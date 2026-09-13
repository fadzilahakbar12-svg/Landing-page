import { fetchJobHealth, recordJobRun } from "@/lib/jobHealth";

const JOB_NAME = "uptime-check";

// PENTING -- MAINTENANCE: jadwal di bawah ini HARUS disalin manual dari
// vercel.json tiap kali jadwal cron di sana berubah (tidak auto-sync, sama
// seperti peringatan di lib/extractor.js). Ini yang dipakai untuk menghitung
// "jam berapa seharusnya job ini SUDAH jalan" -- kalau vercel.json berubah
// tapi ini tidak ikut di-update, uptime-check akan salah lapor (false
// positive/negative).
const JOB_SCHEDULES = {
  "scrape": { weekdaysOnly: true, timesUTC: [[2, 0], [4, 0], [6, 0], [8, 0], [10, 0]] },
  "wa-followup": { weekdaysOnly: true, timesUTC: [[3, 30], [6, 30]] },
  "email-followup": { weekdaysOnly: true, timesUTC: [[2, 30], [9, 0]] },
  "snapshot-stats": { weekdaysOnly: false, timesUTC: [[16, 55]] },
};

// Toleransi keterlambatan wajar (jitter penjadwalan Vercel Cron sendiri, atau
// eksekusi yang sedikit lambat) sebelum benar-benar dianggap "terlewat".
const GRACE_MINUTES = 20;

// Cari jadwal "seharusnya sudah jalan" PALING BARU yang sudah lewat relatif
// ke `now` -- mundur hari per hari (maks 9 hari, cukup untuk lompat akhir
// pekan terpanjang) sampai ketemu hari yang eligible (weekdaysOnly dicek di
// sini) dengan salah satu jam terjadwalnya sudah <= now.
function mostRecentExpectedRun(schedule, now) {
  const timesDesc = [...schedule.timesUTC].sort((a, b) => (b[0] * 60 + b[1]) - (a[0] * 60 + a[1]));
  for (let daysAgo = 0; daysAgo <= 9; daysAgo++) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo));
    const dow = day.getUTCDay(); // 0=Minggu .. 6=Sabtu
    if (schedule.weekdaysOnly && (dow === 0 || dow === 6)) continue;
    for (const [h, m] of timesDesc) {
      const candidate = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m));
      if (candidate.getTime() <= now.getTime()) return candidate;
    }
  }
  return null; // seharusnya tidak pernah terjadi kecuali JOB_SCHEDULES kosong
}

// Scheduler/Uptime Agent -- dijalankan sendiri lewat cron terpisah (lihat
// vercel.json), TIDAK terikat status engine (harus tetap mengecek walau
// engine sedang sengaja dimatikan -- justru saat itu paling penting untuk
// membedakan "memang lagi off" vs "harusnya on tapi diam-diam tidak jalan").
//
// KETERBATASAN JUJUR: endpoint ini SENDIRI adalah sebuah cron job juga --
// kalau Vercel Cron-nya sendiri berhenti total (bukan cuma 1 job, tapi
// seluruh platform/akun), tidak ada yang mengawasi si pengawas ini. Untuk itu
// idealnya ditambah 1 layer luar (mis. layanan heartbeat/dead-man's-switch
// pihak ketiga yang gratis) -- belum dipasang di sini karena belum ada
// infrastruktur notifikasi eksternal (email/Telegram) di project ini. Lihat
// catatan di README/knowledge-base.
export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let jobs;
  try {
    jobs = await fetchJobHealth();
  } catch (err) {
    console.error("[UptimeAgent] Gagal membaca JobHealth sama sekali:", String(err));
    await recordJobRun(JOB_NAME, { status: "error", error: err });
    return Response.json({ ok: false, error: String(err) }, { status: 502 });
  }

  const byName = Object.fromEntries(jobs.map((j) => [j.jobName, j]));
  const missed = [];
  const erroring = [];

  for (const [jobName, schedule] of Object.entries(JOB_SCHEDULES)) {
    const expected = mostRecentExpectedRun(schedule, now);
    if (!expected) continue;

    const job = byName[jobName];
    const lastRunAt = job && job.lastRunAt ? new Date(job.lastRunAt) : null;
    const pastGrace = now.getTime() >= expected.getTime() + GRACE_MINUTES * 60000;
    const ranSinceExpected = lastRunAt && lastRunAt.getTime() >= expected.getTime();

    if (pastGrace && !ranSinceExpected) {
      missed.push({
        jobName,
        expectedAt: expected.toISOString(),
        lastRunAt: lastRunAt ? lastRunAt.toISOString() : null,
      });
    } else if (job && job.lastStatus === "error") {
      erroring.push({ jobName, lastRunAt: job.lastRunAt, lastError: job.lastError });
    }
  }

  // Log jelas & actionable -- ini yang dilihat lewat Vercel function logs
  // selama belum ada notifikasi email/Telegram terpasang di project ini.
  // Prefix [UptimeAgent] supaya gampang di-grep.
  if (missed.length) {
    console.error(
      "[UptimeAgent] Job TIDAK JALAN sesuai jadwal (silent failure):",
      missed.map((m) => `${m.jobName} (seharusnya ${m.expectedAt}, terakhir jalan: ${m.lastRunAt || "belum pernah"})`).join("; ")
    );
  }
  if (erroring.length) {
    console.error(
      "[UptimeAgent] Job jalan tapi run terakhirnya ERROR:",
      erroring.map((e) => `${e.jobName}: ${e.lastError}`).join("; ")
    );
  }
  if (!missed.length && !erroring.length) {
    console.log("[UptimeAgent] Semua job sesuai jadwal, tidak ada yang error.");
  }

  await recordJobRun(JOB_NAME, {
    status: missed.length || erroring.length ? "problems-found" : "ok",
    meta: `missed=${missed.length} erroring=${erroring.length}`,
  });

  return Response.json({ ok: true, checkedAt: now.toISOString(), missed, erroring });
}
