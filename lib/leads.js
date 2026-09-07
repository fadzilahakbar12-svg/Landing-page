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

// status: "sent" | "read" | "connected". fonnteMessageId is set once, right
// after sending — later calls (from the webhooks) only need to pass status.
export async function setLeadWaMeta(row, { status, fonnteMessageId } = {}) {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!url) throw new Error("GOOGLE_SHEETS_WEBHOOK_URL belum diset.");

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "setWaMeta", row, status, fonnteMessageId }),
  });
}

// Digits-only comparison — Fonnte and our sheet may format the same number
// with/without "+", spaces, or a leading 0 instead of 62.
export function samePhoneNumber(a, b) {
  const norm = (s) => String(s ?? "").replace(/\D/g, "").replace(/^0/, "62");
  return norm(a) && norm(a) === norm(b);
}

// If the same number submitted the form more than once, prefer the most
// recent row that isn't already "connected" — that's the conversation this
// reply almost certainly belongs to.
export async function findLeadByPhone(phone) {
  const leads = await fetchLeads();
  const matches = leads.filter((lead) => samePhoneNumber(lead.whatsapp, phone));
  if (matches.length === 0) return undefined;
  const reversed = [...matches].reverse(); // most recent row first
  return reversed.find((lead) => lead.waStatus !== "connected") ?? reversed[0];
}

export async function findLeadByFonnteMessageId(id) {
  const leads = await fetchLeads();
  return leads.find((lead) => String(lead.fonnteMessageId) === String(id));
}
