import { fetchLeads, markLeadFollowedUp, setLeadWaMeta } from "@/lib/leads";
import { sendFollowUpWhatsapp } from "@/lib/notify";

// WhatsApp-only pipeline -- split from email on purpose (see email-followup/route.js).
// Cold WhatsApp outreach needs a much tighter volume cap than email to avoid
// tripping WhatsApp's own spam detection, so the two channels now run on
// completely independent schedules, caps, and "already contacted" columns.
export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Dipanggil 2x sehari (lihat vercel.json) -- dibatasi 25 lead per PANGGILAN
  // (bukan per hari) supaya volume kirim WA ke kontak dingin tetap terkendali
  // dan tidak memicu deteksi spam WhatsApp. Lead yang tersisa otomatis
  // kebagian di panggilan cron berikutnya karena masih punya followUpSentAt
  // kosong. Baris sheet selalu bertambah berurutan sesuai waktu masuk, jadi
  // "ambil yang pending lalu potong 25" ini otomatis mendahulukan antrian
  // paling lama -- tidak perlu logic prioritas tambahan.
  const MAX_PER_BATCH = 25;
  const leads = await fetchLeads();
  const pending = leads
    .filter((lead) => lead.waStatus !== "manual") // skip lead yang sedang Anda tangani manual
    .filter((lead) => !lead.followUpSentAt)
    .slice(0, MAX_PER_BATCH);

  const results = [];
  for (const lead of pending) {
    const errors = [];

    try {
      const { fonnteMessageId } = await sendFollowUpWhatsapp(lead);
      await setLeadWaMeta(lead.row, { status: "sent", fonnteMessageId });
    } catch (err) {
      errors.push(`whatsapp: ${err}`);
      await setLeadWaMeta(lead.row, { status: "fail" });
    }

    // Mark as handled either way — an attempt was made, so we don't want to
    // keep re-sending to the ones that already succeeded (or already failed
    // for a reason that won't change, like an invalid number).
    await markLeadFollowedUp(lead.row);
    results.push({ row: lead.row, name: lead.name, ok: errors.length === 0, errors });
  }

  return Response.json({ ok: true, processed: results.length, results });
}
