/**
 * extractor.js — UNIVERSAL JOB PORTAL EXTRACTOR (versi Node/server)
 *
 * PORT LANGSUNG dari extractor.js di project BarScraper (Chrome extension) --
 * logic ekstraksinya identik, murni JS/DOM biasa (querySelectorAll, dsb.),
 * tidak pakai API khusus Chrome extension, jadi bisa jalan di Node.js asal
 * diberi objek `doc` yang kompatibel (lihat lib/scraper.js -- pakai "linkedom"
 * sebagai pengganti DOMParser browser).
 *
 * PENTING -- MAINTENANCE: kedua file ini TIDAK auto-sync (repo terpisah).
 * Kalau ada perbaikan heuristik ekstraksi di BarScraper, salin manual
 * perubahannya ke sini juga (dan sebaliknya), atau salah satu bakal makin
 * ketinggalan dari yang lain.
 *
 * Tidak terikat ke domain/situs tertentu. Bekerja di halaman lowongan kerja
 * dari job portal manapun dengan strategi berlapis (dari paling akurat ke fallback):
 *
 *  1. Schema.org JSON-LD "JobPosting" — format data terstruktur standar yang
 *     dipakai banyak job board (termasuk yang terindeks Google for Jobs).
 *     Kalau situs menyediakan ini, hasilnya paling akurat.
 *  2. Link "profil perusahaan" (href mengandung /company/, /perusahaan/, /employer/)
 *  3. Pola judul halaman umum ("... di [Company]", "... at [Company]", "... - [Company]")
 *  4. Label teks umum ("Perusahaan:", "Company:", "Employer:", dst)
 *
 * Untuk kontak (WhatsApp/email), semuanya berbasis pemindaian teks/link generik
 * (wa.me, api.whatsapp.com, pola nomor HP Indonesia, alamat email) — tidak ada
 * pengecualian nomor/email spesifik situs tertentu.
 */

// ---------- Util umum ----------

// PENTING: `.innerText` cuma akurat (menyembunyikan isi <script>/<style>/elemen
// tersembunyi) kalau dokumennya benar-benar DIRENDER oleh browser. Extractor
// ini juga dipakai untuk dokumen hasil `new DOMParser().parseFromString(html)`
// dari fetch() (dipakai di jalur "Auto-Scan" & "Ambil Data dari Semua Link"),
// yang TIDAK PERNAH dirender -- pada dokumen semacam itu, Chrome diam-diam
// menjatuhkan `.innerText` ke perilaku seperti `.textContent`, yang IKUT
// MEMBACA isi <script>/<style> apa adanya. Ini bisa menangkap nomor/email
// PALSU dari data JSON internal situs (mis. teks placeholder contoh nomor
// telepon di form lamar, bukan kontak sungguhan). Untuk menghindarinya, buang
// dulu elemen non-visual dari salinan <body> sebelum membaca teksnya, alih-
// alih memakai `.innerText`/`.textContent` mentah.
function getVisibleBodyText(doc) {
  if (!doc.body) return "";
  const clone = doc.body.cloneNode(true);
  clone.querySelectorAll('script, style, noscript, template, [hidden]').forEach((el) => el.remove());
  clone.querySelectorAll('[style*="display:none" i], [style*="display: none" i], [style*="visibility:hidden" i], [style*="visibility: hidden" i]').forEach((el) => el.remove());
  return clone.textContent || "";
}

// ---------- Kontak dari data JSON tersembunyi (SSR payload) ----------
// Banyak job portal modern (Next.js/Nuxt/dst) menaruh SELURUH data halaman
// -- termasuk field kontak recruiter/HR yang mengelola lowongan -- sebagai
// JSON di dalam <script> (mis. __NEXT_DATA__), yang TIDAK PERNAH dirender
// jadi teks visible, jadi tidak tertangkap oleh getVisibleBodyText(). Field
// semacam ini bisa berisi kontak ASLI (mis. email akun HR yang mengelola
// lowongan tsb di platform) ATAU teks placeholder/contoh UI (mis. string
// i18n "phone-example"). Untuk membedakan keduanya TANPA hardcode ke 1
// situs, dipakai pendekatan berbasis STRUKTUR data (nama field + bentuk
// value), bukan scan teks bebas:
//  - Value harus PERSIS berbentuk email/nomor telepon (bukan cuma
//    "mengandung" pola di tengah kalimat lain) -- otomatis menyingkirkan
//    teks seperti "Contoh: +6288812345678." karena itu bukan value bersih.
//  - Nama field harus terlihat relevan (mengandung "email"/"phone"/dst) DAN
//    TIDAK mengandung kata yang menandakan teks UI/contoh ("example",
//    "placeholder", "hint", "error", "label", "tooltip", "message", dst).
const CONTACT_JSON_EXCLUDE_KEY_RE = /example|placeholder|hint|error|label|tooltip|message|desc|title|help|format|regex|pattern|valid/i;
const EMAIL_JSON_KEY_RE = /email/i;
const WHATSAPP_JSON_KEY_RE = /whatsapp/i;
const PHONE_JSON_KEY_RE = /phone|mobile|handphone|kontak|telp|telepon|nomorhp|noHp/i;
const CLEAN_EMAIL_VALUE_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const CLEAN_PHONE_VALUE_RE = /^[\d\s+()-]{7,20}$/;
// 20 -- SSR payload modern (mis. Next.js + react-query) sering membungkus data
// cukup dalam (mis. "props.pageProps.dehydratedState.queries[0].state.data...."
// bisa sampai kedalaman 9+ sebelum ketemu field kontak sungguhan). Batas ini
// cuma jaga-jaga dari struktur pathological/melingkar, bukan untuk performa --
// karena JSON.parse() tidak menghasilkan referensi melingkar, biaya rekursi
// tetap proporsional ke ukuran datanya, bukan ke kedalaman limit ini.
const JSON_WALK_MAX_DEPTH = 20;

