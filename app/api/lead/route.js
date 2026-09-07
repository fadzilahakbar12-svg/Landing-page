const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request) {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;

  if (!webhookUrl || !secret) {
    return Response.json(
      { ok: false, error: "Server belum dikonfigurasi." },
      { status: 500 }
    );
  }

  const body = await request.json();
  const { name, whatsapp, email, website } = body;

  // Honeypot: this field is invisible to real visitors (see LeadForm.js) —
  // only a bot filling every field blindly would put something in it.
  // Pretend success so the bot doesn't learn to look for a different signal.
  if (website) {
    return Response.json({ ok: true });
  }

  if (!name || !whatsapp || !email) {
    return Response.json(
      { ok: false, error: "Nama, WhatsApp, dan email wajib diisi." },
      { status: 400 }
    );
  }

  if (typeof name !== "string" || name.trim().length < 2 || name.length > 200) {
    return Response.json({ ok: false, error: "Nama tidak valid." }, { status: 400 });
  }

  if (!EMAIL_RE.test(String(email))) {
    return Response.json({ ok: false, error: "Format email tidak valid." }, { status: 400 });
  }

  const digitsOnly = String(whatsapp).replace(/\D/g, "");
  if (digitsOnly.length < 9 || digitsOnly.length > 15) {
    return Response.json({ ok: false, error: "Nomor WhatsApp tidak valid." }, { status: 400 });
  }

  const sheetResponse = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ name: name.trim(), whatsapp: digitsOnly, email, secret }),
  });

  if (!sheetResponse.ok) {
    return Response.json(
      { ok: false, error: "Gagal menyimpan ke spreadsheet." },
      { status: 502 }
    );
  }

  return Response.json({ ok: true });
}
