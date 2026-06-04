/* Flowchart Studio — Inzichten paneel
 * Charts (donut, bars) + Always-On vs losse split + actuals tabel + PDF rapport.
 * Geen externe libraries — alles in vanilla SVG.
 */
(function (FS) {
  'use strict';

  const esc = (v) => FS.utils.escapeHtml(v);
  const fC = (v) => FS.utils.formatCurrency(v);
  const fK = (v) => FS.utils.formatK(v) || '€0';

  let isOpen = false;

  // Actieve tab in het inzichten-paneel.
  let activeTab = 'overview';
  const TABS = [
    { id: 'overview', label: '📊 Overzicht' },
    { id: 'channels', label: '📡 Kanalen' },
    { id: 'funnel', label: '🪜 Funnel & Status' },
    { id: 'actuals', label: '📐 Planned vs. Actual' },
  ];

  // Filters (periode + kanalen + funnel). Worden bij eerste open of jaarwissel gereset.
  let filters = null;
  let filtersYear = null;
  function ensureFilters() {
    const y = FS.state.year;
    if (filters && filtersYear === y) return;
    filters = {
      from: `${y}-01-01`,
      to: `${y}-12-31`,
      channels: new Set(FS.constants.CHANNELS.map((c) => c.id)),
      funnel: new Set([...FS.constants.FUNNEL_STAGES.map((s) => s.id), '']),
    };
    filtersYear = y;
  }

  function campMatchesFunnel(c) {
    return filters.funnel.has(c.funnel || '');
  }

  /* ----- Periode-helpers ----- */
  function totalDays(sd, ed) {
    if (!sd || !ed) return 0;
    const a = new Date(`${sd}T12:00:00`);
    const b = new Date(`${ed}T12:00:00`);
    if (b < a) return 0;
    return Math.floor((b - a) / 86400000) + 1;
  }
  function overlapDays(sd, ed) {
    if (!sd || !ed) return 0;
    const fromStr = filters.from;
    const toStr = filters.to;
    const aStr = sd < fromStr ? fromStr : sd;
    const bStr = ed > toStr ? toStr : ed;
    if (aStr > bStr) return 0;
    const a = new Date(`${aStr}T12:00:00`);
    const b = new Date(`${bStr}T12:00:00`);
    return Math.floor((b - a) / 86400000) + 1;
  }
  function periodWeight(sd, ed) {
    const tot = totalDays(sd, ed);
    if (!tot) return 0;
    return overlapDays(sd, ed) / tot;
  }
  function clampedPeriod(sd, ed) {
    if (!sd || !ed) return null;
    const a = sd < filters.from ? filters.from : sd;
    const b = ed > filters.to ? filters.to : ed;
    return a > b ? null : [a, b];
  }

  function open() {
    const bg = document.getElementById('insBg');
    if (!bg) return;
    render();
    bg.classList.add('open');
    isOpen = true;
  }

  function close() {
    const bg = document.getElementById('insBg');
    if (!bg) return;
    bg.classList.remove('open');
    isOpen = false;
  }

  function toggle() { (isOpen ? close : open)(); }

  /* =====================  AGGREGATIES  ===================== */

  function aggregateChannels() {
    ensureFilters();
    const totals = {};
    FS.state.campaigns.forEach((c) => {
      if (!campMatchesFunnel(c)) return;
      c.segs.forEach((f) =>
        (f.tac || []).forEach((t) => {
          const w = periodWeight(t.sd, t.ed);
          if (w <= 0) return;
          for (const k in (t.ch || {})) {
            if (!filters.channels.has(k)) continue;
            totals[k] = (totals[k] || 0) + (t.ch[k] || 0) * w;
          }
        }),
      );
    });
    return totals;
  }

  /** Verdeel een bedrag pro-rata over maanden tussen sd en ed (inclusief). */
  function spreadOverMonths(sd, ed, amount, year, buckets) {
    if (!sd || !ed || !amount) return;
    const a = new Date(sd + 'T12:00:00');
    const b = new Date(ed + 'T12:00:00');
    if (b < a) return;
    const totalDays = Math.floor((b - a) / 86400000) + 1;
    if (totalDays <= 0) return;
    const perDay = amount / totalDays;
    for (let m = 0; m < 12; m++) {
      const ms = new Date(year, m, 1);
      const me = new Date(year, m + 1, 0);
      const lo = a > ms ? a : ms;
      const hi = b < me ? b : me;
      if (hi < lo) continue;
      const days = Math.floor((hi - lo) / 86400000) + 1;
      if (days > 0) buckets[m] += days * perDay;
    }
  }

  function aggregateMonthlySpend() {
    ensureFilters();
    const year = FS.state.year;
    const media = new Array(12).fill(0);
    const creatie = new Array(12).fill(0);
    const tooling = new Array(12).fill(0);
    FS.state.campaigns.forEach((c) => {
      if (!campMatchesFunnel(c)) return;
      c.segs.forEach((f) => {
        const rf = clampedPeriod(f.sd, f.ed);
        if (f.tac && f.tac.length) {
          f.tac.forEach((t) => {
            const rt = clampedPeriod(t.sd, t.ed);
            if (rt) spreadOverMonths(rt[0], rt[1], t.b || 0, year, media);
          });
        } else if (rf) {
          spreadOverMonths(rf[0], rf[1], FS.calc.flightBudget(f), year, media);
        }
        if (rf) {
          if (f.cb) spreadOverMonths(rf[0], rf[1], f.cb, year, creatie);
          if (f.tc) spreadOverMonths(rf[0], rf[1], f.tc, year, tooling);
        }
      });
    });
    return { media, creatie, tooling };
  }

  function aggregateSectionSplit() {
    ensureFilters();
    let ao = 0;
    let losse = 0;
    FS.state.campaigns.forEach((c) => {
      if (!campMatchesFunnel(c)) return;
      let total = 0;
      c.segs.forEach((f) => {
        const w = periodWeight(f.sd, f.ed);
        if (w > 0) total += FS.calc.flightBudget(f) * w;
      });
      if (c.sec === 'ao') ao += total; else losse += total;
    });
    return { ao, losse };
  }

  function collectActuals() {
    ensureFilters();
    const rows = [];
    FS.state.campaigns.forEach((c) => {
      if (!campMatchesFunnel(c)) return;
      c.segs.forEach((f) =>
        (f.tac || []).forEach((t) => {
          if (!(t.actual && t.actual > 0)) return;
          const w = periodWeight(t.sd, t.ed);
          if (w <= 0) return;
          rows.push({
            camp: c.label,
            flight: f.n || '',
            tactic: t.n || '',
            planned: (t.b || 0) * w,
            actual: (t.actual) * w,
            variance: (t.actual - (t.b || 0)) * w,
          });
        }),
      );
    });
    return rows;
  }

  /** Planned vs. werkelijk op campagne- én flight-niveau (flight-actuals). */
  function collectCampaignActuals() {
    ensureFilters();
    const camps = [];
    FS.state.campaigns.forEach((c) => {
      if (!campMatchesFunnel(c)) return;
      let planned = 0;
      let actual = 0;
      let anyActual = false;
      const flights = [];
      c.segs.forEach((f) => {
        const w = periodWeight(f.sd, f.ed);
        if (w <= 0) return;
        const p = FS.calc.flightBudget(f) * w;
        const a = (f.actualized && f.actualBudget != null) ? f.actualBudget * w : p;
        if (f.actualized) anyActual = true;
        planned += p;
        actual += a;
        flights.push({
          name: f.n || 'Flight',
          planned: p,
          actual: a,
          actualized: !!f.actualized,
          variance: a - p,
        });
      });
      if (planned > 0 || actual > 0) {
        camps.push({
          camp: c.label,
          sec: c.sec,
          planned,
          actual,
          anyActual,
          variance: actual - planned,
          flights,
        });
      }
    });
    return camps;
  }

  /** Budget per funnelfase (naar rato van periode). */
  function aggregateFunnel() {
    ensureFilters();
    const totals = {};
    FS.constants.FUNNEL_STAGES.forEach((st) => { totals[st.id] = 0; });
    totals[''] = 0;
    FS.state.campaigns.forEach((c) => {
      if (!campMatchesFunnel(c)) return;
      let total = 0;
      c.segs.forEach((f) => {
        const w = periodWeight(f.sd, f.ed);
        if (w > 0) total += FS.calc.flightBudget(f) * w;
      });
      const key = c.funnel || '';
      totals[key] = (totals[key] || 0) + total;
    });
    return totals;
  }

  /** Budget per flight-status (naar rato van periode). */
  function aggregateStatus() {
    ensureFilters();
    const totals = {};
    FS.constants.STATUSES.forEach((st) => { totals[st.id] = 0; });
    FS.state.campaigns.forEach((c) => {
      if (!campMatchesFunnel(c)) return;
      c.segs.forEach((f) => {
        const w = periodWeight(f.sd, f.ed);
        if (w <= 0) return;
        const key = f.st || 'concept';
        totals[key] = (totals[key] || 0) + FS.calc.flightBudget(f) * w;
      });
    });
    return totals;
  }

  /* =====================  CHARTS (SVG)  ===================== */

  const CHART_COLORS = [
    '#0026C5', '#1E40AF', '#3B82F6', '#60A5FA', '#93C5FD',
    '#0D9488', '#14B8A6', '#A2D2BF', '#F59E0B', '#FBBF24',
    '#EC4899', '#8B5CF6', '#A855F7', '#475569',
  ];

  function donut(totals, channelMeta) {
    const entries = channelMeta
      .map((ch, i) => ({ id: ch.id, name: ch.name, icon: ch.icon, value: totals[ch.id] || 0, color: CHART_COLORS[i % CHART_COLORS.length] }))
      .filter((e) => e.value > 0)
      .sort((a, b) => b.value - a.value);
    const sum = entries.reduce((a, e) => a + e.value, 0);
    if (sum === 0) {
      return `<div class="ins-empty">Nog geen kanaalverdeling — voeg tactics met kanalen toe.</div>`;
    }
    const size = 200;
    const cx = size / 2;
    const cy = size / 2;
    const r = 78;
    const ir = 48;
    let acc = 0;
    let paths = '';
    entries.forEach((e) => {
      const start = (acc / sum) * Math.PI * 2 - Math.PI / 2;
      acc += e.value;
      const end = (acc / sum) * Math.PI * 2 - Math.PI / 2;
      const large = end - start > Math.PI ? 1 : 0;
      const x1 = cx + Math.cos(start) * r;
      const y1 = cy + Math.sin(start) * r;
      const x2 = cx + Math.cos(end) * r;
      const y2 = cy + Math.sin(end) * r;
      const xi2 = cx + Math.cos(end) * ir;
      const yi2 = cy + Math.sin(end) * ir;
      const xi1 = cx + Math.cos(start) * ir;
      const yi1 = cy + Math.sin(start) * ir;
      paths += `<path d="M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} L${xi2} ${yi2} A${ir} ${ir} 0 ${large} 0 ${xi1} ${yi1} Z" fill="${e.color}"><title>${esc(e.name)}: ${esc(fC(e.value))} (${((e.value / sum) * 100).toFixed(1)}%)</title></path>`;
    });
    let legend = '<div class="ins-legend">';
    entries.forEach((e) => {
      const pct = ((e.value / sum) * 100).toFixed(1);
      legend += `<div class="ins-leg-row"><span class="ins-leg-sw" style="background:${e.color}"></span>`
        + `<span class="ins-leg-nm">${esc(e.icon)} ${esc(e.name)}</span>`
        + `<span class="ins-leg-v">${esc(fC(e.value))}</span>`
        + `<span class="ins-leg-p">${pct}%</span></div>`;
    });
    legend += '</div>';
    return `<div class="ins-donut-wrap">`
      + `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths}`
      + `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#000050">Totaal</text>`
      + `<text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="13" font-weight="800" fill="#000050">${esc(fK(sum))}</text>`
      + `</svg>${legend}</div>`;
  }

  const MONTH_LABELS = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

  function stackedBars(data) {
    const max = Math.max(...data.media.map((m, i) => m + data.creatie[i] + data.tooling[i]), 1);
    const w = 560;
    const h = 200;
    const padL = 50;
    const padR = 12;
    const padT = 14;
    const padB = 30;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    const bw = innerW / 12;
    const colors = { media: '#0026C5', creatie: '#EC4899', tooling: '#1E40AF' };
    let bars = '';
    let labels = '';
    for (let i = 0; i < 12; i++) {
      const mv = data.media[i];
      const cv = data.creatie[i];
      const tv = data.tooling[i];
      const x = padL + i * bw + bw * 0.15;
      const bwIn = bw * 0.7;
      let yCur = padT + innerH;
      [['media', mv], ['creatie', cv], ['tooling', tv]].forEach(([k, v]) => {
        if (v <= 0) return;
        const segH = (v / max) * innerH;
        yCur -= segH;
        bars += `<rect x="${x}" y="${yCur}" width="${bwIn}" height="${segH}" fill="${colors[k]}" rx="2"><title>${MONTH_LABELS[i]} – ${k}: ${esc(fC(v))}</title></rect>`;
      });
      const total = mv + cv + tv;
      labels += `<text x="${x + bwIn / 2}" y="${padT + innerH + 14}" text-anchor="middle" font-size="9" fill="#6B7280">${MONTH_LABELS[i]}</text>`;
      if (total > 0) {
        labels += `<text x="${x + bwIn / 2}" y="${padT + innerH + 24}" text-anchor="middle" font-size="8" fill="#000050" font-weight="700">${esc(fK(total))}</text>`;
      }
    }
    // y-axis ticks
    const ticks = 4;
    let axis = '';
    for (let i = 0; i <= ticks; i++) {
      const y = padT + innerH - (i / ticks) * innerH;
      const v = (i / ticks) * max;
      axis += `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="#E5E7EB" stroke-dasharray="2,2"/>`;
      axis += `<text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="8" fill="#94A3B8">${esc(fK(v))}</text>`;
    }
    const legend = `<div class="ins-legend ins-legend-row">`
      + `<div class="ins-leg-row"><span class="ins-leg-sw" style="background:${colors.media}"></span><span class="ins-leg-nm">Media</span></div>`
      + `<div class="ins-leg-row"><span class="ins-leg-sw" style="background:${colors.creatie}"></span><span class="ins-leg-nm">Creatie</span></div>`
      + `<div class="ins-leg-row"><span class="ins-leg-sw" style="background:${colors.tooling}"></span><span class="ins-leg-nm">Tooling</span></div>`
      + `</div>`;
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-height:240px">${axis}${bars}${labels}</svg>${legend}`;
  }

  function splitBar(split) {
    const sum = split.ao + split.losse;
    if (sum === 0) return `<div class="ins-empty">Geen campagne-budget om te splitsen.</div>`;
    const pAo = (split.ao / sum) * 100;
    const pLo = 100 - pAo;
    return `<div class="ins-split">`
      + `<div class="ins-split-bar">`
      + `<div class="ins-split-seg" style="width:${pLo}%;background:#0026C5"><span>${pLo.toFixed(0)}%</span></div>`
      + `<div class="ins-split-seg" style="width:${pAo}%;background:#0D9488"><span>${pAo.toFixed(0)}%</span></div>`
      + `</div>`
      + `<div class="ins-split-leg">`
      + `<div><span class="ins-leg-sw" style="background:#0026C5"></span> Campagnes (losse): <strong>${esc(fC(split.losse))}</strong></div>`
      + `<div><span class="ins-leg-sw" style="background:#0D9488"></span> Always-On: <strong>${esc(fC(split.ao))}</strong></div>`
      + `</div></div>`;
  }

  function actualsTable(rows) {
    if (!rows.length) {
      return `<div class="ins-empty">Nog geen werkelijke uitgaven ingevuld. Vul "Werkelijk besteed" in op een tactic om hier variance te zien.</div>`;
    }
    let totP = 0;
    let totA = 0;
    let tbody = '';
    rows.forEach((r) => {
      totP += r.planned;
      totA += r.actual;
      const cls = r.variance > 0 ? 'ins-var-neg' : r.variance < 0 ? 'ins-var-pos' : '';
      const sign = r.variance > 0 ? '+' : '';
      tbody += `<tr><td>${esc(r.camp)}</td><td>${esc(r.flight)}</td><td>${esc(r.tactic)}</td>`
        + `<td class="num">${esc(fC(r.planned))}</td>`
        + `<td class="num">${esc(fC(r.actual))}</td>`
        + `<td class="num ${cls}">${sign}${esc(fC(r.variance))}</td></tr>`;
    });
    const tv = totA - totP;
    const tcls = tv > 0 ? 'ins-var-neg' : tv < 0 ? 'ins-var-pos' : '';
    const tsign = tv > 0 ? '+' : '';
    return `<table class="ins-table">`
      + `<thead><tr><th>Campagne</th><th>Flight</th><th>Tactic</th><th class="num">Gepland</th><th class="num">Werkelijk</th><th class="num">Δ</th></tr></thead>`
      + `<tbody>${tbody}</tbody>`
      + `<tfoot><tr><td colspan="3"><strong>Totaal</strong></td>`
      + `<td class="num"><strong>${esc(fC(totP))}</strong></td>`
      + `<td class="num"><strong>${esc(fC(totA))}</strong></td>`
      + `<td class="num ${tcls}"><strong>${tsign}${esc(fC(tv))}</strong></td></tr></tfoot></table>`;
  }

  /* ----- Horizontale balkenlijst (budget per categorie) ----- */
  function barList(entries) {
    const valid = entries.filter((e) => e.value > 0).sort((a, b) => b.value - a.value);
    if (!valid.length) {
      return `<div class="ins-empty">Geen budget om te tonen voor deze selectie.</div>`;
    }
    const max = Math.max(...valid.map((e) => e.value), 1);
    const sum = valid.reduce((a, e) => a + e.value, 0);
    let rows = '';
    valid.forEach((e) => {
      const pct = (e.value / max) * 100;
      const share = ((e.value / sum) * 100).toFixed(1);
      rows += `<div class="ins-bl-row">`
        + `<div class="ins-bl-lbl">${esc(e.label)}</div>`
        + `<div class="ins-bl-track"><div class="ins-bl-fill" style="width:${pct}%;background:${esc(e.color || '#0026C5')}"></div></div>`
        + `<div class="ins-bl-val">${esc(fC(e.value))}</div>`
        + `<div class="ins-bl-pct">${share}%</div></div>`;
    });
    return `<div class="ins-bl">${rows}</div>`;
  }

  function funnelChart() {
    const totals = aggregateFunnel();
    const entries = FS.constants.FUNNEL_STAGES.map((st) => ({
      label: `${st.icon} ${st.name}`, value: totals[st.id] || 0, color: st.color,
    }));
    entries.push({ label: '— Geen funnelfase —', value: totals[''] || 0, color: '#94A3B8' });
    return barList(entries);
  }

  function statusChart() {
    const totals = aggregateStatus();
    const entries = FS.constants.STATUSES.map((st) => ({
      label: st.name, value: totals[st.id] || 0, color: st.color || '#0026C5',
    }));
    return barList(entries);
  }

  /** Tabel: planned vs werkelijk per campagne (met uitklapbare flights). */
  function campaignActualsTable(camps) {
    if (!camps.length) {
      return `<div class="ins-empty">Geen campagnes in de huidige selectie.</div>`;
    }
    let totP = 0;
    let totA = 0;
    let tbody = '';
    camps.forEach((c) => {
      totP += c.planned;
      totA += c.actual;
      const cls = c.variance > 0 ? 'ins-var-neg' : c.variance < 0 ? 'ins-var-pos' : '';
      const sign = c.variance > 0 ? '+' : '';
      const badge = c.anyActual
        ? `<span class="ins-pill ins-pill-act">actual</span>`
        : `<span class="ins-pill ins-pill-plan">planned</span>`;
      tbody += `<tr class="r-camp"><td><strong>${esc(c.camp)}</strong> ${badge} `
        + `<span style="color:#6B7280;font-size:9px">(${c.sec === 'ao' ? 'Always-On' : 'Campagne'})</span></td>`
        + `<td class="num">${esc(fC(c.planned))}</td>`
        + `<td class="num">${esc(fC(c.actual))}</td>`
        + `<td class="num ${cls}">${sign}${esc(fC(c.variance))}</td></tr>`;
      c.flights.forEach((f) => {
        const fcls = f.variance > 0 ? 'ins-var-neg' : f.variance < 0 ? 'ins-var-pos' : '';
        const fsign = f.variance > 0 ? '+' : '';
        tbody += `<tr><td style="padding-left:20px">✈️ ${esc(f.name)}${f.actualized ? ' ✓' : ''}</td>`
          + `<td class="num">${esc(fC(f.planned))}</td>`
          + `<td class="num">${esc(fC(f.actual))}</td>`
          + `<td class="num ${fcls}">${fsign}${esc(fC(f.variance))}</td></tr>`;
      });
    });
    const tv = totA - totP;
    const tcls = tv > 0 ? 'ins-var-neg' : tv < 0 ? 'ins-var-pos' : '';
    const tsign = tv > 0 ? '+' : '';
    return `<table class="ins-table">`
      + `<thead><tr><th>Campagne / flight</th><th class="num">Planned</th><th class="num">Werkelijk</th><th class="num">Δ</th></tr></thead>`
      + `<tbody>${tbody}</tbody>`
      + `<tfoot><tr><td><strong>Totaal</strong></td>`
      + `<td class="num"><strong>${esc(fC(totP))}</strong></td>`
      + `<td class="num"><strong>${esc(fC(totA))}</strong></td>`
      + `<td class="num ${tcls}"><strong>${tsign}${esc(fC(tv))}</strong></td></tr></tfoot></table>`;
  }

  /* =====================  KPIs  ===================== */

  function kpi(label, value, mod) {
    const cls = mod ? ` ins-kpi-${mod}` : '';
    return `<div class="ins-kpi${cls}"><div class="ins-kpi-l">${label}</div>`
      + `<div class="ins-kpi-v">${value}</div></div>`;
  }

  function section(title, body) {
    return `<div class="ins-sec"><h4>${title}</h4>${body}</div>`;
  }

  /* =====================  RENDER  ===================== */

  function render() {
    const body = document.getElementById('insBody');
    if (!body) return;
    const s = FS.state;
    ensureFilters();

    // Gefilterde aggregaties
    const spend = aggregateMonthlySpend();
    const filtMedia = spend.media.reduce((a, v) => a + v, 0);
    const filtCreatie = spend.creatie.reduce((a, v) => a + v, 0);
    const filtTooling = spend.tooling.reduce((a, v) => a + v, 0);

    // Full-year referenties (voor jaarbudget / fee / rest)
    const totalFee = FS.calc.totalFee();
    const totCreatie = FS.calc.totalCreatieFlights() + FS.calc.calcCreatie();
    const totTooling = FS.calc.totalToolingFlights() + FS.calc.calcTooling();
    const jaar = s.jaarTotal;
    // Resterend volgt de actual-leidende besteding (geactualiseerde flights tellen
    // mee met hun werkelijk bestede budget).
    const rest = jaar - FS.calc.grandTotalActual() - totCreatie - totTooling;

    const numCamps = s.campaigns.length;
    const numFlights = s.campaigns.reduce((a, c) => a + c.segs.length, 0);
    const numTactics = s.campaigns.reduce((a, c) =>
      a + c.segs.reduce((b, f) => b + (f.tac ? f.tac.length : 0), 0), 0);

    const totalChan = FS.constants.CHANNELS.length;
    const activeChan = filters.channels.size;
    const totalFn = FS.constants.FUNNEL_STAGES.length + 1; // +1 voor "geen"
    const activeFn = filters.funnel.size;
    const isFiltered = filters.from !== `${s.year}-01-01`
      || filters.to !== `${s.year}-12-31`
      || activeChan !== totalChan
      || activeFn !== totalFn;

    // Channel-chips (in collapsible details)
    const chanBoxes = FS.constants.CHANNELS.map((ch) => {
      const checked = filters.channels.has(ch.id);
      return `<label class="ins-chan${checked ? '' : ' off'}"><input type="checkbox" data-ch="${esc(ch.id)}"${checked ? ' checked' : ''}> ${esc(ch.icon)} ${esc(ch.name)}</label>`;
    }).join('');

    // Funnel-chips
    const funnelBoxes = FS.constants.FUNNEL_STAGES.map((st) => {
      const on = filters.funnel.has(st.id);
      const bg = on ? `background:${esc(st.color)};color:#fff;border-color:${esc(st.color)};` : '';
      return `<label class="ins-funnel${on ? '' : ' off'}" style="${bg}"><input type="checkbox" data-fn="${esc(st.id)}"${on ? ' checked' : ''} style="display:none"> ${esc(st.icon)} ${esc(st.name)}</label>`;
    }).join('');
    const noneOn = filters.funnel.has('');
    const funnelNone = `<label class="ins-funnel${noneOn ? '' : ' off'}"><input type="checkbox" data-fn=""${noneOn ? ' checked' : ''} style="display:none"> — geen —</label>`;

    let h = `<div class="ins-filters">`
      + `<div class="ins-filt-row">`
      + `<div class="ins-filt-l">📅 Periode</div>`
      + `<input type="date" id="insFrom" value="${esc(filters.from)}">`
      + `<span class="ins-filt-dash">t/m</span>`
      + `<input type="date" id="insTo" value="${esc(filters.to)}">`
      + `<div class="ins-filt-grp" style="margin-left:auto">`
      + `<button class="mbtn mini" id="insPq1">Q1</button>`
      + `<button class="mbtn mini" id="insPq2">Q2</button>`
      + `<button class="mbtn mini" id="insPq3">Q3</button>`
      + `<button class="mbtn mini" id="insPq4">Q4</button>`
      + `<button class="mbtn mini" id="insFiltReset" title="Hele jaar">↺ Jaar</button>`
      + `</div>`
      + `</div>`
      + `<div class="ins-filt-row">`
      + `<div class="ins-filt-l">🪜 Funnel <span class="ins-filt-mini">(${activeFn}/${totalFn})</span></div>`
      + `<div class="ins-funnels">${funnelBoxes}${funnelNone}</div>`
      + `<div class="ins-filt-grp" style="margin-left:auto">`
      + `<button class="mbtn mini" id="insFnAll">Alle</button>`
      + `<button class="mbtn mini" id="insFnNone">Geen</button>`
      + `</div>`
      + `</div>`
      + `<details class="ins-filt-details"${activeChan !== totalChan ? ' open' : ''}>`
      + `<summary>📊 Kanalen (${activeChan}/${totalChan})</summary>`
      + `<div class="ins-filt-detail-body">`
      + `<div class="ins-chans">${chanBoxes}</div>`
      + `<div class="ins-filt-grp">`
      + `<button class="mbtn mini" id="insChanAll">Alle</button>`
      + `<button class="mbtn mini" id="insChanNone">Geen</button>`
      + `</div></div></details>`
      + (isFiltered
        ? `<div class="ins-filt-note">⚠ Gefilterde weergave — bedragen zijn naar rato van geselecteerde periode/kanalen/funnel.</div>`
        : '')
      + `</div>`;

    // Tab-balk
    h += `<div class="ins-tabs">`
      + TABS.map((t) => {
        const isActualTab = t.id === 'actuals';
        const anyActual = isActualTab && FS.state.campaigns.some((c) => (c.segs || []).some((f) => f.actualized));
        const dot = anyActual ? `<span class="ins-tab-dot"></span>` : '';
        return `<button class="ins-tab${activeTab === t.id ? ' on' : ''}" data-tab="${esc(t.id)}">${t.label}${dot}</button>`;
      }).join('')
      + `</div>`;

    h += `<div class="ins-tabpane">`;

    if (activeTab === 'overview') {
      h += `<div class="ins-grid">`
        + kpi('🎯 Jaarbudget', fC(jaar))
        + kpi(isFiltered ? '📺 Media (periode)' : '📺 Media (campagnes)', fC(filtMedia))
        + kpi(isFiltered ? '🎨 Creatie (periode)' : '🎨 Creatie', fC(filtCreatie))
        + kpi(isFiltered ? '🔧 Tooling (periode)' : '🔧 Tooling', fC(filtTooling))
        + kpi('💰 Fee totaal', fC(totalFee))
        + kpi(rest >= 0 ? '✓ Restbudget (jaar)' : '⚠ Overschrijding (jaar)', fC(Math.abs(rest)), rest >= 0 ? 'pos' : 'neg')
        + kpi('📋 Campagnes', String(numCamps))
        + kpi('✈️ Flights', String(numFlights))
        + kpi('🎯 Tactics', String(numTactics))
        + `</div>`;
      h += section(`📈 Spend curve (per maand · ${s.year})`, stackedBars(spend));
      h += section('🔁 Always-On vs. losse campagnes', splitBar(aggregateSectionSplit()));
    } else if (activeTab === 'channels') {
      h += section('📊 Kanaalverdeling (budget)', donut(aggregateChannels(), FS.constants.CHANNELS));
      h += section(`📈 Spend curve (per maand · ${s.year})`, stackedBars(spend));
    } else if (activeTab === 'funnel') {
      h += section('🪜 Budget per funnelfase', funnelChart());
      h += section('🚦 Budget per status', statusChart());
      h += section('🔁 Always-On vs. losse campagnes', splitBar(aggregateSectionSplit()));
    } else if (activeTab === 'actuals') {
      const camps = collectCampaignActuals();
      const totP = camps.reduce((a, c) => a + c.planned, 0);
      const totA = camps.reduce((a, c) => a + c.actual, 0);
      const diff = totA - totP;
      h += `<div class="ins-grid">`
        + kpi('📐 Planned (selectie)', fC(totP))
        + kpi('💵 Werkelijk (selectie)', fC(totA))
        + kpi(diff > 0 ? '⚠ Meer besteed' : '✓ Bespaard', fC(Math.abs(diff)), diff > 0 ? 'neg' : 'pos')
        + `</div>`;
      h += section('📐 Planned vs. werkelijk — per campagne', campaignActualsTable(camps));
      h += section('🎯 Budget vs. werkelijk — per tactic', actualsTable(collectActuals()));
    }

    h += `</div>`; // ins-tabpane

    h += `<div class="ins-actions">`
      + `<button class="mbtn pri" id="insPDF">📄 Rapport-PDF</button>`
      + `<span class="ins-hint">Opent print-vriendelijk rapport in nieuw venster.</span>`
      + `</div>`;

    body.innerHTML = h;

    wireFilterEvents();

    document.querySelectorAll('#insBody .ins-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        render();
      });
    });

    const pdfBtn = document.getElementById('insPDF');
    if (pdfBtn) pdfBtn.addEventListener('click', generatePDF);
  }

  function wireFilterEvents() {
    const y = FS.state.year;
    const fromEl = document.getElementById('insFrom');
    const toEl = document.getElementById('insTo');
    const onPeriodChange = () => {
      if (fromEl && fromEl.value) filters.from = fromEl.value;
      if (toEl && toEl.value) filters.to = toEl.value;
      if (filters.from > filters.to) {
        const tmp = filters.from;
        filters.from = filters.to;
        filters.to = tmp;
      }
      render();
    };
    if (fromEl) fromEl.addEventListener('change', onPeriodChange);
    if (toEl) toEl.addEventListener('change', onPeriodChange);

    const setRange = (from, to) => { filters.from = from; filters.to = to; render(); };
    const reset = document.getElementById('insFiltReset');
    if (reset) reset.addEventListener('click', () => setRange(`${y}-01-01`, `${y}-12-31`));
    const q = (n) => {
      const startMonth = (n - 1) * 3;
      const from = `${y}-${String(startMonth + 1).padStart(2, '0')}-01`;
      const endMonth = startMonth + 3;
      const last = new Date(y, endMonth, 0).getDate();
      const to = `${y}-${String(endMonth).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
      setRange(from, to);
    };
    ['insPq1', 'insPq2', 'insPq3', 'insPq4'].forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => q(i + 1));
    });

    const all = document.getElementById('insChanAll');
    if (all) all.addEventListener('click', () => {
      filters.channels = new Set(FS.constants.CHANNELS.map((c) => c.id));
      render();
    });
    const none = document.getElementById('insChanNone');
    if (none) none.addEventListener('click', () => {
      filters.channels = new Set();
      render();
    });
    document.querySelectorAll('#insBody input[data-ch]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.ch;
        if (cb.checked) filters.channels.add(id); else filters.channels.delete(id);
        render();
      });
    });

    const fnAll = document.getElementById('insFnAll');
    if (fnAll) fnAll.addEventListener('click', () => {
      filters.funnel = new Set([...FS.constants.FUNNEL_STAGES.map((s) => s.id), '']);
      render();
    });
    const fnNone = document.getElementById('insFnNone');
    if (fnNone) fnNone.addEventListener('click', () => {
      filters.funnel = new Set();
      render();
    });
    document.querySelectorAll('#insBody .ins-funnel').forEach((lbl) => {
      lbl.addEventListener('click', (e) => {
        e.preventDefault();
        const cb = lbl.querySelector('input[data-fn]');
        if (!cb) return;
        const id = cb.dataset.fn;
        if (filters.funnel.has(id)) filters.funnel.delete(id); else filters.funnel.add(id);
        render();
      });
    });
  }

  /* =====================  PDF RAPPORT  ===================== */

  function generatePDF() {
    const s = FS.state;
    const grandTotal = FS.calc.grandTotal();
    const totalFee = FS.calc.totalFee();
    const totCreatie = FS.calc.totalCreatieFlights() + FS.calc.calcCreatie();
    const totTooling = FS.calc.totalToolingFlights() + FS.calc.calcTooling();
    const rest = s.jaarTotal - grandTotal - totCreatie - totTooling;

    const channelHtml = donut(aggregateChannels(), FS.constants.CHANNELS);
    const spendHtml = stackedBars(aggregateMonthlySpend());
    const splitHtml = splitBar(aggregateSectionSplit());
    const actuals = collectActuals();
    const actHtml = actualsTable(actuals);
    const campActuals = collectCampaignActuals();
    const hasFlightActuals = campActuals.some((c) => c.anyActual);
    const campActHtml = campaignActualsTable(campActuals);

    let campRows = '';
    s.campaigns.forEach((c) => {
      const cb = FS.calc.campaignBudget(c);
      campRows += `<tr class="r-camp"><td colspan="2"><strong>${esc(c.label)}</strong> <span style="color:#6B7280">(${c.sec === 'ao' ? 'Always-On' : 'Campagne'})</span></td>`
        + `<td class="num"><strong>${esc(fC(cb))}</strong></td>`
        + `<td colspan="2"></td></tr>`;
      c.segs.forEach((f) => {
        campRows += `<tr><td style="padding-left:18px">✈️ ${esc(f.n || 'Flight')}</td>`
          + `<td>W${FS.utils.dateToWeek(f.sd)}–W${FS.utils.dateToWeek(f.ed)}</td>`
          + `<td class="num">${esc(fC(FS.calc.flightBudget(f)))}</td>`
          + `<td class="num">${f.cb ? esc(fC(f.cb)) : '–'}</td>`
          + `<td class="num">${f.tc ? esc(fC(f.tc)) : '–'}</td></tr>`;
      });
    });

    const css = `
      body{font-family:'Inter',Arial,sans-serif;color:#0C1726;padding:24px;background:#fff}
      h1{color:#000050;font-size:22px;margin:0 0 4px}
      h2{color:#000050;font-size:14px;margin:24px 0 10px;border-bottom:2px solid #0026C5;padding-bottom:4px}
      .meta{color:#6B7280;font-size:11px;margin-bottom:18px}
      .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0}
      .kpi{border:1px solid #E5E7EB;border-left:3px solid #0026C5;border-radius:6px;padding:8px 10px}
      .kpi .l{font-size:8px;color:#6B7280;text-transform:uppercase;letter-spacing:.3px;font-weight:600}
      .kpi .v{font-size:14px;font-weight:800;color:#000050;margin-top:2px}
      .kpi.pos{border-left-color:#10B981}.kpi.neg{border-left-color:#EF4444}
      table{border-collapse:collapse;width:100%;font-size:10px;margin-top:6px}
      th,td{border:1px solid #E5E7EB;padding:5px 7px;text-align:left}
      th{background:#000050;color:#fff;font-weight:700;font-size:9px}
      td.num{text-align:right}
      tfoot td{background:#F0F4FF;font-weight:700}
      .r-camp td{background:#F8FAFF}
      .ins-donut-wrap{display:flex;gap:18px;align-items:center;flex-wrap:wrap}
      .ins-legend{display:flex;flex-direction:column;gap:3px;font-size:10px;min-width:240px}
      .ins-legend-row{flex-direction:row;flex-wrap:wrap}
      .ins-leg-row{display:flex;align-items:center;gap:6px}
      .ins-leg-sw{width:10px;height:10px;border-radius:2px;display:inline-block}
      .ins-leg-nm{flex:1;color:#1E293B}
      .ins-leg-v{font-weight:700;color:#000050}
      .ins-leg-p{color:#6B7280;min-width:38px;text-align:right}
      .ins-split-bar{display:flex;width:100%;height:30px;border-radius:6px;overflow:hidden;border:1px solid #E5E7EB}
      .ins-split-seg{display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:11px}
      .ins-split-leg{display:flex;gap:16px;margin-top:6px;font-size:10px}
      .ins-empty{padding:18px;text-align:center;color:#94A3B8;font-style:italic;font-size:10px}
      .ins-var-pos{color:#059669;font-weight:700}.ins-var-neg{color:#DC2626;font-weight:700}
      .footer{margin-top:30px;text-align:right;font-size:9px;color:#94A3B8}
      @media print{.no-print{display:none}@page{size:A4;margin:12mm}}
    `;

    const now = new Date();
    const dateStr = now.toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' });

    const html = `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"><title>Flowchart Rapport — ${esc(s.client || 'Onbekend')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>${css}</style></head><body>
<div class="no-print" style="margin-bottom:20px;text-align:right">
  <button onclick="window.print()" style="padding:8px 18px;background:#0026C5;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-family:inherit">🖨 Print / PDF opslaan</button>
</div>
<h1>Flowchart Rapport ${esc(s.year)}</h1>
<div class="meta">${esc(s.client || 'Geen klant ingevuld')} · gegenereerd op ${dateStr}</div>

<h2>Samenvatting</h2>
<div class="kpis">
  <div class="kpi"><div class="l">Jaarbudget</div><div class="v">${esc(fC(s.jaarTotal))}</div></div>
  <div class="kpi"><div class="l">Media (campagnes)</div><div class="v">${esc(fC(grandTotal))}</div></div>
  <div class="kpi"><div class="l">Handling Fee</div><div class="v">${esc(fC(totalFee))}</div></div>
  <div class="kpi"><div class="l">Creatie</div><div class="v">${esc(fC(totCreatie))}</div></div>
  <div class="kpi"><div class="l">Tooling</div><div class="v">${esc(fC(totTooling))}</div></div>
  <div class="kpi ${rest >= 0 ? 'pos' : 'neg'}"><div class="l">${rest >= 0 ? 'Restbudget' : 'Overschrijding'}</div><div class="v">${esc(fC(Math.abs(rest)))}</div></div>
</div>

<h2>📊 Kanaalverdeling</h2>
${channelHtml}

<h2>📈 Spend curve per maand</h2>
${spendHtml}

<h2>🔁 Always-On vs. losse campagnes</h2>
${splitHtml}

<h2>📋 Campagne-overzicht</h2>
<table><thead><tr><th>Item</th><th>Periode</th><th class="num">Budget</th><th class="num">Creatie</th><th class="num">Tooling</th></tr></thead><tbody>${campRows}</tbody></table>

${hasFlightActuals ? `<h2>📐 Planned vs. werkelijk — per campagne</h2>${campActHtml}` : ''}

${actuals.length ? `<h2>🎯 Budget vs. werkelijk — per tactic</h2>${actHtml}` : ''}

<div class="footer">Flowchart Studio · ${dateStr}</div>
</body></html>`;

    const win = window.open('', '_blank');
    if (!win) {
      if (FS.toast) FS.toast.show('Pop-up geblokkeerd. Sta pop-ups toe om het rapport te openen.', 'warn', 5000);
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    if (FS.toast) FS.toast.show('Rapport geopend in nieuw tabblad', 'success');
  }

  FS.insights = { open, close, toggle, render, generatePDF };
})(window.FS = window.FS || {});