function walkJsonForContacts(node, keyHint, out, depth) {
  if (node == null || depth > JSON_WALK_MAX_DEPTH) return;
  if (typeof node === "string") {
    const val = node.trim();
    if (!val || CONTACT_JSON_EXCLUDE_KEY_RE.test(keyHint)) return;
    if (EMAIL_JSON_KEY_RE.test(keyHint) && CLEAN_EMAIL_VALUE_RE.test(val)) out.emails.push(val);
    const looksLikePhone = CLEAN_PHONE_VALUE_RE.test(val) && /\d{7,}/.test(val);
    if (looksLikePhone && WHATSAPP_JSON_KEY_RE.test(keyHint)) out.whatsapp.push(val);
    else if (looksLikePhone && PHONE_JSON_KEY_RE.test(keyHint)) out.phones.push(val);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item) => walkJsonForContacts(item, keyHint, out, depth + 1));
    return;
  }
  if (typeof node === "object") {
    for (const key of Object.keys(node)) {
      walkJsonForContacts(node[key], key, out, depth + 1);
    }
  }
}

// Dipanggil SEKALI per halaman (lihat extractJobData) -- memindai semua tag
// <script> yang isinya bisa di-parse sebagai JSON (application/json,
// __NEXT_DATA__, atau assignment "var x = {...}" umum) lalu menelusuri
// seluruh field-nya secara rekursif.
function collectJsonContacts(doc) {
  const out = { emails: [], whatsapp: [], phones: [] };
  const scripts = Array.from(doc.querySelectorAll("script"));
  for (const s of scripts) {
    const raw = (s.textContent || "").trim();
    if (!raw || raw.length < 20) continue;
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      // Sebagian situs menaruh JSON di dalam assignment JS, mis.
      // "window.__DATA__ = {...};" -- coba ambil blok {...} di ujung skrip.
      const m = raw.match(/=\s*(\{[\s\S]*\})\s*;?\s*$/);
      if (!m) continue;
      try {
        data = JSON.parse(m[1]);
      } catch (e2) {
        continue;
      }
    }
    walkJsonForContacts(data, "", out, 0);
  }
  out.emails = Array.from(new Set(out.emails));
  out.whatsapp = Array.from(new Set(out.whatsapp));
  out.phones = Array.from(new Set(out.phones));
  return out;
}

function absUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).href;
  } catch (e) {
    return null;
  }
}

function sameOrigin(url, baseUrl) {
  try {
    return new URL(url).hostname.replace(/^www\./, "") === new URL(baseUrl).hostname.replace(/^www\./, "");
  } catch (e) {
    return false;
  }
}

// ---------- 1. Schema.org JSON-LD JobPosting ----------
function findJsonLdJobPosting(doc) {
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  for (const s of scripts) {
    let data;
    try {
      data = JSON.parse(s.textContent);
    } catch (e) {
      continue;
    }
    const candidates = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];
    for (const item of candidates) {
      if (!item || typeof item !== "object") continue;
      const type = item["@type"];
      const isJobPosting = type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
      if (isJobPosting) return item;
    }
  }
  return null;
}

function findJsonLdJobList(doc) {
  // Beberapa halaman listing menaruh ItemList berisi banyak JobPosting sekaligus
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  const jobs = [];
  for (const s of scripts) {
    let data;
    try {
      data = JSON.parse(s.textContent);
    } catch (e) {
      continue;
    }
    const roots = Array.isArray(data) ? data : [data];
    roots.forEach((root) => {
      if (root && root["@type"] === "ItemList" && Array.isArray(root.itemListElement)) {
        root.itemListElement.forEach((el) => {
          const item = el.item || el;
          if (item && item.url) jobs.push(item.url);
        });
      }
    });
  }
  return jobs;
}

// ---------- 2-5. Fallback nama perusahaan ----------

// Domain sosial media/pihak ketiga yang SERING muncul sebagai link di footer/header
// job portal manapun (ikon share, ikon follow, dsb). URL LinkedIn sendiri secara
// kebetulan mengandung "/company/" (mis. linkedin.com/company/nama-perusahaan),
// jadi tanpa pengecualian ini, link ikon LinkedIn situs job portal itu sendiri bisa
// salah tertangkap sebagai "link profil perusahaan".
const THIRD_PARTY_SOCIAL_DOMAINS = [
  "linkedin.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "t.me",
  "telegram.me",
  "wa.me",
  "api.whatsapp.com",
  "whatsapp.com",
  "youtube.com",
  "tiktok.com",
];

function isThirdPartySocialUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return THIRD_PARTY_SOCIAL_DOMAINS.some((d) => host === d || host.endsWith("." + d));
  } catch (e) {
    return false;
  }
}

