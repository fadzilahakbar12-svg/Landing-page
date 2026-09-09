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
