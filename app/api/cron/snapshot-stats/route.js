import { fetchLeads } from "@/lib/leads";
import { computeWaCounts, waFunnel, emailFunnel } from "@/lib/metrics";
import { recordStatsSnapshot } from "@/lib/statsHistory";

// Sekali/hari (lihat vercel.json) -- mencatat 1 baris ringkasan metrik hari
// ini ke StatsHistory, TIDAK dipengaruhi status engine (berbeda dari 3 cron
// lain) karena ini cuma mencatat angka, tidak mengirim/mengubah apapun ke
// lead -- tetap aman dicatat walau engine sedang mati, supaya perbandingan
// day-to-day tidak bolong di hari-hari Anda memilih mematikan mesin.
export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const leads = await fetchLeads();
  const waCounts = computeWaCounts(leads);
  const wa = waFunnel(waCounts);
  const email = emailFunnel(leads);

  await recordStatsSnapshot({
    totalLeads: leads.length,
    waSent: wa.sent,
    waRead: wa.read,
    waConnected: wa.connected,
    waFail: waCounts.fail,
    emailSent: email.sent,
    emailOpened: email.opened,
    emailClicked: email.clicked,
  });

  return Response.json({ ok: true, totalLeads: leads.length });
}
