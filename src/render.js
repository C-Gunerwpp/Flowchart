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
  function fnStages() { return FS.state.funnelStages || []; }
  function fnAllIds() { return [...fnStages().map((s) => s.id), '']; }
  /** Funnelstappen van een campagne (meervoud; met migratie-fallback op oud veld). */
  function campFunnels(c) {
    if (Array.isArray(c.funnels)) return c.funnels;
    return c.funnel ? [c.funnel] : [];
  }
  function isFunnelVisible(stageId) {
    if (!funnelFilter) return true;
    return funnelFilter.has(stageId || '');
  }
  /** Campagne zichtbaar zodra één van haar funnelstappen (of "geen") actief is. */
  function isCampFunnelVisible(c) {
    if (!funnelFilter) return true;
    const fs = campFunnels(c).filter((id) => funnelStageInfo(id));
    if (!fs.length) return funnelFilter.has('');
    return fs.some((id) => funnelFilter.has(id));
  }
  function setFunnelStage(stageId, on) {
    if (!funnelFilter) {
      funnelFilter = new Set(fnAllIds());
    }
    if (on) funnelFilter.add(stageId); else funnelFilter.delete(stageId);
    // Als alles weer aan staat: terug naar null (= ongekleurde "alle" status)
    if (fnAllIds().every((id) => funnelFilter.has(id))) funnelFilter = null;
    render();
  }
  function setFunnelAll(on) {
    funnelFilter = on ? null : new Set();
    render();
  }
  function funnelStageInfo(stageId) {
    return fnStages().find((s) => s.id === stageId);
  }

  /* ----- Merk-filter (sub-merken / geconsolideerde overzichten) -----
   * Campagnes kunnen een `brand` dragen (bv. Audi, Porsche, Skoda binnen de
   * Volkswagen-groep). Zodra er minstens één merk aanwezig is, schakelt de Gantt
   * naar merk-gegroepeerde weergave met een merkfilter-balk. null = alles tonen.
   */
  let brandFilter = null;
  /** Unieke merknamen in volgorde van eerste voorkomen. */
  function getBrands() {
    const seen = [];
    FS.state.campaigns.forEach((c) => {
      if (c.brand && !seen.includes(c.brand)) seen.push(c.brand);
    });
    return seen;
  }
  /** Vaste, onderscheidende kleur per merk (cyclisch over de palet-groepen). */
  function brandColor(index) {
    const groups = FS.constants.PALETTE_GROUPS;
    const g = groups[index % groups.length];
    return g.colors[0];
  }
  function brandKeys() {
    const keys = getBrands();
    if (FS.state.campaigns.some((c) => !c.brand)) keys.push('');
    return keys;
  }
  function isBrandVisible(brand) {
    if (!brandFilter) return true;
    return brandFilter.has(brand || '');
  }
  function setBrandVisible(brand, on) {
    const keys = brandKeys();
    if (!brandFilter) brandFilter = new Set(keys);
    if (on) brandFilter.add(brand || ''); else brandFilter.delete(brand || '');
    if (keys.every((k) => brandFilter.has(k))) brandFilter = null;
    render();
  }
  function setBrandAll(on) {
    brandFilter = on ? null : new Set();
    render();
  }

  /* ----- Status-filter (gantt): null = alles tonen ----- */
  let statusFilter = null;
  function statusIds() { return FS.constants.STATUSES.map((s) => s.id); }
  function isStatusVisible(id) { if (!statusFilter) return true; return statusFilter.has(id); }
  /** Campagne zichtbaar zodra één van haar flights een geselecteerde status heeft
   *  (campagne zonder flights blijft altijd zichtbaar). */
  function isCampStatusVisible(c) {
    if (!statusFilter) return true;
    const segs = c.segs || [];
    if (!segs.length) return true;
    return segs.some((f) => statusFilter.has(f.st || 'concept'));
  }
  function setStatusVisible(id, on) {
    const keys = statusIds();
    if (!statusFilter) statusFilter = new Set(keys);
    if (on) statusFilter.add(id); else statusFilter.delete(id);
    if (keys.every((k) => statusFilter.has(k))) statusFilter = null;
    render();
    renderFilterModal();
  }
  function setStatusAll(on) { statusFilter = on ? null : new Set(); render(); renderFilterModal(); }

  /* ----- Doelgroep-filter (gantt): null = alles tonen ----- */
  let audienceFilter = null;
  function audiencesOn() {
    return !!(FS.state.settings && FS.state.settings.audiences && FS.state.settings.audiences.enabled);
  }
  /** Alle voorkomende doelgroep-sleutels (incl. '' = geen doelgroep). */
  function ganttAudKeys() {
    const keys = new Set(['']);
    FS.state.campaigns.forEach((c) => (c.segs || []).forEach((f) => keys.add(FS.utils.audienceKey(f.audience))));
    return [...keys];
  }
  /** Unieke doelgroepen (excl. '') als {key,label}, gesorteerd op label. */
  function ganttDistinctAuds() {
    const map = new Map();
    FS.state.campaigns.forEach((c) => (c.segs || []).forEach((f) => {
      const k = FS.utils.audienceKey(f.audience);
      if (k && !map.has(k)) map.set(k, FS.utils.audienceLabel(f.audience));
    }));
    return [...map.entries()].map(([key, label]) => ({ key, label }))
      .sort((x, y) => x.label.localeCompare(y.label));
  }
  function isGAudVisible(key) { if (!audienceFilter) return true; return audienceFilter.has(key); }
  function isCampAudVisible(c) {
    if (!audienceFilter || !audiencesOn()) return true;
    const segs = c.segs || [];
    if (!segs.length) return true;
    return segs.some((f) => audienceFilter.has(FS.utils.audienceKey(f.audience)));
  }
  function setGAudVisible(key, on) {
    const keys = ganttAudKeys();
    if (!audienceFilter) audienceFilter = new Set(keys);
    if (on) audienceFilter.add(key); else audienceFilter.delete(key);
    if (keys.every((k) => audienceFilter.has(k))) audienceFilter = null;
    render();
    renderFilterModal();
  }
  function setGAudAll(on) { audienceFilter = on ? null : new Set(); render(); renderFilterModal(); }

  /** Aantal actieve gantt-filters (wijkt af van "alles"). Voor het filterknopje. */
  function activeFilterCount() {
    let n = 0;
    if (funnelFilter) n += 1;
    if (brandFilter) n += 1;
    if (statusFilter) n += 1;
    if (audienceFilter && audiencesOn()) n += 1;
    return n;
  }

  /** Eén bar in het Gantt-grid. */
  function barHTML(sd, ed, color, textColor, name, budget, status, dataAttrs, flags) {
    const rng = FS.viewport.dateColRange(sd, ed);
    if (!rng.visible) return '';
    const f = flags || {};
    let col = color;
    let tc = textColor;
    let extraCls = '';
    if (f.actualized) {
      col = '#94A3B8';
      tc = '#FFFFFF';
      extraCls = ' g-bar-actual';
    }
    extraCls += tc.toLowerCase() === '#fff' || tc.toLowerCase() === '#ffffff' ? ' g-txt-light' : ' g-txt-dark';
    if (f.selected) extraCls += ' g-sel';
    const stc = statusColor(status);
    const span = rng.eCol - rng.sCol;
    // Budget altijd tonen wanneer aanwezig (ook op smalle balkjes). Naam komt
    // erbij zodra er genoeg ruimte is; zonder budget valt de balk terug op de
    // naam. Zo is een balk vrijwel nooit leeg.
    const budgetTxt = budget ? fK(budget) : '';
    let inner;
    if (name && span >= 4) {
      inner = `<span class="bn">${esc(name)}</span>`
        + (budgetTxt ? `<span class="bb">${esc(budgetTxt)}</span>` : '');
    } else if (budgetTxt) {
      inner = `<span class="bb">${esc(budgetTxt)}</span>`;
    } else {
      inner = name ? `<span class="bn">${esc(name)}</span>` : '';
    }
    return (
      `<div class="g-bar${extraCls}" style="grid-column:${rng.sCol}/${rng.eCol};background:${a(col)};color:${a(tc)}"${dataAttrs}>`
      + inner
      + (stc ? `<div class="g-st" style="background:${a(stc)}"></div>` : '')
      + (f.needAct ? `<span class="g-bar-warn" title="Wacht op actualisatie">!</span>` : '')
      + '</div>'
    );
  }

  function renderHeader() {
    const vp = FS.viewport;
    const cols = vp.cols();
    const weeks = vp.weeks();
    const months = vp.months();
    const quarters = vp.quarters();
    // ISO-week+jaar van vandaag, los van FS.state.year (viewport kan cross-year zijn)
    const today = new Date();
    const _t = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const _dow = _t.getUTCDay() || 7;
    _t.setUTCDate(_t.getUTCDate() + 4 - _dow);
    const todayIsoY = _t.getUTCFullYear();
    const _ys = new Date(Date.UTC(todayIsoY, 0, 1));
    const todayIsoW = Math.ceil((((_t - _ys) / 86400000) + 1) / 7);

    // Kwartaalband
    let q = `<div class=\"g-head-q\"><div class=\"gh-label\">Campagne</div><div class=\"gh-budget\"></div><div class=\"gh-weeks\">`;
    quarters.forEach((qq, qi) => {
      const cls = qi === 0 ? 'gh-q' : 'gh-q gh-qd';
      q += `<div class=\"${cls}\" style=\"grid-column:${qq.colStart}/${qq.colEnd}\">${esc(qq.label)}</div>`;
    });
    q += `</div></div>`;

    // Maandband
    let m = `<div class="g-head-m"><div class="gh-label"></div><div class="gh-budget"></div><div class="gh-weeks">`;
    months.forEach((mm) => {
      if (!mm.colStart) return;
      m += `<div class="gh-m" style="grid-column:${mm.colStart}/${mm.colEnd}" title="${esc(MONTH_LABELS[mm.m])} ${mm.y}">${esc(MONTH_LABELS[mm.m])}</div>`;
    });
    m += `</div></div>`;

    // Weekband
    let w = `<div class="g-head-w"><div class="gh-label"></div><div class="gh-budget">Totaal</div><div class="gh-weeks">`;
    weeks.forEach((wk, i) => {
      // Marker eerste week van een nieuwe maand
      const firstOfMonth = i === 0 || weeks[i - 1].mIdx !== wk.mIdx;
      let cls = '';
      if (firstOfMonth && i > 0) cls = 'gh-qd';
      const isNow = wk.y === todayIsoY && wk.w === todayIsoW;
      if (isNow) cls += ' gh-nw';
      const title = isNow
        ? ` title="Huidige week (${wk.mondayStr} t/m ${wk.sundayStr})"`
        : ` title="Week ${wk.w} (${wk.y}): ${wk.mondayStr} t/m ${wk.sundayStr}"`;
      w += `<div class="${cls.trim()}"${title}>`
        + `<span class="ghw-wk">${wk.w}</span>`
        + `<span class="ghw-d">${wk.mondayDay}</span>`
        + `<span class="ghw-d">${wk.sundayDay}</span>`
        + `</div>`;
    });
    // Stel CSS-variabele voor kolomaantal in op het gantt-root
    const g = document.getElementById('gantt');
    if (g) g.style.setProperty('--g-cols', cols);
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
        const selectedFlight = camp.id === FS.state.selectedCamp
          && fi === FS.state.selectedFlight && FS.state.selectedTactic === null;
        bars += barHTML(f.sd, f.ed, col, tc, span >= 4 ? f.n : '', b, f.st || 'concept',
          ` data-ci="${a(camp.id)}" data-fi="${fi}"`,
          { actualized: !!f.actualized, needAct: FS.calc.flightNeedsActuals(f), selected: selectedFlight });
      });
    }
    const selected = camp.id === FS.state.selectedCamp && FS.state.selectedFlight === null;
    const lockIc = camp.locked ? `<span style="margin-left:4px;font-size:10px" title="Vergrendeld">🔒</span>` : '';
    const fnBadge = campFunnels(camp).map((id) => funnelStageInfo(id)).filter(Boolean).map((fst) =>
      `<span class="g-funnel-bd" style="background:${a(fst.color)}" title="${a(fst.name)}">${fst.icon ? a(fst.icon) : a((fst.name || '?').slice(0, 1).toUpperCase())}</span>`,
    ).join('');
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
    const selected = camp.id === FS.state.selectedCamp
      && fi === FS.state.selectedFlight && FS.state.selectedTactic === null;
    let bars = '';
    if (!isExp) {
      // Toon altijd één flight-bar; tactics worden pas zichtbaar als de flight
      // wordt opengeklapt. Klik selecteert de flight; dubbelklik opent details.
      bars += barHTML(flight.sd, flight.ed, col, tc, flight.n, FS.calc.flightBudget(flight),
        flight.st || 'concept', ` data-ci="${a(camp.id)}" data-fi="${fi}"`,
        { actualized: !!flight.actualized, needAct, selected });
    }
    const stc = statusColor(flight.st);
    const hasTac = !!(flight.tac && flight.tac.length);
    const fOk = flight.actualized ? `<span style="margin-left:4px;color:#059669;font-weight:700" title="Geactualiseerd">✓</span>` : '';
    return `<div class="g-row g-sub${isExp ? ' g-exp' : ''}${selected ? ' g-sel' : ''}" data-ci="${a(camp.id)}" data-fi="${fi}">`
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
    const selected = camp.id === FS.state.selectedCamp
      && fi === FS.state.selectedFlight && ti === FS.state.selectedTactic;
    return `<div class="g-row g-tac${selected ? ' g-sel' : ''}" data-ci="${a(camp.id)}" data-fi="${fi}" data-ti="${ti}">`
      + `<div class="g-label">`
      + `<span class="g-fdot" style="background:${a(col)}"></span>`
      + `<span class="g-name">${esc(tactic.n || `Tactic ${ti + 1}`)}</span></div>`
      + `<div class="g-budget">${esc(fC(tactic.b))}</div>`
        + `<div class="g-bars">${barHTML(tactic.sd, tactic.ed, col, tc, tactic.n, tactic.b, flight.st || 'concept', ` data-ci="${a(camp.id)}" data-fi="${fi}" data-ti="${ti}"`, { selected })}</div>`
      + `</div>`;
  }

  function renderFooter() {
    const c = FS.calc;
    const bd = c.budgetBreakdown();
    const hasActuals = FS.state.campaigns.some((cp) => (cp.segs || []).some((f) => f.actualized));
    const isExcl = bd.mode === 'excl';
    // Media, fee en CTC zijn actual-leidend en identiek aan de kaarten bovenin.
    const totCreatie = c.totalCreatieFlights() + c.calcCreatie();
    const totTooling = c.totalToolingFlights() + c.calcTooling();
    const totUren = c.totalUrenFlights() + c.calcUren();
    const rest = FS.state.jaarTotal - bd.ctc - totCreatie - totTooling - totUren;
    const feeArrow = isExcl ? '➕' : '➖';
    const feeBasis = isExcl ? 'bovenop budget' : 'in budget verwerkt';
    const feeStatus = bd.feeStatus === 'actual' ? 'actual'
      : bd.feeStatus === 'forecast' ? 'prognose: actual + planned' : 'planned prognose';
    const feeNote = bd.feeTiersEnabled ? `${feeBasis} · ${feeStatus}` : feeBasis;
    let html = `<div class="g-row g-foot g-media"><div class="g-label">Netto Media</div><div class="g-budget">${esc(fC(bd.media))}</div><div class="g-bars"></div></div>`
      + `<div class="g-row g-foot g-fee"><div class="g-label">${feeArrow} Handling fee <span class="g-foot-note">${feeNote}</span></div><div class="g-budget">${esc(fC(bd.fee))}</div><div class="g-bars"></div></div>`
      + `<div class="g-row g-foot g-tot"><div class="g-label">Totaal CTC</div><div class="g-budget">${esc(fC(bd.ctc))}</div><div class="g-bars"></div></div>`;
    if (bd.btwIncluded) {
      html += `<div class="g-row g-foot g-btw"><div class="g-label">Incl. ${esc(bd.btwPct)}% BTW</div><div class="g-budget">${esc(fC(bd.ctcInclBtw))}</div><div class="g-bars"></div></div>`;
    }
    html += `<div class="g-row g-foot g-crea"><div class="g-label">🎨 Creatie</div><div class="g-budget">${esc(fC(totCreatie))}</div><div class="g-bars"></div></div>`
      + `<div class="g-row g-foot g-tool"><div class="g-label">🔧 Tooling</div><div class="g-budget">${esc(fC(totTooling))}</div><div class="g-bars"></div></div>`
      + `<div class="g-row g-foot g-uren"><div class="g-label">⏱️ Uren</div><div class="g-budget">${esc(fC(totUren))}</div><div class="g-bars"></div></div>`
      + `<div class="g-row g-foot g-jaar"><div class="g-label">Jaarbudget</div><div class="g-budget">${esc(fC(FS.state.jaarTotal))}</div><div class="g-bars"></div></div>`
      + `<div class="g-row g-foot g-rest${rest < 0 ? ' neg' : ''}"><div class="g-label">Resterend${hasActuals ? ' (actual)' : ''}</div><div class="g-budget">${esc(fC(rest))}</div><div class="g-bars"></div></div>`;
    return html;
  }

  /** Eén campagnerij plus (indien uitgeklapt) de bijbehorende flight- en
   *  tactic-rijen. Gedeeld door zowel de standaard- als de merk-weergave. */
  function renderCampWithChildren(c) {
    let out = renderCampRow(c);
    if (FS.state.expanded[c.id]) {
      c.segs.forEach((f, fi) => {
        out += renderFlightRow(c, f, fi);
        if (FS.state.expandedFlight[`${c.id}_${fi}`] && f.tac) {
          f.tac.forEach((t, ti) => { out += renderTacRow(c, f, fi, t, ti); });
        }
      });
    }
    return out;
  }

  function renderGantt() {
    let html = renderHeader();
    const camps = FS.state.campaigns;
    if (!camps.length) {
      html += `<div class="g-empty">`
        + `<div class="g-empty-ico">📋</div>`
        + `<div class="g-empty-h">Nog geen campagnes</div>`
        + `<div class="g-empty-sub">Begin met een nieuwe campagne of laad een eerder opgeslagen JSON.</div>`
        + `<div class="g-empty-act">`
        + `<button class="g-empty-cta" id="empAdd">+ Nieuwe campagne</button>`
        + `<button class="mbtn" id="empLoad">📂 Laad JSON</button>`
        + `</div>`
        + `<div class="g-empty-kb"><kbd>Ctrl</kbd>+<kbd>N</kbd> nieuwe campagne · <kbd>Ctrl</kbd>+<kbd>S</kbd> opslaan · <kbd>?</kbd> sneltoetsen</div>`
        + `</div>`;
    } else {
      // Groepeer altijd: eerst losse campagnes, daarna Always-On. Zo voorkomen
      // we dat een willekeurig gesorteerd JSON-bestand meerdere sectiekoppen
      // produceert tussen de campagnes door.
      const visible = camps.filter((c) => isCampFunnelVisible(c) && isCampStatusVisible(c) && isCampAudVisible(c));
      const brands = getBrands();
      if (brands.length) {
        // ---- Merk-modus: groepeer campagnes per (sub-)merk ----
        const brandVisible = visible.filter((c) => isBrandVisible(c.brand || ''));
        if (!brandVisible.length) {
          html += `<div class="g-empty" style="padding:24px"><div class="g-empty-sub">Geen campagnes voldoen aan de huidige filters. Pas het merk- of funnelfilter aan.</div></div>`;
        }
        const groups = brands.slice();
        if (camps.some((c) => !c.brand)) groups.push('');
        groups.forEach((brand, bi) => {
          const list = brandVisible.filter((c) => (c.brand || '') === brand);
          if (!list.length) return;
          const ordered = list.filter((c) => (c.sec || 'losse') !== 'ao')
            .concat(list.filter((c) => c.sec === 'ao'));
          const col = brandColor(bi);
          html += `<div class="g-sec g-sec-brand"><span class="g-sec-dot" style="background:${a(col)}"></span>${esc(brand || 'Overig (geen merk)')}<span class="g-sec-cnt">${ordered.length}</span></div>`;
          let subtotal = 0;
          ordered.forEach((c) => {
            html += renderCampWithChildren(c);
            subtotal += FS.calc.campaignBudget(c);
          });
          html += `<div class="g-row g-foot g-brandtot"><div class="g-label">Subtotaal ${esc(brand || 'Overig')}</div><div class="g-budget">${esc(fC(subtotal))}</div><div class="g-bars"></div></div>`;
        });
        html += renderFooter();
      } else {
        const losseList = visible.filter((c) => (c.sec || 'losse') !== 'ao');
        const aoList = visible.filter((c) => c.sec === 'ao');
        const ordered = losseList.concat(aoList);
        if (!ordered.length) {
          html += `<div class="g-empty" style="padding:24px"><div class="g-empty-sub">Geen campagnes voldoen aan de huidige filters. Pas ze aan via het filterknopje in de balk bovenaan.</div></div>`;
        }
        let lastSec = '';
        ordered.forEach((c) => {
          const secKey = c.sec === 'ao' ? 'ao' : 'losse';
          if (secKey !== lastSec) {
            lastSec = secKey;
            html += `<div class="g-sec">${secKey === 'ao' ? 'ALWAYS-ON' : 'CAMPAGNES'}</div>`;
          }
          html += renderCampWithChildren(c);
        });
        html += renderFooter();
      }
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
    const nowFrac = FS.viewport && FS.viewport.nowCol ? FS.viewport.nowCol() : null;
    if (nowFrac == null) return;
    const cols = FS.viewport.cols();
    const headEl = gantt.querySelector('.g-head-w');
    const weeksEl = gantt.querySelector('.g-head-w .gh-weeks');
    if (!headEl || !weeksEl || cols <= 0) return;
    const headRect = headEl.getBoundingClientRect();
    const weeksRect = weeksEl.getBoundingClientRect();
    const offsetLeft = weeksRect.left - headRect.left;
    const colWidth = weeksRect.width / cols;
    const leftPx = offsetLeft + nowFrac * colWidth;
    const line = document.createElement('div');
    line.className = 'g-now-line';
    line.style.left = `${leftPx}px`;
    line.title = 'Huidige week';
    gantt.appendChild(line);
  }

  function renderSummary() {
    const c = FS.calc;
    const bd = c.budgetBreakdown();
    const totCreatie = c.totalCreatieFlights() + c.calcCreatie();
    const totTooling = c.totalToolingFlights() + c.calcTooling();
    const totUren = c.totalUrenFlights() + c.calcUren();
    // Alle totalen zijn actual-leidend (vallen terug op planning zonder actuals).
    const rest = FS.state.jaarTotal - bd.ctc - totCreatie - totTooling - totUren;
    const hasActuals = FS.state.campaigns.some((cp) => (cp.segs || []).some((f) => f.actualized));
    const bj = FS.state.budgetJournal;
    const subtitle = bj.mods.length
      ? `Basis ${fC(bj.base)} + ${bj.mods.length} wijz.`
      : 'Klik voor journal';
    const feeBasis = bd.mode === 'excl' ? 'bovenop budget' : 'in budget verwerkt';
    const feeStatus = bd.feeStatus === 'actual' ? 'actual'
      : bd.feeStatus === 'forecast' ? 'prognose: actual + planned' : 'planned prognose';
    const feeSub = bd.feeTiersEnabled ? `${feeBasis} · ${feeStatus}` : feeBasis;
    document.getElementById('summaryBar').innerHTML =
      `<div class="scard s-click" id="scJ"><div class="sl">Jaarbudget</div><div class="sv">${esc(fC(FS.state.jaarTotal))}</div><div class="sd">${esc(subtitle)}</div></div>`
      + `<div class="scard s-media"><div class="sl">Netto Media</div><div class="sv">${esc(fC(bd.media))}</div></div>`
      + `<div class="scard s-fee s-click" id="scFee" title="Handling fee / uren — klik voor instellingen"><div class="sl">Handling fee/uren</div><div class="sv">${esc(fC(bd.fee + totUren))}</div><div class="sd">${esc(feeSub)}</div></div>`
      + `<div class="scard s-crea s-click" id="scC"><div class="sl">Creatie</div><div class="sv">${esc(fC(totCreatie))}</div></div>`
      + `<div class="scard s-tool s-click" id="scT"><div class="sl">Tooling</div><div class="sv">${esc(fC(totTooling))}</div></div>`
      + `<div class="scard s-rest"><div class="sl">Resterend${hasActuals ? ' (actual)' : ''}</div><div class="sv" style="color:${rest < 0 ? '#DC2626' : '#059669'}">${esc(fC(rest))}</div></div>`;
  }

  /* ----- Filter-popup voor de Gantt (vervangt de oude inline filterbalken) -----
   * Bundelt funnel-, merk-, status- en doelgroepfilters in één modal, net als de
   * flight-/campagne-modals. Wordt alleen opnieuw opgebouwd wanneer geopend. */
  function gfChip(type, key, label, on, color) {
    const style = on && color ? ` style="background:${a(color)};border-color:${a(color)};color:#fff"` : '';
    const dot = on ? '' : `<span class="gf-dot" style="background:${a(color || '#94A3B8')}"></span>`;
    return `<button class="gf-chip${on ? ' on' : ''}" data-gf="${a(type)}" data-key="${a(key)}"${style}>${dot}${label}</button>`;
  }
  function gfSection(title, type, allOn, chipsHtml) {
    return `<section class="gf-section"><div class="gf-sec-head"><span class="gf-sec-title">${title}</span>`
      + `<button class="gf-all${allOn ? ' on' : ''}" data-gf="${a(type)}" data-key="__all">Alle</button></div>`
      + `<div class="gf-chips">${chipsHtml}</div></section>`;
  }
  function renderFilterModal() {
    const bg = document.getElementById('filterBg');
    if (!bg || !bg.classList.contains('open')) return;
    const body = document.getElementById('filterBody');
    if (!body) return;

    let h = '';

    // Funnelfase
    const fnChips = FS.state.funnelStages.map((st) =>
      gfChip('funnel', st.id, `${st.icon ? esc(st.icon) + ' ' : ''}${esc(st.name)}`, isFunnelVisible(st.id), st.color),
    ).join('') + gfChip('funnel', '', 'Geen funnelfase', isFunnelVisible(''), '#94A3B8');
    h += gfSection('🪜 Funnelfase', 'funnel', !funnelFilter, fnChips);

    // Merken (alleen in merk-modus)
    const brands = getBrands();
    if (brands.length) {
      let bc = brands.map((b, i) => gfChip('brand', b, esc(b), isBrandVisible(b), brandColor(i))).join('');
      if (FS.state.campaigns.some((c) => !c.brand)) bc += gfChip('brand', '', 'Geen merk', isBrandVisible(''), '#94A3B8');
      h += gfSection('🏢 Merken', 'brand', !brandFilter, bc);
    }

    // Status
    const stChips = FS.constants.STATUSES.map((st) =>
      gfChip('status', st.id, esc(st.name), isStatusVisible(st.id), st.color || '#0026C5'),
    ).join('');
    h += gfSection('🚦 Status', 'status', !statusFilter, stChips);

    // Doelgroepen (alleen als de functie aanstaat)
    if (audiencesOn()) {
      let ac = ganttDistinctAuds().map((x) => gfChip('aud', x.key, esc(x.label), isGAudVisible(x.key), '#8B5CF6')).join('');
      ac += gfChip('aud', '', 'Geen doelgroep', isGAudVisible(''), '#94A3B8');
      h += gfSection('👥 Doelgroep', 'aud', !audienceFilter, ac);
    }

    // Weergave: legenda tonen/verbergen (voorheen in de funnelbalk)
    const legendHidden = document.body.classList.contains('legend-hidden');
    h += `<section class="gf-section"><div class="gf-sec-head"><span class="gf-sec-title">🎨 Weergave</span></div>`
      + `<div class="ss-toggle" style="padding:2px 0"><label for="gfLegend">Legenda onderaan tonen`
      + `<span class="ss-hint-sm">De kleurenlegenda onder de Gantt.</span></label>`
      + `<div class="tg-sw${legendHidden ? '' : ' on'}" id="gfLegend" role="switch" aria-checked="${!legendHidden}" tabindex="0"></div></div></section>`;

    const n = activeFilterCount();
    h += `<div class="gf-foot"><button class="mbtn gf-reset" id="gfReset">↺ Alles tonen</button>`
      + `<span class="gf-count">${n ? `${n} filter${n === 1 ? '' : 's'} actief` : 'Geen filters actief'}</span></div>`;

    body.innerHTML = h;
  }
  function openFilters() {
    const bg = document.getElementById('filterBg');
    if (!bg) return;
    bg.classList.add('open');
    renderFilterModal();
  }
  function closeFilters() {
    const bg = document.getElementById('filterBg');
    if (bg) bg.classList.remove('open');
  }
  /** Zet alle gantt-filters terug op "alles tonen". */
  function resetFilters() {
    funnelFilter = null;
    brandFilter = null;
    statusFilter = null;
    audienceFilter = null;
    render();
    renderFilterModal();
  }

  function renderLegend() {
    let html = `<span class="leg-lbl">CAMPAGNES:</span>`;
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
    renderFilterModal();
    renderLegend();
    if (FS.finance) FS.finance.render();
    if (FS._refreshRangeUI) FS._refreshRangeUI();
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

  FS.render = { render, renderGantt, renderSummary, renderLegend, renderFilterModal, barHTML, palHTML, positionNowLine,
    setFunnelStage, setFunnelAll, isFunnelVisible, funnelStageInfo,
    getBrands, brandColor, isBrandVisible, setBrandVisible, setBrandAll,
    isStatusVisible, setStatusVisible, setStatusAll,
    isGAudVisible, setGAudVisible, setGAudAll,
    openFilters, closeFilters, resetFilters, activeFilterCount };
})(window.FS = window.FS || {});
