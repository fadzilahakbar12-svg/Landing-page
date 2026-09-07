import {
  findLeadByFonnteMessageId,
  findLeadByPhone,
  setLeadWaMeta,
} from "@/lib/leads";

// Fonnte only has ONE webhook field per device (not separate ones per event
// type), and posts every event type to it — status updates AND replies.
// We tell them apart by shape: a status update carries "id" (+ status/state),
// a reply carries "sender" (+ message).

async function readBody(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return request.json();
  const form = await request.formData();
  return Object.fromEntries(form.entries());
}

function checkSecret(request) {
  const { searchParams } = new URL(request.url);
  return searchParams.get("secret") === process.env.FONNTE_WEBHOOK_SECRET;
}

// Fonnte's dashboard note says the webhook URL "must allow POST and GET" —
// this just answers GET so their check/verification doesn't fail.
export async function GET(request) {
  if (!checkSecret(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return Response.json({ ok: true });
}

export async function POST(request) {
  if (!checkSecret(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await readBody(request);

  // Reply event: has a sender.
  if (body.sender) {
    const lead = await findLeadByPhone(body.sender);
    if (!lead) return Response.json({ ok: true, skipped: "no matching lead" });
    await setLeadWaMeta(lead.row, { status: "connected" });
    return Response.json({ ok: true, matched: "reply", row: lead.row });
  }

  // Status update event: has an id.
  if (body.id) {
    const statusText = String(body.status ?? body.state ?? "").toLowerCase();
    const lead = await findLeadByFonnteMessageId(body.id);
    if (!lead) return Response.json({ ok: true, skipped: "no matching lead" });

    const alreadyEngaged = lead.waStatus === "connected" || lead.waStatus === "read";
    if ((statusText.includes("fail") || statusText.includes("error")) && !alreadyEngaged) {
      await setLeadWaMeta(lead.row, { status: "fail" });
    } else if (statusText.includes("read") && lead.waStatus !== "connected") {
      await setLeadWaMeta(lead.row, { status: "read" });
    }
    return Response.json({ ok: true, matched: "status", row: lead.row });
  }

  return Response.json({ ok: true, skipped: "unrecognized payload shape" });
}
