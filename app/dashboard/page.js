import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { fetchLeads } from "@/lib/leads";
import { fetchSites } from "@/lib/sites";
import { getEngineState } from "@/lib/engine";
import AddSiteForm from "./AddSiteForm";
import EngineToggle from "./EngineToggle";
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

function computeCounts(leads) {
  const counts = { pending: 0, sent: 0, read: 0, connected: 0, manual: 0, fail: 0 };
  for (const lead of leads) {
    const status = lead.waStatus;
    if (status === "read" || status === "connected" || status === "fail" || status === "sent" || status === "manual") {
      counts[status]++;
    } else {
      counts.pending++;
    }
  }
  return counts;
}

// Funnel WA: "Terkirim" itu KUMULATIF (siapapun yang pernah dikirimi, apapun
// status TERKINI-nya sekarang) -- bukan cuma yang masih persis di status
// "sent" (itu sudah "lewat" begitu statusnya maju ke read/connected).
function waFunnel(counts) {
  const sent = counts.sent + counts.read + counts.connected + counts.fail;
  const read = counts.read + counts.connected; // "connected" pasti sudah lewat "dibaca"
  const connected = counts.connected;
  return { sent, read, connected };
}

// Funnel Email: sama logikanya, dari emailSentAt/emailStatus (kolom terpisah
// dari WA sejak Fase 1) -- "clicked" pasti sudah lewat "opened".
function emailFunnel(leads) {
  const sent = leads.filter((l) => l.emailSentAt).length;
  const opened = leads.filter((l) => l.emailStatus === "opened" || l.emailStatus === "clicked").length;
  const clicked = leads.filter((l) => l.emailStatus === "clicked").length;
  return { sent, opened, clicked };
}

function pct(numerator, denominator) {
  if (!denominator) return "0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function barWidth(numerator, denominator) {
  if (!denominator) return "0%";
  return `${Math.min(100, Math.round((numerator / denominator) * 100))}%`;
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

  const total = leads.length;
  const counts = computeCounts(leads);
  const wa = waFunnel(counts);
  const email = emailFunnel(leads);
  const combinedSent = wa.sent + email.sent; // gabungan 2 channel (WA + Email), bukan cuma WA

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

        <div className="db-stats">
          <div className="db-tile is-total">
            <p className="db-tile-label">Total Leads</p>
            <p className="db-tile-value">{total}</p>
          </div>
          <div className="db-tile c-sent">
            <p className="db-tile-label">Terkirim</p>
            <p className="db-tile-value">{combinedSent}</p>
            <p className="db-tile-sub">WA {wa.sent} + Email {email.sent}</p>
          </div>
          <div className="db-tile c-read">
            <p className="db-tile-label">WA Dibaca</p>
            <p className="db-tile-value">{wa.read}</p>
            <p className="db-tile-sub">{pct(wa.read, wa.sent)} dari terkirim</p>
          </div>
          <div className="db-tile c-connected">
            <p className="db-tile-label">WA Terhubung</p>
            <p className="db-tile-value">{wa.connected}</p>
            <p className="db-tile-sub">{pct(wa.connected, wa.sent)} dari terkirim</p>
          </div>
          <div className="db-tile c-fail">
            <p className="db-tile-label">WA Gagal</p>
            <p className="db-tile-value">{counts.fail}</p>
            <p className="db-tile-sub">nomor tidak valid</p>
          </div>
        </div>

        <div className="db-section-head">
          <h2>Funnel per Sumber</h2>
          <span className="db-hint">WhatsApp vs Email</span>
        </div>

        <div className="db-funnel-grid">
          <div className="db-funnel-card wa">
            <div className="db-funnel-head">
              <span className="db-funnel-title">WhatsApp</span>
              <span className="db-funnel-conv">
                <span className="n">{pct(wa.connected, wa.sent)}</span>
                <span className="l">terhubung</span>
              </span>
            </div>
            <div className="db-funnel-stage">
              <span className="db-funnel-stage-label">Terkirim</span>
              <span className="db-funnel-stage-track"><span className="db-funnel-stage-fill" style={{ width: "100%" }} /></span>
              <span className="db-funnel-stage-num">{wa.sent}</span>
            </div>
            <div className="db-funnel-stage">
              <span className="db-funnel-stage-label">Dibaca</span>
              <span className="db-funnel-stage-track"><span className="db-funnel-stage-fill" style={{ width: barWidth(wa.read, wa.sent) }} /></span>
              <span className="db-funnel-stage-num">{wa.read} <small>{pct(wa.read, wa.sent)}</small></span>
            </div>
            <div className="db-funnel-stage">
              <span className="db-funnel-stage-label">Terhubung</span>
              <span className="db-funnel-stage-track"><span className="db-funnel-stage-fill" style={{ width: barWidth(wa.connected, wa.sent) }} /></span>
              <span className="db-funnel-stage-num">{wa.connected} <small>{pct(wa.connected, wa.sent)}</small></span>
            </div>
          </div>

          <div className="db-funnel-card email">
            <div className="db-funnel-head">
              <span className="db-funnel-title">Email</span>
              <span className="db-funnel-conv">
                <span className="n">{pct(email.clicked, email.sent)}</span>
                <span className="l">klik CTA</span>
              </span>
            </div>
            <div className="db-funnel-stage">
              <span className="db-funnel-stage-label">Terkirim</span>
              <span className="db-funnel-stage-track"><span className="db-funnel-stage-fill" style={{ width: "100%" }} /></span>
              <span className="db-funnel-stage-num">{email.sent}</span>
            </div>
            <div className="db-funnel-stage">
              <span className="db-funnel-stage-label">Dibuka</span>
              <span className="db-funnel-stage-track"><span className="db-funnel-stage-fill" style={{ width: barWidth(email.opened, email.sent) }} /></span>
              <span className="db-funnel-stage-num">{email.opened} <small>{pct(email.opened, email.sent)}</small></span>
            </div>
            <div className="db-funnel-stage">
              <span className="db-funnel-stage-label">Klik CTA</span>
              <span className="db-funnel-stage-track"><span className="db-funnel-stage-fill" style={{ width: barWidth(email.clicked, email.sent) }} /></span>
              <span className="db-funnel-stage-num">{email.clicked} <small>{pct(email.clicked, email.sent)}</small></span>
            </div>
          </div>
        </div>

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
