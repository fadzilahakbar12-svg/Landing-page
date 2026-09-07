export async function fetchLeads() {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!url) throw new Error("GOOGLE_SHEETS_WEBHOOK_URL belum diset.");

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error("Gagal membaca data lead dari spreadsheet.");

  const data = await res.json();
  return data.leads ?? [];
}

export async function markLeadFollowedUp(row) {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!url) throw new Error("GOOGLE_SHEETS_WEBHOOK_URL belum diset.");

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "markSent", row }),
  });
}
