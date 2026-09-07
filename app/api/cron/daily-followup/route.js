import { fetchLeads, markLeadFollowedUp } from "@/lib/leads";
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
    try {
      await sendFollowUpEmail(lead);
      await sendFollowUpWhatsapp(lead);
      await markLeadFollowedUp(lead.row);
      results.push({ row: lead.row, name: lead.name, ok: true });
    } catch (err) {
      results.push({ row: lead.row, name: lead.name, ok: false, error: String(err) });
    }
  }

  return Response.json({ ok: true, processed: results.length, results });
}
