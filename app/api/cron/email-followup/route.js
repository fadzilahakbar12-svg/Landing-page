import { fetchLeads, markLeadEmailSent } from "@/lib/leads";
import { sendFollowUpEmail } from "@/lib/notify";
import { getEngineState } from "@/lib/engine";
import { recordJobRun } from "@/lib/jobHealth";
import { fetchTemplates, pickTemplate, renderTemplate } from "@/lib/templates";

const JOB_NAME = "email-followup";

// Email-only pipeline -- split from WhatsApp on purpose (see wa-followup/route.js).
// Sekarang jalan 2 batch/hari (sama seperti WA) dalam jam operasional 09.00-
// 18.00 WIB (lihat vercel.json) -- dibatasi per BATCH (bukan per hari) supaya
// total harian tetap terkendali (~2x MAX_PER_BATCH), re-send otomatis lewat
// cooldown 7 hari kalau belum ada yang klik CTA.
const MAX_PER_BATCH = 50;
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

  const engineEnabled = await getEngineState();
  if (!engineEnabled) {
    await recordJobRun(JOB_NAME, { status: "skipped", meta: "engine off" });
    return Response.json({ ok: true, skipped: true, reason: "Engine sedang mati (belum diaktifkan dari dashboard)." });
  }

  const leads = await fetchLeads();
  const pending = leads.filter(isEligible).slice(0, MAX_PER_BATCH);

  // Template dipilih PER-LEAD (beda dari WA yang 1 batch = 1 template,
  // lihat wa-followup/route.js) -- email dikirim 1-per-1 lewat Resend di
  // sini, jadi tidak ada batasan "1 message per request" seperti Fonnte bulk.
  const templates = await fetchTemplates();

  const results = [];
  for (const lead of pending) {
    // stage: "new" kalau ini email PERTAMA ke lead ini, "followup" kalau
    // sudah pernah (masuk sini lagi karena cooldown 7 hari lewat & belum klik).
    const stage = lead.emailSentAt ? "followup" : "new";
    const template = pickTemplate(templates, { channel: "email", stage });
    const rendered = renderTemplate(template, lead.name);

    try {
      await sendFollowUpEmail(lead, { subject: rendered.subject, text: rendered.body });
      await markLeadEmailSent(lead.row, "sent", template.templateId ?? undefined);
      results.push({ row: lead.row, name: lead.name, ok: true, templateId: template.templateId });
    } catch (err) {
      // Sengaja TIDAK menandai EmailSentAt kalau gagal kirim -- biar dicoba
      // lagi di panggilan cron berikutnya, bukan dianggap "sudah" padahal gagal.
      results.push({ row: lead.row, name: lead.name, ok: false, error: String(err) });
    }
  }

  const errorCount = results.filter((r) => !r.ok).length;
  await recordJobRun(JOB_NAME, {
    status: errorCount === 0 ? "ok" : errorCount === results.length && results.length > 0 ? "error" : "ok-with-warnings",
    error: errorCount ? `${errorCount}/${results.length} lead gagal` : "",
    meta: `processed=${results.length}`,
  });

  return Response.json({ ok: true, processed: results.length, results });
}
