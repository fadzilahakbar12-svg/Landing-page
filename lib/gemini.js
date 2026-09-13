// Generator template pesan pakai Gemini -- dipanggil dari tombol "✨ Generate
// dengan AI" di dashboard (lewat /api/templates/generate). Pakai structured
// output (responseSchema) bawaan Gemini, BUKAN minta "balas cuma JSON" lewat
// teks prompt -- jauh lebih reliable, tidak perlu parsing manual/rawan gagal.
const MODEL = "gemini-3.6-flash";
const IMAGE_MODEL = "gemini-3.1-flash-image";

const BUSINESS_CONTEXT =
  "Kami adalah portal lowongan kerja (job board) di Indonesia. Target pesan ini " +
  "adalah PERUSAHAAN/BRAND yang baru saja membuka lowongan kerja di situs lain " +
  "(hasil scraping), belum tentu tahu portal kami. Tujuannya: menawarkan supaya " +
  "mereka juga memposting lowongan itu di portal kami secara gratis, dengan iming-iming " +
  "banyak kandidat qualified yang siap melamar. Nada bicara: santai, ramah, singkat, " +
  "gaya chat Indonesia sehari-hari (boleh pakai 'kak'), BUKAN bahasa formal korporat.";

const STAGE_CONTEXT = {
  new: "Ini pesan PERTAMA ke perusahaan ini -- mereka belum pernah dihubungi sama sekali.",
  followup:
    "Ini pesan FOLLOW-UP -- perusahaan ini sudah pernah dikirimi pesan sebelumnya tapi belum " +
    "membalas/bertindak. Jangan mengulang persis pesan pertama; buat sudut/alasan follow-up yang " +
    "natural (mis. \"nudge\" sopan, tambahan info baru, atau pertanyaan singkat), tetap singkat.",
};

function buildPrompt({ channel, stage, existingBodies }) {
  const avoidBlock = existingBodies.length
    ? `\n\nJANGAN meniru gaya/kalimat pembuka template yang SUDAH ADA ini (biar bervariasi untuk keperluan A/B test):\n${existingBodies.map((b, i) => `${i + 1}. ${b}`).join("\n")}`
    : "";

  const placeholderRule =
    'WAJIB sisipkan placeholder literal "{{name}}" (dua kurung kurawal, persis begitu) di tempat nama perusahaan/brand seharusnya muncul -- itu akan diganti otomatis oleh sistem, jangan diisi nama sungguhan.';

  if (channel === "email") {
    return (
      `${BUSINESS_CONTEXT}\n\n${STAGE_CONTEXT[stage]}\n\n${placeholderRule}\n\n` +
      `Buatkan draft SATU template email (subject + body) untuk situasi di atas.${avoidBlock}`
    );
  }
  return (
    `${BUSINESS_CONTEXT}\n\n${STAGE_CONTEXT[stage]}\n\n${placeholderRule}\n\n` +
    `Buatkan draft SATU template pesan WhatsApp (singkat, maks 4-5 kalimat, boleh pakai emoji secukupnya) ` +
    `untuk situasi di atas.${avoidBlock}`
  );
}

function schemaFor(channel) {
  if (channel === "email") {
    return {
      type: "OBJECT",
      properties: {
        subject: { type: "STRING", description: "Subjek email, pendek dan menarik dibuka" },
        body: { type: "STRING", description: "Isi email lengkap, sudah termasuk {{name}}" },
      },
      required: ["subject", "body"],
    };
  }
  return {
    type: "OBJECT",
    properties: {
      body: { type: "STRING", description: "Isi pesan WhatsApp lengkap, sudah termasuk {{name}}" },
    },
    required: ["body"],
  };
}

