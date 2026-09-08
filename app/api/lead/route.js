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
  const { name, whatsapp, email, website, source } = body;

  // Honeypot: this field is invisible to real visitors (see LeadForm.js) —
  // only a bot filling every field blindly would put something in it.
  // Pretend success so the bot doesn't learn to look for a different signal.
  if (website) {
    return Response.json({ ok: true });
  }

  // The public landing-page form always collects both whatsapp AND email, so
  // this stayed a strict "all three required" check for a long time. Other
  // sources (e.g. BarScraper) often only have one of the two — requiring
  // BOTH is not needed for our own logic (fetchLeads/notify handle either
  // being blank fine), so only "name" is unconditionally required.
  if (!name || (!whatsapp && !email)) {
    return Response.json(
      { ok: false, error: "Nama wajib diisi, dan minimal salah satu dari WhatsApp/email." },
      { status: 400 }
    );
  }

  if (typeof name !== "string" || name.trim().length < 2 || name.length > 200) {
    return Response.json({ ok: false, error: "Nama tidak valid." }, { status: 400 });
  }

  if (email && !EMAIL_RE.test(String(email))) {
    return Response.json({ ok: false, error: "Format email tidak valid." }, { status: 400 });
  }

  let digitsOnly = "";
  if (whatsapp) {
    digitsOnly = String(whatsapp).replace(/\D/g, "");
    if (digitsOnly.length < 9 || digitsOnly.length > 15) {
      return Response.json({ ok: false, error: "Nomor WhatsApp tidak valid." }, { status: 400 });
    }
  }

  const sheetResponse = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({
      name: name.trim(),
      whatsapp: digitsOnly,
      email: email || "",
      // "landing_page" kalau tidak diisi -- form publik yang sudah ada tidak
      // pernah mengirim field ini, jadi harus tetap dianggap landing_page
      // seperti perilaku sebelumnya (dapat notifikasi email lead baru).
      source: source || "landing_page",
      secret,
    }),
  });

  if (!sheetResponse.ok) {
    return Response.json(
      { ok: false, error: "Gagal menyimpan ke spreadsheet." },
      { status: 502 }
    );
  }

  return Response.json({ ok: true });
}
