import { recordLicenseCheckin, fetchLicenseCheckins } from "@/lib/license";

// Publik juga (sama seperti /api/sites) -- deviceId cuma UUID acak, bukan
// data pribadi apapun, jadi aman dibaca tanpa auth. Dipakai buat cek jumlah
// device aktif dari luar dashboard (mis. curl langsung).
export async function GET() {
  try {
    const checkins = await fetchLicenseCheckins();
    return Response.json({ ok: true, checkins });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 502 });
  }
}

// Endpoint PUBLIK (sengaja tanpa auth apapun, sama seperti /api/lead) --
// dipanggil extension BarScraper saat popup dibuka, cuma untuk verifikasi
// lisensi TERBUKA (lihat #licenseNotice di popup.js/popup.html BarScraper).
// Cuma menerima deviceId (acak, tidak terkait identitas) + version -- TIDAK
// PERNAH menerima/menyimpan data leads/scrape apapun, endpoint ini beda
// total dari /api/lead.
export async function POST(request) {
  const body = await request.json().catch(() => null);
  const deviceId = body && typeof body.deviceId === "string" ? body.deviceId.slice(0, 100) : "";
  const version = body && typeof body.version === "string" ? body.version.slice(0, 30) : "";

  if (!deviceId) {
    return Response.json({ ok: false, error: "deviceId wajib diisi." }, { status: 400 });
  }

  try {
    await recordLicenseCheckin({ deviceId, version });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 502 });
  }
}
