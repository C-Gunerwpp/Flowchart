/* Flowchart Studio — Gantt viewport
 * Beheert de zichtbare maandrange van het Gantt-overzicht.
 * Een viewport bestaat uit een startmaand (jaar+maand) en een aantal maanden
 * (3 t/m 24). De viewport berekent welke ISO-weken zichtbaar zijn en mapt
 * datums naar kolomindices voor de bar/grid-rendering. Hiermee kan dezelfde
 * gantt zowel een kwartaal als twee jaar tonen, en kunnen klanten zelf hun
 * "fiscale" jaar (bv. Q4–Q4, tertialen, …) kiezen.
 */
(function (FS) {
  'use strict';

  const MONTH_LABELS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const MIN_MONTHS = 3;
  const MAX_MONTHS = 24;

  // Mutable view-state. Niet onderdeel van saved JSON: dit is puur UI-state.
  const view = {
    startYear: null,
    startMonth: 0, // 0..11
    monthCount: 12,
  };

  let cache = null;

  function clampInt(v, lo, hi) {
    v = parseInt(v, 10);
    if (!Number.isFinite(v)) return lo;
    return Math.max(lo, Math.min(hi, v));
  }

  /** ISO-week en bijbehorend ISO-jaar voor een Date. */
  function isoWeekParts(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dow = d.getUTCDay() || 7;
    // Verschuif naar donderdag van die week → bepaalt het ISO-jaar
    d.setUTCDate(d.getUTCDate() + 4 - dow);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return { y: d.getUTCFullYear(), w: week };
  }

  function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function ensureInit() {
    if (view.startYear == null) {
      view.startYear = (FS.state && FS.state.year) || new Date().getFullYear();
      view.startMonth = 0;
      view.monthCount = 12;
    }
  }

  /** Bouw de cache met weeks/months/quarters voor de huidige viewport. */
  function build() {
    ensureInit();
    const months = [];
    let y = view.startYear;
    let m = view.startMonth;
    for (let i = 0; i < view.monthCount; i++) {
      months.push({ y, m, idx: i, colStart: 0, colEnd: 0, label: `${MONTH_LABELS[m]} '${String(y).slice(-2)}` });
      m++;
      if (m > 11) { m = 0; y++; }
    }

    // Loop dag-voor-dag door de range; bepaal per dag de ISO-(jaar,week) en
    // groepeer opeenvolgende dagen met dezelfde week tot één kolom. De maand
    // van een week wordt vastgesteld a.d.h.v. de donderdag (ISO-conventie).
    const weeks = [];
    let lastKey = '';
    let lastWeek = null;
    const start = new Date(view.startYear, view.startMonth, 1);
    const endY = months[months.length - 1].y;
    const endM = months[months.length - 1].m;
    const end = new Date(endY, endM + 1, 0); // laatste dag

    const cur = new Date(start);
    while (cur <= end) {
      const iso = isoWeekParts(cur);
      const key = `${iso.y}-${iso.w}`;
      if (key !== lastKey) {
        // Monday van de week
        const dow = cur.getDay() || 7;
        const monday = new Date(cur);
        monday.setDate(cur.getDate() - (dow - 1));
        const thu = new Date(monday);
        thu.setDate(monday.getDate() + 3);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        // Map week naar maandindex op basis van donderdag (en clamp naar
        // beschikbare viewport-maanden).
        let mIdx = months.findIndex((mm) => mm.y === thu.getFullYear() && mm.m === thu.getMonth());
        if (mIdx < 0) {
          // Donderdag valt buiten viewport-maanden (kan bij randweken). Pak
          // dichtstbijzijnde maand uit de viewport.
          if (weeks.length === 0) mIdx = 0;
          else mIdx = months.length - 1;
        }
        lastWeek = {
          y: iso.y,
          w: iso.w,
          mIdx,
          mondayStr: toISO(monday),
          sundayStr: toISO(sunday),
          mondayDay: monday.getDate(),
          sundayDay: sunday.getDate(),
        };
        weeks.push(lastWeek);
        lastKey = key;
      }
      cur.setDate(cur.getDate() + 1);
    }

    // Bereken kolombereik per maand
    months.forEach((mm, mi) => {
      let s = -1; let e = -1;
      for (let i = 0; i < weeks.length; i++) {
        if (weeks[i].mIdx === mi) { if (s < 0) s = i; e = i; }
      }
      if (s < 0) { mm.colStart = 0; mm.colEnd = 0; }
      else { mm.colStart = s + 1; mm.colEnd = e + 2; }
    });

    // Bouw kwartaalbanden, gegroepeerd op (jaar, Q1..Q4)
    const quarters = [];
    months.forEach((mm) => {
      const q = Math.floor(mm.m / 3) + 1;
      const last = quarters[quarters.length - 1];
      if (last && last.y === mm.y && last.q === q) {
        last.colEnd = mm.colEnd;
      } else if (mm.colStart) {
        quarters.push({ y: mm.y, q, colStart: mm.colStart, colEnd: mm.colEnd, label: `Q${q} ${mm.y}` });
      }
    });

    cache = { weeks, months, quarters, cols: weeks.length };
  }

  function toISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function get() { ensureInit(); return { ...view }; }
  function weeks() { if (!cache) build(); return cache.weeks; }
  function months() { if (!cache) build(); return cache.months; }
  function quarters() { if (!cache) build(); return cache.quarters; }
  function cols() { if (!cache) build(); return cache.cols; }

  function invalidate() { cache = null; }

  function set(partial) {
    if (!partial) return;
    if (partial.startYear != null) view.startYear = parseInt(partial.startYear, 10);
    if (partial.startMonth != null) view.startMonth = clampInt(partial.startMonth, 0, 11);
    if (partial.monthCount != null) view.monthCount = clampInt(partial.monthCount, MIN_MONTHS, MAX_MONTHS);
    invalidate();
  }

  function panMonths(delta) {
    ensureInit();
    let y = view.startYear;
    let m = view.startMonth + delta;
    while (m < 0) { m += 12; y--; }
    while (m > 11) { m -= 12; y++; }
    view.startYear = y;
    view.startMonth = m;
    invalidate();
  }

  function setMonthCount(n) {
    view.monthCount = clampInt(n, MIN_MONTHS, MAX_MONTHS);
    invalidate();
  }

  /** Index (0-based) van de week waarin `dateStr` valt; of negatief/te groot. */
  function weekIndex(dateStr) {
    const d = parseDate(dateStr);
    if (!d) return -1;
    const iso = isoWeekParts(d);
    const ws = weeks();
    // Snel pad: lineair zoeken (max ~104 items).
    for (let i = 0; i < ws.length; i++) {
      if (ws[i].y === iso.y && ws[i].w === iso.w) return i;
    }
    // Buiten viewport: bepaal of het ervoor of erna ligt.
    if (!ws.length) return -1;
    const first = ws[0];
    const last = ws[ws.length - 1];
    const before = iso.y < first.y || (iso.y === first.y && iso.w < first.w);
    return before ? -1 : ws.length;
  }

  /** Maakt {sCol, eCol, visible} aan voor een (sd,ed)-paar, geclamped op viewport. */
  function dateColRange(sd, ed) {
    const c = cols();
    if (!c) return { sCol: 1, eCol: 2, visible: false };
    const sIdx = weekIndex(sd);
    const eIdx = weekIndex(ed);
    if (eIdx < 0 || sIdx >= c) return { sCol: 1, eCol: 2, visible: false };
    const sCol = Math.max(1, sIdx + 1);
    const eCol = Math.min(c + 1, (eIdx < 0 ? 0 : eIdx) + 2);
    if (eCol <= sCol) return { sCol, eCol: sCol + 1, visible: false };
    return { sCol, eCol, visible: true };
  }

  /** Fractionele kolom voor "nu" (voor de today-line). */
  function nowCol() {
    const now = new Date();
    const iso = isoWeekParts(now);
    const ws = weeks();
    for (let i = 0; i < ws.length; i++) {
      if (ws[i].y === iso.y && ws[i].w === iso.w) {
        // Bepaal positie binnen de week (0..1) op basis van de dag.
        const monday = parseDate(ws[i].mondayStr);
        const diffDays = (now - monday) / 86400000;
        const frac = Math.max(0, Math.min(1, diffDays / 7));
        return i + frac;
      }
    }
    return null;
  }

  /** Verschuif viewport zodat vandaag (ongeveer) gecentreerd is. */
  function scrollToToday() {
    const now = new Date();
    const half = Math.floor(view.monthCount / 2);
    let m = now.getMonth() - half;
    let y = now.getFullYear();
    while (m < 0) { m += 12; y--; }
    view.startYear = y;
    view.startMonth = m;
    invalidate();
  }

  /** Reset viewport naar het volledige actieve kalenderjaar. */
  function resetToYear(year) {
    view.startYear = year || (FS.state && FS.state.year) || new Date().getFullYear();
    view.startMonth = 0;
    view.monthCount = 12;
    invalidate();
  }

  function rangeLabel() {
    const ms = months();
    if (!ms.length) return '';
    const first = ms[0];
    const last = ms[ms.length - 1];
    return `${MONTH_LABELS[first.m]} ${first.y} – ${MONTH_LABELS[last.m]} ${last.y}`;
  }

  FS.viewport = {
    MIN_MONTHS, MAX_MONTHS, MONTH_LABELS,
    get, set, weeks, months, quarters, cols, invalidate,
    panMonths, setMonthCount, weekIndex, dateColRange, nowCol,
    scrollToToday, resetToYear, rangeLabel,
  };
})(window.FS = window.FS || {});
