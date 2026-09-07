import { Resend } from "resend";

// Ganti isi subjek/body ini sesuai produk/jasa kamu.
export function followUpMessage(name) {
  return {
    subject: `Halo ${name}, ada info lanjutan buat kamu`,
    text:
      `Halo ${name},\n\n` +
      `Terima kasih sudah tertarik dengan penawaran kami. Ini pesan follow-up otomatis — ` +
      `ganti isinya sesuai produk/jasa kamu.\n\n` +
      `Salam,\nTim kami`,
  };
}

// Isi pesan khusus WhatsApp — "name" di sini diisi dari kolom B (nama/brand).
export function whatsappFollowUpMessage(name) {
  return (
    `Halo kak ${name},\n` +
    `Kami lihat sekarang sedang ada buka lowongan kerja untuk Brand ${name} ya :)\n` +
    `boleh kita bantu postingkan di website kami ka?\n\n` +
    `Kandidat nya untuk loker tersebut banyak yang qualified di website kami kak, Kami tunggu konfirmasi nya ya kak :)`
  );
}

export async function sendFollowUpEmail(lead) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { subject, text } = followUpMessage(lead.name);

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

export async function sendFollowUpWhatsapp(lead) {
  const valid = await isWhatsappNumber(lead.whatsapp);
  if (!valid) throw new Error("Nomor tidak terdaftar di WhatsApp.");

  const text = whatsappFollowUpMessage(lead.name);
  const token = process.env.FONNTE_API_TOKEN;
  if (!token) throw new Error("FONNTE_API_TOKEN belum diset.");

  const res = await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ target: lead.whatsapp, message: text }),
  });

  const data = await res.json();
  if (data.status !== true) {
    throw new Error(`Fonnte gagal kirim: ${JSON.stringify(data)}`);
  }

  return { fonnteMessageId: Array.isArray(data.id) ? data.id[0] : data.id };
}
