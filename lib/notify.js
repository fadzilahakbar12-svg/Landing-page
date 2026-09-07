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

export async function sendFollowUpWhatsapp(lead) {
  const { text } = followUpMessage(lead.name);
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
}
