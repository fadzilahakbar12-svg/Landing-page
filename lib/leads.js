export async function fetchLeads() {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!url) throw new Error("GOOGLE_SHEETS_WEBHOOK_URL belum diset.");
  if (!secret) throw new Error("APPS_SCRIPT_SECRET belum diset.");

  const res = await fetch(`${url}?secret=${encodeURIComponent(secret)}`, { method: "GET" });
  if (!res.ok) throw new Error("Gagal membaca data lead dari spreadsheet.");

  const data = await res.json();
  if (data.ok === false) throw new Error(data.error ?? "Gagal membaca data lead.");
  return data.leads ?? [];
}

export async function markLeadFollowedUp(row) {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!url) throw new Error("GOOGLE_SHEETS_WEBHOOK_URL belum diset.");
  if (!secret) throw new Error("APPS_SCRIPT_SECRET belum diset.");

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "markSent", row, secret }),
  });
}

// status: "sent" | "read" | "connected". fonnteMessageId is set once, right
// after sending — later calls (from the webhooks) only need to pass status.
export async function setLeadWaMeta(row, { status, fonnteMessageId } = {}) {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!url) throw new Error("GOOGLE_SHEETS_WEBHOOK_URL belum diset.");
  if (!secret) throw new Error("APPS_SCRIPT_SECRET belum diset.");

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "setWaMeta", row, status, fonnteMessageId, secret }),
  });
}

// Separate from setLeadWaMeta on purpose — email and WhatsApp are independent
// pipelines now (different daily caps, different cooldown rules), so each
// writes to its own pair of columns and never touches the other's state.
export async function markLeadEmailSent(row, emailStatus = "sent") {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!url) throw new Error("GOOGLE_SHEETS_WEBHOOK_URL belum diset.");
  if (!secret) throw new Error("APPS_SCRIPT_SECRET belum diset.");

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "markEmailSent", row, emailStatus, secret }),
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
