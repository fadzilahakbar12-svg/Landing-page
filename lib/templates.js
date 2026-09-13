// Perpustakaan template pesan (Email & WhatsApp) -- dibuat manual atau lewat
// "Generate dengan AI" (lib/gemini.js), dipilih otomatis oleh cron follow-up
// (wa-followup/email-followup), dan diberi skor dari data pemakaian nyata di
// Leads (bukan tebakan) tiap kali dashboard dibuka.

const FALLBACK_EMAIL = {
  templateId: null, // null = bukan template sungguhan, jangan dicatat/skor
  channel: "email",
  stage: "new",
  subject: "Halo {{name}}, ada info lanjutan buat kamu",
  body:
    "Halo {{name}},\n\n" +
    "Terima kasih sudah tertarik dengan penawaran kami. Ini pesan follow-up otomatis — " +
    "ganti isinya sesuai produk/jasa kamu.\n\n" +
    "Salam,\nTim kami",
};

const FALLBACK_WHATSAPP = {
  templateId: null,
  channel: "whatsapp",
  stage: "new",
  subject: "",
  body:
    "Halo kak {{name}},\n" +
    "Kami lihat sekarang sedang ada buka lowongan kerja untuk Brand {{name}} ya :)\n" +
    "boleh kita bantu postingkan di website kami ka?\n\n" +
    "Kandidat nya untuk loker tersebut banyak yang qualified di website kami kak, Kami tunggu konfirmasi nya ya kak :)",
};

export async function fetchTemplates() {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!url) throw new Error("GOOGLE_SHEETS_WEBHOOK_URL belum diset.");
  if (!secret) throw new Error("APPS_SCRIPT_SECRET belum diset.");

  const res = await fetch(`${url}?secret=${encodeURIComponent(secret)}&resource=templates`, { method: "GET" });
  if (!res.ok) throw new Error("Gagal membaca daftar template.");

  const data = await res.json();
  if (data.ok === false) throw new Error(data.error ?? "Gagal membaca daftar template.");
  return data.templates ?? [];
}

export async function addTemplate({ channel, stage, subject, body }) {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!url) throw new Error("GOOGLE_SHEETS_WEBHOOK_URL belum diset.");
  if (!secret) throw new Error("APPS_SCRIPT_SECRET belum diset.");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "addTemplate", channel, stage, subject, body, secret }),
  });
  const data = await res.json();
  if (data.ok === false) throw new Error(data.error ?? "Gagal menyimpan template.");
  return data.templateId;
}

async function setTemplateScore(templateId, { score, timesUsed }) {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!url || !secret) return;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "setTemplateScore", templateId, score, timesUsed, secret }),
  });
}

// Skor per channel dihitung dari sinyal kualitas paling berarti buat channel
// itu -- BUKAN metrik yang sama dipaksa ke semua channel:
//  - WhatsApp: proporsi lead yang "connected" (BALAS pesannya) dari semua
//    yang dikirimi template ini -- itu sinyal keterlibatan paling kuat yang
//    kita punya untuk WA (lihat lib/leads.js waStatus).
//  - Email: proporsi yang "clicked" (klik CTA) dari semua yang dikirimi --
//    "opened" sengaja TIDAK dipakai sebagai basis skor (pixel open-tracking
//    gampang false-positive/gagal, klik CTA jauh lebih dipercaya sebagai
//    sinyal kualitas copy yang sesungguhnya).
function computeScores(leads, templates) {
  const usage = new Map(); // templateId -> { sent, connectedOrClicked }

  for (const lead of leads) {
    if (lead.waTemplateId) {
      const cur = usage.get(lead.waTemplateId) || { sent: 0, hit: 0 };
      cur.sent += 1;
      if (lead.waStatus === "connected") cur.hit += 1;
      usage.set(lead.waTemplateId, cur);
    }
    if (lead.emailTemplateId) {
      const cur = usage.get(lead.emailTemplateId) || { sent: 0, hit: 0 };
      cur.sent += 1;
      if (lead.emailStatus === "clicked") cur.hit += 1;
      usage.set(lead.emailTemplateId, cur);
    }
  }

  return templates.map((t) => {
    const u = usage.get(t.templateId) || { sent: 0, hit: 0 };
    return {
      ...t,
      timesUsed: u.sent,
      score: u.sent > 0 ? u.hit / u.sent : null, // null = belum ada data sama sekali
    };
  });
}

// Dipanggil on-demand dari dashboard (server component) tiap kali halaman
// dibuka -- menghitung ulang score/timesUsed tiap template dari data Leads
// TERKINI dan menyimpannya balik ke sheet Template (supaya pickTemplate()
// di cron berikutnya memakai angka yang sudah update, tidak perlu tunggu
// cron terjadwal terpisah). Gagal (mis. quota Apps Script) TIDAK melempar --
// dashboard tetap harus bisa tampil walau recompute-nya gagal sesekali.
export async function recomputeAndSaveScores(leads, templates) {
  const scored = computeScores(leads, templates);
  await Promise.all(
    scored
      .filter((t) => t.timesUsed > 0) // jangan tulis ulang yang memang belum pernah dipakai
      .map((t) => setTemplateScore(t.templateId, { score: t.score, timesUsed: t.timesUsed }).catch(() => {}))
  );
  return scored;
}

const MIN_EXPLORE_SAMPLES = 5; // di bawah ini dianggap "belum cukup data", terus dicoba
const EXPLOIT_PROBABILITY = 0.8; // 80% pakai yang skornya terbaik, 20% tetap eksplorasi

// Pilih 1 template untuk (channel, stage) tertentu. Strategi (mirip
// epsilon-greedy, sederhana tapi mencegah "keburu yakin" ke 1 template
// gara-gara kebetulan sample awal bagus/jelek):
//  1. Kalau ADA template yang timesUsed-nya masih < MIN_EXPLORE_SAMPLES,
//     pilih acak di antara yang itu dulu -- kumpulkan data sebelum menilai.
//  2. Kalau semua sudah cukup sample: 80% pilih skor tertinggi (exploit),
//     20% pilih acak dari SEMUA yang eligible (tetap eksplorasi sesekali --
//     template lain bisa saja sebenarnya lebih bagus tapi belum kebagian
//     giliran akhir-akhir ini).
//  3. Kalau TIDAK ADA template sama sekali untuk (channel, stage) ini,
//     pakai fallback bawaan (isi lama yang sebelumnya hardcode) -- sistem
//     tidak boleh berhenti kirim pesan cuma karena Template sheet kosong.
export function pickTemplate(templates, { channel, stage }) {
  const eligible = templates.filter((t) => t.channel === channel && t.stage === stage);
  if (!eligible.length) return channel === "email" ? FALLBACK_EMAIL : FALLBACK_WHATSAPP;

  const underSampled = eligible.filter((t) => (t.timesUsed || 0) < MIN_EXPLORE_SAMPLES);
  if (underSampled.length) {
    return underSampled[Math.floor(Math.random() * underSampled.length)];
  }

  if (Math.random() < EXPLOIT_PROBABILITY) {
    return [...eligible].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  }
  return eligible[Math.floor(Math.random() * eligible.length)];
}

// {{name}} -> nama lead (dari kolom nama, bisa nama orang ATAU nama
// brand/perusahaan tergantung sumber lead-nya -- lihat lib/notify.js).
export function renderTemplate(template, name) {
  const fill = (s) => String(s || "").split("{{name}}").join(name);
  return { subject: fill(template.subject), body: fill(template.body) };
}
