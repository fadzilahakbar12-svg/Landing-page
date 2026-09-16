// IMPORTANT: replace this with the same value you put in APPS_SCRIPT_SECRET
// in your .env.local / Vercel env vars. Anyone without this exact string
// cannot read or write your leads data anymore.
var SECRET = "f6089a731114242e62ebc8e17fd11226d4329dfa2a474273";

// Nama tab leads yang sudah ada dari awal. PENTING: sejak SiteStats
// ditambahkan (Fase 4), sheet leads TIDAK BOLEH lagi diambil lewat
// getActiveSheet() -- itu mengambil tab yang SEDANG DIBUKA di browser Anda,
// yang salah kalau Anda kebetulan sedang melihat tab SiteStats saat cron
// jalan. getLeadsSheet_() mengambil tab yang benar berdasarkan NAMA, apapun
// tab yang sedang aktif di UI.
var LEADS_SHEET_NAME = "Sheet1";
var SITESTATS_SHEET_NAME = "SiteStats";
var STATSHISTORY_SHEET_NAME = "StatsHistory";
var JOBHEALTH_SHEET_NAME = "JobHealth";
var TEMPLATE_SHEET_NAME = "Template";

// Skema kolom leads (sejak LeadID ditambahkan di kolom A, semua kolom lain
// geser +1 dari sebelumnya):
// A LeadID | B timestamp | C nama | D whatsapp | E email | F FirstTouch |
// G status (WA) | H fonnteMessageId | I source | J EmailSentAt | K emailStatus

function getLeadsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(LEADS_SHEET_NAME) || ss.getSheets()[0];
}

// Watchlist situs untuk di-scan (Fase 4/5) -- tab TERPISAH dari leads, dibuat
// otomatis kalau belum ada (jadi tidak perlu Anda buat tab-nya manual dulu).
function getSiteStatsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SITESTATS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SITESTATS_SHEET_NAME);
    // schemaIssue (kolom I) ditambahkan belakangan (Schema Validator) -- kalau
    // tab ini sudah ada dari sebelumnya TANPA kolom ini, jalankan
    // migrateAddSchemaIssueColumn() sekali dari editor Apps Script.
    sheet.appendRow(["domain", "startUrl", "dateAdded", "lastScanned", "jobsFound", "successRate", "priority", "needsManualScrape", "schemaIssue"]);
    sheet.getRange("A1:I1").setFontWeight("bold");
  }
  return sheet;
}

// Riwayat kesehatan tiap cron job (Scheduler/Uptime Agent) -- 1 baris per
// NAMA job (upsert, bukan log yang terus bertambah), supaya gampang dibaca
// sekilas: "scrape" terakhir jalan kapan & hasilnya apa. Dibuat otomatis
// kalau belum ada, sama seperti tab lain di atas.
function getJobHealthSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(JOBHEALTH_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(JOBHEALTH_SHEET_NAME);
    sheet.appendRow(["jobName", "lastRunAt", "lastStatus", "lastError", "meta"]);
    sheet.getRange("A1:E1").setFontWeight("bold");
  }
  return sheet;
}

// Perpustakaan template pesan (Email & WhatsApp), dibuat manual ATAU lewat
// tombol "Generate dengan AI" di dashboard (lib/gemini.js). "score" & "timesUsed"
// dihitung ulang di sisi Next.js (lib/templates.js#recomputeAndSaveScores,
// dipanggil on-demand tiap dashboard dibuka) dari data Leads (kolom
// waTemplateId/emailTemplateId) -- tab ini sendiri cuma penyimpanan pasif.
function getTemplateSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TEMPLATE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(TEMPLATE_SHEET_NAME);
    // "asset" (kolom I) ditambahkan belakangan (AI image generation) --
    // ditaruh di UJUNG, bukan menyisip di antara kolom yang sudah ada
    // (kolom F "score" tetap F, tidak geser) -- pola yang sama dipakai di
    // schemaIssue/waTemplateId/emailTemplateId.
    sheet.appendRow(["templateID", "channel", "stage", "subject", "body", "score", "timesUsed", "lastScored", "asset"]);
    sheet.getRange("A1:I1").setFontWeight("bold");
  }
  return sheet;
}

// Folder Google Drive tempat nyimpen gambar hasil generate AI (lib/gemini.js
// #generateTemplateImageWithAI) -- dibuat otomatis kalau belum ada, di Drive
// milik akun yang menjalankan Apps Script ini (akun yang deploy web app-nya).
function getAssetFolder_() {
  var name = "BarScrapper Template Assets";
  var folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

function nextTemplateId_(sheet, channel) {
  var prefix = channel === "email" ? "EM" : "WA";
  var lastRow = sheet.getLastRow();
  var maxN = 0;
  if (lastRow > 1) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var re = new RegExp("^" + prefix + "-(\\d+)$");
    for (var i = 0; i < ids.length; i++) {
      var m = String(ids[i][0]).match(re);
      if (m) {
        var n = parseInt(m[1], 10);
        if (n > maxN) maxN = n;
      }
    }
  }
  var next = maxN + 1;
  var padded = next < 1000 ? ("00" + next).slice(-3) : String(next);
  return prefix + "-" + padded;
}

