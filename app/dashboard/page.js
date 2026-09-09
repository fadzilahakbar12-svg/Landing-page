import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { fetchLeads } from "@/lib/leads";
import { fetchSites } from "@/lib/sites";
import { getEngineState } from "@/lib/engine";
import { computeWaCounts, waFunnel, emailFunnel, leadsInWindow, computeDelta } from "@/lib/metrics";
import AddSiteForm from "./AddSiteForm";
import EngineToggle from "./EngineToggle";
import StatsPanel from "./StatsPanel";
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

function pct(numerator, denominator) {
  if (!denominator) return "0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

// 1 "cohort" = lead yang MASUK dalam jendela waktu tsb (by timestamp), lalu
// status WA/email-nya diambil dari kondisi TERKINI (bukan snapshot di masa
// itu -- data historis per-event tidak tersimpan). Delta dihitung terhadap
// jendela sebelumnya yang sama panjangnya (mis. 7 hari ini vs 7 hari sebelum itu).
function buildRangeStat(leads, days, sub) {
  const period = leadsInWindow(leads, days, 0);
  const prev = leadsInWindow(leads, days, days);

  const pCounts = computeWaCounts(period);
  const pWa = waFunnel(pCounts);
  const pEmail = emailFunnel(period);
  const pSent = pWa.sent + pEmail.sent;

  const qCounts = computeWaCounts(prev);
  const qWa = waFunnel(qCounts);
  const qEmail = emailFunnel(prev);
  const qSent = qWa.sent + qEmail.sent;

  return {
    sub: sub(period.length),
    total: { value: period.length, delta: computeDelta(period.length, prev.length) },
    sent: { value: pSent, delta: computeDelta(pSent, qSent) },
    read: { value: pWa.read, delta: computeDelta(pWa.read, qWa.read) },
    connected: { value: pWa.connected, delta: computeDelta(pWa.connected, qWa.connected) },
    fail: { value: pCounts.fail, delta: computeDelta(pCounts.fail, qCounts.fail) },
    readPct: pct(pWa.read, pWa.sent),
    connectedPct: pct(pWa.connected, pWa.sent),
    waConvPct: pct(pWa.connected, pWa.sent),
    waConvDelta: computeDelta(pWa.sent ? Math.round((pWa.connected / pWa.sent) * 100) : 0, qWa.sent ? Math.round((qWa.connected / qWa.sent) * 100) : 0),
    emailConvPct: pct(pEmail.clicked, pEmail.sent),
    emailConvDelta: computeDelta(pEmail.sent ? Math.round((pEmail.clicked / pEmail.sent) * 100) : 0, qEmail.sent ? Math.round((qEmail.clicked / qEmail.sent) * 100) : 0),
    waStage: pWa,
    emailStage: pEmail,
  };
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

  let engineEnabled = false;
  try {
    engineEnabled = await getEngineState();
  } catch {
    // biarkan default false (mati) kalau gagal baca -- lebih aman daripada
    // diam-diam anggap "jalan" padahal statusnya tidak terbaca.
  }

  const sortedSites = [...sites].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4)
  );

  const rangeData = {
    today: buildRangeStat(leads, 1, (n) => `+${n} hari ini`),
    "7d": buildRangeStat(leads, 7, (n) => `+${n} minggu ini`),
    "30d": buildRangeStat(leads, 30, (n) => `+${n} bulan ini`),
  };

  return (
    <main className={`db-panel ${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <div className="db-inner">
        <div className="db-topbar">
          <div className="db-brand">
            <p className="db-eyebrow">Kontrol Panel · Bank Data</p>
            <h1>Ringkasan Leads</h1>
            <p className="db-sub">Data langsung dari spreadsheet — refresh kapan saja untuk lihat angka terbaru.</p>
            <p className="db-engine-line">
              Engine: {engineEnabled ? <span className="on">Jalan</span> : <span className="off">Berhenti</span>}
              {" "}— scrape otomatis, follow-up WA &amp; email cuma aktif kalau engine jalan.
            </p>
          </div>
          <div className="db-actions">
            <a href={BANK_DATA_URL} target="_blank" rel="noopener noreferrer" className="db-btn-ghost">
              🔗 Buka Bank Data
            </a>
            <EngineToggle initialEnabled={engineEnabled} />
          </div>
        </div>

        {loadError && <div className="db-error">Gagal memuat data: {loadError}</div>}

        <StatsPanel rangeData={rangeData} />

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
      </div>
    </main>
  );
}
