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
    const totals = {};
    FS.state.campaigns.forEach((c) =>
      c.segs.forEach((f) =>
        (f.tac || []).forEach((t) => {
          for (const k in (t.ch || {})) {
            totals[k] = (totals[k] || 0) + (t.ch[k] || 0);
          }
        }),
      ),
    );
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
    const year = FS.state.year;
    const media = new Array(12).fill(0);
    const creatie = new Array(12).fill(0);
    const tooling = new Array(12).fill(0);
    FS.state.campaigns.forEach((c) => {
      c.segs.forEach((f) => {
        if (f.tac && f.tac.length) {
          f.tac.forEach((t) => spreadOverMonths(t.sd, t.ed, t.b || 0, year, media));
        } else {
          spreadOverMonths(f.sd, f.ed, FS.calc.flightBudget(f), year, media);
        }
        if (f.cb) spreadOverMonths(f.sd, f.ed, f.cb, year, creatie);
        if (f.tc) spreadOverMonths(f.sd, f.ed, f.tc, year, tooling);
      });
    });
    return { media, creatie, tooling };
  }

  function aggregateSectionSplit() {
    let ao = 0;
    let losse = 0;
    FS.state.campaigns.forEach((c) => {
      const b = FS.calc.campaignBudget(c);
      if (c.sec === 'ao') ao += b; else losse += b;
    });
    return { ao, losse };
  }

  function collectActuals() {
    const rows = [];
    FS.state.campaigns.forEach((c) =>
      c.segs.forEach((f) =>
        (f.tac || []).forEach((t) => {
          if (t.actual && t.actual > 0) {
            rows.push({
              camp: c.label,
              flight: f.n || '',
              tactic: t.n || '',
              planned: t.b || 0,
              actual: t.actual,
              variance: t.actual - (t.b || 0),
            });
          }
        }),
      ),
    );
    return rows;
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

    const grandTotal = FS.calc.grandTotal();
    const totalFee = FS.calc.totalFee();
    const totCreatie = FS.calc.totalCreatieFlights() + FS.calc.calcCreatie();
    const totTooling = FS.calc.totalToolingFlights() + FS.calc.calcTooling();
    const jaar = s.jaarTotal;
    const rest = jaar - grandTotal - totCreatie - totTooling;
    const numCamps = s.campaigns.length;
    const numFlights = s.campaigns.reduce((a, c) => a + c.segs.length, 0);
    const numTactics = s.campaigns.reduce((a, c) =>
      a + c.segs.reduce((b, f) => b + (f.tac ? f.tac.length : 0), 0), 0);

    let h = '';
    h += `<div class="ins-grid">`
      + kpi('🎯 Jaarbudget', fC(jaar))
      + kpi('📺 Media (campagnes)', fC(grandTotal))
      + kpi('🎨 Creatie', fC(totCreatie))
      + kpi('🔧 Tooling', fC(totTooling))
      + kpi('💰 Fee totaal', fC(totalFee))
      + kpi(rest >= 0 ? '✓ Restbudget' : '⚠ Overschrijding', fC(Math.abs(rest)), rest >= 0 ? 'pos' : 'neg')
      + kpi('📋 Campagnes', String(numCamps))
      + kpi('✈️ Flights', String(numFlights))
      + kpi('🎯 Tactics', String(numTactics))
      + `</div>`;

    h += section('📊 Kanaalverdeling', donut(aggregateChannels(), FS.constants.CHANNELS));
    h += section(`📈 Spend curve (per maand · ${s.year})`, stackedBars(aggregateMonthlySpend()));
    h += section('🔁 Always-On vs. losse campagnes', splitBar(aggregateSectionSplit()));
    h += section('📐 Budget vs. werkelijk (actuals)', actualsTable(collectActuals()));

    h += `<div class="ins-actions">`
      + `<button class="mbtn pri" id="insPDF">📄 Rapport-PDF</button>`
      + `<span class="ins-hint">Opent print-vriendelijk rapport in nieuw venster.</span>`
      + `</div>`;

    body.innerHTML = h;

    const pdfBtn = document.getElementById('insPDF');
    if (pdfBtn) pdfBtn.addEventListener('click', generatePDF);
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

${actuals.length ? `<h2>📐 Budget vs. werkelijk</h2>${actHtml}` : ''}

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