// Riwayat harian (Fase: perbandingan day-to-day/week-on-week/monthly di
// dashboard) -- 1 baris per tanggal, dibuat otomatis kalau belum ada. Cron
// snapshot (sekali/hari) menulis baris "hari ini" tiap kali jalan -- kalau
// baris untuk tanggal itu SUDAH ada (mis. karena redeploy/re-run manual),
// di-update di tempat, bukan duplikat, supaya tetap aman dipanggil berkali-kali.
function getStatsHistorySheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STATSHISTORY_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(STATSHISTORY_SHEET_NAME);
    sheet.appendRow(["date", "totalLeads", "waSent", "waRead", "waConnected", "waFail", "emailSent", "emailOpened", "emailClicked"]);
    sheet.getRange("A1:I1").setFontWeight("bold");
  }
  return sheet;
}

// Inisial LeadID dari isi kolom "source". Untuk lead hasil scrape, source-nya
// berupa link homepage situs sumber (mis. "https://dealls.com") -- domainnya
// dipetakan ke inisial 2 huruf. Situs baru yang belum ada di daftar TETAP
// dapat inisial otomatis (2 huruf pertama domainnya), tidak perlu diedit
// manual di sini setiap nambah situs -- tapi silakan tambah entri di
// KNOWN_SOURCE_PREFIXES kalau mau inisialnya lebih pas/enak dibaca.
var KNOWN_SOURCE_PREFIXES = {
  "dealls.com": "DS",
  "jakartakerja.com": "JK",
  "lokersolo.id": "LS",
};

function leadIdPrefix_(sourceRaw) {
  var s = String(sourceRaw || "").trim().toLowerCase();
  if (!s || s === "landing_page") return "LP";
  if (s === "barscraper") return "BS";

  var domain = s.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  if (KNOWN_SOURCE_PREFIXES[domain]) return KNOWN_SOURCE_PREFIXES[domain];

  var alnum = domain.replace(/[^a-z0-9]/g, "");
  return (alnum.slice(0, 2) || "XX").toUpperCase();
}

// Nomor urut per prefix dihitung dari LeadID TERBESAR yang sudah ada dengan
// prefix itu (bukan cuma dihitung jumlahnya) -- supaya tidak tabrakan kalau
// ada baris lama yang pernah dihapus manual di tengah.
function nextLeadId_(sheet, prefix) {
  var lastRow = sheet.getLastRow();
  var maxN = 0;
  if (lastRow > 1) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var re = new RegExp("^" + prefix + "-(\\d+)$");
    for (var i = 0; i < ids.length; i++) {
      var m = String(ids[i][0]).match(re);
      if (m) {
        var n = parseInt(m[1], 10);
        if (n > maxN) maxN = n;
      }
    }
  }
  var next = maxN + 1;
  var padded = next < 1000 ? ("00" + next).slice(-3) : String(next);
  return prefix + "-" + padded;
}

