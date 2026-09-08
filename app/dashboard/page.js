import { fetchLeads } from "@/lib/leads";
import { fetchSites } from "@/lib/sites";
import { getEngineState } from "@/lib/engine";
import AddSiteForm from "./AddSiteForm";
import EngineToggle from "./EngineToggle";

const BANK_DATA_URL = "https://docs.google.com/spreadsheets/d/1JxV1UAq_c-erM_28UojQ7yKW-JraFrXpEgcCIpVLukQ/edit?gid=0#gid=0";

export const dynamic = "force-dynamic";

const PRIORITY_ORDER = { Tinggi: 0, Sedang: 1, Rendah: 2, Baru: 3 };
const PRIORITY_BADGE = {
  Tinggi: "bg-green-50 text-green-700",
  Sedang: "bg-amber-50 text-amber-700",
  Rendah: "bg-zinc-100 text-zinc-600",
  Baru: "border border-dashed border-zinc-300 text-zinc-500",
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

const STATUS_META = {
  pending: { label: "Menunggu", color: "text-zinc-500", bg: "bg-zinc-50" },
  sent: { label: "Terkirim", color: "text-zinc-600", bg: "bg-zinc-50" },
  read: { label: "Dibaca", color: "text-blue-600", bg: "bg-blue-50" },
  connected: { label: "Terhubung", color: "text-green-600", bg: "bg-green-50" },
  manual: { label: "Ditangani Manual", color: "text-amber-600", bg: "bg-amber-50" },
  fail: { label: "Gagal", color: "text-red-600", bg: "bg-red-50" },
};

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

function pct(numerator, denominator) {
  if (!denominator) return "0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
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
  // "attempted" = pesan yang benar-benar diproses (bukan yang masih nunggu jadwal)
  const attempted = counts.sent + counts.read + counts.connected + counts.fail;
  const everRead = counts.read + counts.connected; // "connected" pasti sudah lewat "dibaca"

  return (
    <main className="min-h-screen bg-white px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Dashboard Leads</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Data langsung dari spreadsheet — refresh halaman ini kapan saja untuk lihat angka terbaru.
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Engine: {engineEnabled ? (
                <span className="font-medium text-green-600">Jalan</span>
              ) : (
                <span className="font-medium text-zinc-500">Berhenti</span>
              )}{" "}
              — scrape otomatis, follow-up WA &amp; email cuma aktif kalau engine jalan.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={BANK_DATA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:border-zinc-400"
            >
              🔗 Buka Bank Data
            </a>
            <EngineToggle initialEnabled={engineEnabled} />
          </div>
        </div>

        {loadError && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Gagal memuat data: {loadError}
          </div>
        )}

        <div className="mt-8 rounded-2xl border border-zinc-200 p-6">
          <p className="text-sm font-medium text-zinc-500">Total Leads</p>
          <p className="mt-1 text-4xl font-bold text-zinc-900">{total}</p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Object.entries(STATUS_META).map(([key, meta]) => (
            <div key={key} className={`rounded-xl border border-zinc-200 p-4 ${meta.bg}`}>
              <p className="text-xs font-medium text-zinc-500">{meta.label}</p>
              <p className={`mt-1 text-2xl font-bold ${meta.color}`}>{counts[key]}</p>
              <p className="mt-0.5 text-xs text-zinc-400">{pct(counts[key], total)} dari total</p>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-zinc-200 p-6">
          <p className="text-sm font-semibold text-zinc-900">Angka Konversi</p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-zinc-600">Berhasil diproses (dari total leads)</dt>
              <dd className="font-semibold text-zinc-900">{pct(attempted, total)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-zinc-600">Dibaca (dari yang diproses)</dt>
              <dd className="font-semibold text-blue-600">{pct(everRead, attempted)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-zinc-600">Terhubung / dibalas (dari yang diproses)</dt>
              <dd className="font-semibold text-green-600">{pct(counts.connected, attempted)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
              <dt className="font-medium text-zinc-900">Konversi keseluruhan (terhubung dari total leads)</dt>
              <dd className="text-base font-bold text-green-700">{pct(counts.connected, total)}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Performa Situs</h2>
            <AddSiteForm />
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Watchlist situs yang di-scan otomatis. Situs bertanda &quot;perlu manual&quot; butuh
            BarScraper (belum bisa full-otomatis).
          </p>

          {sitesError && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Gagal memuat watchlist situs: {sitesError}
            </div>
          )}

          {!sitesError && sortedSites.length === 0 && (
            <div className="mt-3 rounded-xl border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-400">
              Belum ada situs di watchlist. Klik &quot;+ Tambah Situs&quot; untuk mulai.
            </div>
          )}

          {!sitesError && sortedSites.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-2xl border border-zinc-200">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Situs</th>
                    <th className="px-4 py-3">Loker Ditemukan</th>
                    <th className="px-4 py-3">Sukses Ekstraksi</th>
                    <th className="px-4 py-3">Prioritas</th>
                    <th className="px-4 py-3">Terakhir Discan</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSites.map((site) => (
                    <tr key={site.domain} className="border-t border-zinc-100">
                      <td className="px-4 py-3">
                        <p className="font-medium text-zinc-900">{site.domain}</p>
                        {site.needsManualScrape && (
                          <p className="text-xs text-amber-600">perlu manual (BarScraper)</p>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-zinc-700">{site.jobsFound || "—"}</td>
                      <td className="px-4 py-3 tabular-nums text-zinc-700">{formatSuccessRate(site.successRate)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${PRIORITY_BADGE[site.priority] || PRIORITY_BADGE.Baru}`}>
                          {site.priority || "Baru"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-500">{formatRelative(site.lastScanned)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
