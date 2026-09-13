import { fetchSites, updateSiteStats } from "@/lib/sites";
import { scanSite } from "@/lib/scraper";
import { getEngineState } from "@/lib/engine";
import { validateScanResult } from "@/lib/schemaValidator";
import { recordJobRun } from "@/lib/jobHealth";

const JOB_NAME = "scrape";

// 1 invocation = scan 1 situs saja (bukan seluruh watchlist sekaligus) --
// dijadwalkan jalan berkali-kali sepanjang jam kerja (lihat vercel.json),
// jadi watchlist ke-cover bertahap sepanjang hari tanpa 1 eksekusi jadi
// terlalu lama/berat. Situs bertanda needsManualScrape (pola "Load More"/JS
// berat, lihat detectLoadMoreButton di lib/extractor.js) di-skip permanen --
// itu tetap perlu BarScraper manual.
const PRIORITY_ORDER = { Tinggi: 0, Sedang: 1, Rendah: 2, Baru: 3 };

function pickNextSite(sites) {
  const eligible = sites.filter((s) => s.startUrl && !s.needsManualScrape);
  if (!eligible.length) return null;

  // Prioritas dulu, lalu di antara yang prioritasnya sama, dahulukan yang
  // PALING LAMA belum di-scan (atau belum pernah sama sekali) -- supaya
  // watchlist ter-cover merata, bukan situs yang sama terus tiap tick.
  eligible.sort((a, b) => {
    const pDiff = (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4);
    if (pDiff !== 0) return pDiff;
    const aTime = a.lastScanned ? new Date(a.lastScanned).getTime() : 0;
    const bTime = b.lastScanned ? new Date(b.lastScanned).getTime() : 0;
    return aTime - bTime;
  });
  return eligible[0];
}

export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Jadwal cron ini tetap jalan seperti biasa terlepas dari status engine --
  // yang membedakan cuma apakah tick ini benar-benar ngerjain sesuatu atau
  // no-op. Ini yang membuat tombol "Mulai/Stop" di dashboard bisa instan
  // (cuma toggle 1 flag), bukan harus daftar/hapus jadwal cron sungguhan.
  const engineEnabled = await getEngineState();
  if (!engineEnabled) {
    await recordJobRun(JOB_NAME, { status: "skipped", meta: "engine off" });
    return Response.json({ ok: true, skipped: true, reason: "Engine sedang mati (belum diaktifkan dari dashboard)." });
  }

  const sites = await fetchSites();
  const site = pickNextSite(sites);
  if (!site) {
    await recordJobRun(JOB_NAME, { status: "skipped", meta: "no eligible site" });
    return Response.json({ ok: true, message: "Tidak ada situs eligible untuk di-scan (watchlist kosong atau semua perlu manual)." });
  }

  let result;
  try {
    result = await scanSite(site);
  } catch (err) {
    // Tetap catat lastScanned walau gagal total -- supaya situs ini tidak
    // terus-menerus "dipilih duluan" tiap tick karena dianggap paling lama
    // belum di-scan (lihat pickNextSite).
    await updateSiteStats(site.domain, { jobsFound: 0, successRate: 0 });
    await recordJobRun(JOB_NAME, { status: "error", error: err, meta: site.domain });
    return Response.json({ ok: false, domain: site.domain, error: String(err) }, { status: 502 });
  }

  // Schema Validator -- cek hasil scan SEBELUM dianggap "sukses begitu saja".
  // site (dari fetchSites di atas) masih punya successRate scan SEBELUMNYA di
  // sini, dipakai sebagai baseline pembanding.
  const validation = validateScanResult(site, result);
  if (validation.issues.length) {
    // console.warn (bukan .error) -- ini bukan kegagalan cron-nya, tapi sinyal
    // kualitas data yang perlu ditindaklanjuti manual. Prefix [SchemaValidator]
    // supaya gampang di-grep di Vercel logs.
    console.warn(`[SchemaValidator] ${site.domain}:`, validation.issues.join(" | "));
  }

  await updateSiteStats(site.domain, {
    jobsFound: result.jobsFound,
    successRate: result.successRate,
    needsManualScrape: result.needsManualScrape,
    schemaIssue: validation.schemaIssue,
  });

  // Kirim tiap lead yang lolos filter lewat endpoint /api/lead yang sudah ada
  // -- reuse validasi & penandaan source, bukan tulis ulang logic-nya di sini.
  const baseUrl = new URL(request.url).origin;
  let leadsSent = 0;
  for (const lead of result.leads) {
    try {
      const res = await fetch(`${baseUrl}/api/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: lead.company,
          whatsapp: lead.whatsapp || "",
          email: lead.email || "",
          // Link ke HOMEPAGE situs sumber (bukan link halaman lowongan
          // spesifiknya) -- ini yang jadi isi kolom "source" di sheet, dan
          // domainnya dipakai Apps Script untuk bikin inisial LeadID (mis.
          // dealls.com -> "DS").
          source: `https://${site.domain}`,
        }),
      });
      if (res.ok) leadsSent++;
    } catch (err) {
      // 1 lead gagal terkirim bukan alasan menghentikan sisanya
    }
  }

  await recordJobRun(JOB_NAME, {
    status: validation.issues.length ? "ok-with-warnings" : "ok",
    error: validation.issues.length ? validation.schemaIssue : "",
    meta: `${site.domain} | jobsFound=${result.jobsFound} leadsSent=${leadsSent}`,
  });

  return Response.json({
    ok: true,
    domain: site.domain,
    jobsFound: result.jobsFound,
    successRate: result.successRate,
    needsManualScrape: result.needsManualScrape,
    leadsSent,
    schemaIssue: validation.schemaIssue || null,
  });
}
