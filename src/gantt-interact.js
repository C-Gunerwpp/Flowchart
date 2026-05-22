/* Flowchart Studio — Gantt interacties
 * Drag-to-move + resize op flight/tactic-bars en dubbelklik quick-edit
 * popover. Snapt naar weken op basis van de huidige column-breedte.
 */
(function (FS) {
  'use strict';

  const THRESHOLD = 4; // px voor we drag activeren
  let drag = null;
  let suppressNextClick = false;

  function init() {
    const gantt = document.getElementById('gantt');
    if (!gantt) return;

    gantt.addEventListener('mousedown', onMouseDown);
    gantt.addEventListener('dblclick', onDblClick);
    gantt.addEventListener('mousemove', onHover);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Klikken na een drag mag de modal niet openen.
    document.addEventListener('click', (e) => {
      if (!suppressNextClick) return;
      suppressNextClick = false;
      e.stopPropagation();
      e.preventDefault();
    }, true);
  }

  /* Hover: cursor wijzigen aan de randen (resize) versus midden (move). */
  function onHover(e) {
    if (drag) return;
    const bar = e.target.closest('.g-bar');
    if (!bar || bar.dataset.fi === undefined) {
      return;
    }
    const rect = bar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const edge = Math.min(10, rect.width / 4);
    if (x < edge || x > rect.width - edge) {
      bar.style.cursor = 'ew-resize';
    } else {
      bar.style.cursor = 'grab';
    }
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest('.g-toggle')) return;
    const bar = e.target.closest('.g-bar');
    if (!bar) return;
    if (bar.dataset.fi === undefined) return;

    const ci = parseInt(bar.dataset.ci, 10);
    const fi = parseInt(bar.dataset.fi, 10);
    const ti = bar.dataset.ti !== undefined ? parseInt(bar.dataset.ti, 10) : null;
    const idx = FS.utils.findCampaignIndex(ci);
    if (idx < 0) return;

    // Voor campagne-rows: alleen bars die echt bij één flight horen.
    // Voor tactic-rows en flight-rows zijn fi (en eventueel ti) gezet.
    const rect = bar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const edge = Math.min(10, rect.width / 4);
    let mode = 'move';
    if (x < edge) mode = 'resizeStart';
    else if (x > rect.width - edge) mode = 'resizeEnd';

    const barsContainer = bar.closest('.g-bars');
    if (!barsContainer) return;
    const colWidth = barsContainer.getBoundingClientRect().width / 52;
    if (colWidth <= 0) return;

    const target = ti !== null
      ? FS.state.campaigns[idx].segs[fi].tac[ti]
      : FS.state.campaigns[idx].segs[fi];

    drag = {
      mode,
      idx,
      fi,
      ti,
      startX: e.clientX,
      colWidth,
      origSd: target.sd,
      origEd: target.ed,
      moved: false,
      barEl: bar,
    };
    bar.style.cursor = mode === 'move' ? 'grabbing' : 'ew-resize';
    document.body.style.userSelect = 'none';
  }

  function onMouseMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) < THRESHOLD) return;
    drag.moved = true;

    const dWeeks = Math.round(dx / drag.colWidth);

    if (drag.mode === 'move') {
      drag.barEl.style.transform = `translateX(${dx}px)`;
      drag.barEl.style.opacity = '0.75';
    } else {
      // resize: pas de grid-column kolommen live aan voor feedback
      const sw = origWeek(drag.origSd) + (drag.mode === 'resizeStart' ? dWeeks : 0);
      const ew = origWeek(drag.origEd) + (drag.mode === 'resizeEnd' ? dWeeks : 0);
      const a = Math.max(1, Math.min(53, sw));
      const b = Math.max(a, Math.min(53, ew));
      drag.barEl.style.gridColumn = `${a}/${b + 1}`;
      drag.barEl.style.opacity = '0.85';
    }

    showDragTip(e.clientX, e.clientY, computePreview(dWeeks));
  }

  function onMouseUp(e) {
    document.body.style.userSelect = '';
    hideDragTip();
    if (!drag) return;
    const cur = drag;
    drag = null;
    cur.barEl.style.transform = '';
    cur.barEl.style.opacity = '';
    cur.barEl.style.gridColumn = '';

    if (!cur.moved) return;

    const dWeeks = Math.round((e.clientX - cur.startX) / cur.colWidth);
    if (dWeeks === 0) return;

    suppressNextClick = true;

    const camp = FS.state.campaigns[cur.idx];
    const f = camp.segs[cur.fi];
    const target = cur.ti !== null ? f.tac[cur.ti] : f;

    let prevSd = target.sd;
    let prevEd = target.ed;

    if (cur.mode === 'move') {
      target.sd = applyWeeksOffset(cur.origSd, dWeeks);
      target.ed = applyWeeksOffset(cur.origEd, dWeeks);
    } else if (cur.mode === 'resizeStart') {
      let newSd = applyWeeksOffset(cur.origSd, dWeeks);
      if (newSd > target.ed) newSd = target.ed;
      target.sd = newSd;
    } else if (cur.mode === 'resizeEnd') {
      let newEd = applyWeeksOffset(cur.origEd, dWeeks);
      if (newEd < target.sd) newEd = target.sd;
      target.ed = newEd;
    }

    if (cur.ti === null) {
      // Flight: check tactics buiten periode
      FS.modals.clampFlightTactics(cur.idx, cur.fi, prevSd, prevEd, () => FS.render.render());
    } else {
      // Tactic: clamp binnen flight-grenzen
      if (target.sd < f.sd) target.sd = f.sd;
      if (target.ed > f.ed) target.ed = f.ed;
      if (target.ed < target.sd) target.ed = target.sd;
      FS.render.render();
    }
  }

  /* Dubbelklik op een bar: open een kleine inline-popover met naam+budget. */
  function onDblClick(e) {
    const bar = e.target.closest('.g-bar');
    if (!bar || bar.dataset.fi === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    suppressNextClick = true;
    openQuickEdit(bar);
  }

  function openQuickEdit(bar) {
    closeQuickEdit();
    const ci = parseInt(bar.dataset.ci, 10);
    const fi = parseInt(bar.dataset.fi, 10);
    const ti = bar.dataset.ti !== undefined ? parseInt(bar.dataset.ti, 10) : null;
    const idx = FS.utils.findCampaignIndex(ci);
    if (idx < 0) return;
    const camp = FS.state.campaigns[idx];
    const f = camp.segs[fi];
    const target = ti !== null ? f.tac[ti] : f;
    const isTactic = ti !== null;

    const rect = bar.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = 'qe-pop';
    pop.innerHTML =
      `<div class="qe-head">${isTactic ? '🎯 Tactic' : '✈️ Flight'} snel bewerken</div>`
      + `<label>Naam<input class="qe-n" type="text" value="${FS.utils.escapeAttr(target.n || '')}"></label>`
      + `<label>Budget<input class="qe-b" type="number" value="${target.b || 0}" step="100"></label>`
      + `<div class="qe-act">`
      + `<button class="mbtn" data-act="cancel">Annuleer</button>`
      + `<button class="mbtn pri" data-act="save">Opslaan</button>`
      + `<button class="mbtn" data-act="full">📝 Volledig…</button>`
      + `</div>`;
    document.body.appendChild(pop);

    const px = Math.min(window.innerWidth - 280, rect.left + rect.width / 2 - 130);
    const py = Math.min(window.innerHeight - 220, rect.bottom + 6);
    pop.style.left = Math.max(8, px) + 'px';
    pop.style.top = py + 'px';

    const nInput = pop.querySelector('.qe-n');
    nInput.focus();
    nInput.select();

    pop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); closeQuickEdit(); }
    });
    pop.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'cancel') closeQuickEdit();
      else if (act === 'save') commit();
      else if (act === 'full') {
        closeQuickEdit();
        if (isTactic) FS.modals.showTacticModal(idx, fi, ti);
        else FS.modals.showFlightModal(idx, fi);
      }
    });
    // klik buiten popover → annuleer
    setTimeout(() => document.addEventListener('mousedown', outsideClose, true), 0);

    function commit() {
      target.n = nInput.value;
      target.b = parseFloat(pop.querySelector('.qe-b').value) || 0;
      closeQuickEdit();
      if (isTactic) FS.render.render();
      else FS.modals.checkCampBudget(idx, () => FS.render.render());
    }
    function outsideClose(e) {
      if (!pop.contains(e.target)) closeQuickEdit();
    }
    pop._outsideClose = outsideClose;
  }

  function closeQuickEdit() {
    const pop = document.querySelector('.qe-pop');
    if (!pop) return;
    if (pop._outsideClose) document.removeEventListener('mousedown', pop._outsideClose, true);
    pop.remove();
  }

  /* Drag-tooltip met preview van nieuwe periode. */
  function showDragTip(x, y, text) {
    let tip = document.getElementById('dragTip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'dragTip';
      tip.className = 'drag-tip';
      document.body.appendChild(tip);
    }
    tip.textContent = text;
    tip.style.left = (x + 14) + 'px';
    tip.style.top = (y + 14) + 'px';
    tip.classList.add('vis');
  }
  function hideDragTip() {
    const tip = document.getElementById('dragTip');
    if (tip) tip.classList.remove('vis');
  }

  function computePreview(dWeeks) {
    if (!drag) return '';
    const sd = drag.mode === 'resizeEnd' ? drag.origSd : applyWeeksOffset(drag.origSd, dWeeks);
    const ed = drag.mode === 'resizeStart' ? drag.origEd : applyWeeksOffset(drag.origEd, dWeeks);
    const sw = FS.utils.dateToWeek(sd);
    const ew = FS.utils.dateToWeek(ed);
    const label = drag.mode === 'move' ? `Verplaats ${dWeeks > 0 ? '+' : ''}${dWeeks}w`
      : drag.mode === 'resizeStart' ? `Start ${dWeeks > 0 ? '+' : ''}${dWeeks}w`
      : `Eind ${dWeeks > 0 ? '+' : ''}${dWeeks}w`;
    return `${label} → W${sw}–W${ew}`;
  }

  function applyWeeksOffset(dateStr, weeks) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + weeks * 7);
    return d.toISOString().substring(0, 10);
  }

  function origWeek(dateStr) {
    return FS.utils.dateToWeek(dateStr);
  }

  /* ========= ZOOM ========= */
  // Zoom is een schaal-factor: 1.0 = standaard. Wordt toegepast op .gantt min-width.
  const ZOOM_MIN = 0.6;
  const ZOOM_MAX = 2.5;
  const ZOOM_STEP = 0.2;
  const BASE_WIDTH = 1500;
  let zoom = 1;

  function applyZoom() {
    const g = document.getElementById('gantt');
    if (!g) return;
    g.style.minWidth = Math.round(BASE_WIDTH * zoom) + 'px';
    const ind = document.getElementById('zoomVal');
    if (ind) ind.textContent = Math.round(zoom * 100) + '%';
  }

  function zoomIn() { zoom = Math.min(ZOOM_MAX, Math.round((zoom + ZOOM_STEP) * 100) / 100); applyZoom(); }
  function zoomOut() { zoom = Math.max(ZOOM_MIN, Math.round((zoom - ZOOM_STEP) * 100) / 100); applyZoom(); }
  function zoomReset() { zoom = 1; applyZoom(); }

  FS.ganttInteract = { init, applyZoom, zoomIn, zoomOut, zoomReset };
})(window.FS = window.FS || {});
