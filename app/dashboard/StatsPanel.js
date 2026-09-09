"use client";

import { useState } from "react";

const RANGES = [
  { key: "today", label: "Hari Ini", title: "Ringkasan Hari Ini" },
  { key: "7d", label: "7 Hari", title: "Ringkasan 7 Hari Terakhir" },
  { key: "30d", label: "30 Hari", title: "Ringkasan 30 Hari Terakhir" },
];

const COMPARE_LABEL = {
  prev: "dibanding periode sebelumnya",
  wow: "dibanding minggu lalu (WoW)",
  mom: "dibanding bulan lalu (MoM)",
};

// Badge delta ▲/▼/Baru -- dir "new" dipakai kalau periode pembanding nol
// (belum ada baseline sama sekali), supaya tidak menampilkan pembagian
// dengan nol sebagai angka yang menyesatkan.
function DeltaBadge({ pct, dir }) {
  if (dir === "new") return <span className="db-delta is-flat">Baru</span>;
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "—";
  return <span className={`db-delta is-${dir}`}>{arrow} {Math.abs(pct)}%</span>;
}

export default function StatsPanel({ rangeData }) {
  const [range, setRange] = useState("today");
  const [compare, setCompare] = useState("prev");
  const d = rangeData[range];

  return (
    <>
      <div className="db-toolbar">
        <div className="db-range-group">
          {RANGES.map((r) => (
            <button
              key={r.key}
              className={r.key === range ? "is-active" : ""}
              onClick={() => setRange(r.key)}
              type="button"
            >
              {r.label}
            </button>
          ))}
        </div>
        <select
          className="db-compare-select"
          value={compare}
          onChange={(e) => setCompare(e.target.value)}
        >
          <option value="prev">Dibanding periode sebelumnya</option>
          <option value="wow">Dibanding minggu lalu (WoW)</option>
          <option value="mom">Dibanding bulan lalu (MoM)</option>
        </select>
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
          <p className="db-tile-sub">WA {d.waStage.sent} + Email {d.emailStage.sent}</p>
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
          <p className="db-tile-sub">nomor tidak valid</p>
        </div>
      </div>
      <p className="db-compare-hint">{COMPARE_LABEL[compare]}</p>

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

function pct(numerator, denominator) {
  if (!denominator) return "0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function barWidth(numerator, denominator) {
  if (!denominator) return "0%";
  return `${Math.min(100, Math.round((numerator / denominator) * 100))}%`;
}