// ---------- Link lamar eksternal (ATS / form pihak ketiga) ----------
// Banyak startup & perusahaan di Indonesia tidak pakai form lamar bawaan job
// portal, tapi mengarahkan pelamar ke sistem ATS (Applicant Tracking System)
// pihak ketiga atau form generik (Google Form dsb). Ini sinyal kontak yang
// berharga tapi sebelumnya tidak tertangkap sama sekali oleh extractor.
// Daftar ini generik (bukan spesifik 1 situs) -- berlaku untuk job portal
// manapun yang menautkan ke salah satu platform ini.
const ATS_FORM_DOMAINS = [
  "forms.gle",
  "typeform.com",
  "greenhouse.io",
  "boards.greenhouse.io",
  "lever.co",
  "jobs.lever.co",
  "workable.com",
  "apply.workable.com",
  "smartrecruiters.com",
  "bamboohr.com",
  "jazzhr.com",
  "recruitee.com",
  "personio.de",
  "personio.com",
  "breezy.hr",
  "freshteam.com",
  "myworkdayjobs.com",
  "workday.com",
  "successfactors.com",
  "icims.com",
  "taleo.net",
  "jobvite.com",
  "ashbyhq.com",
];

function isAtsFormUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    // Google Forms bisa berupa domain pendek forms.gle ATAU
    // docs.google.com/forms/... -- keduanya dicek terpisah karena
    // docs.google.com juga dipakai untuk hal lain (Docs, Sheets, dst) yang
    // BUKAN form lamar.
    if (host === "docs.google.com") return /\/forms\//i.test(u.pathname);
    return ATS_FORM_DOMAINS.some((d) => host === d || host.endsWith("." + d));
  } catch (e) {
    return false;
  }
}

// Ambil link "Lamar" ke ATS/form eksternal kalau ada. Diutamakan anchor dengan
// teks yang jelas menandakan tombol lamar ("lamar/apply/daftar/formulir");
// kalau tidak ada teks yang cocok, ambil link ATS pertama yang ditemukan.
function extractApplyLink(doc, baseUrl) {
  const anchors = Array.from(doc.querySelectorAll("a[href]"));
  const candidates = [];
  for (const a of anchors) {
    const hrefRaw = a.getAttribute("href");
    if (!hrefRaw) continue;
    const abs = absUrl(hrefRaw, baseUrl);
    if (!abs || !isAtsFormUrl(abs)) continue;
    candidates.push(a);
  }
  if (!candidates.length) return "";
  const preferred = candidates.find((a) =>
    /lamar|apply|daftar|formulir|form|kirim/i.test((a.textContent || "").trim())
  );
  const chosen = preferred || candidates[0];
  return absUrl(chosen.getAttribute("href"), baseUrl) || "";
}

function extractCompanyFromProfileLink(doc, baseUrl) {
  const candidates = Array.from(
    doc.querySelectorAll(
      'a[href*="/company/"], a[href*="/companies/"], a[href*="/perusahaan/"], a[href*="/employer/"], a[href*="/employers/"]'
    )
  );
  for (const link of candidates) {
    const hrefRaw = link.getAttribute("href");
    if (!hrefRaw) continue;
    const abs = absUrl(hrefRaw, baseUrl);
    if (!abs) continue;
    // Hanya anggap valid kalau link INTERNAL (situs job portal yang sama) dan
    // BUKAN domain sosial media pihak ketiga -- profil perusahaan asli selalu
    // ada di situs job portal itu sendiri, bukan di linkedin.com/facebook.com/dst.
    if (isThirdPartySocialUrl(abs)) continue;
    if (!sameOrigin(abs, baseUrl)) continue;

    const titleAttr = link.getAttribute("title") || "";
    const tm = titleAttr.match(/(?:profile|profil)\s*:?\s*(.+)/i);
    if (tm && tm[1] && tm[1].trim().length > 1) return tm[1].trim();
    const text = (link.textContent || "").trim();
    if (text.length > 1 && text.length < 100) {
      // Di beberapa tema job board (umumnya WordPress), teks link profil
      // perusahaan bukan cuma nama perusahaan, tapi kalimat penuh seperti
      // "Lowongan Kerja Sales Counter di PT. Taraprima Megah". Kalau ada kata
      // penghubung " di " (Indonesia: "at"), ambil segmen SETELAH kemunculan
      // terakhirnya supaya posisi pekerjaan tidak ikut kebawa jadi nama
      // perusahaan. Kalau tidak ada " di " sama sekali, teks dipakai apa adanya
      // seperti sebelumnya (aman untuk situs yang teks link-nya sudah bersih).
      const parts = text.split(/\s+di\s+/i);
      if (parts.length > 1) {
        const candidate = parts[parts.length - 1].trim();
        if (candidate.length > 1 && candidate.length < 100) return candidate;
      }
      return text;
    }
  }
  return "";
}

// Pola awalan badan usaha Indonesia & umum internasional. Kalau sebuah heading
// (h1/h2) diawali pola ini, kemungkinan besar itu memang nama perusahaan --
// sinyal yang cukup kuat & aman dipakai, sering muncul di job board bergaya
// "satu artikel per perusahaan" (mis. WordPress).
const ENTITY_PREFIX_RE = /^(PT\.?|CV\.?|UD\.?|PD\.?|Firma|Yayasan|Koperasi|Perum|Inc\.?|LLC|Ltd\.?|Corp\.?|Co\.?)\s+\S/i;

function looksLikeEntityName(text) {
  if (!text) return false;
  const t = text.trim();
  if (t.length < 4 || t.length > 100) return false;
  return ENTITY_PREFIX_RE.test(t);
}

