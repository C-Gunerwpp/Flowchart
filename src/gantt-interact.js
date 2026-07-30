/* Flowchart Studio — Gantt interacties
 * Drag-to-move + resize op flight/tactic-bars.
 * Snapt naar weken op basis van de huidige column-breedte.
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
    gantt.addEventListener('mousemove', onHover);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Klikken na een drag mogen de verplaatste bar niet selecteren.
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
    const cols = (FS.viewport && FS.viewport.cols()) || 52;
    const colWidth = barsContainer.getBoundingClientRect().width / cols;
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
      const cols = (FS.viewport && FS.viewport.cols()) || 52;
      const sw = origWeek(drag.origSd) + (drag.mode === 'resizeStart' ? dWeeks : 0);
      const ew = origWeek(drag.origEd) + (drag.mode === 'resizeEnd' ? dWeeks : 0);
      const a = Math.max(1, Math.min(cols + 1, sw));
      const b = Math.max(a, Math.min(cols + 1, ew));
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
    cur.barEl.style.cursor = '';

    if (!cur.moved) return;

    cur.barEl.style.gridColumn = '';

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
    const label = drag.mode === 'move' ? `Verplaats ${dWeeks > 0 ? '+' : ''}${dWeeks}w`
      : drag.mode === 'resizeStart' ? `Start ${dWeeks > 0 ? '+' : ''}${dWeeks}w`
      : `Eind ${dWeeks > 0 ? '+' : ''}${dWeeks}w`;
    return `${label} → ${sd} t/m ${ed}`;
  }

  function applyWeeksOffset(dateStr, weeks) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + weeks * 7);
    return d.toISOString().substring(0, 10);
  }

  function origWeek(dateStr) {
    // Kolomindex (1-based) van de week binnen de huidige viewport.
    const idx = FS.viewport && FS.viewport.weekIndex ? FS.viewport.weekIndex(dateStr) : -1;
    return idx >= 0 ? idx + 1 : 1;
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
    g.style.setProperty('--gz', zoom);
    const ind = document.getElementById('zoomVal');
    if (ind) ind.textContent = Math.round(zoom * 100) + '%';
    if (FS.render && FS.render.positionNowLine) {
      requestAnimationFrame(FS.render.positionNowLine);
    }
  }

  function zoomIn() { zoom = Math.min(ZOOM_MAX, Math.round((zoom + ZOOM_STEP) * 100) / 100); applyZoom(); saveZoom(); }
  function zoomOut() { zoom = Math.max(ZOOM_MIN, Math.round((zoom - ZOOM_STEP) * 100) / 100); applyZoom(); saveZoom(); }
  function zoomReset() { zoom = 1; applyZoom(); saveZoom(); }

  /** Zoomniveau uitlezen/zetten voor het bewaren van de weergavestand. */
  function getZoom() { return zoom; }
  function setZoom(value) {
    const z = Number(value);
    if (!Number.isFinite(z)) return;
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 100) / 100));
    applyZoom();
  }

  /** Zoom hoort bij de bewaarde weergave; render() draait hier niet, dus
   *  expliciet autosaven. */
  function saveZoom() {
    if (FS.io && FS.io.autoSave) FS.io.autoSave();
  }

  /** Scroll de gantt horizontaal zodat de huidige week in beeld is. */
  function scrollToNow() {
    const wrap = document.getElementById('ganttWrap');
    const gantt = document.getElementById('gantt');
    if (!wrap || !gantt) return;
    let nowFrac = FS.viewport && FS.viewport.nowCol ? FS.viewport.nowCol() : null;
    if (nowFrac == null) {
      // Vandaag valt buiten de viewport → herschuif de viewport eerst.
      if (FS.viewport && FS.viewport.scrollToToday) {
        FS.viewport.scrollToToday();
        if (FS.render) FS.render.render();
        nowFrac = FS.viewport.nowCol();
      }
      if (nowFrac == null) {
        if (FS.toast) FS.toast.show('Vandaag valt buiten de zichtbare periode', 'info');
        return;
      }
    }
    const weeksEl = gantt.querySelector('.g-head-w .gh-weeks');
    if (!weeksEl) return;
    const cols = FS.viewport.cols();
    const weeksRect = weeksEl.getBoundingClientRect();
    const ganttRect = gantt.getBoundingClientRect();
    const offsetLeft = weeksRect.left - ganttRect.left;
    const colWidth = weeksRect.width / cols;
    const nwLeft = offsetLeft + nowFrac * colWidth;
    const target = Math.max(0, nwLeft - wrap.clientWidth / 2);
    wrap.scrollTo({ left: target, behavior: 'smooth' });
  }

  FS.ganttInteract = { init, applyZoom, zoomIn, zoomOut, zoomReset, getZoom, setZoom, scrollToNow };
})(window.FS = window.FS || {});
