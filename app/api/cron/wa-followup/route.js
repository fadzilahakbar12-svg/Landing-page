import { fetchLeads, markLeadFollowedUp, setLeadWaMeta } from "@/lib/leads";
import { isWhatsappNumber, sendBulkFollowUpWhatsapp } from "@/lib/notify";

// WhatsApp-only pipeline -- split from email on purpose (see email-followup/route.js).
// Cold WhatsApp outreach needs a much tighter volume cap than email to avoid
// tripping WhatsApp's own spam detection, so the two channels now run on
// completely independent schedules, caps, and "already contacted" columns.
export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Dipanggil 2x sehari (lihat vercel.json) -- dibatasi 25 lead per PANGGILAN
  // (bukan per hari) supaya volume kirim WA ke kontak dingin tetap terkendali
  // dan tidak memicu deteksi spam WhatsApp. Lead yang tersisa otomatis
  // kebagian di panggilan cron berikutnya karena masih punya followUpSentAt
  // kosong. Baris sheet selalu bertambah berurutan sesuai waktu masuk, jadi
  // "ambil yang pending lalu potong 25" ini otomatis mendahulukan antrian
  // paling lama -- tidak perlu logic prioritas tambahan.
  const MAX_PER_BATCH = 25;
  const leads = await fetchLeads();
  const pending = leads
    .filter((lead) => lead.waStatus !== "manual") // skip lead yang sedang Anda tangani manual
    .filter((lead) => !lead.followUpSentAt)
    .slice(0, MAX_PER_BATCH);

  const results = [];

  // 1. Validasi nomor dulu satu-satu (cepat, tidak perlu jeda) -- nomor yang
  // tidak terdaftar WhatsApp langsung ditandai gagal tanpa ikut masuk ke
  // request kirim batch di bawah.
  const validated = [];
  for (const lead of pending) {
    try {
      const valid = await isWhatsappNumber(lead.whatsapp);
      if (valid) {
        validated.push(lead);
      } else {
        await setLeadWaMeta(lead.row, { status: "fail" });
        await markLeadFollowedUp(lead.row);
        results.push({ row: lead.row, name: lead.name, ok: false, errors: ["whatsapp: Nomor tidak terdaftar di WhatsApp."] });
      }
    } catch (err) {
      await setLeadWaMeta(lead.row, { status: "fail" });
      await markLeadFollowedUp(lead.row);
      results.push({ row: lead.row, name: lead.name, ok: false, errors: [`whatsapp (validasi): ${err}`] });
    }
  }

  // 2. Kirim SEMUA nomor valid dalam 1 request ke Fonnte, dengan parameter
  // "delay" yang membuat Fonnte sendiri menjeda ~2 menit antar pengiriman --
  // request ini balas seketika (tidak menunggu semua pesan benar-benar
  // terkirim), jadi tidak kena batas waktu eksekusi function.
  if (validated.length) {
    try {
      const sent = await sendBulkFollowUpWhatsapp(validated);
      for (const { lead, fonnteMessageId } of sent) {
        await setLeadWaMeta(lead.row, { status: "sent", fonnteMessageId });
        await markLeadFollowedUp(lead.row);
        results.push({ row: lead.row, name: lead.name, ok: true });
      }
    } catch (err) {
      // Seluruh batch gagal (mis. Fonnte down/kuota habis) -- tandai fail
      // semua supaya tidak "hilang" dari antrian, coba lagi di panggilan berikutnya
      // TIDAK dilakukan di sini secara sengaja: markLeadFollowedUp TIDAK dipanggil,
      // supaya baris ini tetap dianggap pending dan otomatis dicoba lagi nanti.
      for (const lead of validated) {
        results.push({ row: lead.row, name: lead.name, ok: false, errors: [`whatsapp (batch): ${err}`] });
      }
    }
  }

  return Response.json({ ok: true, processed: results.length, results });
}
