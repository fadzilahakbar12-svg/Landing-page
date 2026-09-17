import { dedupeLeads } from "@/lib/leads";

// Tombol "Bersihkan Duplikat" di dashboard -- lihat lib/leads.js#dedupeLeads
// untuk aturannya (company+email sama ATAU company+whatsapp sama = duplikat).
export async function POST() {
  try {
    const result = await dedupeLeads();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json({ ok: false, error: String(err.message || err) }, { status: 502 });
  }
}
