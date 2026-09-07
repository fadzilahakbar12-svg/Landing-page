import { findLeadByFonnteMessageId, setLeadWaMeta } from "@/lib/leads";

async function readBody(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return request.json();
  const form = await request.formData();
  return Object.fromEntries(form.entries());
}

// Fonnte calls this whenever a message's delivery status changes.
// Configure this URL (with the secret) in Fonnte → Device → Webhook → Update Message Status.
export async function POST(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("secret") !== process.env.FONNTE_WEBHOOK_SECRET) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await readBody(request);
  const id = body.id;
  const statusText = String(body.status ?? body.state ?? "").toLowerCase();

  if (!id) return Response.json({ ok: true, skipped: "no id" });

  const lead = await findLeadByFonnteMessageId(id);
  if (!lead) return Response.json({ ok: true, skipped: "no matching lead" });

  // Only "upgrade" the funnel stage — never downgrade read/connected back to sent.
  if (statusText.includes("read") && lead.waStatus !== "connected") {
    await setLeadWaMeta(lead.row, { status: "read" });
  }

  return Response.json({ ok: true });
}
