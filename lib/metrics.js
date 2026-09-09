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