// existingBodies: array string -- body template lain yang SUDAH ADA di channel+stage
// yang sama, dikasih ke model sebagai konteks "jangan diulang" biar variannya
// benar-benar beda (bukan cuma buat memenuhi kuota jumlah template).
export async function generateTemplateWithAI({ channel, stage, existingBodies = [] }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY belum diset.");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt({ channel, stage, existingBodies }) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schemaFor(channel),
        },
      }),
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini API error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini tidak mengembalikan hasil (kemungkinan diblokir safety filter).");

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini mengembalikan hasil yang tidak bisa diparse sebagai JSON.");
  }

  if (!parsed.body || (channel === "email" && !parsed.subject)) {
    throw new Error("Hasil dari Gemini tidak lengkap (subject/body kosong).");
  }
  // Jaring pengaman -- kalau model lupa menyisipkan placeholder walau sudah
  // diminta eksplisit, jangan diam-diam kirim template tanpa personalisasi.
  if (!parsed.body.includes("{{name}}") && (channel !== "email" || !parsed.subject.includes("{{name}}"))) {
    throw new Error('Hasil dari Gemini tidak menyertakan placeholder "{{name}}" -- coba generate ulang.');
  }

  return { subject: parsed.subject || "", body: parsed.body };
}

// Deskripsi gaya visual (dari referensi gambar promo Mekari POS yang dikasih
// operator) -- kita tidak punya file gambarnya untuk dikirim ke model
// (cuma ada di chat, bukan file), jadi didekati lewat deskripsi tertulis:
// warna aksen teal/mint, background putih bersih, ikon bulat dengan garis
// putih, headline tebal warna gelap, tata letak modern & rapi khas produk
// SaaS/tech Indonesia.
const VISUAL_STYLE =
  "Gaya visual: bersih dan modern seperti materi promosi produk SaaS/teknologi Indonesia. " +
  "Warna aksen utama hijau teal/mint cerah (#0EA974-ish), dipadukan putih dan sedikit abu " +
  "muda sebagai background. Ada bentuk lingkaran/blob dekoratif lembut di background. " +
  "Ikon-ikon berbentuk lingkaran teal solid dengan simbol garis putih di dalamnya. " +
  "Teks headline besar, tebal, warna gelap (navy/hitam), rapi dan mudah dibaca. Layout bersih, " +
  "banyak white space, elemen tersusun rapi (bukan penuh sesak). Tidak ada watermark, tidak ada " +
  "teks placeholder aneh/typo -- semua teks di gambar (kalau ada) harus dalam Bahasa Indonesia " +
  "yang benar dan singkat.";

function imagePrompt({ channel, stage, subject, body }) {
  const aspect = channel === "email"
    ? "Rasio gambar landscape/banner (cocok jadi header email, lebar)."
    : "Rasio gambar persegi (cocok dikirim sebagai gambar pendukung pesan WhatsApp).";

  return (
    `Buatkan SATU gambar promosi/ilustrasi pendukung untuk pesan ${channel === "email" ? "email" : "WhatsApp"} berikut ` +
    `(portal lowongan kerja Indonesia menawarkan ke perusahaan untuk posting loker gratis di platform kami):\n\n` +
    `${subject ? `Subjek: ${subject}\n` : ""}Isi pesan: ${body}\n\n` +
    `Gambar ini TIDAK PERLU menyalin ulang teks pesan di atas kata-per-kata -- cukup tangkap TEMA-nya ` +
    `(rekrutmen, lowongan kerja, kandidat, koneksi perusahaan-pencari kerja) dalam bentuk ilustrasi/grafis ringkas. ` +
    `${VISUAL_STYLE}\n\n${aspect}`
  );
}

// Mengembalikan { mimeType, base64 } gambar hasil generate, atau null kalau
// model TIDAK mengembalikan gambar sama sekali (mis. kena safety filter) --
// caller (route generate) memutuskan sendiri apakah itu fatal atau cuma
// "template teks-nya tetap jadi, gambarnya skip".
export async function generateTemplateImageWithAI({ channel, stage, subject, body }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY belum diset.");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: imagePrompt({ channel, stage, subject, body }) }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini Image API error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  if (!imagePart) return null;

  return { mimeType: imagePart.inlineData.mimeType || "image/png", base64: imagePart.inlineData.data };
}
