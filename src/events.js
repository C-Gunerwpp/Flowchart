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

    document.getElementById('btnSett').addEventListener('click', FS.modals.openSett);
    document.getElementById('btnUndo').addEventListener('click', () => FS.history && FS.history.undo());
    document.getElementById('btnRedo').addEventListener('click', () => FS.history && FS.history.redo());
    document.getElementById('btnIns').addEventListener('click', () => FS.insights && FS.insights.open());
    document.getElementById('btnCollab').addEventListener('click', () => FS.collab && FS.collab.open());
    document.getElementById('btnZoomIn').addEventListener('click', () => FS.ganttInteract && FS.ganttInteract.zoomIn());
    document.getElementById('btnZoomOut').addEventListener('click', () => FS.ganttInteract && FS.ganttInteract.zoomOut());
    document.getElementById('zoomVal').addEventListener('click', () => FS.ganttInteract && FS.ganttInteract.zoomReset());
    const btnToday = document.getElementById('btnToday');
    if (btnToday) btnToday.addEventListener('click', () => FS.ganttInteract && FS.ganttInteract.scrollToNow());
    document.getElementById('insClose').addEventListener('click', () => FS.insights && FS.insights.close());
    document.getElementById('insBg').addEventListener('click', function (e) {
      if (e.target === this) FS.insights && FS.insights.close();
    });

    document.getElementById('yearIn').addEventListener('change', function () {
      FS.state.year = parseInt(this.value, 10) || C.DEFAULT_YEAR;
      FS.render.render();
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

    /* Legenda: funnel-filter pillen */
    const legendEl = document.getElementById('legend');
    if (legendEl) {
      legendEl.addEventListener('click', (e) => {
        const pill = e.target.closest('.g-funnel-pill');
        if (!pill) return;
        const fs = pill.dataset.fs;
        if (fs === '__all') {
          FS.render.setFunnelAll(true);
          return;
        }
        const on = FS.render.isFunnelVisible(fs);
        FS.render.setFunnelStage(fs, !on);
      });
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
            b: 0, cb: 0, tc: 0, col: '', st: 'concept', nt: '', tac: [],
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
        // Shift-klik = toevoegen aan bulk-selectie i.p.v. modal openen
        if (e.shiftKey) {
          toggleBulkSelect(bar);
          return;
        }
        ttEl.classList.remove('vis');
        clearTimeout(ttTimer);
        const ciB = parseInt(bar.dataset.ci, 10);
        const fiB = bar.dataset.fi !== undefined ? parseInt(bar.dataset.fi, 10) : null;
        const tiB = bar.dataset.ti !== undefined ? parseInt(bar.dataset.ti, 10) : null;
        const idx = findCampaignIndex(ciB);
        if (idx < 0) return;
        if (tiB !== null && fiB !== null) {
          FS.state.expanded[ciB] = true;
          FS.state.expandedFlight[`${ciB}_${fiB}`] = true;
          FS.modals.showTacticModal(idx, fiB, tiB);
        } else if (fiB !== null) {
          FS.state.expanded[ciB] = true;
          FS.modals.showFlightModal(idx, fiB);
        }
        return;
      }

      const label = t.closest('.g-label');
      if (label && !t.closest('.g-toggle')) {
        const row = label.closest('.g-row');
        if (!row) return;
        const ci = parseInt(row.dataset.ci, 10);
        if (isNaN(ci)) return;
        const idx = findCampaignIndex(ci);
        if (idx < 0) return;
        if (row.classList.contains('g-tac')) {
          FS.modals.showTacticModal(idx, parseInt(row.dataset.fi, 10), parseInt(row.dataset.ti, 10));
        } else if (row.classList.contains('g-sub')) {
          FS.modals.showFlightModal(idx, parseInt(row.dataset.fi, 10));
        } else if (row.classList.contains('g-camp')) {
          FS.modals.showCampModal(idx);
        }
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
        h += `<div class="tb">${esc(formatCurrency(FS.calc.flightBudget(f)))}</div>`
          + `<div style="font-weight:600">${esc(f.n || 'Flight')}</div>`
          + `<div style="opacity:.5;font-size:8px">W${dateToWeek(f.sd)} – W${dateToWeek(f.ed)}</div>`;
        if (f.cb) h += `<div style="color:#F9A8D4;font-size:8px;margin-top:3px">🎨 ${esc(formatK(f.cb))}</div>`;
        if (f.tc) h += `<div style="color:#93C5FD;font-size:8px">🔧 ${esc(formatK(f.tc))}</div>`;
      }
      ttEl.innerHTML = h;
      ttEl.classList.add('vis');
      const r = bar.getBoundingClientRect();
      ttEl.style.left = `${Math.min(r.left, window.innerWidth - 330)}px`;
      ttEl.style.top = `${r.bottom + 8}px`;
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
        s.campaigns[ci].segs.push(JSON.parse(JSON.stringify(s.campaigns[ci].segs[s.selectedFlight])));
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
      if (el.id === 'mCfunnel') {
        s.campaigns[ci].funnel = el.value;
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
        if (el.id === 'mFcb') { f.cb = parseFloat(el.value) || 0; re(); return; }
        if (el.id === 'mFtc') { f.tc = parseFloat(el.value) || 0; re(); return; }
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
        if (el.id === 'mTact') { t.actual = parseFloat(el.value) || 0; if (!t.actual) delete t.actual; re(); return; }
        if (el.id === 'mTnt') { t.nt = el.value; FS.io.autoSave(); }
      }
    });

    /* ----- Settings body ----- */
    function getJournal(key) {
      if (key === 'bj') return FS.state.budgetJournal;
      if (key === 'cj') return FS.state.creatieJournal;
      if (key === 'tj') return FS.state.toolingJournal;
      return null;
    }
    function afterSettChange() {
      FS.calc.calcJaar();
      FS.modals.renderSettings();
      FS.render.render();
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
      if (el.classList.contains('sf-in')) {
        const ch = el.dataset.ch;
        const v = parseFloat(el.value);
        if (isNaN(v) || v <= 0) delete FS.state.fees[ch];
        else FS.state.fees[ch] = v / 100;
        afterSettChange();
        warnFeeChange(ch);
      }
    });

    settBody.addEventListener('click', (e) => {
      const t = e.target;
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
      if (t.id === 'sjNotifyAct') {
        FS.state.settings = FS.state.settings || {};
        FS.state.settings.notifyActuals = !FS.state.settings.notifyActuals;
        FS.io.autoSave();
        FS.modals.renderSettings();
      }
    });

    settBody.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur();
    });

    /* ----- Summary cards ----- */
    document.getElementById('summaryBar').addEventListener('click', (e) => {
      const card = e.target.closest('.scard');
      if (!card) return;
      if (card.id === 'addCampBtn') {
        const s = FS.state;
        const newCamp = {
          id: s.nextId++,
          sec: 'losse',
          label: 'Nieuwe campagne',
          col: C.PALETTE[s.campaigns.length % C.PALETTE.length],
          budget: 0,
          segs: [],
        };
        let idx = 0;
        for (let i = 0; i < s.campaigns.length; i++) {
          if (s.campaigns[i].sec === 'ao') { idx = i; break; }
          idx = i + 1;
        }
        s.campaigns.splice(idx, 0, newCamp);
        FS.render.render();
        FS.modals.showCampModal(findCampaignIndex(newCamp.id));
        return;
      }
      if (card.id === 'scJ' || card.id === 'scC' || card.id === 'scT') FS.modals.openSett();
    });

    /* ----- Empty-state knoppen ----- */
    document.getElementById('gantt').addEventListener('click', (e) => {
      if (e.target.id === 'empAdd') {
        document.getElementById('addCampBtn') && document.getElementById('addCampBtn').click();
        return;
      }
      if (e.target.id === 'empLoad') {
        document.getElementById('FI').click();
        return;
      }
      if (e.target.id === 'empTpl') {
        if (FS.collab) FS.collab.open();
      }
    });

    /* ----- Globale ESC ----- */
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd+Z (undo) en Ctrl+Y / Ctrl+Shift+Z (redo).
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const key = e.key.toLowerCase();
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
          const addBtn = document.getElementById('addCampBtn');
          if (addBtn) addBtn.click();
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
      // Delete / Backspace bij actieve bulk-selectie
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isTypingTarget(e.target)) {
        if (bulkSelection.size > 0) {
          e.preventDefault();
          bulkDeleteSelection();
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

  /* ============ Bulk-selectie ============ */
  const bulkSelection = new Set();

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
        ['Ctrl+E', 'Export CSV'],
        ['Ctrl+T', 'Spring naar huidige week'],
        ['Ctrl+Z', 'Ongedaan maken'],
        ['Ctrl+Y of Ctrl+Shift+Z', 'Opnieuw'],
        ['Shift+klik op bar', 'Toevoegen aan selectie'],
        ['Delete', 'Verwijder bulk-selectie'],
        ['Dubbelklik op bar', 'Snelle naam/budget bewerken'],
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
})(window.FS = window.FS || {});
