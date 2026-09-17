import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { fetchLeads } from "@/lib/leads";
import { fetchSites } from "@/lib/sites";
import { getEngineState } from "@/lib/engine";
import { fetchJobHealth } from "@/lib/jobHealth";
import { fetchTemplates, recomputeAndSaveScores } from "@/lib/templates";
import AddSiteForm from "./AddSiteForm";
import TemplateGenerateForm from "./TemplateGenerateForm";
import DedupeLeadsButton from "./DedupeLeadsButton";
import EngineToggle from "./EngineToggle";
import StatsPanel from "./StatsPanel";
import CursorGlow from "./CursorGlow";
import EngineStatusText from "./EngineStatusText";
import { EngineStateProvider } from "./EngineStateContext";
import "./styles.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
});
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

const BANK_DATA_URL = "https://docs.google.com/spreadsheets/d/1JxV1UAq_c-erM_28UojQ7yKW-JraFrXpEgcCIpVLukQ/edit?gid=0#gid=0";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kontrol Panel Leads" };

const PRIORITY_ORDER = { Tinggi: 0, Sedang: 1, Rendah: 2, Baru: 3 };
const PRIORITY_CLASS = {
  Tinggi: "db-prio-tinggi",
  Sedang: "db-prio-sedang",
  Rendah: "db-prio-rendah",
  Baru: "db-prio-baru",
};

// Google Sheets otomatis mengubah value seperti "93%" (string) yang ditulis
// lewat API jadi angka desimal 0.93 dengan format tampilan persen di sisi
// Sheets -- tapi lewat JSON API, yang kita terima ya angka mentahnya (0.93),
// bukan "93%". Tangani KEDUA kemungkinan bentuk supaya tetap tampil benar.
function formatSuccessRate(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" && value.trim().endsWith("%")) return value;
  const num = Number(value);
  if (Number.isNaN(num)) return "—";
  return `${Math.round(num * 100)}%`;
}

// Label tampilan + urutan tetap untuk panel "Kesehatan Job" (Scheduler/Uptime
// Agent) -- daftar ini HARUS mengikuti nama jobName yang dipakai tiap route
// cron (lihat const JOB_NAME di masing-masing app/api/cron/*/route.js).
const JOB_LABELS = {
  scrape: "Scraper (situs loker)",
  "wa-followup": "Follow-up WhatsApp",
  "email-followup": "Follow-up Email",
  "snapshot-stats": "Snapshot Statistik",
  "uptime-check": "Uptime Agent (dirinya sendiri)",
};
const JOB_ORDER = ["scrape", "wa-followup", "email-followup", "snapshot-stats", "uptime-check"];

const JOB_STATUS_META = {
  ok: { label: "OK", cls: "db-prio-tinggi" },
  skipped: { label: "Dilewati (engine mati)", cls: "db-prio-baru" },
  "ok-with-warnings": { label: "OK, ada peringatan", cls: "db-prio-sedang" },
  "problems-found": { label: "Ada masalah ditemukan", cls: "db-prio-sedang" },
  error: { label: "Error", cls: "db-prio-alert" },
};

function jobStatusMeta(status) {
  return JOB_STATUS_META[status] || { label: status || "belum pernah jalan", cls: "db-prio-rendah" };
}

const CHANNEL_LABEL = { email: "Email", whatsapp: "WhatsApp" };
const STAGE_LABEL = { new: "New", followup: "Follow up" };

function formatScore(score, timesUsed) {
  if (!timesUsed) return "belum ada data";
  return `${Math.round((score ?? 0) * 100)}% (${timesUsed}x kirim)`;
}

function truncate(text, max) {
  const s = String(text || "");
  return s.length > max ? s.slice(0, max).trimEnd() + "…" : s;
}

function formatRelative(dateValue) {
  if (!dateValue) return "belum pernah";
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "belum pernah";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}

