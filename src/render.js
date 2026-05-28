/* Flowchart Studio — render
 * Bouwt Gantt-grid, summary-bar en legend op uit state.
 * Alle gebruikersinvoer wordt geëscaped voor het in innerHTML wordt gezet.
 */
(function (FS) {
  'use strict';

  const { escapeHtml: esc, escapeAttr: a, formatCurrency: fC, formatK: fK,
    pickColor, autoTextColor, statusColor, dateToWeek, weekToDate, weekToMonth, getCurrentWeek } = FS.utils;

  const MONTH_LABELS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

  // Funnel-filter voor het Gantt-overzicht. null = alles tonen; anders Set met
  // actieve fase-id's (incl. '' voor "geen fase ingevuld").
  let funnelFilter = null;
  function isFunnelVisible(stageId) {
    if (!funnelFilter) return true;
    return funnelFilter.has(stageId || '');
  }
  function setFunnelStage(stageId, on) {
    if (!funnelFilter) {
      funnelFilter = new Set([...FS.constants.FUNNEL_STAGES.map((s) => s.id), '']);
    }
    if (on) funnelFilter.add(stageId); else funnelFilter.delete(stageId);
    // Als alles weer aan staat: terug naar null (= ongekleurde "alle" status)
    const allIds = [...FS.constants.FUNNEL_STAGES.map((s) => s.id), ''];
    if (allIds.every((id) => funnelFilter.has(id))) funnelFilter = null;
    render();
  }
  function setFunnelAll(on) {
    funnelFilter = on ? null : new Set();
    render();
  }
  function funnelStageInfo(stageId) {
    return FS.constants.FUNNEL_STAGES.find((s) => s.id === stageId);
  }

  /** Eén bar in het Gantt-grid. */
  function barHTML(startWeek, endWeek, color, textColor, name, budget, status, dataAttrs, flags) {
    const f = flags || {};
    let col = color;
    let tc = textColor;
    let extraCls = '';
    if (f.actualized) {
      col = '#94A3B8';
      tc = '#FFFFFF';
      extraCls = ' g-bar-actual';
    }
    const stc = statusColor(status);
    return (
      `<div class="g-bar${extraCls}" style="grid-column:${startWeek}/${endWeek + 1};background:${a(col)};color:${a(tc)}"${dataAttrs}>`
      + (name ? `<span class="bn">${esc(name)}</span>` : '')
      + (budget ? `<span class="bb">${esc(fK(budget))}</span>` : '')
      + (stc ? `<div class="g-st" style="background:${a(stc)}"></div>` : '')
      + (f.needAct ? `<span class="g-bar-warn" title="Wacht op actualisatie">!</span>` : '')
      + '</div>'
    );
  }

  function renderHeader() {
    const year = FS.state.year;
    const nowWeek = getCurrentWeek();
    let q = `<div class="g-head-q"><div class="gh-label">Campagne</div><div class="gh-budget"></div><div class="gh-weeks">`
      + `<div class="gh-q" style="grid-column:1/14">Q1 ${esc(year)}</div>`
      + `<div class="gh-q gh-qd" style="grid-column:14/27">Q2</div>`
      + `<div class="gh-q gh-qd" style="grid-column:27/40">Q3</div>`
      + `<div class="gh-q gh-qd" style="grid-column:40/53">Q4</div></div></div>`;

    // Maandband: groepeer weken per maand
    let m = `<div class="g-head-m"><div class="gh-label"></div><div class="gh-budget"></div><div class="gh-weeks">`;
    let mStart = 1;
    let curMonth = weekToMonth(1);
    for (let i = 2; i <= 53; i++) {
      const nextMonth = i <= 52 ? weekToMonth(i) : -1;
      if (i > 52 || nextMonth !== curMonth) {
        m += `<div class="gh-m" style="grid-column:${mStart}/${i}">${MONTH_LABELS[curMonth]}</div>`;
        mStart = i;
        curMonth = nextMonth;
      }
    }
    m += `</div></div>`;

    let w = `<div class="g-head-w"><div class="gh-label"></div><div class="gh-budget">Totaal</div><div class="gh-weeks">`;
    for (let i = 1; i <= 52; i++) {
      let cls = '';
      if (i === 14 || i === 27 || i === 40) cls = ' gh-qd';
      if (nowWeek && i === nowWeek) cls += ' gh-nw';
      const monStr = weekToDate(i);
      const monDay = parseInt(monStr.slice(8), 10);
      const sunD = new Date(`${monStr}T12:00:00`);
      sunD.setDate(sunD.getDate() + 6);
      const sunDay = sunD.getDate();
      const title = nowWeek && i === nowWeek
        ? ` title="Huidige week (${monStr} t/m ${sunD.toISOString().substring(0, 10)})"`
        : ` title="Week ${i}: ${monStr} t/m ${sunD.toISOString().substring(0, 10)}"`;
      w += `<div class="${cls.trim()}"${title}>`
        + `<span class="ghw-wk">${i}</span>`
        + `<span class="ghw-d">${monDay}</span>`
        + `<span class="ghw-d">${sunDay}</span>`
        + `</div>`;
    }
    return `${q}${m}${w}</div></div>`;
  }

  function renderCampRow(camp) {
    const isExp = !!FS.state.expanded[camp.id];
    let bars = '';
    if (!isExp) {
      camp.segs.forEach((f, fi) => {
        const sw = dateToWeek(f.sd);
        const ew = dateToWeek(f.ed);
        const col = pickColor(f, camp);
        const tc = autoTextColor(col);
        const b = FS.calc.flightBudget(f);
        const span = ew - sw + 1;
        bars += barHTML(sw, ew, col, tc, span >= 4 ? f.n : '', b, f.st || 'concept',
          ` data-ci="${a(camp.id)}" data-fi="${fi}"`,
          { actualized: !!f.actualized, needAct: FS.calc.flightNeedsActuals(f) });
      });
    }
    const selected = camp.id === FS.state.selectedCamp;
    const lockIc = camp.locked ? `<span style="margin-left:4px;font-size:10px" title="Vergrendeld">🔒</span>` : '';
    const fst = funnelStageInfo(camp.funnel);
    const fnBadge = fst
      ? `<span class="g-funnel-bd" style="background:${a(fst.color)}" title="${a(fst.name)}">${a(fst.icon)}</span>`
      : '';
    return `<div class="g-row g-camp${isExp ? ' g-exp' : ''}${selected ? ' g-sel' : ''}" data-ci="${a(camp.id)}">`
      + `<div class="g-label">`
      + `<span class="g-toggle" data-ci="${a(camp.id)}">${isExp ? '▼' : '▶'}</span>`
      + `<span class="g-dot" style="background:${a(camp.col)}"></span>`
      + `<span class="g-name">${esc(camp.label)}</span>`
      + fnBadge
      + lockIc
      + `<span class="g-count">${camp.segs.length}</span>`
      + (camp.locked ? '' : `<button class="g-addf" data-ci="${a(camp.id)}" title="Flight toevoegen">+</button>`)
      + `</div>`
      + `<div class="g-budget">${esc(fC(FS.calc.campaignBudget(camp)))}</div>`
      + `<div class="g-bars">${bars}</div></div>`;
  }

  function renderFlightRow(camp, flight, fi) {
    const key = `${camp.id}_${fi}`;
    const isExp = !!FS.state.expandedFlight[key];
    const col = pickColor(flight, camp);
    const tc = autoTextColor(col);
    const sw = dateToWeek(flight.sd);
    const ew = dateToWeek(flight.ed);
    const needAct = FS.calc.flightNeedsActuals(flight);
    let bars = '';
    if (!isExp) {
      // Toon altijd één flight-bar; tactics worden pas zichtbaar als de flight
      // wordt opengeklapt. Zo opent een klik op deze bar de flight-modal.
      bars += barHTML(sw, ew, col, tc, flight.n, FS.calc.flightBudget(flight),
        flight.st || 'concept', ` data-ci="${a(camp.id)}" data-fi="${fi}"`,
        { actualized: !!flight.actualized, needAct });
    }
    const stc = statusColor(flight.st);
    const hasTac = !!(flight.tac && flight.tac.length);
    const fOk = flight.actualized ? `<span style="margin-left:4px;color:#059669;font-weight:700" title="Geactualiseerd">✓</span>` : '';
    return `<div class="g-row g-sub${isExp ? ' g-exp' : ''}" data-ci="${a(camp.id)}" data-fi="${fi}">`
      + `<div class="g-label">`
      + (hasTac
        ? `<span class="g-toggle" data-ci="${a(camp.id)}" data-fi="${fi}">${isExp ? '▼' : '▶'}</span>`
        : `<span style="width:14px"></span>`)
      + `<span class="g-fdot" style="background:${a(col)}"></span>`
      + `<span class="g-name">${esc(flight.n || `Flight ${fi + 1}`)}</span>`
      + fOk
      + (stc ? `<span class="g-sdot" style="background:${a(stc)}"></span>` : '')
      + `</div><div class="g-budget">${esc(fC(FS.calc.flightBudget(flight)))}</div>`
      + `<div class="g-bars">${bars}</div></div>`;
  }

  function renderTacRow(camp, flight, fi, tactic, ti) {
    const col = pickColor(tactic, { col: pickColor(flight, camp) });
    const tc = autoTextColor(col);
    const sw = dateToWeek(tactic.sd);
    const ew = dateToWeek(tactic.ed);
    return `<div class="g-row g-tac" data-ci="${a(camp.id)}" data-fi="${fi}" data-ti="${ti}">`
      + `<div class="g-label">`
      + `<span class="g-fdot" style="background:${a(col)}"></span>`
      + `<span class="g-name">${esc(tactic.n || `Tactic ${ti + 1}`)}</span></div>`
      + `<div class="g-budget">${esc(fC(tactic.b))}</div>`
      + `<div class="g-bars">${barHTML(sw, ew, col, tc, tactic.n, tactic.b, flight.st || 'concept', ` data-ci="${a(camp.id)}" data-fi="${fi}" data-ti="${ti}"`)}</div>`
      + `</div>`;
  }

  function renderFooter() {
    const c = FS.calc;
    const grand = c.grandTotal();
    const totCreatie = c.totalCreatieFlights() + c.calcCreatie();
    const totTooling = c.totalToolingFlights() + c.calcTooling();
    const rest = FS.state.jaarTotal - grand - totCreatie - totTooling;
    return `<div class="g-row g-foot g-tot"><div class="g-label">Totaal</div><div class="g-budget">${esc(fC(grand))}</div><div class="g-bars"></div></div>`
      + `<div class="g-row g-foot g-crea"><div class="g-label">🎨 Creatie</div><div class="g-budget">${esc(fC(totCreatie))}</div><div class="g-bars"></div></div>`
      + `<div class="g-row g-foot g-tool"><div class="g-label">🔧 Tooling</div><div class="g-budget">${esc(fC(totTooling))}</div><div class="g-bars"></div></div>`
      + `<div class="g-row g-foot g-jaar"><div class="g-label">Jaarbudget</div><div class="g-budget">${esc(fC(FS.state.jaarTotal))}</div><div class="g-bars"></div></div>`
      + `<div class="g-row g-foot g-rest${rest < 0 ? ' neg' : ''}"><div class="g-label">Resterend</div><div class="g-budget">${esc(fC(rest))}</div><div class="g-bars"></div></div>`;
  }

  function renderGantt() {
    let html = renderHeader();
    const camps = FS.state.campaigns;
    if (!camps.length) {
      html += `<div class="g-empty">`
        + `<div class="g-empty-ico">📋</div>`
        + `<div class="g-empty-h">Nog geen campagnes</div>`
        + `<div class="g-empty-sub">Begin met een nieuwe campagne, laad een eerder opgeslagen JSON of gebruik een template.</div>`
        + `<div class="g-empty-act">`
        + `<button class="mbtn pri" id="empAdd">+ Nieuwe campagne</button>`
        + `<button class="mbtn" id="empLoad">📂 Laad JSON</button>`
        + `<button class="mbtn" id="empTpl">📋 Gebruik template</button>`
        + `</div>`
        + `<div class="g-empty-kb"><kbd>Ctrl</kbd>+<kbd>N</kbd> nieuwe campagne · <kbd>Ctrl</kbd>+<kbd>S</kbd> opslaan · <kbd>?</kbd> sneltoetsen</div>`
        + `</div>`;
    } else {
      // Groepeer altijd: eerst losse campagnes, daarna Always-On. Zo voorkomen
      // we dat een willekeurig gesorteerd JSON-bestand meerdere sectiekoppen
      // produceert tussen de campagnes door.
      const visible = camps.filter((c) => isFunnelVisible(c.funnel || ''));
      const losseList = visible.filter((c) => (c.sec || 'losse') !== 'ao');
      const aoList = visible.filter((c) => c.sec === 'ao');
      const ordered = losseList.concat(aoList);
      if (!ordered.length) {
        html += `<div class="g-empty" style="padding:24px"><div class="g-empty-sub">Geen campagnes voldoen aan het funnel-filter. Pas het filter aan via de legenda onderaan.</div></div>`;
      }
      let lastSec = '';
      ordered.forEach((c) => {
        const secKey = c.sec === 'ao' ? 'ao' : 'losse';
        if (secKey !== lastSec) {
          lastSec = secKey;
          html += `<div class="g-sec">${secKey === 'ao' ? 'ALWAYS-ON' : 'CAMPAGNES'}</div>`;
        }
        html += renderCampRow(c);
        if (FS.state.expanded[c.id]) {
          c.segs.forEach((f, fi) => {
            html += renderFlightRow(c, f, fi);
            if (FS.state.expandedFlight[`${c.id}_${fi}`] && f.tac) {
              f.tac.forEach((t, ti) => { html += renderTacRow(c, f, fi, t, ti); });
            }
          });
        }
      });
      html += renderFooter();
    }
    document.getElementById('gantt').innerHTML = html;
    requestAnimationFrame(positionNowLine);
  }

  /** Plaats een verticale "vandaag"-lijn over alle gantt-rijen. */
  function positionNowLine() {
    const gantt = document.getElementById('gantt');
    if (!gantt) return;
    const existing = gantt.querySelector('.g-now-line');
    if (existing) existing.remove();
    const nw = getCurrentWeek();
    if (!nw) return;
    const headEl = gantt.querySelector('.g-head-w');
    const weeksEl = gantt.querySelector('.g-head-w .gh-weeks');
    if (!headEl || !weeksEl) return;
    const headRect = headEl.getBoundingClientRect();
    const weeksRect = weeksEl.getBoundingClientRect();
    const offsetLeft = weeksRect.left - headRect.left;
    const colWidth = weeksRect.width / 52;
    const leftPx = offsetLeft + (nw - 0.5) * colWidth;
    const line = document.createElement('div');
    line.className = 'g-now-line';
    line.style.left = `${leftPx}px`;
    line.title = `Huidige week — W${nw}`;
    gantt.appendChild(line);
  }

  function renderSummary() {
    const c = FS.calc;
    const total = c.grandTotal();
    const fee = c.totalFee();
    const net = total - fee;
    const totCreatie = c.totalCreatieFlights() + c.calcCreatie();
    const totTooling = c.totalToolingFlights() + c.calcTooling();
    const rest = FS.state.jaarTotal - total - totCreatie - totTooling;
    const bj = FS.state.budgetJournal;
    const subtitle = bj.mods.length
      ? `Basis ${fC(bj.base)} + ${bj.mods.length} wijz.`
      : 'Klik voor journal';
    document.getElementById('summaryBar').innerHTML =
      `<div class="scard s-click" id="scJ"><div class="sl">Jaarbudget</div><div class="sv">${esc(fC(FS.state.jaarTotal))}</div><div class="sd">${esc(subtitle)}</div></div>`
      + `<div class="scard s-media"><div class="sl">Netto Media</div><div class="sv">${esc(fC(net))}</div></div>`
      + `<div class="scard s-fee"><div class="sl">Handling Fee</div><div class="sv">${esc(fC(fee))}</div></div>`
      + `<div class="scard s-crea s-click" id="scC"><div class="sl">Creatie</div><div class="sv">${esc(fC(totCreatie))}</div></div>`
      + `<div class="scard s-tool s-click" id="scT"><div class="sl">Tooling</div><div class="sv">${esc(fC(totTooling))}</div></div>`
      + `<div class="scard s-rest"><div class="sl">Resterend</div><div class="sv" style="color:${rest < 0 ? '#DC2626' : '#059669'}">${esc(fC(rest))}</div></div>`
      + `<div class="scard s-add" id="addCampBtn">+ Campagne</div>`;
  }

  function renderLegend() {
    // Funnel-filter pillen
    let html = `<span class="leg-lbl">🪜 FUNNEL:</span>`;
    const all = !funnelFilter;
    html += `<button class="g-funnel-pill${all ? ' on' : ''}" data-fs="__all" title="Alle fases tonen">Alle</button>`;
    FS.constants.FUNNEL_STAGES.forEach((st) => {
      const on = isFunnelVisible(st.id);
      html += `<button class="g-funnel-pill${on ? ' on' : ''}" data-fs="${a(st.id)}" style="${on ? `background:${a(st.color)};color:#fff;border-color:${a(st.color)}` : ''}" title="${a(st.name)}">${a(st.icon)} ${esc(st.name)}</button>`;
    });
    const noneOn = isFunnelVisible('');
    html += `<button class="g-funnel-pill${noneOn ? ' on' : ''}" data-fs="" title="Campagnes zonder funnelfase">— Geen —</button>`;

    html += `<span class="leg-lbl" style="margin-left:14px">CAMPAGNES:</span>`;
    FS.state.campaigns.forEach((c) => {
      html += `<div class="leg-item"><div class="leg-dot" style="background:${a(c.col)}"></div>${esc(c.label)}</div>`;
    });
    html += `<span class="leg-lbl" style="margin-left:14px">STATUS:</span>`;
    FS.constants.STATUSES.forEach((s) => {
      html += `<div class="leg-item"><div class="leg-st" style="background:${a(s.color || '#0026C5')}">`
        + `<div class="lst" style="background:${a(s.color || 'transparent')}"></div></div>${esc(s.name)}</div>`;
    });
    document.getElementById('legend').innerHTML = html;
  }

  function render() {
    renderGantt();
    renderSummary();
    renderLegend();
    FS.io.autoSave();
  }

  /** Paletmarkering — kleurkiezer wordt pas uitgeklapt na klik om visueel
   *  rustiger te zijn. Bevat groepen per bureau (WPP/EssenceMediacom/etc.). */
  function palHTML(selected) {
    const cur = selected || '#0026C5';
    let groups = '';
    FS.constants.PALETTE_GROUPS.forEach((g) => {
      let sws = '';
      g.colors.forEach((c) => {
        sws += `<div class="pal-sw${c === selected ? ' act' : ''}" style="background:${a(c)}" data-col="${a(c)}" title="${a(c)}"></div>`;
      });
      groups += `<div class="pal-group"><div class="pal-row">${sws}</div></div>`;
    });
    return ''
      + '<div class="pal-pop" data-open="0">'
      +   `<button type="button" class="pal-trigger" data-act="toggle-pal">`
      +     `<span class="pal-current" style="background:${a(cur)}"></span>`
      +     `<span class="pal-label">${selected ? 'Kleur wijzigen' : 'Kies kleur'}</span>`
      +     `<span class="pal-chev">\u25BE</span>`
      +   `</button>`
      +   `<div class="pal-panel">${groups}</div>`
      + '</div>';
  }

  FS.render = { render, renderGantt, renderSummary, renderLegend, barHTML, palHTML, positionNowLine,
    setFunnelStage, setFunnelAll, isFunnelVisible, funnelStageInfo };
})(window.FS = window.FS || {});
