"use client";

import { useMemo, useState } from "react";
import { leadsInWindow, leadsInRange, summarizeLeads, computeDelta } from "@/lib/metrics";
import DateRangePicker from "./DateRangePicker";

const RANGES = [
  { key: "today", label: "Hari Ini", days: 1, sub: (n) => `+${n} hari ini` },
  { key: "7d", label: "7 Hari", days: 7, sub: (n) => `+${n} minggu ini` },
  { key: "30d", label: "30 Hari", days: 30, sub: (n) => `+${n} bulan ini` },
];

function pct(numerator, denominator) {
  if (!denominator) return "0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function barWidth(numerator, denominator) {
  if (!denominator) return "0%";
  return `${Math.min(100, Math.round((numerator / denominator) * 100))}%`;
}

// dir "new" = periode pembanding nol lead sama sekali (belum ada baseline)
// -- tampilkan "Baru" daripada pembagian dengan nol.
function DeltaBadge({ pct: p, dir }) {
  if (dir === "new") return <span className="db-delta is-flat">Baru</span>;
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "—";
  return <span className={`db-delta is-${dir}`}>{arrow} {Math.abs(p)}%</span>;
}

// Default rentang pembanding: periode SEBELUMNYA yang sama panjangnya
// dengan pill yang aktif -- dipakai sampai user memilih rentang custom
// sendiri lewat kalender.
function defaultCompareRange(days) {
  const now = Date.now();
  const end = new Date(now - days * 86400000);
  const start = new Date(now - 2 * days * 86400000);
  return { start, end };
}

