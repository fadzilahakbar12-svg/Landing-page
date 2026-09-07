import { findLeadByPhone, setLeadWaMeta } from "@/lib/leads";

async function readBody(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return request.json();
  const form = await request.formData();
  return Object.fromEntries(form.entries());
}

// Fonnte calls this whenever someone replies to a message on this device.
// Configure this URL (with the secret) in Fonnte → Device → Webhook → Reply Message.
export async function POST(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("secret") !== process.env.FONNTE_WEBHOOK_SECRET) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await readBody(request);
  const sender = body.sender;
  if (!sender) return Response.json({ ok: true, skipped: "no sender" });

  const lead = await findLeadByPhone(sender);
  if (!lead) return Response.json({ ok: true, skipped: "no matching lead", sender });

  const setResult = await setLeadWaMeta(lead.row, { status: "connected" });

  return Response.json({ ok: true, debug: { sender, foundRow: lead.row, setResult } });
}
