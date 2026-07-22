/* Flowchart Studio — events & bootstrap
 * Bevat alle DOM-event-bindings en de start-flow.
 *
 * Text-inputs (naam, notitie) gebruiken het `input`-event en doen een
 * gerichte state-update zonder de modal opnieuw te renderen — dat
 * behoudt cursorpositie en selecties tijdens typen.
 *
 * Structurele wijzigingen (status, kleur, sectie, +/- items) doen een
 * volledige re-render.
 */
(function (FS) {
  'use strict';

  const { findCampaignIndex, weekToDate, dateToWeek } = FS.utils;
  const C = FS.constants;

  /** Show main app, hide welcome. */
  function showApp() {
    document.getElementById('W').classList.add('h');
    document.getElementById('A').classList.add('on');
    const yr = document.getElementById('yearIn');
    if (yr) yr.value = FS.state.year;
    const ci = document.getElementById('clientIn');
    if (ci) ci.value = FS.state.client;
    FS.render.render();
    if (FS.history) FS.history.updateButtons();
    if (FS.ganttInteract) FS.ganttInteract.applyZoom();
    if (FS.modals && FS.modals.notifyPendingActuals) {
      setTimeout(() => FS.modals.notifyPendingActuals(), 600);
    }
  }

  FS.events = { showApp };

  let entityClipboard = null;

  function cloneEntity(entity) {
    return JSON.parse(JSON.stringify(entity));
  }

  function isoDate(date) {
    return date.toISOString().substring(0, 10);
  }

  function nextWeekMonday() {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    const isoDay = date.getDay() || 7;
    date.setDate(date.getDate() + (8 - isoDay));
    return isoDate(date);
  }

  function shiftDateByDays(dateStr, days) {
    const date = new Date(`${dateStr}T12:00:00`);
    if (Number.isNaN(date.getTime())) return dateStr;
    date.setDate(date.getDate() + days);
    return isoDate(date);
  }

  function shiftTacticByDays(tactic, days) {
    tactic.sd = shiftDateByDays(tactic.sd, days);
    tactic.ed = shiftDateByDays(tactic.ed, days);
  }

  function shiftFlightByDays(flight, days) {
    flight.sd = shiftDateByDays(flight.sd, days);
    flight.ed = shiftDateByDays(flight.ed, days);
    (flight.tac || []).forEach((tactic) => shiftTacticByDays(tactic, days));
  }

  function moveEntityToNextWeek(type, entity) {
    let start = entity.sd;
    if (type === 'campaign') {
      start = (entity.segs || []).reduce((earliest, flight) => {
        if (!flight.sd) return earliest;
        return !earliest || flight.sd < earliest ? flight.sd : earliest;
      }, '');
    }
    if (!start) return;
    const source = new Date(`${start}T12:00:00`);
    const target = new Date(`${nextWeekMonday()}T12:00:00`);
    if (Number.isNaN(source.getTime())) return;
    const days = Math.round((target - source) / 86400000);
    if (type === 'campaign') (entity.segs || []).forEach((flight) => shiftFlightByDays(flight, days));
    else if (type === 'flight') shiftFlightByDays(entity, days);
    else shiftTacticByDays(entity, days);
  }

  function allocateCampaignId() {
    const s = FS.state;
    const maxId = s.campaigns.reduce((max, camp) => Math.max(max, Number(camp.id) || 0), 0);
    const id = Math.max(Number(s.nextId) || 0, maxId + 1);
    s.nextId = id + 1;
    return id;
  }

  /** Voeg een nieuwe campagne toe met een gegarandeerd uniek id en open de
   *  bewerk-modal. Gedeeld door de topbar-CTA, de lege-staat-knop en Ctrl+N. */
  function addCampaign() {
    const s = FS.state;
    const newId = allocateCampaignId();
    const newCamp = {
      id: newId,
      sec: 'losse',
      label: 'Nieuwe campagne',
      col: C.PALETTE[s.campaigns.length % C.PALETTE.length],
      budget: 0,
      funnels: [],
      segs: [],
    };
    // Plaats nieuwe (losse) campagnes vóór de Always-On-sectie.
    let idx = 0;
    for (let i = 0; i < s.campaigns.length; i++) {
      if (s.campaigns[i].sec === 'ao') { idx = i; break; }
      idx = i + 1;
    }
    s.campaigns.splice(idx, 0, newCamp);
    FS.render.render();
    FS.modals.showCampModal(findCampaignIndex(newCamp.id));
  }
  FS.events.addCampaign = addCampaign;

  function selectedEntityForCopy() {
    const s = FS.state;
    const ci = findCampaignIndex(s.selectedCamp);
    if (ci < 0) return null;
    const camp = s.campaigns[ci];
    if (s.selectedTactic !== null && s.selectedFlight !== null) {
      const flight = camp.segs[s.selectedFlight];
      const tactic = flight && flight.tac && flight.tac[s.selectedTactic];
      return tactic ? { type: 'tactic', data: tactic, camp, flight } : null;
    }
    if (s.selectedFlight !== null) {
      const flight = camp.segs[s.selectedFlight];
      return flight ? { type: 'flight', data: flight, camp, flight } : null;
    }
    return { type: 'campaign', data: camp, camp, flight: null };
  }

  function copySelectedEntity() {
    const selected = selectedEntityForCopy();
    if (!selected) return false;
    if (selected.camp.locked || (selected.flight && selected.flight.actualized)) {
      if (FS.toast) FS.toast.show('Dit onderdeel is vergrendeld en kan niet worden gekopieerd', 'warn');
      return true;
    }
    entityClipboard = {
      type: selected.type,
      data: cloneEntity(selected.data),
      sourceCampId: selected.camp.id,
    };
    const names = { campaign: 'Campagne', flight: 'Flight', tactic: 'Tactic' };
    if (FS.toast) FS.toast.show(`${names[selected.type]} gekopieerd`, 'success');
    return true;
  }

  function selectGanttEntity(campId, flightIndex, tacticIndex) {
    const s = FS.state;
    s.selectedCamp = campId;
    s.selectedFlight = flightIndex == null ? null : flightIndex;
    s.selectedTactic = tacticIndex == null ? null : tacticIndex;

    document.querySelectorAll('#gantt .g-row.g-sel, #gantt .g-bar.g-sel').forEach((el) => el.classList.remove('g-sel'));
    const rows = Array.from(document.querySelectorAll(`#gantt .g-row[data-ci="${campId}"]`));
    const row = rows.find((candidate) => {
      if (s.selectedTactic !== null) {
        return candidate.dataset.fi === String(s.selectedFlight) && candidate.dataset.ti === String(s.selectedTactic);
      }
      if (s.selectedFlight !== null) {
        return candidate.classList.contains('g-sub') && candidate.dataset.fi === String(s.selectedFlight);
      }
      return candidate.classList.contains('g-camp');
    });
    if (row) row.classList.add('g-sel');
    if (s.selectedFlight !== null) {
      document.querySelectorAll(`#gantt .g-bar[data-ci="${campId}"][data-fi="${s.selectedFlight}"]`).forEach((bar) => {
        const matchesTactic = s.selectedTactic === null
          ? bar.dataset.ti === undefined
          : bar.dataset.ti === String(s.selectedTactic);
        if (matchesTactic) bar.classList.add('g-sel');
      });
    }
  }

  function finishEntityPaste(ci, flightIndex, tacticIndex, message) {
    FS.modals.clampFunnelHierarchy(FS.state.campaigns[ci]);
    selectGanttEntity(FS.state.campaigns[ci].id, flightIndex, tacticIndex);
    FS.render.render();
    FS.io.autoSave();
    if (FS.toast) FS.toast.show(message, 'success');
  }

  function pasteCopiedCampaign() {
    const s = FS.state;
    const copy = cloneEntity(entityClipboard.data);
    copy.id = allocateCampaignId();
    copy.label = `${copy.label || 'Campagne'} (kopie)`;
    (copy.segs || []).forEach((flight) => { flight.finance = { poNumbers: [], entries: [] }; });
    moveEntityToNextWeek('campaign', copy);
    FS.modals.clampFunnelHierarchy(copy);

    let anchor = findCampaignIndex(s.selectedCamp);
    if (anchor < 0) anchor = findCampaignIndex(entityClipboard.sourceCampId);
    let insertAt = -1;
    if (anchor >= 0 && s.campaigns[anchor].sec === copy.sec) insertAt = anchor + 1;
    if (insertAt < 0) {
      for (let i = 0; i < s.campaigns.length; i++) {
        if (s.campaigns[i].sec === copy.sec) insertAt = i + 1;
      }
    }
    if (insertAt < 0) {
      insertAt = copy.sec === 'ao' ? s.campaigns.length : s.campaigns.findIndex((camp) => camp.sec === 'ao');
      if (insertAt < 0) insertAt = s.campaigns.length;
    }

    s.campaigns.splice(insertAt, 0, copy);
    selectGanttEntity(copy.id, null, null);
    FS.render.render();
    FS.io.autoSave();
    if (FS.toast) FS.toast.show('Campagne geplakt', 'success');
  }

  function pasteCopiedFlight(ci) {
    const s = FS.state;
    const camp = s.campaigns[ci];
    if (camp.locked) {
      if (FS.toast) FS.toast.show('Deze campagne is vergrendeld', 'warn');
      return;
    }
    const copy = cloneEntity(entityClipboard.data);
    copy.finance = { poNumbers: [], entries: [] };
    moveEntityToNextWeek('flight', copy);
    const insertAt = s.selectedFlight !== null ? s.selectedFlight + 1 : camp.segs.length;
    camp.segs.splice(insertAt, 0, copy);
    FS.modals.checkCampBudget(ci, () => {
      finishEntityPaste(ci, insertAt, null, 'Flight geplakt');
    });
  }

  function clampTacticDates(tactic, flight) {
    tactic.sd = tactic.sd < flight.sd ? flight.sd : tactic.sd > flight.ed ? flight.ed : tactic.sd;
    tactic.ed = tactic.ed > flight.ed ? flight.ed : tactic.ed < flight.sd ? flight.sd : tactic.ed;
    if (tactic.ed < tactic.sd) tactic.ed = tactic.sd;
  }

  function pasteCopiedTactic(ci) {
    const s = FS.state;
    const camp = s.campaigns[ci];
    const fi = s.selectedFlight;
    const flight = fi !== null ? camp.segs[fi] : null;
    if (!flight) {
      if (FS.toast) FS.toast.show('Open eerst de flight waarin je wilt plakken', 'warn');
      return;
    }
    if (camp.locked || flight.actualized) {
      if (FS.toast) FS.toast.show('Deze flight is vergrendeld', 'warn');
      return;
    }
    const copy = cloneEntity(entityClipboard.data);
    moveEntityToNextWeek('tactic', copy);
    clampTacticDates(copy, flight);
    if (!Array.isArray(flight.tac)) flight.tac = [];
    const insertAt = s.selectedTactic !== null ? s.selectedTactic + 1 : flight.tac.length;
    flight.tac.splice(insertAt, 0, copy);
    FS.modals.checkCampBudget(ci, () => {
      finishEntityPaste(ci, fi, insertAt, 'Tactic geplakt');
    });
  }

  function pasteCopiedEntity() {
    if (!entityClipboard) return false;
    if (entityClipboard.type === 'campaign') {
      pasteCopiedCampaign();
      return true;
    }
    const ci = findCampaignIndex(FS.state.selectedCamp);
    if (ci < 0) {
      const parentName = entityClipboard.type === 'flight' ? 'campagne' : 'flight';
      if (FS.toast) FS.toast.show(`Open eerst de ${parentName} waarin je wilt plakken`, 'warn');
      return true;
    }
    if (entityClipboard.type === 'flight') pasteCopiedFlight(ci);
    else pasteCopiedTactic(ci);
    return true;
  }

  document.addEventListener('DOMContentLoaded', wireUp);

  function wireUp() {
    /* ----- Welkomstscherm ----- */
    const fileInput = document.getElementById('FI');

    /* ----- Identiteit + recente plannen ----- */
    if (FS.locks) {
      FS.locks.updateUserPill();
      FS.locks.renderRecentList();
      document.getElementById('userPill').addEventListener('click', () => FS.locks.promptUserName());
      // Vraag eenmalig de naam als die ontbreekt
      if (!FS.locks.getUserName()) {
        // Klein vertragen zodat eventuele share-hash-laad eerst rendert
        setTimeout(() => FS.locks.ensureUserName(), 400);
      }
    }

    /* ----- Drop-anywhere ----- */
    const dropOv = document.getElementById('dropOverlay');
    let dragDepth = 0;
    function isFileDrag(e) {
      return e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    }
    window.addEventListener('dragenter', (e) => {
      if (!isFileDrag(e)) return;
      dragDepth++;
      dropOv.classList.add('on');
    });
    window.addEventListener('dragover', (e) => { if (isFileDrag(e)) e.preventDefault(); });
    window.addEventListener('dragleave', () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) dropOv.classList.remove('on');
    });
    window.addEventListener('drop', (e) => {
      dragDepth = 0;
      dropOv.classList.remove('on');
      if (!isFileDrag(e)) return;
      e.preventDefault();
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && /\.json$/i.test(f.name)) {
        FS.io.loadFile(f);
      } else if (f) {
        if (FS.toast) FS.toast.show('Alleen .json-bestanden worden ondersteund', 'warn');
      }
    });

    document.getElementById('wl').addEventListener('click', () => fileInput.click());
    document.getElementById('wn').addEventListener('click', () => {
      FS.state.reset();
      FS.calc.calcJaar();
      if (FS.history) FS.history.reset();
      showApp();
    });
    document.getElementById('wr').addEventListener('click', () => {
      FS.io.loadLocal();
      if (FS.history) FS.history.reset();
      showApp();
    });

    const dropZone = document.getElementById('wd');
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('ov'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('ov'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('ov');
      if (e.dataTransfer.files[0]) FS.io.loadFile(e.dataTransfer.files[0]);
    });

    document.body.addEventListener('dragover', (e) => e.preventDefault());
    document.body.addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer.files[0]) FS.io.loadFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) FS.io.loadFile(e.target.files[0]);
      e.target.value = '';
    });

    /* ----- Topbar ----- */
    document.getElementById('btnSave').addEventListener('click', FS.io.saveFile);
    document.getElementById('btnLoad').addEventListener('click', () => fileInput.click());

    /* ----- Export-dropdown ----- */
    const exportMenu = document.getElementById('tbExport');
    const exportBtn = document.getElementById('btnExport');
    function closeExportMenu() {
      if (!exportMenu) return;
      exportMenu.classList.remove('open');
      if (exportBtn) exportBtn.setAttribute('aria-expanded', 'false');
    }
    if (exportBtn && exportMenu) {
      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = exportMenu.classList.toggle('open');
        exportBtn.setAttribute('aria-expanded', String(isOpen));
      });
      exportMenu.querySelectorAll('.tb-menu-item').forEach((item) => {
        item.addEventListener('click', (e) => {
          const act = e.currentTarget.dataset.act;
          closeExportMenu();
          if (act === 'csv') FS.io.exportCSV();
          else if (act === 'xls') FS.io.exportXLS();
          else if (act === 'pdf') window.print();
        });
      });
      document.addEventListener('click', (e) => {
        if (!exportMenu.contains(e.target)) closeExportMenu();
      });
    }

    /* ----- Thema-schakelaar (licht/donker) ----- */
    const btnTheme = document.getElementById('btnTheme');
    if (btnTheme) {
      btnTheme.addEventListener('click', () => {
        const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
        const next = cur === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('fs-theme', next); } catch (e) { /* private mode */ }
        if (FS.toast) FS.toast.show(next === 'dark' ? '🌙 Donkere modus' : '☀️ Lichte modus', 'info', 1400);
      });
    }

    /* ----- Weergave-popover (zoom, periode, jaar) ----- */
    const viewPop = document.getElementById('viewPop');
    const btnView = document.getElementById('btnView');
    if (viewPop && btnView) {
      btnView.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = viewPop.classList.toggle('open');
        btnView.setAttribute('aria-expanded', String(open));
      });
      const panel = viewPop.querySelector('.tb-pop-panel');
      if (panel) panel.addEventListener('click', (e) => e.stopPropagation());
      document.addEventListener('click', (e) => {
        if (!viewPop.contains(e.target)) viewPop.classList.remove('open');
      });
    }

    /* ----- Gantt-filters (popup i.p.v. inline balken) ----- */
    const btnFilters = document.getElementById('btnFilters');
    if (btnFilters) {
      btnFilters.addEventListener('click', () => FS.render.openFilters());
    }
    const filterCloseBtn = document.getElementById('filterClose');
    if (filterCloseBtn) filterCloseBtn.addEventListener('click', () => FS.render.closeFilters());
    const filterBgEl = document.getElementById('filterBg');
    if (filterBgEl) filterBgEl.addEventListener('click', (e) => { if (e.target === filterBgEl) FS.render.closeFilters(); });
    const filterBodyEl = document.getElementById('filterBody');
    if (filterBodyEl) {
      filterBodyEl.addEventListener('click', (e) => {
        if (e.target.closest('#gfLegend')) {
          document.body.classList.toggle('legend-hidden');
          FS.render.render();
          return;
        }
        if (e.target.closest('#gfReset')) { FS.render.resetFilters(); return; }
        const chip = e.target.closest('[data-gf]');
        if (!chip) return;
        const type = chip.dataset.gf;
        const key = chip.dataset.key;
        const R = FS.render;
        if (type === 'funnel') {
          if (key === '__all') R.setFunnelAll(true); else R.setFunnelStage(key, !R.isFunnelVisible(key));
        } else if (type === 'brand') {
          if (key === '__all') R.setBrandAll(true); else R.setBrandVisible(key, !R.isBrandVisible(key));
        } else if (type === 'status') {
          if (key === '__all') R.setStatusAll(true); else R.setStatusVisible(key, !R.isStatusVisible(key));
        } else if (type === 'aud') {
          if (key === '__all') R.setGAudAll(true); else R.setGAudVisible(key, !R.isGAudVisible(key));
        }
      });
    }

    /* ----- "Meer"-menu (inzichten/versies/merge/export/laden/settings) ----- */
    const moreMenu = document.getElementById('tbMore');
    const btnMore = document.getElementById('btnMore');
    if (moreMenu && btnMore) {
      const closeMore = () => {
        moreMenu.classList.remove('open');
        btnMore.setAttribute('aria-expanded', 'false');
      };
      btnMore.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = moreMenu.classList.toggle('open');
        btnMore.setAttribute('aria-expanded', String(open));
      });
      moreMenu.querySelectorAll('.tb-menu-item').forEach((item) => {
        item.addEventListener('click', (e) => {
          const act = e.currentTarget.dataset.act;
          closeMore();
          if (act === 'csv') FS.io.exportCSV();
          else if (act === 'xls') FS.io.exportXLS();
          else if (act === 'pdf') window.print();
        });
      });
      document.addEventListener('click', (e) => {
        if (!moreMenu.contains(e.target)) closeMore();
      });
    }

    /* ----- Topbar-CTA: nieuwe campagne ----- */
    const btnNewCampTop = document.getElementById('btnNewCampTop');
    if (btnNewCampTop) {
      btnNewCampTop.addEventListener('click', () => addCampaign());
    }

    document.getElementById('btnSett').addEventListener('click', () => FS.modals.openSett('personalisatie'));
    document.getElementById('btnUndo').addEventListener('click', () => FS.history && FS.history.undo());
    document.getElementById('btnRedo').addEventListener('click', () => FS.history && FS.history.redo());
    document.getElementById('btnIns').addEventListener('click', () => FS.insights && FS.insights.open());
    document.getElementById('btnCollab').addEventListener('click', () => FS.collab && FS.collab.open());
    document.getElementById('btnMerge').addEventListener('click', () => FS.merge && FS.merge.openModal());
    document.getElementById('btnZoomIn').addEventListener('click', () => FS.ganttInteract && FS.ganttInteract.zoomIn());
    document.getElementById('btnZoomOut').addEventListener('click', () => FS.ganttInteract && FS.ganttInteract.zoomOut());
    document.getElementById('zoomVal').addEventListener('click', () => FS.ganttInteract && FS.ganttInteract.zoomReset());
    const btnToday = document.getElementById('btnToday');
    if (btnToday) btnToday.addEventListener('click', () => FS.ganttInteract && FS.ganttInteract.scrollToNow());

    /* ----- Gantt viewport (pan + maand-aantal) ----- */
    const updateRangeUI = () => {
      const lbl = document.getElementById('ganttRangeLbl');
      const inp = document.getElementById('monthCountIn');
      if (lbl && FS.viewport) lbl.textContent = FS.viewport.rangeLabel();
      if (inp && FS.viewport) inp.value = FS.viewport.get().monthCount;
    };
    const panAndRender = (delta) => {
      if (!FS.viewport) return;
      FS.viewport.panMonths(delta);
      FS.render.render();
      updateRangeUI();
    };
    const btnPrev = document.getElementById('btnPanPrev');
    if (btnPrev) btnPrev.addEventListener('click', () => panAndRender(-1));
    const btnNext = document.getElementById('btnPanNext');
    if (btnNext) btnNext.addEventListener('click', () => panAndRender(1));
    const monthIn = document.getElementById('monthCountIn');
    if (monthIn) monthIn.addEventListener('change', function () {
      if (!FS.viewport) return;
      FS.viewport.setMonthCount(this.value);
      this.value = FS.viewport.get().monthCount;
      FS.render.render();
      updateRangeUI();
    });
    const rangeLbl = document.getElementById('ganttRangeLbl');
    if (rangeLbl) rangeLbl.addEventListener('click', () => {
      if (!FS.viewport) return;
      FS.viewport.scrollToToday();
      FS.render.render();
      updateRangeUI();
    });
    // Update label na elke render
    FS._refreshRangeUI = updateRangeUI;
    updateRangeUI();
    document.getElementById('insClose').addEventListener('click', () => FS.insights && FS.insights.close());
    document.getElementById('insBg').addEventListener('click', function (e) {
      if (e.target === this) FS.insights && FS.insights.close();
    });

    document.getElementById('yearIn').addEventListener('change', function () {
      FS.state.year = parseInt(this.value, 10) || C.DEFAULT_YEAR;
      if (FS.viewport) FS.viewport.resetToYear(FS.state.year);
      FS.render.render();
      if (FS._refreshRangeUI) FS._refreshRangeUI();
    });
    document.getElementById('clientIn').addEventListener('input', function () {
      FS.state.client = this.value;
      FS.io.autoSave();
    });

    /* ----- Custom confirm dialog ----- */
    document.getElementById('cfmYes').addEventListener('click', () => FS.modals.answerConfirm(true));
    document.getElementById('cfmNo').addEventListener('click', () => FS.modals.answerConfirm(false));

    /* ----- Gantt: click + tooltip ----- */
    const ttEl = document.getElementById('ttip');
    let ttTimer = null;
    const gantt = document.getElementById('gantt');
    let doubleClickEntity = null;

    function ganttEntityFromTarget(target) {
      const bar = target.closest('.g-bar[data-ci]');
      const row = target.closest('.g-row[data-ci]');
      const source = bar || row;
      if (!source) return null;
      const campId = parseInt(source.dataset.ci, 10);
      if (Number.isNaN(campId)) return null;
      return {
        campId,
        flightIndex: source.dataset.fi === undefined ? null : parseInt(source.dataset.fi, 10),
        tacticIndex: source.dataset.ti === undefined ? null : parseInt(source.dataset.ti, 10),
        bar,
      };
    }

    gantt.addEventListener('click', (e) => {
      const t = e.target;
      const addFlt = t.closest('.g-addf');
      if (addFlt) {
        e.stopPropagation();
        const ci = parseInt(addFlt.dataset.ci, 10);
        const idx = findCampaignIndex(ci);
        if (idx >= 0) {
          const camp = FS.state.campaigns[idx];
          if (camp.locked) return;
          FS.state.expanded[ci] = true;
          const n = (camp.segs && camp.segs.length) || 0;
          camp.segs.push({
            n: `Flight ${n + 1}`, sd: FS.utils.today(), ed: FS.utils.today(),
            b: 0, cb: 0, tc: 0, col: '', st: 'concept', nt: '', tac: [], finance: { poNumbers: [], entries: [] },
          });
          FS.render.render();
          if (FS.io && FS.io.autoSave) FS.io.autoSave();
          if (FS.toast) FS.toast.show('Flight toegevoegd — versleep om te plaatsen', 'success', 2500);
        }
        return;
      }
      const toggle = t.closest('.g-toggle');
      if (toggle) {
        const ci = toggle.dataset.ci;
        if (toggle.dataset.fi !== undefined) {
          const key = `${ci}_${toggle.dataset.fi}`;
          FS.state.expandedFlight[key] = !FS.state.expandedFlight[key];
        } else {
          const id = parseInt(ci, 10);
          FS.state.expanded[id] = !FS.state.expanded[id];
        }
        FS.render.render();
        return;
      }

      const bar = t.closest('.g-bar');
      if (bar) {
        // Shift-klik = toevoegen aan bulk-selectie i.p.v. selecteren.
        if (e.shiftKey) {
          toggleBulkSelect(bar);
          return;
        }
        ttEl.classList.remove('vis');
        clearTimeout(ttTimer);
      }

      let entity = ganttEntityFromTarget(t);
      if (!entity) return;
      if (e.detail === 1) doubleClickEntity = entity;
      else if (e.detail > 1 && doubleClickEntity) entity = doubleClickEntity;
      selectGanttEntity(entity.campId, entity.flightIndex, entity.tacticIndex);
    });

    gantt.addEventListener('dblclick', (e) => {
      if (e.target.closest('button, .g-toggle')) return;
      const entity = doubleClickEntity || ganttEntityFromTarget(e.target);
      doubleClickEntity = null;
      if (!entity) return;
      const ci = findCampaignIndex(entity.campId);
      if (ci < 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      selectGanttEntity(entity.campId, entity.flightIndex, entity.tacticIndex);
      if (entity.tacticIndex !== null && entity.flightIndex !== null) {
        FS.modals.showTacticModal(ci, entity.flightIndex, entity.tacticIndex);
      } else if (entity.flightIndex !== null) {
        FS.modals.showFlightModal(ci, entity.flightIndex);
      } else {
        FS.modals.showCampModal(ci);
      }
    });

    gantt.addEventListener('mouseover', (e) => {
      const bar = e.target.closest('.g-bar');
      if (!bar) return;
      const ci = parseInt(bar.dataset.ci, 10);
      const fi = bar.dataset.fi !== undefined ? parseInt(bar.dataset.fi, 10) : null;
      const idx = findCampaignIndex(ci);
      if (idx < 0) return;
      const camp = FS.state.campaigns[idx];
      clearTimeout(ttTimer);
      const { escapeHtml: esc, formatCurrency, formatK } = FS.utils;
      let h = `<h5>${esc(camp.label)}</h5>`;
      if (fi !== null && camp.segs[fi]) {
        const f = camp.segs[fi];
        h += `<div class="tt-budget">${esc(formatCurrency(FS.calc.flightBudget(f)))}</div>`
          + `<div class="tt-flight">${esc(f.n || 'Flight')}</div>`
          + `<div class="tt-meta">Week ${dateToWeek(f.sd)} – ${dateToWeek(f.ed)}</div>`;
        if (f.cb || f.tc) {
          h += `<div class="tt-costs">`
            + (f.cb ? `<span class="tt-cost tt-crea">🎨 ${esc(formatK(f.cb))}</span>` : '')
            + (f.tc ? `<span class="tt-cost tt-tool">🔧 ${esc(formatK(f.tc))}</span>` : '')
            + `</div>`;
        }
      }
      ttEl.innerHTML = h;
      ttEl.classList.add('vis');
      const r = bar.getBoundingClientRect();
      const left = Math.max(12, Math.min(r.left, window.innerWidth - ttEl.offsetWidth - 12));
      const below = r.bottom + 8;
      const top = below + ttEl.offsetHeight <= window.innerHeight - 12
        ? below : Math.max(12, r.top - ttEl.offsetHeight - 8);
      ttEl.style.left = `${left}px`;
      ttEl.style.top = `${top}px`;
    });

    gantt.addEventListener('mouseout', (e) => {
      if (e.target.closest('.g-bar')) {
        ttTimer = setTimeout(() => ttEl.classList.remove('vis'), 150);
      }
    });

    /* ----- Modal close + back -----
     * Sluit alleen als zowel mousedown als click op de backdrop zelf
     * plaatsvonden. Zo wordt de modal niet weggeklikt wanneer de gebruiker
     * tekst selecteert in een veld en de muis buiten de modal loslaat. */
    function bindBackdropClose(bgId, closeFn) {
      const bg = document.getElementById(bgId);
      let downOnBg = false;
      bg.addEventListener('mousedown', function (e) {
        downOnBg = (e.target === bg);
      });
      bg.addEventListener('click', function (e) {
        if (e.target === bg && downOnBg) closeFn();
        downOnBg = false;
      });
    }

    document.getElementById('modalClose').addEventListener('click', FS.modals.closeModal);
    bindBackdropClose('modalBg', FS.modals.closeModal);
    document.getElementById('settClose').addEventListener('click', FS.modals.closeSett);
    bindBackdropClose('settBg', FS.modals.closeSett);
    const mergeCloseBtn = document.getElementById('mergeClose');
    if (mergeCloseBtn) mergeCloseBtn.addEventListener('click', () => FS.merge && FS.merge.closeModal());
    bindBackdropClose('mergeBg', () => FS.merge && FS.merge.closeModal());
    document.getElementById('modalNav').addEventListener('click', (e) => {
      if (!e.target.closest('.mnav-back')) return;
      const ci = findCampaignIndex(FS.state.selectedCamp);
      if (ci < 0) return;
      if (FS.state.selectedTactic !== null) {
        FS.state.selectedTactic = null;
        document.getElementById('modal').classList.remove('wide');
        FS.modals.showFlightModal(ci, FS.state.selectedFlight);
      } else if (FS.state.selectedFlight !== null) {
        FS.state.selectedFlight = null;
        FS.modals.showCampModal(ci);
      } else {
        FS.modals.closeModal();
      }
    });

    /* ----- Modal body: clicks ----- */
    const modalBody = document.getElementById('modalBody');
    function modalSelectionLocked(s, ci) {
      const camp = s.campaigns[ci];
      if (!camp) return false;
      if (camp.locked) return true;
      return s.selectedFlight !== null && !!(camp.segs[s.selectedFlight] && camp.segs[s.selectedFlight].actualized);
    }
    modalBody.addEventListener('click', (e) => {
      const ci = findCampaignIndex(FS.state.selectedCamp);
      if (ci < 0) return;
      const s = FS.state;

      const fiEl = e.target.closest('.m-item[data-fi]');
      if (fiEl && s.selectedFlight === null) {
        FS.modals.showFlightModal(ci, parseInt(fiEl.dataset.fi, 10));
        return;
      }
      const tiEl = e.target.closest('.m-item[data-ti]');
      if (tiEl && s.selectedFlight !== null && s.selectedTactic === null) {
        FS.modals.showTacticModal(ci, s.selectedFlight, parseInt(tiEl.dataset.ti, 10));
        return;
      }

      if (modalSelectionLocked(s, ci) && !e.target.closest('.allow-locked')) return;

      const palTrigger = e.target.closest('.pal-trigger');
      if (palTrigger) {
        const pop = palTrigger.closest('.pal-pop');
        if (pop) pop.dataset.open = pop.dataset.open === '1' ? '0' : '1';
        return;
      }

      const palette = e.target.closest('.pal-sw');
      if (palette) {
        const col = palette.dataset.col;
        if (s.selectedTactic !== null) {
          s.campaigns[ci].segs[s.selectedFlight].tac[s.selectedTactic].col = col;
          FS.modals.showTacticModal(ci, s.selectedFlight, s.selectedTactic);
        } else if (s.selectedFlight === null) {
          s.campaigns[ci].col = col;
          FS.modals.showCampModal(ci);
        }
        return;
      }

      const id = e.target.id;
      if (id === 'mFadd') { FS.modals.addFlight(ci); return; }
      if (id === 'mTadd' && s.selectedFlight !== null) { FS.modals.addTactic(ci, s.selectedFlight); return; }
      if (id === 'mFaudAdd' && s.selectedFlight !== null) {
        s.campaigns[ci].segs[s.selectedFlight].audience = { gender: 'b', ageMin: 18, ageMax: 65 };
        FS.modals.showFlightModal(ci, s.selectedFlight);
        return;
      }
      if (id === 'mFaudDel' && s.selectedFlight !== null) {
        delete s.campaigns[ci].segs[s.selectedFlight].audience;
        FS.modals.showFlightModal(ci, s.selectedFlight);
        return;
      }

      /* Actualisatie + lock */
      if (id === 'mFactual' && s.selectedFlight !== null) {
        FS.modals.actualizeFlight(ci, s.selectedFlight);
        return;
      }
      if (id === 'mFreopen' && s.selectedFlight !== null) {
        FS.modals.reopenFlight(ci, s.selectedFlight);
        return;
      }
      if (id === 'mCunlock') { FS.modals.unlockCampaign(ci, 'camp'); return; }
      if (id === 'mCunlockF') { FS.modals.unlockCampaign(ci, 'flight'); return; }
      if (id === 'mCunlockT') { FS.modals.unlockCampaign(ci, 'tactic'); return; }

      if (id === 'mCdel') {
        FS.modals.showConfirm(
          `Weet je zeker dat je <strong>${FS.utils.escapeHtml(s.campaigns[ci].label)}</strong> wilt verwijderen?<br><br>Dit kan niet ongedaan worden gemaakt.`,
          (ok) => { if (ok) { s.campaigns.splice(ci, 1); FS.modals.closeModal(); } },
          '🗑️',
        );
        return;
      }
      if (id === 'mFdel' && s.selectedFlight !== null) {
        FS.modals.showConfirm(
          `Flight <strong>${FS.utils.escapeHtml(s.campaigns[ci].segs[s.selectedFlight].n || '')}</strong> verwijderen?`,
          (ok) => {
            if (ok) {
              s.campaigns[ci].segs.splice(s.selectedFlight, 1);
              s.selectedFlight = null;
              FS.modals.checkCampBudget(ci, () => FS.modals.showCampModal(ci));
            }
          },
          '🗑️',
        );
        return;
      }
      if (id === 'mTdel' && s.selectedTactic !== null) {
        FS.modals.showConfirm('Tactic verwijderen?', (ok) => {
          if (ok) {
            s.campaigns[ci].segs[s.selectedFlight].tac.splice(s.selectedTactic, 1);
            const fiKept = s.selectedFlight;
            s.selectedTactic = null;
            document.getElementById('modal').classList.remove('wide');
            FS.modals.checkCampBudget(ci, () => FS.modals.showFlightModal(ci, fiKept));
          }
        }, '🗑️');
        return;
      }
      if (id === 'mFdup' && s.selectedFlight !== null) {
        const copy = JSON.parse(JSON.stringify(s.campaigns[ci].segs[s.selectedFlight]));
        copy.finance = { poNumbers: [], entries: [] };
        s.campaigns[ci].segs.push(copy);
        FS.modals.checkCampBudget(ci, () => FS.modals.showCampModal(ci));
        return;
      }
      if ((id === 'mFshiftL1' || id === 'mFshiftL4' || id === 'mFshiftR1' || id === 'mFshiftR4')
          && s.selectedFlight !== null) {
        const w = id === 'mFshiftL1' ? -1 : id === 'mFshiftL4' ? -4 : id === 'mFshiftR1' ? 1 : 4;
        const f = s.campaigns[ci].segs[s.selectedFlight];
        f.sd = shiftDate(f.sd, w);
        f.ed = shiftDate(f.ed, w);
        if (f.tac) f.tac.forEach((t) => {
          t.sd = shiftDate(t.sd, w);
          t.ed = shiftDate(t.ed, w);
        });
        FS.modals.showFlightModal(ci, s.selectedFlight);
        return;
      }
      if (id === 'mCdup') {
        const copy = JSON.parse(JSON.stringify(s.campaigns[ci]));
        copy.id = s.nextId++;
        copy.label += ' (kopie)';
        copy.col = C.PALETTE[(ci + 4) % C.PALETTE.length];
        (copy.segs || []).forEach((flight) => { flight.finance = { poNumbers: [], entries: [] }; });
        s.campaigns.splice(ci + 1, 0, copy);
        FS.modals.closeModal();
        return;
      }
      if (id === 'mCup') {
        if (ci > 0 && s.campaigns[ci].sec === s.campaigns[ci - 1].sec) {
          [s.campaigns[ci - 1], s.campaigns[ci]] = [s.campaigns[ci], s.campaigns[ci - 1]];
          FS.modals.showCampModal(ci - 1);
        }
        return;
      }
      if (id === 'mCdn') {
        if (ci < s.campaigns.length - 1 && s.campaigns[ci].sec === s.campaigns[ci + 1].sec) {
          [s.campaigns[ci], s.campaigns[ci + 1]] = [s.campaigns[ci + 1], s.campaigns[ci]];
          FS.modals.showCampModal(ci + 1);
        }
      }
    });

    /* ----- Modal body: typing in text inputs -----
     * `input` event = live typing. We werken state bij + nav-titel +
     * render Gantt/summary. We raken het input-element niet aan, dus
     * cursor blijft staan. */
    modalBody.addEventListener('input', (e) => {
      const ci = findCampaignIndex(FS.state.selectedCamp);
      if (ci < 0) return;
      const el = e.target;
      const s = FS.state;
      if (modalSelectionLocked(s, ci)) return;

      if (el.id === 'mCname') {
        s.campaigns[ci].label = el.value;
        updateNavText(`<strong>${FS.utils.escapeHtml(el.value)}</strong>`
          + `<span style="opacity:.5;margin-left:8px;font-size:9px">${s.campaigns[ci].segs.length} flights</span>`);
        FS.render.render();
        return;
      }
      if (el.id === 'mFname' && s.selectedFlight !== null) {
        s.campaigns[ci].segs[s.selectedFlight].n = el.value;
        const camp = s.campaigns[ci];
        updateNavText(`<span class="mnav-back" id="mBack">← ${FS.utils.escapeHtml(camp.label)}</span>`
          + `<span style="opacity:.4;margin:0 6px">›</span>`
          + `<strong>✈️ ${FS.utils.escapeHtml(el.value || `Flight ${s.selectedFlight + 1}`)}</strong>`);
        FS.render.render();
        return;
      }
      if (el.id === 'mTname' && s.selectedTactic !== null) {
        const t = s.campaigns[ci].segs[s.selectedFlight].tac[s.selectedTactic];
        t.n = el.value;
        const f = s.campaigns[ci].segs[s.selectedFlight];
        updateNavText(`<span class="mnav-back" id="mBack">← ${FS.utils.escapeHtml(f.n || 'Flight')}</span>`
          + `<span style="opacity:.4;margin:0 6px">›</span>`
          + `<strong>${FS.utils.escapeHtml(el.value || `Tactic ${s.selectedTactic + 1}`)}</strong>`);
        FS.render.render();
        return;
      }
      if (el.id === 'mTnt' && s.selectedTactic !== null) {
        s.campaigns[ci].segs[s.selectedFlight].tac[s.selectedTactic].nt = el.value;
        FS.io.autoSave();
      }
    });

    /* ----- Modal body: change (numeric, dates, status, etc.) ----- */
    modalBody.addEventListener('change', (e) => {
      const ci = findCampaignIndex(FS.state.selectedCamp);
      if (ci < 0) return;
      const el = e.target;
      const s = FS.state;
      if (modalSelectionLocked(s, ci)) return;

      if (el.classList.contains('chv')) {
        if (s.selectedFlight === null || s.selectedTactic === null) return;
        const t = s.campaigns[ci].segs[s.selectedFlight].tac[s.selectedTactic];
        if (!t.ch) t.ch = {};
        const v = parseFloat(el.value) || 0;
        t.ch[el.dataset.ch] = v;
        if (!v) delete t.ch[el.dataset.ch];
        // Tactic-budget is afgeleid van de som van de kanaalbudgetten.
        t.b = FS.calc.channelSum(t.ch);
        FS.modals.checkCampBudget(ci, () => FS.modals.showTacticModal(ci, s.selectedFlight, s.selectedTactic));
        return;
      }
      if (el.classList.contains('metv')) {
        if (s.selectedFlight === null || s.selectedTactic === null) return;
        const t = s.campaigns[ci].segs[s.selectedFlight].tac[s.selectedTactic];
        if (!t.met) t.met = {};
        if (!t.met[el.dataset.ch]) t.met[el.dataset.ch] = {};
        t.met[el.dataset.ch][el.dataset.mk] = el.value;
        FS.io.autoSave();
        return;
      }
      if (el.classList.contains('bpv')) {
        if (s.selectedFlight === null || s.selectedTactic === null) return;
        const t = s.campaigns[ci].segs[s.selectedFlight].tac[s.selectedTactic];
        if (!t.bp) t.bp = {};
        if (el.value) t.bp[el.dataset.ch] = el.value; else delete t.bp[el.dataset.ch];
        FS.io.autoSave();
        return;
      }
      if (el.id === 'mTchannel') {
        if (s.selectedFlight === null || s.selectedTactic === null) return;
        const t = s.campaigns[ci].segs[s.selectedFlight].tac[s.selectedTactic];
        const oldCh = Object.keys(t.ch || {})[0] || '';
        const budget = oldCh ? (t.ch[oldCh] || 0) : 0;
        const newCh = el.value;
        // Kanaal wisselen: budget behouden, oude kanaalgegevens (metrics/protocol) opruimen.
        if (oldCh && oldCh !== newCh) {
          if (t.met) delete t.met[oldCh];
          if (t.bp) delete t.bp[oldCh];
        }
        t.ch = {};
        if (newCh) t.ch[newCh] = budget;
        t.b = FS.calc.channelSum(t.ch);
        FS.modals.checkCampBudget(ci, () => FS.modals.showTacticModal(ci, s.selectedFlight, s.selectedTactic));
        return;
      }
      if (el.id === 'mTchbudget') {
        if (s.selectedFlight === null || s.selectedTactic === null) return;
        const t = s.campaigns[ci].segs[s.selectedFlight].tac[s.selectedTactic];
        const selCh = Object.keys(t.ch || {})[0] || '';
        if (!selCh) return;
        t.ch[selCh] = parseFloat(el.value) || 0;
        t.b = FS.calc.channelSum(t.ch);
        FS.modals.checkCampBudget(ci, () => FS.modals.showTacticModal(ci, s.selectedFlight, s.selectedTactic));
        return;
      }

      if (el.id === 'mCname') {
        s.campaigns[ci].label = el.value.trim() || s.campaigns[ci].label;
        FS.modals.showCampModal(ci);
        return;
      }
      if (el.id === 'mCsec') {
        s.campaigns[ci].sec = el.value;
        s.campaigns.sort((aa, bb) =>
          aa.sec === 'losse' && bb.sec === 'ao' ? -1
          : aa.sec === 'ao' && bb.sec === 'losse' ? 1 : 0);
        FS.modals.showCampModal(findCampaignIndex(s.selectedCamp));
        return;
      }
      if (el.id === 'mCbudget') {
        s.campaigns[ci].budget = parseFloat(el.value) || 0;
        FS.modals.checkCampBudget(ci, () => FS.modals.showCampModal(ci));
        return;
      }
      if (el.id === 'mCfeeChannel') {
        if (el.value) s.campaigns[ci].feePlaceholderChannel = el.value;
        else delete s.campaigns[ci].feePlaceholderChannel;
        FS.modals.showCampModal(ci);
        return;
      }
      if (el.matches && el.matches('#mCfunnels input[data-fn]')) {
        const camp = s.campaigns[ci];
        if (!Array.isArray(camp.funnels)) camp.funnels = [];
        const id = el.dataset.fn;
        if (el.checked) { if (!camp.funnels.includes(id)) camp.funnels.push(id); }
        else camp.funnels = camp.funnels.filter((x) => x !== id);
        FS.modals.clampFunnelHierarchy(camp);
        FS.modals.showCampModal(ci);
        return;
      }
      if (el.matches && el.matches('#mFfunnels input[data-fn]') && s.selectedFlight !== null) {
        const camp = s.campaigns[ci];
        const f = camp.segs[s.selectedFlight];
        if (!Array.isArray(f.funnels)) f.funnels = [];
        const id = el.dataset.fn;
        if (el.checked) { if (!f.funnels.includes(id)) f.funnels.push(id); }
        else f.funnels = f.funnels.filter((x) => x !== id);
        FS.modals.clampFunnelHierarchy(camp);
        FS.modals.showFlightModal(ci, s.selectedFlight);
        return;
      }
      if (el.id === 'mTfunnel' && s.selectedFlight !== null && s.selectedTactic !== null) {
        s.campaigns[ci].segs[s.selectedFlight].tac[s.selectedTactic].funnel = el.value;
        FS.io.autoSave();
        FS.render.render();
        return;
      }

      if (s.selectedFlight !== null) {
        const f = s.campaigns[ci].segs[s.selectedFlight];
        const fi = s.selectedFlight;
        const re = () => FS.modals.showFlightModal(ci, fi);
        if (el.id === 'mFname') { f.n = el.value; re(); return; }
        if (el.id === 'mFst') { f.st = el.value; re(); return; }
        if (el.id === 'mFsd') {
          const prevSd = f.sd; const prevEd = f.ed;
          f.sd = el.value;
          FS.modals.clampFlightTactics(ci, fi, prevSd, prevEd, re);
          return;
        }
        if (el.id === 'mFed') {
          const prevSd = f.sd; const prevEd = f.ed;
          f.ed = el.value;
          if (f.ed < f.sd) f.ed = f.sd;
          FS.modals.clampFlightTactics(ci, fi, prevSd, prevEd, re);
          return;
        }
        if (el.id === 'mFsw') {
          const wk = parseInt(el.value, 10);
          if (wk >= 1 && wk <= 53) {
            const prevSd = f.sd; const prevEd = f.ed;
            f.sd = weekToDate(wk);
            FS.modals.clampFlightTactics(ci, fi, prevSd, prevEd, re);
          }
          return;
        }
        if (el.id === 'mFew') {
          const wk = parseInt(el.value, 10);
          if (wk >= 1 && wk <= 53) {
            const prevSd = f.sd; const prevEd = f.ed;
            f.ed = weekToDate(wk);
            if (f.ed < f.sd) f.ed = f.sd;
            FS.modals.clampFlightTactics(ci, fi, prevSd, prevEd, re);
          }
          return;
        }
        if (el.id === 'mFb') { f.b = parseFloat(el.value) || 0; FS.modals.checkCampBudget(ci, re); return; }
        if (el.id === 'mFfeeChannel') {
          if (el.value) f.feePlaceholderChannel = el.value;
          else delete f.feePlaceholderChannel;
          re();
          return;
        }
        if (el.id === 'mFcb') { f.cb = parseFloat(el.value) || 0; re(); return; }
        if (el.id === 'mFtc') { f.tc = parseFloat(el.value) || 0; re(); return; }
        if (el.id === 'mFub') { f.ub = parseFloat(el.value) || 0; re(); return; }
        if (el.id === 'mFpot') { if (el.value) f.pot = el.value; else delete f.pot; re(); return; }
        if (el.id === 'mFaudG') { if (!f.audience) f.audience = { gender: 'b', ageMin: 18, ageMax: 65 }; f.audience.gender = el.value; re(); return; }
        if (el.id === 'mFaudMin') {
          if (!f.audience) f.audience = { gender: 'b', ageMin: 18, ageMax: 65 };
          const v = parseInt(el.value, 10);
          f.audience.ageMin = Number.isFinite(v) ? v : null;
          re();
          return;
        }
        if (el.id === 'mFaudMax') {
          if (!f.audience) f.audience = { gender: 'b', ageMin: 18, ageMax: 65 };
          const v = parseInt(el.value, 10);
          f.audience.ageMax = Number.isFinite(v) ? v : null;
          re();
          return;
        }
      }

      if (s.selectedTactic !== null && s.selectedFlight !== null) {
        const t = s.campaigns[ci].segs[s.selectedFlight].tac[s.selectedTactic];
        const fl = s.campaigns[ci].segs[s.selectedFlight];
        const re = () => FS.modals.showTacticModal(ci, s.selectedFlight, s.selectedTactic);
        if (el.id === 'mTname') { t.n = el.value; re(); return; }
        if (el.id === 'mTsd') {
          t.sd = el.value;
          if (t.sd < fl.sd) t.sd = fl.sd;
          if (t.sd > fl.ed) t.sd = fl.ed;
          re();
          return;
        }
        if (el.id === 'mTed') {
          t.ed = el.value;
          if (t.ed < t.sd) t.ed = t.sd;
          if (t.ed > fl.ed) t.ed = fl.ed;
          re();
          return;
        }
        if (el.id === 'mTsw') {
          const wk = parseInt(el.value, 10);
          if (wk >= 1 && wk <= 53) { t.sd = weekToDate(wk); if (t.sd < fl.sd) t.sd = fl.sd; re(); }
          return;
        }
        if (el.id === 'mTew') {
          const wk = parseInt(el.value, 10);
          if (wk >= 1 && wk <= 53) { t.ed = weekToDate(wk); if (t.ed < t.sd) t.ed = t.sd; if (t.ed > fl.ed) t.ed = fl.ed; re(); }
          return;
        }
        // mTb is readonly — wordt automatisch berekend uit de kanaalbudgetten.
        if (el.id === 'mTact') {
          if (el.value.trim() === '') delete t.actual;
          else t.actual = Math.max(0, parseFloat(el.value) || 0);
          delete t.actualAuto;
          re();
          return;
        }
        if (el.id === 'mTnt') { t.nt = el.value; FS.io.autoSave(); }
      }
    });

    /* ----- Settings body ----- */
    function getJournal(key) {
      if (key === 'bj') return FS.state.budgetJournal;
      if (key === 'cj') return FS.state.creatieJournal;
      if (key === 'tj') return FS.state.toolingJournal;
      if (key === 'uj') return FS.state.urenJournal;
      return null;
    }
    function ensureComm() {
      if (!FS.state.settings) FS.state.settings = FS.state.defaultSettings();
      if (!FS.state.settings.comm) FS.state.settings.comm = FS.state.defaultSettings().comm;
      return FS.state.settings.comm;
    }
    function ensurePots() {
      if (!FS.state.settings) FS.state.settings = FS.state.defaultSettings();
      if (!FS.state.settings.pots) FS.state.settings.pots = { enabled: false, list: [] };
      if (!Array.isArray(FS.state.settings.pots.list)) FS.state.settings.pots.list = [];
      return FS.state.settings.pots;
    }
    function ensureFeeTiers() {
      if (!FS.state.feeTiers || typeof FS.state.feeTiers !== 'object') {
        FS.state.feeTiers = FS.state.defaultFeeTiers();
      }
      if (!Array.isArray(FS.state.feeTiers.tiers)) FS.state.feeTiers.tiers = [];
      if (!FS.state.feeTiers.cap) FS.state.feeTiers.cap = { enabled: false, above: 0, kind: 'amount', value: 0 };
      return FS.state.feeTiers;
    }
    function findFeeTier(id) {
      return ensureFeeTiers().tiers.find((tier) => tier.id === id);
    }
    function sortFeeTiers() {
      ensureFeeTiers().tiers.sort((left, right) => {
        const a = Number(left.upTo); const b = Number(right.upTo);
        const av = Number.isFinite(a) && a > 0 ? a : Number.MAX_VALUE;
        const bv = Number.isFinite(b) && b > 0 ? b : Number.MAX_VALUE;
        return av - bv;
      });
    }
    function afterSettChange() {
      FS.calc.calcJaar();
      FS.modals.renderSettings();
      FS.render.render();
    }
    function afterFeeTierChange() {
      sortFeeTiers();
      afterSettChange();
      warnFeeTierChange();
    }

    const settBody = document.getElementById('settBody');
    settBody.addEventListener('change', (e) => {
      const el = e.target;
      if (el.id === 'sjBase') {
        FS.state.budgetJournal.base = parseFloat(el.value) || 0;
        afterSettChange();
        return;
      }
      if (el.classList.contains('sjm-a')) {
        const obj = getJournal(el.dataset.j);
        if (obj) {
          obj.mods[parseInt(el.dataset.i, 10)].a = parseFloat(el.value) || 0;
          afterSettChange();
        }
        return;
      }
      if (el.classList.contains('sjm-n')) {
        const obj = getJournal(el.dataset.j);
        if (obj) {
          obj.mods[parseInt(el.dataset.i, 10)].n = el.value;
          FS.io.autoSave();
        }
        return;
      }
      if (el.classList.contains('fn-color')) {
        const i = parseInt(el.dataset.i, 10);
        if (FS.state.funnelStages[i]) { FS.state.funnelStages[i].color = el.value; afterSettChange(); }
        return;
      }
      if (el.classList.contains('fn-name')) {
        const i = parseInt(el.dataset.i, 10);
        if (FS.state.funnelStages[i]) { FS.state.funnelStages[i].name = el.value; afterSettChange(); }
        return;
      }
      if (el.classList.contains('pot-name')) {
        const pots = ensurePots();
        const i = parseInt(el.dataset.i, 10);
        if (pots.list[i]) { pots.list[i].name = el.value; FS.io.autoSave(); }
        return;
      }
      if (el.classList.contains('sf-in')) {
        const ch = el.dataset.ch;
        const v = parseFloat(el.value);
        if (isNaN(v) || v <= 0) delete FS.state.fees[ch];
        else FS.state.fees[ch] = v / 100;
        afterSettChange();
        warnFeeChange(ch);
        return;
      }
      if (el.classList.contains('ft-up-to')) {
        const tier = findFeeTier(el.dataset.id);
        if (tier) tier.upTo = el.value.trim() === '' ? null : Number(el.value);
        afterFeeTierChange();
        return;
      }
      if (el.classList.contains('ft-rate')) {
        const tier = findFeeTier(el.dataset.id);
        if (tier) tier.rate = el.value.trim() === '' ? null : Number(el.value) / 100;
        afterFeeTierChange();
        return;
      }
      if (el.classList.contains('ft-ch-rate')) {
        const tier = findFeeTier(el.dataset.id);
        if (tier) {
          if (!tier.channelRates) tier.channelRates = {};
          if (el.value.trim() === '') delete tier.channelRates[el.dataset.ch];
          else tier.channelRates[el.dataset.ch] = Number(el.value) / 100;
        }
        afterFeeTierChange();
        return;
      }
      if (el.id === 'feeCapAbove') {
        const cap = ensureFeeTiers().cap;
        cap.above = el.value.trim() === '' ? null : Number(el.value);
        afterFeeTierChange();
        return;
      }
      if (el.id === 'feeCapKind') {
        const cap = ensureFeeTiers().cap;
        cap.kind = el.value === 'rate' ? 'rate' : 'amount';
        cap.value = 0;
        afterFeeTierChange();
        return;
      }
      if (el.id === 'feeCapValue') {
        const cap = ensureFeeTiers().cap;
        cap.value = el.value.trim() === '' ? null : (cap.kind === 'rate' ? Number(el.value) / 100 : Number(el.value));
        afterFeeTierChange();
        return;
      }

      /* ----- Communicatie naar klant (incl./excl. CTC + BTW) ----- */
      const comm = ensureComm();
      if (el.id === 'cmInclCtc') {
        comm.inclCtc = el.checked;
        if (el.checked) comm.exclCtc = false; // wederzijds uitsluitend
        afterSettChange();
        return;
      }
      if (el.id === 'cmExclCtc') {
        comm.exclCtc = el.checked;
        if (el.checked) comm.inclCtc = false; // wederzijds uitsluitend
        afterSettChange();
        return;
      }
      if (el.id === 'cmInclBtw') {
        comm.inclBtw = el.checked;
        afterSettChange();
        return;
      }
      if (el.id === 'cmBtwPct') {
        const v = parseFloat(el.value);
        comm.btwPct = (isNaN(v) || v < 0) ? 0 : v;
        afterSettChange();
        return;
      }
    });

    settBody.addEventListener('click', (e) => {
      const t = e.target;
      const tabBtn = t.closest('.set-tab');
      if (tabBtn) {
        FS.modals.setSettingsTab(tabBtn.dataset.settab);
        FS.modals.renderSettings();
        return;
      }
      if (t.classList.contains('sjm-add')) {
        const obj = getJournal(t.dataset.j);
        if (obj) { obj.mods.push({ a: 0, n: '' }); afterSettChange(); }
        return;
      }
      if (t.classList.contains('sjm-d')) {
        const obj = getJournal(t.dataset.j);
        if (obj) {
          obj.mods.splice(parseInt(t.dataset.i, 10), 1);
          afterSettChange();
        }
        return;
      }
      if (t.classList.contains('fn-add')) {
        FS.state.funnelStages.push({ id: 'st_' + Math.random().toString(36).slice(2, 8), name: 'Nieuwe stap', color: '#64748B', icon: '' });
        afterSettChange();
        return;
      }
      if (t.classList.contains('fn-del')) {
        FS.state.funnelStages.splice(parseInt(t.dataset.i, 10), 1);
        afterSettChange();
        return;
      }
      if (t.classList.contains('fn-mv')) {
        const i = parseInt(t.dataset.i, 10);
        const j = i + (t.classList.contains('fn-up') ? -1 : 1);
        const arr = FS.state.funnelStages;
        if (j >= 0 && j < arr.length) { const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp; afterSettChange(); }
        return;
      }
      if (t.closest('.fee-tier-toggle label')) {
        const switchEl = document.getElementById('feeTiersEnable');
        if (switchEl) switchEl.click();
        return;
      }
      if (t.id === 'feeTiersEnable') {
        const config = ensureFeeTiers();
        config.enabled = !config.enabled;
        if (config.enabled && !config.tiers.length) {
          config.tiers.push({ id: FS.state.newFeeTierId(), upTo: 50000, rate: 0, channelRates: {} });
        }
        afterFeeTierChange();
        return;
      }
      const scopeBtn = t.closest('.fee-scope-btn');
      if (scopeBtn) {
        ensureFeeTiers().scope = scopeBtn.dataset.ftScope === 'flight' ? 'flight' : 'campaign';
        afterFeeTierChange();
        return;
      }
      const channelToggle = t.closest('.ft-ch-toggle');
      if (channelToggle) {
        FS.modals.toggleFeeTierChannels(channelToggle.dataset.id);
        FS.modals.renderSettings();
        return;
      }
      const tierDelete = t.closest('.ft-del');
      if (tierDelete) {
        const config = ensureFeeTiers();
        const index = config.tiers.findIndex((tier) => tier.id === tierDelete.dataset.id);
        if (index >= 0) config.tiers.splice(index, 1);
        FS.modals.forgetFeeTierChannels(tierDelete.dataset.id);
        afterFeeTierChange();
        return;
      }
      if (t.classList.contains('ft-add')) {
        const config = ensureFeeTiers();
        const highest = config.tiers.reduce((max, tier) => Number(tier.upTo) > max ? Number(tier.upTo) : max, 0);
        config.tiers.push({ id: FS.state.newFeeTierId(), upTo: highest > 0 ? highest + 50000 : 50000, rate: 0, channelRates: {} });
        sortFeeTiers();
        afterFeeTierChange();
        return;
      }
      if (t.closest('.fee-cap .ss-toggle label')) {
        const switchEl = document.getElementById('feeCapEnable');
        if (switchEl) switchEl.click();
        return;
      }
      if (t.id === 'feeCapEnable') {
        const cap = ensureFeeTiers().cap;
        cap.enabled = !cap.enabled;
        afterFeeTierChange();
        return;
      }
      if (t.id === 'sjNotifyAct') {
        FS.state.settings = FS.state.settings || {};
        FS.state.settings.notifyActuals = !FS.state.settings.notifyActuals;
        FS.io.autoSave();
        FS.modals.renderSettings();
      }
      if (t.id === 'potEnable') {
        const pots = ensurePots();
        pots.enabled = !pots.enabled;
        FS.io.autoSave();
        FS.modals.renderSettings();
        return;
      }
      if (t.classList.contains('pot-add')) {
        const pots = ensurePots();
        pots.list.push({ id: 'pot_' + Math.random().toString(36).slice(2, 8), name: '' });
        FS.io.autoSave();
        FS.modals.renderSettings();
        return;
      }
      if (t.classList.contains('pot-del')) {
        const pots = ensurePots();
        pots.list.splice(parseInt(t.dataset.i, 10), 1);
        FS.io.autoSave();
        FS.modals.renderSettings();
        return;
      }
      if (t.classList.contains('pot-mv')) {
        const pots = ensurePots();
        const i = parseInt(t.dataset.i, 10);
        const j = i + (t.classList.contains('pot-up') ? -1 : 1);
        if (j >= 0 && j < pots.list.length) {
          const tmp = pots.list[i]; pots.list[i] = pots.list[j]; pots.list[j] = tmp;
          FS.io.autoSave();
          FS.modals.renderSettings();
        }
        return;
      }
      if (t.id === 'audEnable') {
        if (!FS.state.settings) FS.state.settings = FS.state.defaultSettings();
        if (!FS.state.settings.audiences) FS.state.settings.audiences = { enabled: false };
        FS.state.settings.audiences.enabled = !FS.state.settings.audiences.enabled;
        FS.io.autoSave();
        FS.modals.renderSettings();
        return;
      }
    });

    settBody.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && (e.target.id === 'feeTiersEnable' || e.target.id === 'feeCapEnable')) {
        e.preventDefault();
        e.target.click();
        return;
      }
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur();
    });

    /* ----- Summary cards ----- */
    document.getElementById('summaryBar').addEventListener('click', (e) => {
      const card = e.target.closest('.scard');
      if (!card) return;
      if (card.id === 'scJ' || card.id === 'scC' || card.id === 'scT' || card.id === 'scFee') FS.modals.openSett('budget');
    });

    /* ----- Empty-state knoppen ----- */
    document.getElementById('gantt').addEventListener('click', (e) => {
      if (e.target.id === 'empAdd') {
        addCampaign();
        return;
      }
      if (e.target.id === 'empLoad') {
        document.getElementById('FI').click();
        return;
      }
    });

    /* ----- Globale ESC ----- */
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd+Z (undo) en Ctrl+Y / Ctrl+Shift+Z (redo).
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const key = e.key.toLowerCase();
        if ((key === 'c' || key === 'v') && !e.shiftKey) {
          if (isClipboardTarget(e.target)) return;
          if (FS.finance && FS.finance.isActive()) return;
          if (key === 'c' && hasSelectedPageText()) return;
          const handled = key === 'c' ? copySelectedEntity() : pasteCopiedEntity();
          if (handled) e.preventDefault();
          return;
        }
        if (key === 'z' && !e.shiftKey) {
          if (isTypingTarget(e.target)) return;
          e.preventDefault();
          if (FS.history) FS.history.undo();
          return;
        }
        if (key === 'y' || (key === 'z' && e.shiftKey)) {
          if (isTypingTarget(e.target)) return;
          e.preventDefault();
          if (FS.history) FS.history.redo();
          return;
        }
        if (key === 's') {
          if (isTypingTarget(e.target)) return;
          e.preventDefault();
          if (e.shiftKey) {
            FS.io.saveFile();
            if (FS.toast) FS.toast.show('JSON-bestand gedownload', 'success');
          } else {
            FS.io.writeLocal();
            if (FS.toast) FS.toast.show('Opgeslagen in browser', 'success');
          }
          return;
        }
        if (key === 'n') {
          if (isTypingTarget(e.target)) return;
          e.preventDefault();
          addCampaign();
          return;
        }
        if (key === 'e') {
          if (isTypingTarget(e.target)) return;
          e.preventDefault();
          FS.io.exportCSV();
          return;
        }
        if (key === 't') {
          if (isTypingTarget(e.target)) return;
          e.preventDefault();
          if (FS.ganttInteract && FS.ganttInteract.scrollToNow) FS.ganttInteract.scrollToNow();
          return;
        }
      }
      // ? = shortcut hulp
      if (e.key === '?' && !isTypingTarget(e.target)) {
        e.preventDefault();
        toggleShortcutHelp();
        return;
      }
      // Delete / Backspace: bulkselectie of de enkel geselecteerde Gantt-flight.
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isClipboardTarget(e.target)) {
        if (FS.finance && FS.finance.isActive()) return;
        if (bulkSelection.size > 0) {
          e.preventDefault();
          bulkDeleteSelection();
          return;
        }
        if (deleteSelectedFlight()) {
          e.preventDefault();
          return;
        }
      }
      if (e.key !== 'Escape') return;
      // Eerst eventuele bulk-selectie wissen
      if (bulkSelection.size > 0) {
        clearBulkSelection();
        return;
      }
      const helpEl = document.getElementById('shHelp');
      if (helpEl && helpEl.classList.contains('on')) {
        helpEl.classList.remove('on');
        return;
      }
      if (e.key !== 'Escape') return;
      const cfmOpen = document.getElementById('cfmBg').classList.contains('open');
      if (cfmOpen) {
        FS.modals.answerConfirm(false);
        return;
      }
      if (document.getElementById('insBg').classList.contains('open')) {
        FS.insights.close();
        return;
      }
      if (FS.merge && FS.merge.isOpen && FS.merge.isOpen()) {
        FS.merge.closeModal();
        return;
      }
      if (document.getElementById('settBg').classList.contains('open')) {
        FS.modals.closeSett();
        return;
      }
      if (document.getElementById('modalBg').classList.contains('open')) {
        const ci = findCampaignIndex(FS.state.selectedCamp);
        if (ci < 0) { FS.modals.closeModal(); return; }
        if (FS.state.selectedTactic !== null) {
          FS.state.selectedTactic = null;
          document.getElementById('modal').classList.remove('wide');
          FS.modals.showFlightModal(ci, FS.state.selectedFlight);
        } else if (FS.state.selectedFlight !== null) {
          FS.state.selectedFlight = null;
          FS.modals.showCampModal(ci);
        } else {
          FS.modals.closeModal();
        }
      }
    });

    if (FS.io.hasLocal()) document.getElementById('wr').classList.add('sh');
    if (FS.ganttInteract) FS.ganttInteract.init();
    if (FS.finance) FS.finance.init();

    // Vandaag-lijn herpositioneren bij venster-resize
    let nowLineResizeT = null;
    window.addEventListener('resize', () => {
      clearTimeout(nowLineResizeT);
      nowLineResizeT = setTimeout(() => {
        if (FS.render && FS.render.positionNowLine) FS.render.positionNowLine();
      }, 80);
    });

  }

  /** Pas alleen de nav-tekst aan zonder rest van de modal te raken. */
  function updateNavText(html) {
    document.getElementById('modalNav').innerHTML = html;
  }

  /** Verschuif een ISO-datum met N weken (kan negatief). */
  function shiftDate(dateStr, weeks) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + weeks * 7);
    return d.toISOString().substring(0, 10);
  }

  /** Waarschuw als een fee gewijzigd wordt terwijl er al tactics zijn die dit kanaal gebruiken. */
  let feeWarnTimer = null;
  function warnFeeChange(channelId) {
    if (!FS.toast) return;
    let usageCount = 0;
    FS.state.campaigns.forEach((c) => (c.segs || []).forEach((f) => (f.tac || []).forEach((t) => {
      if (t.ch && t.ch[channelId]) usageCount++;
    })));
    if (usageCount === 0) return;
    clearTimeout(feeWarnTimer);
    feeWarnTimer = setTimeout(() => {
      FS.toast.show(`Fee voor kanaal '${channelId}' gewijzigd — ${usageCount} tactic(s) bevatten dit kanaal. Totalen zijn herberekend.`, 'warn', 5500);
    }, 600);
  }

  let feeTierWarnTimer = null;
  function warnFeeTierChange() {
    if (!FS.toast || !FS.state.feeTiers || !FS.state.feeTiers.enabled) return;
    const config = FS.state.feeTiers;
    const scopeCount = config.scope === 'flight'
      ? FS.state.campaigns.reduce((sum, camp) => sum + (camp.segs || []).length, 0)
      : FS.state.campaigns.length;
    if (!scopeCount) return;
    const actualCount = config.scope === 'flight'
      ? FS.state.campaigns.reduce((sum, camp) => sum + (camp.segs || []).filter((flight) => flight.actualized).length, 0)
      : FS.state.campaigns.filter((camp) => (camp.segs || []).some((flight) => flight.actualized)).length;
    clearTimeout(feeTierWarnTimer);
    feeTierWarnTimer = setTimeout(() => {
      const actualNote = actualCount ? `, waaronder ${actualCount} met actuals` : '';
      FS.toast.show(`Fee-staffels gewijzigd — ${scopeCount} ${config.scope === 'flight' ? 'flight(s)' : 'campagne(s)'} herberekend${actualNote}.`, 'warn', 5500);
    }, 600);
  }

  /* ============ Bulk-selectie ============ */
  const bulkSelection = new Set();

  function deleteSelectedFlight() {
    const modalBg = document.getElementById('modalBg');
    if (modalBg && modalBg.classList.contains('open')) return false;

    const s = FS.state;
    if (s.selectedFlight === null || s.selectedTactic !== null) return false;
    const ci = findCampaignIndex(s.selectedCamp);
    if (ci < 0) return false;
    const camp = s.campaigns[ci];
    const fi = s.selectedFlight;
    const flight = camp.segs && camp.segs[fi];
    if (!flight) return false;

    if (camp.locked || flight.actualized) {
      if (FS.toast) FS.toast.show('Ontgrendel de campagne of heropen de flight om deze te verwijderen', 'warn');
      return true;
    }

    // Leg beide kanten synchroon vast: Ctrl+Z werkt ook direct na Delete.
    if (FS.io && FS.io.writeLocal) FS.io.writeLocal();
    else if (FS.history && FS.history.commit) FS.history.commit();

    camp.segs.splice(fi, 1);
    const prefix = `${camp.id}_`;
    const expanded = {};
    Object.keys(s.expandedFlight || {}).forEach((key) => {
      if (!key.startsWith(prefix)) {
        expanded[key] = s.expandedFlight[key];
        return;
      }
      const index = parseInt(key.slice(prefix.length), 10);
      if (index < fi) expanded[key] = s.expandedFlight[key];
      else if (index > fi) expanded[`${prefix}${index - 1}`] = s.expandedFlight[key];
    });
    s.expandedFlight = expanded;
    s.selectedFlight = null;
    s.selectedTactic = null;

    FS.render.render();
    if (FS.io && FS.io.writeLocal) FS.io.writeLocal();
    else if (FS.history && FS.history.commit) FS.history.commit();
    if (FS.toast) FS.toast.show('Flight verwijderd — Ctrl+Z om terug te draaien', 'success');
    return true;
  }

  function bulkKey(bar) {
    const ci = bar.dataset.ci;
    const fi = bar.dataset.fi;
    const ti = bar.dataset.ti;
    if (ti !== undefined) return `${ci}:${fi}:${ti}`;
    if (fi !== undefined) return `${ci}:${fi}`;
    return `${ci}`;
  }

  function toggleBulkSelect(bar) {
    const k = bulkKey(bar);
    if (bulkSelection.has(k)) bulkSelection.delete(k);
    else bulkSelection.add(k);
    refreshBulkUI();
  }

  function clearBulkSelection() {
    bulkSelection.clear();
    refreshBulkUI();
  }

  function refreshBulkUI() {
    document.querySelectorAll('.g-bar.g-bar-sel').forEach((b) => b.classList.remove('g-bar-sel'));
    bulkSelection.forEach((k) => {
      const parts = k.split(':');
      let sel = `.g-bar[data-ci="${parts[0]}"]`;
      if (parts[1] !== undefined) sel += `[data-fi="${parts[1]}"]`;
      if (parts[2] !== undefined) sel += `[data-ti="${parts[2]}"]`;
      document.querySelectorAll(sel).forEach((b) => b.classList.add('g-bar-sel'));
    });

    let bar = document.getElementById('bulkBar');
    if (bulkSelection.size === 0) {
      if (bar) bar.remove();
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'bulkBar';
      bar.className = 'bulk-bar';
      document.body.appendChild(bar);
      bar.addEventListener('click', (ev) => {
        const act = ev.target.dataset && ev.target.dataset.act;
        if (act === 'del') bulkDeleteSelection();
        else if (act === 'clear') clearBulkSelection();
      });
    }
    bar.innerHTML = `<span class="bb-count">${bulkSelection.size} geselecteerd</span>`
      + `<button class="mbtn del" data-act="del">🗑 Verwijder</button>`
      + `<button class="mbtn" data-act="clear">✕ Wis</button>`;
  }

  function bulkDeleteSelection() {
    if (!bulkSelection.size) return;
    FS.modals.showConfirm(
      `<b>${bulkSelection.size}</b> item(s) verwijderen?`,
      () => {
        const items = Array.from(bulkSelection).map((k) => {
          const parts = k.split(':').map((p) => parseInt(p, 10));
          return { ci: parts[0], fi: parts[1], ti: parts[2], depth: parts.length };
        });
        items.sort((a, b) => {
          if (a.depth !== b.depth) return b.depth - a.depth;
          if (a.ci !== b.ci) return b.ci - a.ci;
          if ((a.fi || 0) !== (b.fi || 0)) return (b.fi || 0) - (a.fi || 0);
          return (b.ti || 0) - (a.ti || 0);
        });
        items.forEach((it) => {
          const idx = findCampaignIndex(it.ci);
          if (idx < 0) return;
          if (it.depth === 3) {
            const f = FS.state.campaigns[idx].segs[it.fi];
            if (f && f.tac) f.tac.splice(it.ti, 1);
          } else if (it.depth === 2) {
            FS.state.campaigns[idx].segs.splice(it.fi, 1);
          } else {
            FS.state.campaigns.splice(idx, 1);
          }
        });
        clearBulkSelection();
        FS.calc.calcJaar();
        FS.render.render();
        if (FS.toast) FS.toast.show('Selectie verwijderd', 'success');
      },
      '🗑',
    );
  }

  /* ============ Shortcut-help overlay ============ */
  function toggleShortcutHelp() {
    let el = document.getElementById('shHelp');
    if (el && el.classList.contains('on')) {
      el.classList.remove('on');
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = 'shHelp';
      el.className = 'modal-bg sh-help';
      const rows = [
        ['Ctrl+S', 'Opslaan in browser'],
        ['Ctrl+Shift+S', 'Download JSON-bestand'],
        ['Ctrl+N', 'Nieuwe campagne'],
        ['Ctrl+C', 'Geopende campagne, flight of tactic kopiëren'],
        ['Ctrl+V', 'Gekopieerd onderdeel plakken'],
        ['Ctrl+E', 'Export CSV'],
        ['Ctrl+T', 'Spring naar huidige week'],
        ['Ctrl+Z', 'Ongedaan maken'],
        ['Ctrl+Y of Ctrl+Shift+Z', 'Opnieuw'],
        ['Shift+klik op bar', 'Toevoegen aan selectie'],
        ['Delete of Backspace', 'Verwijder geselecteerde flight / bulkselectie'],
        ['Klik op campagne/flight', 'Selecteren voor kopiëren'],
        ['Dubbelklik op campagne/flight', 'Details openen'],
        ['?', 'Toon dit overzicht'],
        ['Esc', 'Sluit modal / wis selectie'],
      ];
      const kbRow = (k, d) => `<div class="sh-row"><kbd>${k.split('+').join('</kbd>+<kbd>')}</kbd><span>${d}</span></div>`;
      el.innerHTML = '<div class="sh-box">'
        + '<div class="sh-head"><h2>⌨️ Sneltoetsen</h2><button class="mbtn" id="shClose">Sluit</button></div>'
        + '<div class="sh-grid">' + rows.map(([k, d]) => kbRow(k, d)).join('') + '</div></div>';
      document.body.appendChild(el);
      el.addEventListener('click', (ev) => {
        if (ev.target === el || ev.target.id === 'shClose') el.classList.remove('on');
      });
    }
    el.classList.add('on');
  }


  /** Vermijd undo/redo hijacking als gebruiker in een tekstveld typt;
   *  daar moet de browser eigen undo voor de tekst zelf afhandelen. */
  function isTypingTarget(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') {
      const type = (el.type || 'text').toLowerCase();
      return type === 'text' || type === 'search' || type === 'url' || type === 'email' || type === 'tel' || type === 'password';
    }
    return !!el.isContentEditable;
  }

  function isClipboardTarget(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || !!el.isContentEditable;
  }

  function hasSelectedPageText() {
    const selection = window.getSelection && window.getSelection();
    return !!(selection && !selection.isCollapsed && String(selection).trim());
  }
})(window.FS = window.FS || {});
