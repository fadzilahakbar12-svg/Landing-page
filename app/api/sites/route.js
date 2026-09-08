import { fetchSites, addSite } from "@/lib/sites";

// Proxy tipis ke Apps Script -- sama alasannya dengan /api/lead: secret Apps
// Script tetap di server, tidak pernah dikirim ke browser lewat form "+ Tambah Situs".
export async function GET() {
  try {
    const sites = await fetchSites();
    return Response.json({ ok: true, sites });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 502 });
  }
}

export async function POST(request) {
  const body = await request.json();
  const raw = String(body.domain || "").trim();
  if (!raw) {
    return Response.json({ ok: false, error: "URL/domain wajib diisi." }, { status: 400 });
  }

  // Terima baik "https://situs.id/lowongan" maupun "situs.id" -- ambil hostname-nya saja.
  let domain = raw;
  try {
    domain = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
  } catch {
    return Response.json({ ok: false, error: "URL tidak valid." }, { status: 400 });
  }

  try {
    await addSite(domain);
    return Response.json({ ok: true, domain });
  } catch (err) {
    // Kegagalan di sini umumnya karena input (mis. domain duplikat), bukan
    // server down -- 400 lebih tepat daripada 502 supaya form bisa tampilkan
    // pesannya apa adanya ke user.
    return Response.json({ ok: false, error: String(err.message || err) }, { status: 400 });
  }
}