export default function StatsPanel({ leads }) {
  const [range, setRange] = useState("today");
  const [compareRange, setCompareRange] = useState(() => defaultCompareRange(RANGES[0].days));
  const [customized, setCustomized] = useState(false);

  const activeRange = RANGES.find((r) => r.key === range);

  function handleRangeChange(key) {
    setRange(key);
    if (!customized) {
      const meta = RANGES.find((r) => r.key === key);
      setCompareRange(defaultCompareRange(meta.days));
    }
  }

  function handleCompareChange(next) {
    setCompareRange(next);
    setCustomized(true);
  }

  const stat = useMemo(() => {
    const currentLeads = leadsInWindow(leads, activeRange.days, 0);
    const compareLeads = leadsInRange(leads, compareRange.start, compareRange.end);
    const current = summarizeLeads(currentLeads);
    const compare = summarizeLeads(compareLeads);

    const waConvNow = current.waStage.sent ? Math.round((current.waStage.connected / current.waStage.sent) * 100) : 0;
    const waConvPrev = compare.waStage.sent ? Math.round((compare.waStage.connected / compare.waStage.sent) * 100) : 0;
    const emailConvNow = current.emailStage.sent ? Math.round((current.emailStage.clicked / current.emailStage.sent) * 100) : 0;
    const emailConvPrev = compare.emailStage.sent ? Math.round((compare.emailStage.clicked / compare.emailStage.sent) * 100) : 0;

    return {
      sub: activeRange.sub(current.total),
      total: { value: current.total, delta: computeDelta(current.total, compare.total) },
      sent: { value: current.sent, delta: computeDelta(current.sent, compare.sent) },
      read: { value: current.waStage.read, delta: computeDelta(current.waStage.read, compare.waStage.read) },
      connected: { value: current.waStage.connected, delta: computeDelta(current.waStage.connected, compare.waStage.connected) },
      fail: { value: current.fail, delta: computeDelta(current.fail, compare.fail) },
      sentOfTotalPct: pct(current.sent, current.total),
      failOfTotalPct: pct(current.fail, current.total),
      readPct: pct(current.waStage.read, current.waStage.sent),
      connectedPct: pct(current.waStage.connected, current.waStage.sent),
      waConvPct: pct(current.waStage.connected, current.waStage.sent),
      waConvDelta: computeDelta(waConvNow, waConvPrev),
      emailConvPct: pct(current.emailStage.clicked, current.emailStage.sent),
      emailConvDelta: computeDelta(emailConvNow, emailConvPrev),
      waStage: current.waStage,
      emailStage: current.emailStage,
    };
  }, [leads, activeRange, compareRange]);

  const d = stat;

  return (
    <>
      <div className="db-toolbar">
        <div className="db-range-group">
          {RANGES.map((r) => (
            <button
              key={r.key}
              className={r.key === range ? "is-active" : ""}
              onClick={() => handleRangeChange(r.key)}
              type="button"
            >
              {r.label}
            </button>
          ))}
        </div>
        <DateRangePicker range={compareRange} onChange={handleCompareChange} />
      </div>

      <div className="db-stats">
        <div className="db-tile is-total">
          <p className="db-tile-label">Total Leads</p>
          <p className="db-tile-value">{d.total.value} <DeltaBadge pct={d.total.delta.pct} dir={d.total.delta.dir} /></p>
          <p className="db-tile-sub">{d.sub}</p>
        </div>
        <div className="db-tile c-sent">
          <p className="db-tile-label">Terkirim</p>
          <p className="db-tile-value">{d.sent.value} <DeltaBadge pct={d.sent.delta.pct} dir={d.sent.delta.dir} /></p>
          <p className="db-tile-sub">{d.sentOfTotalPct} dari total leads</p>
        </div>
        <div className="db-tile c-read">
          <p className="db-tile-label">Dibaca</p>
          <p className="db-tile-value">{d.read.value} <DeltaBadge pct={d.read.delta.pct} dir={d.read.delta.dir} /></p>
          <p className="db-tile-sub">{d.readPct} dari terkirim</p>
        </div>
        <div className="db-tile c-connected">
          <p className="db-tile-label">Terhubung</p>
          <p className="db-tile-value">{d.connected.value} <DeltaBadge pct={d.connected.delta.pct} dir={d.connected.delta.dir} /></p>
          <p className="db-tile-sub">{d.connectedPct} dari terkirim</p>
        </div>
        <div className="db-tile c-fail">
          <p className="db-tile-label">Gagal</p>
          <p className="db-tile-value">{d.fail.value} <DeltaBadge pct={d.fail.delta.pct} dir={d.fail.delta.dir} /></p>
          <p className="db-tile-sub">{d.failOfTotalPct} dari total leads</p>
        </div>
      </div>
      <p className="db-compare-hint">dibanding {compareRange.start && compareRange.end ? `${compareRange.start.toLocaleDateString("id-ID")} – ${compareRange.end.toLocaleDateString("id-ID")}` : "periode sebelumnya"}</p>

      <div className="db-section-head">
        <h2>Funnel per Sumber</h2>
        <span className="db-hint">WhatsApp vs Email</span>
      </div>

      <div className="db-funnel-grid">
        <div className="db-funnel-card wa">
          <div className="db-funnel-head">
            <span className="db-funnel-title">WhatsApp</span>
            <span className="db-funnel-conv">
              <span className="n">{d.waConvPct} <DeltaBadge pct={d.waConvDelta.pct} dir={d.waConvDelta.dir} /></span>
              <span className="l">terhubung</span>
            </span>
          </div>
          <p className="db-funnel-caption">WA {d.waStage.sent} + Email {d.emailStage.sent}</p>
          <div className="db-funnel-stage">
            <span className="db-funnel-stage-label">Terkirim</span>
            <span className="db-funnel-stage-track"><span className="db-funnel-stage-fill" style={{ width: "100%" }} /></span>
            <span className="db-funnel-stage-num">{d.waStage.sent}</span>
          </div>
          <div className="db-funnel-stage">
            <span className="db-funnel-stage-label">Dibaca</span>
            <span className="db-funnel-stage-track"><span className="db-funnel-stage-fill" style={{ width: barWidth(d.waStage.read, d.waStage.sent) }} /></span>
            <span className="db-funnel-stage-num">{d.waStage.read} <small>{pct(d.waStage.read, d.waStage.sent)}</small></span>
          </div>
          <div className="db-funnel-stage">
            <span className="db-funnel-stage-label">Terhubung</span>
            <span className="db-funnel-stage-track"><span className="db-funnel-stage-fill" style={{ width: barWidth(d.waStage.connected, d.waStage.sent) }} /></span>
            <span className="db-funnel-stage-num">{d.waStage.connected} <small>{pct(d.waStage.connected, d.waStage.sent)}</small></span>
          </div>
        </div>

        <div className="db-funnel-card email">
          <div className="db-funnel-head">
            <span className="db-funnel-title">Email</span>
            <span className="db-funnel-conv">
              <span className="n">{d.emailConvPct} <DeltaBadge pct={d.emailConvDelta.pct} dir={d.emailConvDelta.dir} /></span>
              <span className="l">klik CTA</span>
            </span>
          </div>
          <p className="db-funnel-caption">WA {d.waStage.sent} + Email {d.emailStage.sent}</p>
          <div className="db-funnel-stage">
            <span className="db-funnel-stage-label">Terkirim</span>
            <span className="db-funnel-stage-track"><span className="db-funnel-stage-fill" style={{ width: "100%" }} /></span>
            <span className="db-funnel-stage-num">{d.emailStage.sent}</span>
          </div>
          <div className="db-funnel-stage">
            <span className="db-funnel-stage-label">Dibuka</span>
            <span className="db-funnel-stage-track"><span className="db-funnel-stage-fill" style={{ width: barWidth(d.emailStage.opened, d.emailStage.sent) }} /></span>
            <span className="db-funnel-stage-num">{d.emailStage.opened} <small>{pct(d.emailStage.opened, d.emailStage.sent)}</small></span>
          </div>
          <div className="db-funnel-stage">
            <span className="db-funnel-stage-label">Klik CTA</span>
            <span className="db-funnel-stage-track"><span className="db-funnel-stage-fill" style={{ width: barWidth(d.emailStage.clicked, d.emailStage.sent) }} /></span>
            <span className="db-funnel-stage-num">{d.emailStage.clicked} <small>{pct(d.emailStage.clicked, d.emailStage.sent)}</small></span>
          </div>
        </div>
      </div>
    </>
  );
}
