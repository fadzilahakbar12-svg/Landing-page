// Generator template pesan pakai Gemini -- dipanggil dari tombol "✨ Generate
// dengan AI" di dashboard (lewat /api/templates/generate). Pakai structured
// output (responseSchema) bawaan Gemini, BUKAN minta "balas cuma JSON" lewat
// teks prompt -- jauh lebih reliable, tidak perlu parsing manual/rawan gagal.
const MODEL = "gemini-3.6-flash";

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