// Beberapa tema job board WordPress merender H1 (dan kadang field lain seperti
// hiringOrganization.name di JSON-LD) dari 2 elemen terpisah yang digabung TANPA
// spasi, menghasilkan teks seperti "PT. Foo Bar membuka lowonganStaff Admin"
// atau bahkan "PT. Foo Barmembuka lowonganStaff Admin". Potong di frasa
// penghubung ini supaya nama posisi tidak ikut kebawa jadi nama perusahaan.
// Generik: berlaku untuk tema/situs manapun yang memakai frasa Indonesia umum
// ini, bukan hardcode ke satu situs.
function stripMembukaLowonganNoise(text) {
  // CATATAN: sengaja TIDAK pakai \b di akhir "lowongan" -- pada data nyata,
  // kata ini sering nempel langsung ke kata berikutnya tanpa spasi (mis.
  // "membuka lowonganPelatihan Kerja..."), jadi \b (butuh word boundary)
  // akan gagal cocok kalau dipasang di sana.
  const m = text.match(/^(.*?)\s*membuka\s*lowongan/i);
  if (m && m[1] && m[1].trim().length > 1) return m[1].trim();
  return text;
}

function extractCompanyFromHeading(doc) {
  const headings = Array.from(doc.querySelectorAll("h1, h2")).slice(0, 5);
  for (const h of headings) {
    const raw = (h.textContent || "").trim();
    const cleaned = stripMembukaLowonganNoise(raw);
    if (looksLikeEntityName(cleaned)) return cleaned;
  }
  return "";
}

function extractCompanyFromTitlePatterns(doc) {
  const titleText = (doc.title || "").trim();
  // Hanya pola yang punya kata kunci eksplisit (aman dari salah tangkap nama situs).
  // Pola "... | X" sengaja TIDAK dipakai di sini karena X pada banyak situs blog/CMS
  // justru adalah nama situsnya sendiri, bukan nama perusahaan.
  const patterns = [
    /Lowongan\s+(?:Kerja\s+)?di\s+(.+?)\s*(?:sebagai\s+.+?)?\s*[-|–]\s*[^-|–]+$/i,
    /^.+?\s+at\s+(.+?)\s*[-|–]\s*[^-|–]+$/i, // "Posisi at Company - SiteName"
    /^.+?\s+[-|–]\s+(.+?)\s*[-|–]\s*[^-|–]+$/, // "Posisi - Company - SiteName" (segmen tengah)
  ];
  for (const p of patterns) {
    const m = titleText.match(p);
    if (m && m[1]) {
      const candidate = m[1].trim();
      if (candidate && candidate.length > 1 && candidate.length < 100) return candidate;
    }
  }
  return "";
}

