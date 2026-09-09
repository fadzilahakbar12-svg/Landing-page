// Shared aggregation logic -- dipakai oleh dashboard (tampilan live) DAN
// cron snapshot (mencatat 1 baris/hari ke StatsHistory), supaya definisi
// "terkirim/dibaca/terhubung" dkk selalu konsisten di kedua tempat.

export function computeWaCounts(leads) {
  const counts = { pending: 0, sent: 0, read: 0, connected: 0, manual: 0, fail: 0 };
  for (const lead of leads) {
    const status = lead.waStatus;
    if (status === "read" || status === "connected" || status === "fail" || status === "sent" || status === "manual") {
      counts[status]++;
    } else {
      counts.pending++;
    }
  }
  return counts;
}

// "Terkirim" itu KUMULATIF (siapapun yang pernah dikirimi, apapun status
// TERKINI-nya sekarang) -- bukan cuma yang masih persis di status "sent"
// (itu sudah "lewat" begitu statusnya maju ke read/connected).
export function waFunnel(counts) {
  const sent = counts.sent + counts.read + counts.connected + counts.fail;
  const read = counts.read + counts.connected; // "connected" pasti sudah lewat "dibaca"
  const connected = counts.connected;
  return { sent, read, connected };
}

// Sama logikanya untuk email (kolom terpisah dari WA sejak Fase 1) --
// "clicked" pasti sudah lewat "opened".
export function emailFunnel(leads) {
  const sent = leads.filter((l) => l.emailSentAt).length;
  const opened = leads.filter((l) => l.emailStatus === "opened" || l.emailStatus === "clicked").length;
  const clicked = leads.filter((l) => l.emailStatus === "clicked").length;
  return { sent, opened, clicked };
}

// Cohort rolling-window: lead masuk hitungan kalau "timestamp" (kapan lead
// itu ditambahkan) jatuh di jendela [now-(offsetDays+days), now-offsetDays).
// offsetDays=0 -> jendela "sekarang"; offsetDays=days -> jendela SEBELUMNYA
// yang sama panjangnya, dipakai sebagai pembanding delta default (sebelum
// user memilih rentang custom lewat kalender).
export function leadsInWindow(leads, days, offsetDays = 0) {
  const now = Date.now();
  const end = now - offsetDays * 86400000;
  const start = end - days * 86400000;
  return leadsInRange(leads, new Date(start), new Date(end));
}

// Rentang custom (dipilih lewat kalender) -- start/end adalah Date, batas
// start EKSKLUSIF dan end INKLUSIF (konsisten dengan leadsInWindow di atas).
export function leadsInRange(leads, start, end) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  return leads.filter((l) => {
    const t = new Date(l.timestamp).getTime();
    return !Number.isNaN(t) && t > startMs && t <= endMs;
  });
}

// Ringkasan 1 cohort lead (dipakai untuk periode "sekarang" MAUPUN periode
// pembanding -- baik yang default maupun yang dipilih manual lewat kalender).
export function summarizeLeads(leads) {
  const counts = computeWaCounts(leads);
  const wa = waFunnel(counts);
  const email = emailFunnel(leads);
  return {
    total: leads.length,
    sent: wa.sent + email.sent, // gabungan WA + Email
    fail: counts.fail,
    waStage: wa,
    emailStage: email,
  };
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function startOfWeekMonday(d) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0=Minggu, 1=Senin, ...
  const diff = day === 0 ? 6 : day - 1; // jarak dari Senin
  x.setDate(x.getDate() - diff);
  return x;
}

// Periode KALENDER (bukan rolling-window) untuk tiap pilihan di toolbar --
// "7 Hari" berarti minggu kerja INI (Senin s.d. sekarang) dibanding minggu
// kerja LALU (Senin-Jumat penuh), "30 Hari" berarti bulan kalender INI
// dibanding bulan kalender LALU (penuh) -- BUKAN 7/30 hari mundur dari
// sekarang. "custom" pakai rentang persis yang dipilih user di kalender,
// dibanding periode sebelumnya yang sama panjangnya.
export function getCalendarPeriod(mode, customRange) {
  const now = new Date();

  if (mode === "today") {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return {
      current: { start: startOfDay(now), end: now },
      compare: { start: startOfDay(yesterday), end: endOfDay(yesterday) },
      sub: (n) => `+${n} hari ini`,
      compareLabel: "dibanding kemarin",
    };
  }

  if (mode === "7d") {
    const thisMonday = startOfWeekMonday(now);
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(lastMonday.getDate() - 7);
    const lastFriday = new Date(lastMonday);
    lastFriday.setDate(lastFriday.getDate() + 4);
    return {
      current: { start: thisMonday, end: now },
      compare: { start: lastMonday, end: endOfDay(lastFriday) },
      sub: (n) => `+${n} minggu ini`,
      compareLabel: "dibanding minggu lalu (Senin–Jumat)",
    };
  }

  if (mode === "30d") {
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
    return {
      current: { start: thisMonthStart, end: now },
      compare: { start: prevMonthStart, end: prevMonthEnd },
      sub: (n) => `+${n} bulan ini`,
      compareLabel: "dibanding bulan lalu",
    };
  }

  // custom -- persis rentang yang dipilih user, dibanding periode sebelumnya
  // yang sama panjangnya (durasi sama, langsung menempel sebelum tanggal mulai).
  const start = customRange.start;
  const end = customRange.end;
  const durationMs = end.getTime() - start.getTime();
  const compareEnd = new Date(start.getTime());
  const compareStart = new Date(start.getTime() - durationMs);
  return {
    current: { start, end },
    compare: { start: compareStart, end: compareEnd },
    sub: (n) => `+${n} pada periode ini`,
    compareLabel: "dibanding periode sebelumnya (durasi sama)",
  };
}

// dir: "up" | "down" | "flat" | "new" ("new" = tidak ada baseline pembanding
// sama sekali, mis. periode sebelumnya nol lead -- tampilkan "Baru", bukan
// pembagian dengan nol).
export function computeDelta(curr, prev) {
  if (prev === 0) {
    if (curr === 0) return { pct: 0, dir: "flat" };
    return { pct: null, dir: "new" };
  }
  const pct = Math.round(((curr - prev) / prev) * 100);
  return { pct, dir: pct > 0 ? "up" : pct < 0 ? "down" : "flat" };
}
