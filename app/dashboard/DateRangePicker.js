"use client";

import { useEffect, useRef, useState } from "react";

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const DAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

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
function sameDay(a, b) {
  return a && b && a.toDateString() === b.toDateString();
}
function formatShort(d) {
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}`;
}

// Grid 6x7 untuk 1 bulan yang ditampilkan, termasuk hari peluruhan dari
// bulan sebelum/sesudah supaya kalender selalu genap 6 baris.
function buildMonthGrid(viewYear, viewMonth) {
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  // Senin = 0 ... Minggu = 6 (locale ID biasa mulai Senin)
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(viewYear, viewMonth, 1 - firstWeekday);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

// Popover kalender dark-themed untuk memilih rentang tanggal pembanding
// (custom, menggantikan dropdown WoW/MoM lama). Klik pertama = mulai, klik
// kedua = selesai; klik lagi sebelum "mulai" mereset pilihan.
export default function DateRangePicker({ range, onChange }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => range.start || new Date());
  const [draftStart, setDraftStart] = useState(range.start);
  const [draftEnd, setDraftEnd] = useState(range.end);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function openPopover() {
    setDraftStart(range.start);
    setDraftEnd(range.end);
    setViewDate(range.start || new Date());
    setOpen(true);
  }

  function pickDay(day) {
    if (!draftStart || (draftStart && draftEnd)) {
      setDraftStart(day);
      setDraftEnd(null);
    } else if (day < draftStart) {
      setDraftStart(day);
      setDraftEnd(null);
    } else {
      setDraftEnd(day);
    }
  }

  function apply() {
    if (draftStart && draftEnd) {
      onChange({ start: startOfDay(draftStart), end: endOfDay(draftEnd) });
      setOpen(false);
    }
  }

  const grid = buildMonthGrid(viewDate.getFullYear(), viewDate.getMonth());
  const viewMonth = viewDate.getMonth();

  return (
    <div className="db-daterange" ref={rootRef}>
      <button type="button" className="db-daterange-trigger" onClick={openPopover}>
        📅 {range.start && range.end ? `${formatShort(range.start)} – ${formatShort(range.end)}` : "Pilih rentang"}
      </button>

      {open && (
        <div className="db-daterange-pop">
          <div className="db-daterange-nav">
            <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewMonth - 1, 1))}>‹</button>
            <span>{MONTH_NAMES[viewMonth]} {viewDate.getFullYear()}</span>
            <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewMonth + 1, 1))}>›</button>
          </div>

          <div className="db-daterange-weekdays">
            {DAY_LABELS.map((l) => <span key={l}>{l}</span>)}
          </div>

          <div className="db-daterange-grid">
            {grid.map((day) => {
              const inMonth = day.getMonth() === viewMonth;
              const isStart = sameDay(day, draftStart);
              const isEnd = sameDay(day, draftEnd);
              const inRange = draftStart && draftEnd && day > draftStart && day < draftEnd;
              const cls = [
                "db-daterange-day",
                !inMonth && "is-muted",
                (isStart || isEnd) && "is-endpoint",
                inRange && "is-inrange",
              ].filter(Boolean).join(" ");
              return (
                <button type="button" key={day.toISOString()} className={cls} onClick={() => pickDay(day)}>
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <div className="db-daterange-actions">
            <span className="db-daterange-preview">
              {draftStart ? formatShort(draftStart) : "mulai"} – {draftEnd ? formatShort(draftEnd) : "selesai"}
            </span>
            <button type="button" className="db-daterange-apply" disabled={!draftStart || !draftEnd} onClick={apply}>
              Terapkan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