function extractCompanyFromLabel(doc) {
  const bodyText = getVisibleBodyText(doc);
  const m = bodyText.match(
    /(?:Perusahaan|Company|Employer|Nama\s+Perusahaan)\s*:?\s*\n?\s*([A-Z][A-Za-z0-9&.,'\- ]{2,80})/
  );
  return m && m[1] ? m[1].trim() : "";
}

// Fallback terakhir: judul halaman, dengan bantuan meta og:site_name untuk
// mengenali & membuang segmen yang ternyata adalah nama situsnya sendiri
// (bukan menebak buta segmen pertama/terakhir seperti sebelumnya).
function extractCompanyFromTitleFallback(doc) {
  const rawTitle = (doc.querySelector('meta[property="og:title"]')?.content || doc.title || "").trim();
  if (!rawTitle) return "";
  const siteName = (doc.querySelector('meta[property="og:site_name"]')?.content || "").trim().toLowerCase();

  const splitBy = rawTitle.includes("|") ? "|" : /\s+[-–]\s+/;
  const parts = rawTitle.split(splitBy).map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 2) return "";

  const nonSite = parts.filter((p) => !siteName || p.toLowerCase() !== siteName);
  if (nonSite.length === 1) {
    const candidate = nonSite[0];
    if (candidate.length > 1 && candidate.length < 100) return candidate;
  }
  // og:site_name tidak membantu membedakan -> coba cari segmen yang terlihat
  // seperti nama entitas resmi (PT/CV/dst); kalau tidak ada, jangan menebak.
  for (const p of parts) {
    if (looksLikeEntityName(p)) return p;
  }
  return "";
}

// Tingkat keyakinan per sumber ekstraksi nama perusahaan -- dipakai popup untuk
// kasih indikator visual mana hasil yang paling bisa dipercaya apa adanya vs
// mana yang sebaiknya dicek manual. "tinggi" = sumber eksplisit/terstruktur
// (JSON-LD, link profil perusahaan, label teks eksplisit). "sedang" = pola
// heading yang cukup kuat tapi masih heuristik. "rendah" = hasil tebakan dari
// parsing judul halaman (paling rawan salah).
const COMPANY_SOURCE_CONFIDENCE = {
  jsonld: "tinggi",
  "profile-link": "tinggi",
  label: "tinggi",
  heading: "sedang",
  "title-pattern": "rendah",
  "title-fallback": "rendah",
};

function extractCompanyName(doc, baseUrl) {
  const jobPosting = findJsonLdJobPosting(doc);
  if (jobPosting && jobPosting.hiringOrganization) {
    const org = jobPosting.hiringOrganization;
    const rawName = typeof org === "string" ? org : org.name;
    if (rawName && rawName.trim()) {
      let name = stripMembukaLowonganNoise(rawName.trim());
      // Jaring pengaman: kalau setelah dibersihkan masih terlalu panjang untuk
      // nama perusahaan wajar (indikasi field ini ikut membawa judul posisi),
      // coba potong di kemunculan terakhir kata "di" seperti pada link profil.
      if (name.length > 60) {
        const parts = name.split(/\s+di\s+/i);
        if (parts.length > 1) {
          const candidate = parts[parts.length - 1].trim();
          if (candidate.length > 1 && candidate.length < 100) name = candidate;
        }
      }
      return { name, source: "jsonld" };
    }
  }

  let name = extractCompanyFromProfileLink(doc, baseUrl);
  if (name) return { name, source: "profile-link" };

  name = extractCompanyFromHeading(doc);
  if (name) return { name, source: "heading" };

  name = extractCompanyFromTitlePatterns(doc);
  if (name) return { name, source: "title-pattern" };

  name = extractCompanyFromLabel(doc);
  if (name) return { name, source: "label" };

  name = extractCompanyFromTitleFallback(doc);
  if (name) return { name, source: "title-fallback" };

  return { name: "", source: "" };
}

// ---------- Kontak: WhatsApp, Telepon, Telegram & Email (generik, tanpa daftar pengecualian per situs) ----------
// Beberapa job portal menaruh link kontak (WhatsApp/Telegram) milik ADMIN SITUS
// itu sendiri di tiap halaman lowongan (mis. tombol "Laporkan lowongan ini",
// atau kontak admin di footer/social row untuk pasang iklan) -- bukan kontak
// perusahaan yang membuka lowongan. Anchor ini format URL-nya identik dengan
// tombol kontak perusahaan, jadi perlu disaring dulu sebelum diambil, atau bisa
// salah tertangkap sebagai kontak perusahaan.
function isLikelySiteOwnContactLink(a) {
  const text = (a.textContent || "").trim();
  const aria = (a.getAttribute("aria-label") || "").trim();
  // Pola umum: tombol "laporkan lowongan/iklan" di situs job portal manapun.
  if (/laporkan|lapor(?!an\s*kerja)|report/i.test(text) || /laporkan|report/i.test(aria)) return true;
  // Link kontak admin situs biasanya ditaruh di elemen <footer> (baris sosial
  // media/kontak umum situs), bukan di konten detail lowongan.
  if (a.closest("footer")) return true;
  return false;
}

// Normalisasi nomor telepon/WA Indonesia ke format internasional tanpa simbol
// (mis. "0812-3456-7890" / "+62 812 3456 7890" / "6281234567890" -> "6281234567890"),
// supaya hasil CSV konsisten dan siap dipakai langsung (mis. untuk broadcast/CRM),
// dan sekaligus jadi validasi kasar supaya angka acak yang bukan nomor telepon
// (kode pos, tahun, dll) tidak ikut lolos jadi kontak.
function normalizeIndonesianPhone(raw) {
  if (!raw) return "";
  let digits = String(raw).replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  else if (!digits.startsWith("62") && digits.startsWith("8")) digits = "62" + digits;
  // Nomor Indonesia (mobile & landline dengan kode area) setelah dinormalisasi
  // ke awalan 62 wajarnya 10-15 digit total.
  if (!/^62\d{8,13}$/.test(digits)) return "";
  return digits;
}

function extractWhatsapp(doc, bodyText, jsonContacts) {
  // 1. Link wa.me atau api.whatsapp.com
  const waAnchorsRaw = Array.from(
    doc.querySelectorAll('a[href*="wa.me/"], a[href*="api.whatsapp.com/send"], a[href*="whatsapp.com/send"]')
  );
  const waAnchors = waAnchorsRaw.filter((a) => !isLikelySiteOwnContactLink(a));
  if (waAnchors.length) {
    // Utamakan anchor dengan teks yang terlihat seperti tombol "lamar/apply/kirim"
    let applyAnchor = waAnchors.find((a) => /lamar|apply|kirim|hubungi|contact/i.test(a.textContent || ""));
    if (!applyAnchor) applyAnchor = waAnchors[0];
    const m = applyAnchor.href.match(/(?:wa\.me\/|phone=)(\+?\d+)/i);
    if (m) {
      const normalized = normalizeIndonesianPhone(m[1]);
      if (normalized) return normalized;
    }
  }

  // 2. Field JSON tersembunyi (SSR payload) yang nama field-nya eksplisit
  // "whatsapp" (lihat collectJsonContacts) -- lebih presisi daripada scan teks
  // bebas karena dipilih berdasarkan nama field + value yang bersih, bukan
  // cuma pola angka yang kebetulan cocok di tengah teks lain.
  if (jsonContacts && jsonContacts.whatsapp.length) {
    const normalized = normalizeIndonesianPhone(jsonContacts.whatsapp[0]);
    if (normalized) return normalized;
  }

  // 3. Label eksplisit khusus WhatsApp di teks (bukan "Telepon/Kontak" umum --
  // itu ditangani terpisah oleh extractPhone karena belum tentu WA-capable)
  const tm = bodyText.match(/(?:WhatsApp|W\.?A\.?)\s*:?\s*\+?(\d[\d\s-]{7,15}\d)/i);
  if (tm) {
    const normalized = normalizeIndonesianPhone(tm[1]);
    if (normalized) return normalized;
  }

  // 4. Pola umum nomor HP Indonesia (awalan 08xx) di teks bebas
  const tm2 = bodyText.match(/(?:\+?62|0)8\d{2}[\s-]?\d{3,4}[\s-]?\d{3,4}/);
  if (tm2) {
    const normalized = normalizeIndonesianPhone(tm2[0]);
    if (normalized) return normalized;
  }

  return "";
}

// Nomor telepon UMUM (bukan cuma WhatsApp) -- mencakup nomor kantor/landline
// yang tidak mungkin dianggap WA (mis. "021-5551234", "0341-xxxxxx"). Dipisah
// dari extractWhatsapp supaya kolom WhatsApp tidak diisi nomor yang belum tentu
// bisa dihubungi lewat WA. Kalau hasilnya sama dengan nomor WA yang sudah
// ditemukan, dianggap redundan dan dikosongkan supaya tidak duplikat di kolom lain.
function extractPhone(doc, whatsappNumber, bodyText, jsonContacts) {
  const telLink = doc.querySelector('a[href^="tel:"]');
  if (telLink) {
    const raw = telLink.getAttribute("href").replace(/^tel:/i, "");
    const normalized = normalizeIndonesianPhone(raw);
    if (normalized && normalized !== whatsappNumber) return normalized;
  }

  // Field JSON tersembunyi (SSR payload) yang nama field-nya terlihat seperti
  // nomor telepon/HP (lihat collectJsonContacts) -- sama seperti WhatsApp,
  // ditempatkan sebelum scan teks bebas karena lebih presisi (berbasis nama
  // field + value bersih, bukan pola angka yang kebetulan cocok).
  if (jsonContacts) {
    for (const raw of jsonContacts.phones) {
      const normalized = normalizeIndonesianPhone(raw);
      if (normalized && normalized !== whatsappNumber) return normalized;
    }
  }

  // Label eksplisit umum: "No. Telepon:", "Telp:", "Kontak:", "Contact:", "Phone:"
  const tm = bodyText.match(/(?:No\.?\s*Telepon|Telp\.?|Telepon|Kontak|Contact|Phone)\s*:?\s*\+?(\d[\d\s()-]{6,16}\d)/i);
  if (tm) {
    const normalized = normalizeIndonesianPhone(tm[1]);
    if (normalized && normalized !== whatsappNumber) return normalized;
  }

  // Fallback: pola nomor landline Indonesia di teks bebas -- kode area 2-4 digit
  // yang diawali 0[2-7] (SENGAJA tidak termasuk 08xx/09xx supaya tidak tumpang
  // tindih dengan pola mobile yang sudah ditangani extractWhatsapp).
  const tm2 = bodyText.match(/\b0[2-7]\d{1,3}[\s-]?\d{3,4}[\s-]?\d{3,5}\b/);
  if (tm2) {
    const normalized = normalizeIndonesianPhone(tm2[0]);
    if (normalized && normalized !== whatsappNumber) return normalized;
  }

  return "";
}

// Link Telegram (t.me/username atau telegram.me/username) -- makin umum
// dipakai perusahaan startup/agensi rekrutmen di Indonesia sebagai kanal lamar.
function extractTelegram(doc) {
  const anchors = Array.from(doc.querySelectorAll('a[href*="t.me/"], a[href*="telegram.me/"]'));
  const candidates = anchors.filter((a) => !isLikelySiteOwnContactLink(a));
  for (const a of candidates) {
    try {
      const u = new URL(a.href);
      const path = u.pathname.replace(/^\//, "").split("/")[0];
      // Buang link non-username: t.me/joinchat/xxx (link undangan grup lama),
      // t.me/+xxxx (link undangan acak), atau path kosong.
      if (path && path.length >= 3 && !/^(joinchat|\+)/i.test(path)) {
        return "@" + path;
      }
    } catch (e) {
      // href tidak valid, lewati
    }
  }
  return "";
}

// Cloudflare "Email Address Obfuscation" mengganti alamat email asli di HTML
// dengan teks placeholder "[email protected]" + data terenkripsi -- sangat umum
// di situs WordPress yang memakai Cloudflare (proteksi anti-scraping bawaan).
// Datanya ada di atribut data-cfemail ATAU di fragment hex pada href
// "/cdn-cgi/l/email-protection#<hex>". Didekode pakai algoritma XOR standar
// Cloudflare (byte pertama = key, sisanya di-XOR satu per satu) -- generik,
// bukan hardcode ke satu situs, berlaku untuk semua situs yang pakai Cloudflare.
function cfDecodeEmail(hex) {
  try {
    let email = "";
    const key = parseInt(hex.substr(0, 2), 16);
    for (let i = 2; i < hex.length; i += 2) {
      email += String.fromCharCode(parseInt(hex.substr(i, 2), 16) ^ key);
    }
    return email.split("?")[0]; // buang parameter mailto seperti ?subject=...
  } catch (e) {
    return "";
  }
}

function extractCloudflareProtectedEmail(doc) {
  const withAttr = doc.querySelector("[data-cfemail]");
  if (withAttr) {
    const decoded = cfDecodeEmail(withAttr.getAttribute("data-cfemail") || "");
    if (decoded && decoded.includes("@")) return decoded;
  }
  const cfLink = doc.querySelector('a[href*="/cdn-cgi/l/email-protection#"]');
  if (cfLink) {
    const hex = (cfLink.getAttribute("href") || "").split("#")[1];
    if (hex) {
      const decoded = cfDecodeEmail(hex);
      if (decoded && decoded.includes("@")) return decoded;
    }
  }
  return "";
}

function extractEmail(doc, currentUrl, bodyText, jsonContacts) {
  // 1. mailto: link (paling reliable kalau ada)
  const mailtoLink = doc.querySelector('a[href^="mailto:"]');
  if (mailtoLink) {
    const addr = mailtoLink.getAttribute("href").replace(/^mailto:/i, "").split("?")[0].trim();
    if (addr) return addr;
  }

  // 1b. Email yang di-obfuscate Cloudflare (href mailto asli diganti dengan
  // link /cdn-cgi/l/email-protection, jadi tidak tertangkap oleh langkah 1 di atas)
  const cfEmail = extractCloudflareProtectedEmail(doc);
  if (cfEmail) return cfEmail;

  // 2. Field JSON tersembunyi (SSR payload, lihat collectJsonContacts) +
  // scan teks halaman -- digabung lalu disaring bareng di bawah. Field JSON
  // ditaruh duluan supaya diprioritaskan kalau ada beberapa kandidat (lebih
  // presisi, berbasis nama field eksplisit "email" + value bersih).
  const jsonEmails = (jsonContacts && jsonContacts.emails) || [];
  const textMatches = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  const matches = [...jsonEmails, ...textMatches];
  if (!matches.length) return "";

  // Heuristik universal: kalau ada beberapa email ditemukan, hindari yang
  // local-part-nya mengandung nama brand situs itu sendiri (biasanya email
  // placeholder/generik buatan platform, bukan email asli perusahaan yang
  // memasang lowongan). Nama brand diambil otomatis dari hostname halaman,
  // bukan daftar hardcode per situs.
  let siteBrandToken = "";
  try {
    const host = new URL(currentUrl).hostname.replace(/^www\./, "");
    const parts = host.split(".");
    // ambil segmen kedua dari terakhir (mis. "karirlink" dari "portal.karirlink.id")
    siteBrandToken = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  } catch (e) {}

  const unique = Array.from(new Set(matches));
  if (siteBrandToken && siteBrandToken.length >= 4) {
    const nonPlatform = unique.filter((e) => !e.toLowerCase().split("@")[0].includes(siteBrandToken.toLowerCase()));
    if (nonPlatform.length) return nonPlatform[0];
  }
  return unique[0];
}

function extractJobData(doc, url) {
  // Hitung sekali di sini dan pass ke semua fungsi turunan (whatsapp/phone/
  // email) alih-alih tiap fungsi membacanya sendiri -- getVisibleBodyText()
  // juga meng-clone seluruh <body>, jadi memanggilnya berulang jauh lebih
  // mahal daripada innerText biasa.
  const bodyText = getVisibleBodyText(doc);
  // Field kontak dari data JSON tersembunyi (SSR payload) -- lihat komentar
  // di collectJsonContacts. Dihitung sekali di sini seperti bodyText, lalu
  // dipakai bareng oleh WA/telepon/email supaya tidak parsing ulang semua
  // <script> 3x.
  const jsonContacts = collectJsonContacts(doc);
  const whatsapp = extractWhatsapp(doc, bodyText, jsonContacts);
  const companyResult = extractCompanyName(doc, url);
  return {
    company: companyResult.name,
    companyConfidence: COMPANY_SOURCE_CONFIDENCE[companyResult.source] || "",
    whatsapp,
    phone: extractPhone(doc, whatsapp, bodyText, jsonContacts),
    telegram: extractTelegram(doc),
    email: extractEmail(doc, url, bodyText, jsonContacts),
    applyLink: extractApplyLink(doc, url),
    link: url,
  };
}

// ---------- Kumpulkan link lowongan dari halaman listing (generik) ----------
const JOB_URL_KEYWORDS =
  /\/(job|jobs|career|careers|vacancy|vacancies|lowongan|loker|posisi|karir|karier|employment|position|positions|hiring|opening|openings|recruitment)\b/i;

const NON_JOB_PATH =
  /\/(login|register|signin|signup|about|about-us|contact|contact-us|privacy|terms|category|categories|tag|tags|author|wp-content|wp-json|feed|rss|sitemap|page)\//i;

function looksLikeJobLink(a, baseUrl) {
  const hrefRaw = a.getAttribute("href");
  if (!hrefRaw || hrefRaw.startsWith("#") || hrefRaw.startsWith("javascript:") || hrefRaw.startsWith("mailto:") || hrefRaw.startsWith("tel:")) {
    return null;
  }
  const abs = absUrl(hrefRaw, baseUrl);
  if (!abs || !sameOrigin(abs, baseUrl)) return null;
  if (NON_JOB_PATH.test(abs)) return null;
  // buang link pagination itu sendiri
  if (/[?&](page|p|hal|halaman)=\d+/i.test(abs) && !JOB_URL_KEYWORDS.test(abs)) return null;
  if (/\/page\/\d+\/?$/i.test(abs)) return null;

  let score = 0;
  if (JOB_URL_KEYWORDS.test(abs)) score += 3;

  const text = (a.textContent || "").trim();
  const insideHeading = a.closest("h1,h2,h3,h4");
  if (insideHeading && text.length >= 8 && text.length <= 140) score += 1;
  if (text.length >= 8 && text.length <= 140 && /[a-zA-Z]/.test(text)) score += 1;

  return { url: abs, score };
}

function collectJobLinksFromDoc(doc, baseUrl) {
  // 1. Coba dari JSON-LD ItemList dulu (paling akurat kalau tersedia)
  const jsonLdLinks = findJsonLdJobList(doc)
    .map((h) => absUrl(h, baseUrl))
    .filter((h) => h && sameOrigin(h, baseUrl));
  if (jsonLdLinks.length >= 3) return Array.from(new Set(jsonLdLinks));

  // 2. Heuristik generik berbasis URL & konteks link
  const anchors = Array.from(doc.querySelectorAll("a[href]"));
  const scored = anchors.map((a) => looksLikeJobLink(a, baseUrl)).filter(Boolean);

  // Utamakan yang match keyword URL job (score>=3); kalau terlalu sedikit,
  // turunkan ambang batas ke skor >=2 sebagai fallback.
  let picked = scored.filter((s) => s.score >= 3);
  if (picked.length < 2) picked = scored.filter((s) => s.score >= 2);

  const urls = Array.from(new Set(picked.map((s) => s.url)));
  return urls;
}

// ---------- Deteksi & navigasi pagination (generik) ----------
function findNextPageUrl(doc, baseUrl) {
  // 1. rel="next"
  const relNext = doc.querySelector('a[rel="next"]');
  if (relNext) {
    const abs = absUrl(relNext.getAttribute("href"), baseUrl);
    if (abs) return abs;
  }
  // 2. aria-label / teks "Next", "Selanjutnya", »
  const candidates = Array.from(doc.querySelectorAll("a[href]"));
  const textNext = candidates.find((a) => {
    const label = (a.getAttribute("aria-label") || "").trim();
    const text = (a.textContent || "").trim();
    if (/next|selanjutnya|berikutnya/i.test(label)) return true;
    if (/^[»›]+$/.test(text)) return true;
    // Teks tombol "next" sering dibungkus kalimat lebih panjang (mis. "Laman
    // Berikutnya »", "Next Page", "Halaman Selanjutnya"), bukan cuma kata
    // tunggal -- cocokkan sebagai kata utuh, tapi batasi panjang teks supaya
    // tidak salah menangkap paragraf panjang yang kebetulan memuat kata ini.
    if (text.length > 0 && text.length <= 40 && /\b(next|selanjutnya|berikutnya)\b/i.test(text)) return true;
    return false;
  });
  if (textNext) {
    const abs = absUrl(textNext.getAttribute("href"), baseUrl);
    if (abs) return abs;
  }
  // 3. Nomor halaman: cari halaman aktif (elemen non-link di antara elemen bernomor)
  //    lalu ambil link dengan nomor berikutnya.
  const numericAnchors = candidates.filter((a) => /^\d{1,4}$/.test((a.textContent || "").trim()));
  if (numericAnchors.length >= 2) {
    // asumsikan urutan menaik sesuai posisi DOM; ambil nomor terbesar yang > nomor saat ini
    // (nomor saat ini diasumsikan tidak berupa <a> — biasanya <span> aktif tidak ke-capture di sini)
    const nums = numericAnchors
      .map((a) => ({ el: a, n: parseInt(a.textContent.trim(), 10) }))
      .sort((x, y) => x.n - y.n);
    // ambil elemen dengan nomor terkecil yang lebih besar dari nomor pada URL saat ini (kalau ada)
    const curMatch = baseUrl.match(/[?&](?:page|p|hal|halaman)=(\d+)/i) || baseUrl.match(/\/page\/(\d+)\/?/i);
    const curNum = curMatch ? parseInt(curMatch[1], 10) : 1;
    const next = nums.find((x) => x.n === curNum + 1);
    if (next) {
      const abs = absUrl(next.el.getAttribute("href"), baseUrl);
      if (abs) return abs;
    }
  }
  return null;
}

// ---------- Deteksi tombol "Load More" berbasis JavaScript (generik) ----------
// Beberapa job portal (mis. situs berbasis Alpine.js/Vue/React) tidak punya
// pagination lewat link <a href> sama sekali -- daftar lowongan berikutnya
// cuma bisa dimuat lewat tombol "Load More"/"Muat Lebih" yang manggil API
// internal via JavaScript (mis. GET /api/xxx/list?page=2), BUKAN navigasi ke
// URL baru. findNextPageUrl() di atas cuma bisa mengikuti <a href>, jadi pola
// semacam ini TIDAK PERNAH bisa diikuti otomatis oleh Auto-Scan (yang
// berbasis fetch(), tidak menjalankan JavaScript) -- URL API di baliknya
// berbeda-beda tiap situs sehingga tidak bisa ditebak secara generik.
// Fungsi ini SEKADAR mendeteksi keberadaan pola ini (untuk dikasih tahu ke
// user lewat pesan status), bukan untuk mengikutinya.
const LOAD_MORE_TEXT_RE = /load\s*more|muat\s*lebih|lihat\s*lebih\s*banyak|tampilkan\s*lebih\s*banyak|show\s*more/i;

function scanForLoadMoreButton(root) {
  const candidates = Array.from(root.querySelectorAll("button, a, div, span"));
  for (const el of candidates) {
    const text = (el.textContent || "").trim();
    // Batasi panjang teks supaya tidak salah tangkap paragraf panjang yang
    // kebetulan memuat frasa ini di tengah kalimat.
    if (!text || text.length > 30 || !LOAD_MORE_TEXT_RE.test(text)) continue;
    // Kalau ternyata ini <a href="..."> yang valid (bukan "#"/javascript:),
    // itu link sungguhan -- sudah ditangani findNextPageUrl secara normal,
    // jadi bukan kasus yang perlu diperingatkan di sini.
    const closestLink = el.closest("a[href]");
    if (closestLink) {
      const href = closestLink.getAttribute("href") || "";
      if (href && href !== "#" && !/^javascript:/i.test(href)) continue;
    }
    return true;
  }
  // Framework reaktif (Alpine.js/Vue/dst) sering membungkus konten
  // kondisional dalam <template> (mis. "<template x-if=...>") -- isinya
  // TIDAK ikut ke textContent/querySelectorAll biasa karena hidup di
  // <template>.content, sebuah DocumentFragment TERPISAH dari DOM utama.
  // Tanpa langkah ini, tombol "Load More" yang dibungkus <template> (seperti
  // di lokerbdg.id) tidak akan pernah terdeteksi.
  const templates = Array.from(root.querySelectorAll("template"));
  for (const t of templates) {
    if (t.content && scanForLoadMoreButton(t.content)) return true;
  }
  return false;
}

function detectLoadMoreButton(doc) {
  return scanForLoadMoreButton(doc);
}


// Ekspor ESM untuk dipakai lib/scraper.js -- padanan dari
// "window.LokerBdgExtractor" di versi Chrome extension.
export {
  extractJobData,
  collectJobLinksFromDoc,
  findNextPageUrl,
  findJsonLdJobPosting,
  detectLoadMoreButton,
};
