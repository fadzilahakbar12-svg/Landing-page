// Schema Validator -- situs target (job portal pihak ketiga) sering mengubah
// struktur HTML-nya tanpa pemberitahuan. Kalau itu terjadi, lib/extractor.js
// bisa DIAM-DIAM mulai gagal (company kosong, kontak kosong, dsb) TANPA
// error yang jelas -- scanSite() tetap "sukses" secara teknis (HTTP 200,
// tidak throw), cuma hasilnya sampah. Modul ini mendeteksi itu SEBELUM hasil
// scan dipakai/dikirim, lewat 2 lapis:
//
//  1. validateJobRecord() -- per-record: field yang wajib ada tapi kosong,
//     atau bentuknya tidak masuk akal (mis. nama perusahaan cuma 1 huruf).
//  2. validateScanResult() -- level situs: successRate scan SEKARANG
//     dibandingkan ke successRate scan SEBELUMNYA (yang sudah tersimpan di
//     SiteStats) -- penurunan drastis adalah sinyal paling kuat kalau
//     extractor "berhenti bekerja" untuk situs itu, bukan sekadar kebetulan
//     hari itu lowongannya sedikit.

const MIN_COMPANY_LEN = 2;
const MAX_COMPANY_LEN = 120;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHATSAPP_DIGITS_RE = /^62\d{8,13}$/;

// Validasi 1 record hasil extractJobData() (lib/extractor.js). Dipakai untuk
// menyaring record yang lolos filter "punya company + (whatsapp/email)" di
// scanSite() tapi sebenarnya bentuknya mencurigakan.
export function validateJobRecord(record) {
  const issues = [];

  if (!record.company || record.company.trim().length < MIN_COMPANY_LEN) {
    issues.push("company kosong/terlalu pendek");
  } else if (record.company.length > MAX_COMPANY_LEN) {
    issues.push("company terlalu panjang (kemungkinan ikut menangkap teks lain, bukan cuma nama perusahaan)");
  }

  if (record.email && !EMAIL_RE.test(record.email)) {
    issues.push(`email tidak valid: "${record.email}"`);
  }

  if (record.whatsapp && !WHATSAPP_DIGITS_RE.test(record.whatsapp)) {
    issues.push(`whatsapp tidak valid: "${record.whatsapp}"`);
  }

  if (!record.email && !record.whatsapp) {
    issues.push("tidak ada kontak sama sekali (email & whatsapp kosong)");
  }

  return { valid: issues.length === 0, issues };
}

// Ambang batas penurunan successRate yang dianggap "kemungkinan situs berubah
// struktur", bukan sekadar fluktuasi wajar hari-ke-hari. Sengaja tidak dipicu
// oleh 1x successRate rendah SAJA (banyak situs kecil memang wajar successRate-
// nya rendah dari awal) -- yang jadi sinyal adalah PENURUNAN TAJAM dari
// baseline situs itu SENDIRI.
const DRIFT_MIN_PREVIOUS_RATE = 0.3; // situs ini sebelumnya "cukup sehat"
const DRIFT_MIN_JOBS_FOUND = 3; // jobsFound sekarang cukup untuk successRate berarti (bukan 0/1 sampel)
const DRIFT_DROP_RATIO = 0.4; // sekarang turun ke <40% dari rate sebelumnya

function parsePreviousRate(raw) {
  // SiteStats menyimpan successRate sebagai TEKS "83%" (lihat updateSiteStats
  // di google-apps-script-updated.gs), bukan angka 0-1 mentah.
  if (raw === null || raw === undefined || raw === "") return null;
  const s = String(raw).trim();
  const n = s.endsWith("%") ? parseFloat(s) / 100 : parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// site: baris SiteStats SEBELUM di-update oleh scan ini (dari fetchSites()).
// result: hasil scanSite() yang baru saja selesai untuk situs itu.
// Mengembalikan { schemaIssue, issues[] } -- schemaIssue string kosong kalau
// tidak ada masalah, atau pesan pendek+actionable kalau ada (ditulis apa
// adanya ke kolom SiteStats.schemaIssue supaya kelihatan di dashboard).
export function validateScanResult(site, result) {
  const issues = [];

  const recordIssues = (result.leads || [])
    .map((r) => validateJobRecord(r))
    .filter((v) => !v.valid);
  const badRecordCount = recordIssues.length;
  if (result.jobsFound > 0 && badRecordCount > 0) {
    const ratio = badRecordCount / result.jobsFound;
    if (ratio >= 0.5) {
      issues.push(
        `${badRecordCount}/${result.jobsFound} record hasil ekstraksi bermasalah (${Math.round(ratio * 100)}%) -- cek manual, kemungkinan struktur HTML situs berubah.`
      );
    }
  }

  const previousRate = parsePreviousRate(site && site.successRate);
  if (
    previousRate !== null &&
    previousRate >= DRIFT_MIN_PREVIOUS_RATE &&
    result.jobsFound >= DRIFT_MIN_JOBS_FOUND &&
    result.successRate < previousRate * DRIFT_DROP_RATIO
  ) {
    issues.push(
      `successRate anjlok: sebelumnya ${Math.round(previousRate * 100)}%, sekarang ${Math.round(result.successRate * 100)}% (jobsFound=${result.jobsFound}) -- kemungkinan besar struktur HTML situs ini berubah, extractor perlu dicek/disesuaikan.`
    );
  }

  // listingFetchFailed (dari scanSite) berarti bahkan HALAMAN LISTING-nya saja
  // tidak bisa diambil sama sekali (situs down, ganti domain, atau mulai
  // memblokir bot) -- beda kelas masalah dari "struktur berubah tapi masih
  // bisa diakses", tapi sama-sama perlu perhatian manual.
  if (result.listingFetchFailed) {
    issues.push("Gagal mengambil halaman listing sama sekali (situs down / block bot / URL sudah tidak valid) -- cek startUrl-nya manual.");
  }

  return { schemaIssue: issues.join(" | "), issues };
}
