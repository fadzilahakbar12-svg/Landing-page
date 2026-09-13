import { fetchTemplates, addTemplate } from "@/lib/templates";
import { generateTemplateWithAI } from "@/lib/gemini";

const VALID_CHANNELS = ["email", "whatsapp"];
const VALID_STAGES = ["new", "followup"];

// Tombol "✨ Generate dengan AI" di dashboard -- generate draft (Gemini),
// LANGSUNG disimpan ke Template sheet (belum ada UI edit/preview-dulu untuk
// versi pertama ini; operator bisa lihat & hapus manual dari spreadsheet
// kalau hasilnya kurang pas).
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

    return Response.json({ ok: true, templateId, ...generated });
  } catch (err) {
    return Response.json({ ok: false, error: String(err.message || err) }, { status: 502 });
  }
}