function doPost(e) {
  var sheet = getLeadsSheet_();
  var data = JSON.parse(e.postData.contents);

  if (data.secret !== SECRET) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: "Unauthorized" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Saklar on/off tunggal untuk SELURUH engine (scrape + follow-up WA + email)
  // -- dicek di awal tiap cron (lihat 3 route Next.js /api/cron/*), bukan cuma
  // dipakai UI. Disimpan lewat PropertiesService (bukan sel di sheet) karena
  // cuma 1 flag boolean, tidak perlu bikin tab baru untuk ini.
  if (data.action === "setEngineState") {
    PropertiesService.getScriptProperties().setProperty("engineEnabled", data.enabled ? "true" : "false");
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, enabled: !!data.enabled }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Called by the WhatsApp follow-up job to mark a row as sent.
  if (data.action === "markSent") {
    sheet.getRange(data.row, 6).setValue(new Date()); // column F = FirstTouch
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Called after sending a WhatsApp message (status) and/or when Fonnte's
  // webhooks report a status change (read/fail) or an incoming reply (connected).
  if (data.action === "setWaMeta") {
    if (data.status) sheet.getRange(data.row, 7).setValue(data.status); // column G = status
    if (data.fonnteMessageId) sheet.getRange(data.row, 8).setValue(data.fonnteMessageId); // column H
    // waTemplateId (column L) -- template mana yang dipakai buat pesan ini,
    // dipakai lib/templates.js buat hitung skor per-template. Cuma ditulis
    // saat status "sent" (pertama kali kirim), bukan pas webhook Fonnte
    // update status jadi read/connected/fail -- template-nya sudah tetap
    // sejak baris ini pertama kali dikirim.
    if (data.waTemplateId) sheet.getRange(data.row, 12).setValue(data.waTemplateId);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Called by the EMAIL follow-up job (separate pipeline from WhatsApp) right
  // after an email is sent. Kept independent from setWaMeta/markSent so the
  // two channels never block or overwrite each other's timestamps.
  if (data.action === "markEmailSent") {
    sheet.getRange(data.row, 10).setValue(new Date()); // column J = EmailSentAt
    sheet.getRange(data.row, 11).setValue(data.emailStatus || "sent"); // column K = emailStatus
    // emailTemplateId (column M) -- sama seperti waTemplateId di atas, cuma
    // ditulis saat "sent" (pertama/re-kirim), status opened/clicked lewat
    // webhook Resend tidak menimpa ini.
    if (data.emailTemplateId) sheet.getRange(data.row, 13).setValue(data.emailTemplateId);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Dipanggil oleh cron snapshot (sekali/hari) -- mencatat 1 baris ringkasan
  // metrik hari ini di tab StatsHistory. Upsert berdasarkan tanggal (bukan
  // append terus-menerus) supaya aman kalau cron sempat jalan dobel.
  if (data.action === "recordStatsSnapshot") {
    var statsSheet = getStatsHistorySheet_();
    var today = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
    var statsRows = statsSheet.getDataRange().getValues();
    var statsRowIndex = -1;
    for (var st = 1; st < statsRows.length; st++) {
      if (String(statsRows[st][0]) === today) { statsRowIndex = st + 1; break; }
    }
    var rowValues = [
      today,
      Number(data.totalLeads || 0),
      Number(data.waSent || 0),
      Number(data.waRead || 0),
      Number(data.waConnected || 0),
      Number(data.waFail || 0),
      Number(data.emailSent || 0),
      Number(data.emailOpened || 0),
      Number(data.emailClicked || 0),
    ];
    if (statsRowIndex === -1) {
      statsSheet.appendRow(rowValues);
    } else {
      statsSheet.getRange(statsRowIndex, 1, 1, rowValues.length).setValues([rowValues]);
    }
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Dipanggil oleh SETIAP cron job (scrape, wa-followup, email-followup,
  // snapshot-stats) di titik keluarnya -- sukses, error, ATAUPUN di-skip
  // karena engine mati -- supaya Scheduler/Uptime Agent (uptime-check) bisa
  // tahu 2 hal: (1) job ini beneran jalan sesuai jadwal cron atau tidak
  // (lastRunAt), dan (2) kalau jalan, hasilnya sukses atau error (lastStatus/
  // lastError). Upsert berdasarkan jobName -- 1 baris tetap per job, bukan
  // log yang terus bertambah tak terbatas.
  if (data.action === "recordJobRun") {
    var jhSheet = getJobHealthSheet_();
    var jhRows = jhSheet.getDataRange().getValues();
    var jhRowIndex = -1;
    for (var jh = 1; jh < jhRows.length; jh++) {
      if (String(jhRows[jh][0]) === String(data.jobName)) { jhRowIndex = jh + 1; break; }
    }
    var jhValues = [
      String(data.jobName || ""),
      new Date(),
      String(data.status || ""),
      String(data.error || ""),
      String(data.meta || ""),
    ];
    if (jhRowIndex === -1) {
      jhSheet.appendRow(jhValues);
    } else {
      jhSheet.getRange(jhRowIndex, 1, 1, jhValues.length).setValues([jhValues]);
    }
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Pengaman kuota Firecrawl (free tier, 1000 credit/bulan) -- dipanggil
  // SETELAH tiap panggilan Firecrawl sukses (lib/firecrawl.js). Disimpan
  // lewat PropertiesService (2 nilai: bulan berjalan "YYYY-MM" + hitungan),
  // reset otomatis kalau bulan berganti -- tidak perlu tab sheet baru untuk
  // 2 angka ini.
  if (data.action === "incrementFirecrawlUsage") {
    var props = PropertiesService.getScriptProperties();
    var curMonth = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM");
    var storedMonth = props.getProperty("firecrawlUsageMonth");
    var used = storedMonth === curMonth ? parseInt(props.getProperty("firecrawlUsageCount") || "0", 10) : 0;
    used += 1;
    props.setProperty("firecrawlUsageMonth", curMonth);
    props.setProperty("firecrawlUsageCount", String(used));
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, month: curMonth, used: used }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ---- Template: perpustakaan pesan Email & WhatsApp ----
  if (data.action === "addTemplate") {
    var channel = String(data.channel || "").trim().toLowerCase();
    if (channel !== "email" && channel !== "whatsapp") {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: "channel harus 'email' atau 'whatsapp'." }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var stage = String(data.stage || "").trim().toLowerCase();
    if (stage !== "new" && stage !== "followup") {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: "stage harus 'new' atau 'followup'." }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var body = String(data.body || "").trim();
    if (!body) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: "Isi template kosong." }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var tplSheet = getTemplateSheet_();
    var templateId = nextTemplateId_(tplSheet, channel);
    tplSheet.appendRow([
      templateId,
      channel,
      stage,
      channel === "email" ? String(data.subject || "").trim() : "",
      body,
      "",  // score -- belum ada data pemakaian
      0,   // timesUsed
      "",  // lastScored
      "",  // asset -- diisi belakangan lewat action "saveTemplateAsset"
    ]);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, templateId: templateId }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Dipanggil setelah lib/gemini.js#generateTemplateImageWithAI berhasil --
  // decode base64 -> simpan sebagai file ke Google Drive (folder khusus,
  // lihat getAssetFolder_) -> share "anyone with link, view only" -> tulis
  // URL-nya ke kolom asset (I) baris template terkait.
  if (data.action === "saveTemplateAsset") {
    var tplSheet4 = getTemplateSheet_();
    var tplRows3 = tplSheet4.getDataRange().getValues();
    var tplRowIndex2 = -1;
    for (var t3 = 1; t3 < tplRows3.length; t3++) {
      if (String(tplRows3[t3][0]) === String(data.templateId)) { tplRowIndex2 = t3 + 1; break; }
    }
    if (tplRowIndex2 === -1) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: "templateId tidak ditemukan." }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var bytes = Utilities.base64Decode(data.dataBase64);
    var blob = Utilities.newBlob(bytes, data.mimeType || "image/png", String(data.templateId) + ".png");
    var file = getAssetFolder_().createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var assetUrl = "https://drive.google.com/uc?export=view&id=" + file.getId();
    tplSheet4.getRange(tplRowIndex2, 9).setValue(assetUrl);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, assetUrl: assetUrl }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Dipanggil oleh lib/templates.js#recomputeAndSaveScores (on-demand, tiap
  // dashboard dibuka) setelah menghitung ulang skor tiap template dari data
  // Leads sisi Next.js -- tab Template sendiri tidak menghitung apa-apa,
  // cuma menyimpan hasil akhirnya.
  if (data.action === "setTemplateScore") {
    var tplSheet2 = getTemplateSheet_();
    var tplRows = tplSheet2.getDataRange().getValues();
    var tplRowIndex = -1;
    for (var tr = 1; tr < tplRows.length; tr++) {
      if (String(tplRows[tr][0]) === String(data.templateId)) { tplRowIndex = tr + 1; break; }
    }
    if (tplRowIndex === -1) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: "templateId tidak ditemukan." }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    tplSheet2.getRange(tplRowIndex, 6).setValue(data.score === null || data.score === undefined ? "" : Number(data.score));
    tplSheet2.getRange(tplRowIndex, 7).setValue(Number(data.timesUsed || 0));
    tplSheet2.getRange(tplRowIndex, 8).setValue(new Date());
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ---- SiteStats: watchlist situs yang mau di-scan (Fase 4/5) ----
  // Ditaruh di TAB TERPISAH ("SiteStats"), bukan di sheet leads, supaya tidak
  // tercampur -- lihat getSiteStatsSheet_() di bawah.
  //
  // PENTING: disimpan URL LENGKAP (data.url, mis. "https://situs.id/loker"),
  // BUKAN cuma domain -- scraper (Fase 5) butuh tahu persis halaman LISTING
  // mana yang harus dibuka pertama kali, "domain" saja (mis. "situs.id") tidak
  // cukup buat mulai scan. "domain" tetap disimpan terpisah cuma untuk
  // dedup/tampilan ringkas di dashboard.
  if (data.action === "addSite") {
    var rawUrl = String(data.url || "").trim();
    if (!rawUrl) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: "URL kosong." }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var domain;
    try {
      domain = rawUrl.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].toLowerCase();
    } catch (eDomain) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: "URL tidak valid." }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var siteSheet = getSiteStatsSheet_();
    var existing = siteSheet.getDataRange().getValues();
    for (var s = 1; s < existing.length; s++) {
      if (String(existing[s][0]).toLowerCase() === domain) {
        return ContentService
          .createTextOutput(JSON.stringify({ ok: false, error: "Situs ini sudah ada di watchlist." }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    siteSheet.appendRow([
      domain,
      rawUrl,     // startUrl -- halaman pertama yang dibuka scraper
      new Date(), // dateAdded
      "",         // lastScanned
      "",         // jobsFound
      "",         // successRate
      "Baru",     // priority
      "",         // needsManualScrape ("ya" kalau situs butuh JS/Load More, diisi belakangan)
    ]);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Dipanggil oleh proses scraping (Fase 5, server-side) setiap kali selesai
  // scan 1 situs -- update angka performanya & hitung ulang prioritas.
  if (data.action === "updateSiteStats") {
    var siteSheet2 = getSiteStatsSheet_();
    var rows2 = siteSheet2.getDataRange().getValues();
    var targetDomain = String(data.domain || "").trim().toLowerCase();
    var rowIndex = -1;
    for (var r2 = 1; r2 < rows2.length; r2++) {
      if (String(rows2[r2][0]).toLowerCase() === targetDomain) { rowIndex = r2 + 1; break; }
    }
    if (rowIndex === -1) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: "Situs tidak ditemukan di watchlist." }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var jobsFound = Number(data.jobsFound || 0);
    var successRate = Number(data.successRate || 0); // 0-1
    var priority = jobsFound >= 20 && successRate >= 0.8 ? "Tinggi"
      : jobsFound >= 5 ? "Sedang"
      : "Rendah";

    siteSheet2.getRange(rowIndex, 4).setValue(new Date());              // lastScanned
    siteSheet2.getRange(rowIndex, 5).setValue(jobsFound);               // jobsFound
    siteSheet2.getRange(rowIndex, 6).setValue(Math.round(successRate * 100) + "%"); // successRate
    siteSheet2.getRange(rowIndex, 7).setValue(priority);                // priority
    if (data.needsManualScrape !== undefined) {
      siteSheet2.getRange(rowIndex, 8).setValue(data.needsManualScrape ? "ya" : "");
    }
    // schemaIssue (Schema Validator) -- ditulis lib/schemaValidator.js lewat
    // /api/cron/scrape kalau hasil scan situs ini terlihat mencurigakan
    // (mis. successRate anjlok drastis dari scan sebelumnya, indikasi situs
    // sumber mengubah struktur HTML-nya dan extractor diam-diam mulai gagal).
    if (data.schemaIssue !== undefined) {
      siteSheet2.getRange(rowIndex, 9).setValue(data.schemaIssue ? String(data.schemaIssue) : "");
    }
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Default: a new lead -- either from the landing page form, BarScraper's
  // "Send BD" button, or the auto-scraper (Fase 5). "source" tells them apart
  // -- for auto-scraper leads it's the SOURCE SITE'S HOMEPAGE LINK (mis.
  // "https://dealls.com"), used below to build the LeadID's prefix.
  var source = data.source || "landing_page";
  var leadId = nextLeadId_(sheet, leadIdPrefix_(source));

  sheet.appendRow([
    leadId,
    new Date(),
    data.name || "",
    data.whatsapp || "",
    data.email || "",
    "", // F: FirstTouch (WA) — filled once the WA follow-up job sends the first outreach
    "", // G: status (WA: sent / read / connected / fail)
    "", // H: fonnteMessageId (internal use, matches Fonnte's status webhook to a row)
    source, // I: "landing_page" / "barscraper" / link homepage situs sumber
    "", // J: EmailSentAt — filled once the EMAIL follow-up job sends the first email
    "", // K: emailStatus (sent / opened / clicked) — opened/clicked wired up later via Resend webhook
  ]);

  // Notifikasi email "lead baru" HANYA untuk lead dari form landing page --
  // lead dari BarScraper/auto-scraper bisa datang puluhan sekaligus, jadi
  // akan membanjiri inbox kalau tetap dikirim satu-satu per baris.
  if (source === "landing_page") {
    MailApp.sendEmail({
      to: "fadzilahakbar12@gmail.com",
      subject: "Lead baru masuk: " + data.name,
      body:
        "Ada lead baru dari landing page kamu:\n\n" +
        "LeadID: " + leadId + "\n" +
        "Nama: " + data.name + "\n" +
        "WhatsApp: " + data.whatsapp + "\n" +
        "Email: " + data.email,
    });
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, leadId: leadId }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Returns every lead as JSON — used by the follow-up jobs and the Fonnte
// webhooks to find which row a status update or reply belongs to. Requires
// ?secret=... in the URL now — without it, nobody can read your data.
function doGet(e) {
  if (!e.parameter || e.parameter.secret !== SECRET) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: "Unauthorized" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ?resource=engine -- status saklar on/off engine (default false/mati kalau
  // belum pernah di-set sama sekali, mis. pertama kali deploy).
  if (e.parameter.resource === "engine") {
    var enabled = PropertiesService.getScriptProperties().getProperty("engineEnabled") === "true";
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, enabled: enabled }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ?resource=sites -- daftar watchlist SiteStats (Fase 4), bukan leads.
  if (e.parameter.resource === "sites") {
    var siteSheet = getSiteStatsSheet_();
    var siteRows = siteSheet.getDataRange().getValues();
    var sites = [];
    for (var si = 1; si < siteRows.length; si++) {
      if (!siteRows[si][0]) continue; // baris kosong
      sites.push({
        domain: siteRows[si][0],
        startUrl: siteRows[si][1] || null,
        dateAdded: siteRows[si][2] || null,
        lastScanned: siteRows[si][3] || null,
        jobsFound: siteRows[si][4] || 0,
        successRate: siteRows[si][5] || null,
        priority: siteRows[si][6] || "Baru",
        needsManualScrape: siteRows[si][7] === "ya",
        schemaIssue: siteRows[si][8] || "", // Schema Validator -- lihat updateSiteStats
      });
    }
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, sites: sites }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ?resource=firecrawlUsage -- berapa credit Firecrawl yang sudah kepakai
  // bulan ini (lihat action "incrementFirecrawlUsage" di atas).
  if (e.parameter.resource === "firecrawlUsage") {
    var props2 = PropertiesService.getScriptProperties();
    var curMonth2 = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM");
    var storedMonth2 = props2.getProperty("firecrawlUsageMonth");
    var used2 = storedMonth2 === curMonth2 ? parseInt(props2.getProperty("firecrawlUsageCount") || "0", 10) : 0;
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, month: curMonth2, used: used2 }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ?resource=jobHealth -- status terakhir tiap cron job (Scheduler/Uptime
  // Agent), dipakai /api/cron/uptime-check untuk deteksi job yang diam-diam
  // berhenti/gagal terus-menerus, dan ditampilkan di dashboard.
  if (e.parameter.resource === "jobHealth") {
    var jhSheet2 = getJobHealthSheet_();
    var jhRows2 = jhSheet2.getDataRange().getValues();
    var jobs = [];
    for (var jr = 1; jr < jhRows2.length; jr++) {
      if (!jhRows2[jr][0]) continue;
      jobs.push({
        jobName: jhRows2[jr][0],
        lastRunAt: jhRows2[jr][1] || null,
        lastStatus: jhRows2[jr][2] || null,
        lastError: jhRows2[jr][3] || "",
        meta: jhRows2[jr][4] || "",
      });
    }
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, jobs: jobs }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ?resource=templates -- perpustakaan template pesan (Email/WhatsApp).
  if (e.parameter.resource === "templates") {
    var tplSheet3 = getTemplateSheet_();
    var tplRows2 = tplSheet3.getDataRange().getValues();
    var templates = [];
    for (var tp = 1; tp < tplRows2.length; tp++) {
      if (!tplRows2[tp][0]) continue;
      templates.push({
        templateId: tplRows2[tp][0],
        channel: tplRows2[tp][1],
        stage: tplRows2[tp][2],
        subject: tplRows2[tp][3] || "",
        body: tplRows2[tp][4] || "",
        score: tplRows2[tp][5] === "" ? null : Number(tplRows2[tp][5]),
        timesUsed: Number(tplRows2[tp][6] || 0),
        lastScored: tplRows2[tp][7] || null,
        asset: tplRows2[tp][8] || "",
      });
    }
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, templates: templates }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ?resource=statsHistory -- riwayat snapshot harian (dipakai untuk hitung
  // perbandingan day-to-day/week-on-week/monthly di dashboard).
  if (e.parameter.resource === "statsHistory") {
    var statsSheet2 = getStatsHistorySheet_();
    var statsRows2 = statsSheet2.getDataRange().getValues();
    var history = [];
    for (var sh = 1; sh < statsRows2.length; sh++) {
      if (!statsRows2[sh][0]) continue;
      history.push({
        date: statsRows2[sh][0],
        totalLeads: statsRows2[sh][1] || 0,
        waSent: statsRows2[sh][2] || 0,
        waRead: statsRows2[sh][3] || 0,
        waConnected: statsRows2[sh][4] || 0,
        waFail: statsRows2[sh][5] || 0,
        emailSent: statsRows2[sh][6] || 0,
        emailOpened: statsRows2[sh][7] || 0,
        emailClicked: statsRows2[sh][8] || 0,
      });
    }
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, history: history }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var sheet = getLeadsSheet_();
  var rows = sheet.getDataRange().getValues();
  var leads = [];

  for (var i = 1; i < rows.length; i++) { // skip header row
    leads.push({
      row: i + 1,
      leadId: rows[i][0] || null,
      timestamp: rows[i][1],
      name: rows[i][2],
      whatsapp: rows[i][3],
      email: rows[i][4],
      followUpSentAt: rows[i][5] || null, // column F, "FirstTouch" (WA)
      waStatus: rows[i][6] || null,       // column G, "status" (WA)
      fonnteMessageId: rows[i][7] || null,
      source: rows[i][8] || "landing_page", // column I
      emailSentAt: rows[i][9] || null,    // column J
      emailStatus: rows[i][10] || null,   // column K
      waTemplateId: rows[i][11] || null,    // column L -- lihat setWaMeta
      emailTemplateId: rows[i][12] || null, // column M -- lihat markEmailSent
    });
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, leads: leads }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Simple trigger: fires automatically on ANY edit to this sheet — including
// you typing/pasting data by hand, not just form submissions. If column D
// (WhatsApp) gets a value on a row that doesn't have one yet:
// 1. Stamp column B (timestamp) with the current time, kalau masih kosong.
// 2. Generate LeadID dengan prefix "ML" (Manual) di kolom A, kalau masih
//    kosong -- supaya baris yang Anda tambah langsung di sheet (bukan lewat
//    form/API) juga otomatis kebagian LeadID, bukan cuma yang lewat /api/lead.
// Ini juga yang membuat lead manual otomatis eligible untuk follow-up jobs
// (mereka cuma cek apakah kolom "sent at" per-channel kosong, tidak peduli
// baris itu asalnya dari mana).
function onEdit(e) {
  var range = e.range;
  var sheet = range.getSheet();
  if (sheet.getName() !== LEADS_SHEET_NAME) return; // abaikan edit di tab SiteStats/lainnya
  var firstCol = range.getColumn();
  var lastCol = firstCol + range.getNumColumns() - 1;
  if (firstCol > 4 || lastCol < 4) return; // edit didn't touch column D (whatsapp)

  for (var r = range.getRow(); r < range.getRow() + range.getNumRows(); r++) {
    if (r === 1) continue; // header row
    var whatsapp = sheet.getRange(r, 4).getValue();
    if (whatsapp === "") continue;

    var tsCell = sheet.getRange(r, 2);
    if (tsCell.getValue() === "") tsCell.setValue(new Date());

    var idCell = sheet.getRange(r, 1);
    if (idCell.getValue() === "") idCell.setValue(nextLeadId_(sheet, "ML"));
  }
}

// Run this ONCE manually from the Apps Script editor (select "setupFormatting"
// in the function dropdown, then Run) after pasting this code in. Renames the
// headers and sets up the color rules. Safe to re-run any time — it replaces
// the sheet's conditional formatting rules with these ones.
function setupFormatting() {
  var sheet = getLeadsSheet_();

  sheet.getRange("A1").setValue("LeadID");
  sheet.getRange("B1").setValue("timestamp");
  sheet.getRange("C1").setValue("nama");
  sheet.getRange("D1").setValue("whatsapp");
  sheet.getRange("E1").setValue("email");
  sheet.getRange("F1").setValue("FirstTouch");
  sheet.getRange("G1").setValue("status");
  sheet.getRange("H1").setValue("fonnteMessageId");
  sheet.getRange("I1").setValue("source");
  sheet.getRange("J1").setValue("EmailSentAt");
  sheet.getRange("K1").setValue("emailStatus");

  var dRange = sheet.getRange("D2:D1000");
  var eRange = sheet.getRange("E2:E1000");
  var gRange = sheet.getRange("G2:G1000");
  var kRange = sheet.getRange("K2:K1000");

  // Dropdown pilihan di kolom status (G) -- supaya menandai lead "manual"
  // (ditangani sendiri, bukan lewat bot) tinggal pilih dari daftar, tidak
  // perlu ketik manual & rawan typo (typo = tidak ke-skip oleh cron).
  var statusValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(["", "sent", "read", "connected", "manual", "fail"], true)
    .setAllowInvalid(true) // tetap boleh diisi value lain (mis. dari webhook) tanpa kena block
    .build();
  gRange.setDataValidation(statusValidation);

  var rules = [
    // Duplicate WhatsApp number → red background on column D
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($D2<>"", COUNTIF($D$2:$D$1000,$D2)>1)')
      .setBackground("#f4c7c3")
      .setRanges([dRange])
      .build(),

    // Duplicate email → red background on column E (same idea as WhatsApp above)
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($E2<>"", COUNTIF($E$2:$E$1000,$E2)>1)')
      .setBackground("#f4c7c3")
      .setRanges([eRange])
      .build(),

    // status column (WhatsApp) font colors
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("sent")
      .setFontColor("#666666")
      .setRanges([gRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("read")
      .setFontColor("#1155cc")
      .setRanges([gRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("connected")
      .setFontColor("#38761d")
      .setRanges([gRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("fail")
      .setFontColor("#cc0000")
      .setRanges([gRange])
      .build(),
    // "manual" -- Anda sedang tangani lead ini sendiri lewat chat langsung;
    // kedua cron follow-up (WA & email) otomatis skip baris ini.
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("manual")
      .setFontColor("#b45309")
      .setBackground("#fef3c7")
      .setRanges([gRange])
      .build(),

    // emailStatus column font colors (same palette, mirrors WA status colors)
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("sent")
      .setFontColor("#666666")
      .setRanges([kRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("opened")
      .setFontColor("#1155cc")
      .setRanges([kRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("clicked")
      .setFontColor("#38761d")
      .setRanges([kRange])
      .build(),
  ];

  sheet.setConditionalFormatRules(rules);
}

// Run this ONCE the same way as setupFormatting (pilih "setupSiteStats" di
// dropdown function, klik Run). Membuat tab SiteStats kalau belum ada, dan
// mewarnai kolom priority supaya gampang dipindai sekilas.
function setupSiteStats() {
  var sheet = getSiteStatsSheet_();
  var priorityRange = sheet.getRange("G2:G1000");

  var priorityValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Baru", "Rendah", "Sedang", "Tinggi"], true)
    .setAllowInvalid(true) // proses scraping (Fase 5) juga menulis ke sini otomatis
    .build();
  priorityRange.setDataValidation(priorityValidation);

  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Tinggi")
      .setFontColor("#38761d")
      .setRanges([priorityRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Sedang")
      .setFontColor("#b45309")
      .setRanges([priorityRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Rendah")
      .setFontColor("#666666")
      .setRanges([priorityRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Baru")
      .setFontColor("#999999")
      .setRanges([priorityRange])
      .build(),
  ]);
}

// Run this ONCE (pilih "migrateAddTemplateAssetColumn" di dropdown function,
// klik Run), SEKALI SAJA -- hanya perlu kalau tab Template Anda dibuat
// SEBELUM kolom "asset" ditambahkan. No-op kalau header-nya sudah "asset".
function migrateAddTemplateAssetColumn() {
  var sheet = getTemplateSheet_();
  if (String(sheet.getRange("I1").getValue()) === "asset") {
    return; // sudah pernah dijalankan
  }
  sheet.getRange("I1").setValue("asset");
  sheet.getRange("I1").setFontWeight("bold");
}

// Run this ONCE (pilih "migrateAddTemplateIdColumns" di dropdown function,
// klik Run), SEKALI SAJA -- menambah header kolom L (waTemplateId) & M
// (emailTemplateId) di tab Leads. APPEND di ujung (bukan disisipkan di
// tengah seperti migrateAddLeadIdColumn) supaya semua kolom lain TIDAK
// geser -- aman dijalankan kapan saja. No-op kalau sudah pernah dijalankan.
function migrateAddTemplateIdColumns() {
  var sheet = getLeadsSheet_();
  if (String(sheet.getRange("L1").getValue()) === "waTemplateId") {
    return; // sudah pernah dijalankan
  }
  sheet.getRange("L1").setValue("waTemplateId");
  sheet.getRange("M1").setValue("emailTemplateId");
  sheet.getRange("L1:M1").setFontWeight("bold");
}

// Run this ONCE (pilih "migrateAddSchemaIssueColumn" di dropdown function,
// klik Run), SEKALI SAJA -- hanya perlu kalau tab SiteStats Anda dibuat
// SEBELUM kolom schemaIssue ditambahkan (kalau tab-nya baru dibuat otomatis
// oleh getSiteStatsSheet_() versi terbaru, kolom ini sudah ada dari awal,
// migrasi ini tidak perlu dijalankan). Aman dipanggil berkali-kali -- no-op
// kalau header-nya sudah "schemaIssue".
function migrateAddSchemaIssueColumn() {
  var sheet = getSiteStatsSheet_();
  if (String(sheet.getRange("I1").getValue()) === "schemaIssue") {
    return; // sudah pernah dijalankan, tidak perlu apa-apa lagi
  }
  sheet.getRange("I1").setValue("schemaIssue");
  sheet.getRange("I1").setFontWeight("bold");
}

// ============================================================================
// MIGRASI SATU KALI -- jalankan manual dari Apps Script editor (pilih
// "migrateAddLeadIdColumn" di dropdown function, klik Run), SEKALI SAJA,
// setelah paste kode baru ini. Menyisipkan kolom LeadID baru di posisi A
// (semua kolom lain otomatis geser ke kanan oleh Google Sheets), lalu mengisi
// LeadID untuk setiap baris yang sudah ada berdasarkan isi kolom "source"
// (yang sudah bergeser jadi kolom I setelah penyisipan).
//
// PENTING: baris-baris lama dari auto-scraper (sebelum perubahan ini) masih
// bertuliskan "auto-scraper" generik di kolom source (bukan link domain),
// jadi LeadID-nya jatuh ke prefix "AU" (dari kata "auto-scraper") -- bukan
// DS/JK/LS. Cuma lead BARU (setelah kode ini di-deploy) yang otomatis dapat
// prefix per-situs yang benar, karena route scraper sekarang mengirim link
// homepage situs sumbernya, bukan cuma kata "auto-scraper".
//
// JANGAN dijalankan dua kali -- kalau kolom LeadID sudah ada, ini akan
// menyisipkan kolom LeadID KEDUA. Cek dulu kolom A sudah "LeadID" atau belum.
function migrateAddLeadIdColumn() {
  var sheet = getLeadsSheet_();
  if (String(sheet.getRange("A1").getValue()) === "LeadID") {
    throw new Error("Kolom A sudah bernama LeadID -- migrasi ini sepertinya sudah pernah dijalankan. Dibatalkan supaya tidak dobel.");
  }

  sheet.insertColumnBefore(1);
  sheet.getRange("A1").setValue("LeadID");

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return; // belum ada data lead sama sekali

  var sourceValues = sheet.getRange(2, 9, lastRow - 1, 1).getValues(); // kolom I setelah geser
  var counts = {};
  var ids = [];
  for (var i = 0; i < sourceValues.length; i++) {
    var prefix = leadIdPrefix_(sourceValues[i][0]);
    counts[prefix] = (counts[prefix] || 0) + 1;
    var n = counts[prefix];
    var padded = n < 1000 ? ("00" + n).slice(-3) : String(n);
    ids.push([prefix + "-" + padded]);
  }
  sheet.getRange(2, 1, ids.length, 1).setValues(ids);
}
