export async function POST(request) {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;

  if (!webhookUrl) {
    return Response.json(
      { ok: false, error: "GOOGLE_SHEETS_WEBHOOK_URL belum diset." },
      { status: 500 }
    );
  }

  const body = await request.json();
  const { name, whatsapp, email } = body;

  if (!name || !whatsapp || !email) {
    return Response.json(
      { ok: false, error: "Nama, WhatsApp, dan email wajib diisi." },
      { status: 400 }
    );
  }

  const sheetResponse = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ name, whatsapp, email }),
  });

  if (!sheetResponse.ok) {
    return Response.json(
      { ok: false, error: "Gagal menyimpan ke spreadsheet." },
      { status: 502 }
    );
  }

  return Response.json({ ok: true });
}
