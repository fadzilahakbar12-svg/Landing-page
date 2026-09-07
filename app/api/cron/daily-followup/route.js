import { fetchLeads, markLeadFollowedUp, setLeadWaMeta } from "@/lib/leads";
import { sendFollowUpEmail, sendFollowUpWhatsapp } from "@/lib/notify";

export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const leads = await fetchLeads();
  const pending = leads.filter((lead) => !lead.followUpSentAt);

  const results = [];
  for (const lead of pending) {
    const errors = [];

    try {
      await sendFollowUpEmail(lead);
    } catch (err) {
      errors.push(`email: ${err}`);
    }

    try {
      const { fonnteMessageId } = await sendFollowUpWhatsapp(lead);
      await setLeadWaMeta(lead.row, { status: "sent", fonnteMessageId });
    } catch (err) {
      errors.push(`whatsapp: ${err}`);
      await setLeadWaMeta(lead.row, { status: "fail" });
    }

    // Mark as handled either way — an attempt was made for both channels,
    // so we don't want to keep re-sending the ones that did succeed.
    await markLeadFollowedUp(lead.row);
    results.push({ row: lead.row, name: lead.name, ok: errors.length === 0, errors });
  }

  return Response.json({ ok: true, processed: results.length, results });
}