export default async function DashboardPage() {
  let leads = [];
  let loadError = null;
  let sites = [];
  let sitesError = null;

  try {
    leads = await fetchLeads();
  } catch (err) {
    loadError = String(err);
  }

  try {
    sites = await fetchSites();
  } catch (err) {
    sitesError = String(err);
  }

  let jobs = [];
  let jobsError = null;
  try {
    jobs = await fetchJobHealth();
  } catch (err) {
    jobsError = String(err);
  }

  let engineEnabled = false;
  try {
    engineEnabled = await getEngineState();
  } catch {
    // biarkan default false (mati) kalau gagal baca -- lebih aman daripada
    // diam-diam anggap "jalan" padahal statusnya tidak terbaca.
  }

  // Skor template dihitung ulang ON-DEMAND tiap dashboard dibuka (bukan cron
  // terjadwal) -- lihat lib/templates.js#recomputeAndSaveScores. Gagal di
  // sini TIDAK boleh menjatuhkan seluruh halaman, cukup tampilkan skor lama.
  let templates = [];
  let templatesError = null;
  try {
    const rawTemplates = await fetchTemplates();
    templates = leads.length ? await recomputeAndSaveScores(leads, rawTemplates) : rawTemplates;
  } catch (err) {
    templatesError = String(err);
  }

  const sortedSites = [...sites].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4)
  );

  const jobsByName = Object.fromEntries(jobs.map((j) => [j.jobName, j]));
  const orderedJobs = JOB_ORDER.map((name) => ({ name, job: jobsByName[name] || null }));

  // Cuma field yang benar-benar dibutuhkan StatsPanel untuk hitung ulang di
  // client (rentang pill + kalender custom) -- nama/WA/email lead SENGAJA
  // tidak ikut dikirim ke sana, tidak perlu bocor ke HTML halaman ini.
  const statsLeads = leads.map((l) => ({
    timestamp: l.timestamp,
    waStatus: l.waStatus,
    emailSentAt: l.emailSentAt,
    emailStatus: l.emailStatus,
  }));

  return (
    <main
      className={`db-panel ${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}
      data-engine={engineEnabled ? "on" : "off"}
    >
      <EngineStateProvider initialEnabled={engineEnabled}>
      <CursorGlow />
      <div className="db-inner">
        <div className="db-topbar">
          <div className="db-brand">
            <p className="db-eyebrow">Kontrol Panel · Bank Data</p>
            <h1>Ringkasan Leads</h1>
            <p className="db-sub">Data langsung dari spreadsheet — refresh kapan saja untuk lihat angka terbaru.</p>
            <EngineStatusText initialEnabled={engineEnabled} />
          </div>
          <div className="db-actions">
            <a href={BANK_DATA_URL} target="_blank" rel="noopener noreferrer" className="db-btn-ghost">
              🔗 Buka Bank Data
            </a>
            <DedupeLeadsButton />
            <EngineToggle initialEnabled={engineEnabled} />
          </div>
        </div>

        {loadError && <div className="db-error">Gagal memuat data: {loadError}</div>}

        <StatsPanel leads={statsLeads} />

        <div className="db-section-head">
          <h2>Performa Situs</h2>
          <div className="db-section-head-right">
            <span className="db-hint">diurutkan berdasarkan prioritas</span>
            <AddSiteForm />
          </div>
        </div>

        {sitesError && <div className="db-error">Gagal memuat watchlist situs: {sitesError}</div>}

        {!sitesError && sortedSites.length === 0 && (
          <div className="db-empty">Belum ada situs di watchlist. Klik &quot;+ Tambah Situs&quot; untuk mulai.</div>
        )}

        {!sitesError && sortedSites.length > 0 && (
          <div className="db-table-wrap">
            <table className="db-table">
              <thead>
                <tr>
                  <th>Situs</th>
                  <th>Loker Ditemukan</th>
                  <th>Sukses Ekstraksi</th>
                  <th>Prioritas</th>
                  <th>Terakhir Discan</th>
                </tr>
              </thead>
              <tbody>
                {sortedSites.map((site) => (
                  <tr key={site.domain}>
                    <td>
                      <span className="db-site-name">{site.domain}</span>
                      {site.needsManualScrape && <span className="flag">perlu manual (BarScraper)</span>}
                      {site.schemaIssue && (
                        <span className="flag" title={site.schemaIssue}>
                          ⚠ kemungkinan situs berubah struktur — cek manual
                        </span>
                      )}
                    </td>
                    <td className="db-num">{site.jobsFound || "—"}</td>
                    <td className="db-num">{formatSuccessRate(site.successRate)}</td>
                    <td>
                      <span className={`db-prio ${PRIORITY_CLASS[site.priority] || PRIORITY_CLASS.Baru}`}>
                        {site.priority || "Baru"}
                      </span>
                    </td>
                    <td className="db-num">{formatRelative(site.lastScanned)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="db-section-head">
          <h2>Kesehatan Job</h2>
          <span className="db-hint">Scheduler/Uptime Agent — apakah cron benar-benar jalan sesuai jadwal</span>
        </div>

        {jobsError && <div className="db-error">Gagal memuat status job: {jobsError}</div>}

        {!jobsError && (
          <div className="db-table-wrap">
            <table className="db-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Status Terakhir</th>
                  <th>Terakhir Jalan</th>
                  <th>Catatan</th>
                </tr>
              </thead>
              <tbody>
                {orderedJobs.map(({ name, job }) => {
                  const meta = jobStatusMeta(job?.lastStatus);
                  return (
                    <tr key={name}>
                      <td>
                        <span className="db-site-name">{JOB_LABELS[name] || name}</span>
                      </td>
                      <td>
                        <span className={`db-prio ${meta.cls}`}>{meta.label}</span>
                      </td>
                      <td className="db-num">{formatRelative(job?.lastRunAt)}</td>
                      <td>{job?.lastError || job?.meta || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="db-section-head">
          <h2>Template Pesan</h2>
          <div className="db-section-head-right">
            <span className="db-hint">skor = % connected (WA) / % klik CTA (Email), dihitung dari data nyata</span>
            <TemplateGenerateForm />
          </div>
        </div>

        {templatesError && <div className="db-error">Gagal memuat template: {templatesError}</div>}

        {!templatesError && templates.length === 0 && (
          <div className="db-empty">Belum ada template. Klik &quot;✨ Generate Template Baru&quot; untuk mulai.</div>
        )}

        {!templatesError && templates.length > 0 && (
          <div className="db-table-wrap">
            <table className="db-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Template ID</th>
                  <th>Channel</th>
                  <th>Stage</th>
                  <th>Isi</th>
                  <th>Skor</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.templateId}>
                    <td>
                      {t.asset ? (
                        // eslint-disable-next-line @next/next/no-img-element -- gambar dari Google Drive, bukan aset lokal
                        <a href={t.asset} target="_blank" rel="noopener noreferrer">
                          <img src={t.asset} alt="" className="db-template-thumb" />
                        </a>
                      ) : (
                        <span className="db-hint">—</span>
                      )}
                    </td>
                    <td><span className="db-site-name">{t.templateId}</span></td>
                    <td>{CHANNEL_LABEL[t.channel] || t.channel}</td>
                    <td>{STAGE_LABEL[t.stage] || t.stage}</td>
                    <td title={t.channel === "email" ? `Subjek: ${t.subject}\n\n${t.body}` : t.body}>
                      {t.channel === "email" && t.subject ? `${truncate(t.subject, 40)} — ` : ""}
                      {truncate(t.body, 60)}
                    </td>
                    <td className="db-num">{formatScore(t.score, t.timesUsed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </EngineStateProvider>
    </main>
  );
}
