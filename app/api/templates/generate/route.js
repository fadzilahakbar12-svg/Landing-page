import { fetchTemplates, addTemplate, saveTemplateAsset } from "@/lib/templates";
import { generateTemplateWithAI, generateTemplateImageWithAI } from "@/lib/gemini";

const VALID_CHANNELS = ["email", "whatsapp"];
const VALID_STAGES = ["new", "followup"];

// Tombol "✨ Generate dengan AI" di dashboard -- generate draft teks (Gemini,
// structured output) + 1 gambar pendukung (Gemini image, tema disesuaikan
// isi pesannya), LANGSUNG disimpan ke Template sheet + Google Drive. Belum
// ada UI edit/preview-dulu untuk versi pertama ini; operator bisa lihat &
// hapus manual dari spreadsheet/Drive kalau hasilnya kurang pas.
export async function POST(request) {
  const body = await request.json();
  const channel = String(body.channel || "").trim().toLowerCase();
  const stage = String(body.stage || "").trim().toLowerCase();

  if (!VALID_CHANNELS.includes(channel)) {
    return Response.json({ ok: false, error: "channel harus 'email' atau 'whatsapp'." }, { status: 400 });
  }
  if (!VALID_STAGES.includes(stage)) {
    return Response.json({ ok: false, error: "stage harus 'new' atau 'followup'." }, { status: 400 });
  }

  try {
    const existing = await fetchTemplates();
    const existingBodies = existing
      .filter((t) => t.channel === channel && t.stage === stage)
      .map((t) => t.body)
      .slice(0, 10); // cukup buat konteks "jangan diulang", tidak perlu semuanya

    const generated = await generateTemplateWithAI({ channel, stage, existingBodies });
    const templateId = await addTemplate({ channel, stage, subject: generated.subject, body: generated.body });

    // Gambar itu "bonus" -- kalau gagal (mis. kena safety filter, atau
    // GEMINI_API_KEY sedang bermasalah), template TEKS-nya tetap tersimpan
    // dan dipakai seperti biasa. Jangan sampai satu gagal menjatuhkan semua.
    //
    // Dimatikan lewat ENABLE_TEMPLATE_IMAGES (default: off) sampai billing
    // buat model image generation Gemini diaktifkan di sisi akun -- tanpa
    // flag ini tiap generate selalu nunggu lalu gagal 429 (quota), buang
    // waktu percuma. Tinggal set ENABLE_TEMPLATE_IMAGES=1 kalau sudah siap,
    // tidak perlu ubah kode lagi.
    let assetUrl = null;
    let assetError = null;
    if (process.env.ENABLE_TEMPLATE_IMAGES === "1") {
      try {
        const image = await generateTemplateImageWithAI({ channel, stage, subject: generated.subject, body: generated.body });
        if (image) {
          assetUrl = await saveTemplateAsset(templateId, image);
        } else {
          assetError = "Gemini tidak menghasilkan gambar (kemungkinan kena safety filter).";
        }
      } catch (err) {
        assetError = String(err.message || err);
      }
    }

    return Response.json({ ok: true, templateId, ...generated, assetUrl, assetError });
  } catch (err) {
    return Response.json({ ok: false, error: String(err.message || err) }, { status: 502 });
  }
}
