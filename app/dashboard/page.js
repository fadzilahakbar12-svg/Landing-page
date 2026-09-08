import { fetchLeads } from "@/lib/leads";

export const dynamic = "force-dynamic";

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

  try {
    leads = await fetchLeads();
  } catch (err) {
    loadError = String(err);
  }

  const total = leads.length;
  const counts = computeCounts(leads);
  // "attempted" = pesan yang benar-benar diproses (bukan yang masih nunggu jadwal)
  const attempted = counts.sent + counts.read + counts.connected + counts.fail;
  const everRead = counts.read + counts.connected; // "connected" pasti sudah lewat "dibaca"

  return (
    <main className="min-h-screen bg-white px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-zinc-900">Dashboard Leads</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Data langsung dari spreadsheet — refresh halaman ini kapan saja untuk lihat angka terbaru.
        </p>

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
      </div>
    </main>
  );
}
