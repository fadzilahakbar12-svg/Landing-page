import { Resend } from "resend";

// Isi pesan sekarang datang dari lib/templates.js (pickTemplate + renderTemplate,
// dengan fallback bawaan kalau Template sheet kosong) -- notify.js cuma
// urusan "kirim", bukan "apa isinya" lagi.

export async function sendFollowUpEmail(lead, { subject, text }) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  // Selama masih pakai domain testing Resend, tujuan email DIPAKSA ke NOTIFY_EMAIL
  // (email lead yang sesungguhnya belum bisa dikirimi sampai kamu verifikasi domain sendiri).
  const to = process.env.RESEND_FROM_EMAIL === "onboarding@resend.dev"
    ? process.env.NOTIFY_EMAIL
    : lead.email;

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to,
    subject,
    text,
  });
}

// Fonnte's /send happily "succeeds" even for numbers that aren't on WhatsApp
// at all — it just silently never delivers. Check first so those can be
// marked "fail" immediately instead of sitting as "sent" forever.
export async function isWhatsappNumber(phone) {
  const token = process.env.FONNTE_API_TOKEN;
  if (!token) throw new Error("FONNTE_API_TOKEN belum diset.");

  const res = await fetch("https://api.fonnte.com/validate", {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ target: String(phone), countryCode: "62" }),
  });

  const data = await res.json();
  if (data.status !== true) {
    throw new Error(`Fonnte gagal validasi nomor: ${JSON.stringify(data)}`);
  }

  return (data.registered ?? []).length > 0;
}

// Kirim ke BANYAK lead dalam 1 request Fonnte, dengan jeda otomatis di sisi
// Fonnte sendiri (parameter "delay", dalam detik) antar setiap nomor --
// divalidasi lewat uji nyata (Fase 2): Fonnte mengembalikan array "id" satu
// message-ID per target, urut sesuai array target yang dikirim, dan
// personalisasi {name} per-target independen satu sama lain.
//
// PENTING: request ini balas SEKETIKA ("process: pending") -- Fonnte yang
// menjadwalkan pengiriman bertahap di sisi mereka, bukan function kita yang
// menunggu. Ini yang membuat jeda antar-pesan tidak kena batas waktu eksekusi
// serverless, walau totalnya bisa puluhan menit (mis. 25 pesan x 2 menit).
//
// "message" HARUS sudah mengandung literal "{name}" (placeholder Fonnte
// sendiri, BUKAN "{{name}}" milik lib/templates.js) di tempat nama -- semua
// lead dalam 1 batch ini menerima TEMPLATE YANG SAMA (1 pilihan template per
// batch, bukan per-lead) karena Fonnte cuma menerima 1 "message" per request
// bulk. Lihat wa-followup/route.js untuk cara render-nya.
const WHATSAPP_SEND_DELAY_SECONDS = 120;

export async function sendBulkFollowUpWhatsapp(leads, message) {
  if (!leads.length) return [];
  const token = process.env.FONNTE_API_TOKEN;
  if (!token) throw new Error("FONNTE_API_TOKEN belum diset.");

  const target = leads.map((lead) => `${lead.whatsapp}|${lead.name}`).join(",");

  const res = await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      target,
      message,
      delay: String(WHATSAPP_SEND_DELAY_SECONDS),
      countryCode: "62",
    }),
  });

  const data = await res.json();
  if (data.status !== true) {
    throw new Error(`Fonnte gagal kirim (batch): ${JSON.stringify(data)}`);
  }

  const ids = Array.isArray(data.id) ? data.id : [data.id];
  return leads.map((lead, i) => ({ lead, fonnteMessageId: ids[i] }));
}
