import { fetchLeads, markLeadEmailSent } from "@/lib/leads";
import { sendFollowUpEmail } from "@/lib/notify";

// Email-only pipeline -- split from WhatsApp on purpose (see wa-followup/route.js).
// Email tolerates a much higher daily volume than cold WhatsApp, and re-sends
// on its own 7-day cooldown instead of being a one-shot "already contacted"
// flag, so it needed its own schedule, cap, and columns (EmailSentAt/emailStatus)
// entirely separate from WhatsApp's.
const MAX_PER_DAY = 100;
const COOLDOWN_DAYS = 7;
const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

function isEligible(lead) {
  if (lead.waStatus === "manual") return false; // Anda sedang tangani lead ini sendiri
  if (!lead.email) return false;
  if (!lead.emailSentAt) return true; // belum pernah di-email sama sekali

  // emailStatus baru berisi "sent" untuk sekarang (opened/clicked menyusul lewat
  // webhook Resend) -- begitu ada yang klik CTA, tidak perlu di-follow-up lagi.
  if (lead.emailStatus === "clicked") return false;

  const sentAt = new Date(lead.emailSentAt).getTime();
  if (Number.isNaN(sentAt)) return true; // data tidak terbaca, aman dianggap eligible lagi
  return Date.now() - sentAt >= COOLDOWN_MS;
}

export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const leads = await fetchLeads();
  const pending = leads.filter(isEligible).slice(0, MAX_PER_DAY);

  const results = [];
  for (const lead of pending) {
    try {
      await sendFollowUpEmail(lead);
      await markLeadEmailSent(lead.row, "sent");
      results.push({ row: lead.row, name: lead.name, ok: true });
    } catch (err) {
      // Sengaja TIDAK menandai EmailSentAt kalau gagal kirim -- biar dicoba
      // lagi di panggilan cron berikutnya, bukan dianggap "sudah" padahal gagal.
      results.push({ row: lead.row, name: lead.name, ok: false, error: String(err) });
    }
  }

  return Response.json({ ok: true, processed: results.length, results });
}
