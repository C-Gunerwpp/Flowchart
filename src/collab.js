/* Flowchart Studio — Versies
 * Versie-historie (snapshots) lokaal in localStorage.
 */
(function (FS) {
  'use strict';

  const VK = 'fs13_versions';
  const MAX_VERSIONS = 20;

  function loadVersions() {
    try { return JSON.parse(localStorage.getItem(VK) || '[]'); } catch { return []; }
  }
  function saveVersions(arr) { localStorage.setItem(VK, JSON.stringify(arr)); }

  function pickState(s) {
    return {
      year: s.year,
      client: s.client,
      campaigns: s.campaigns,
      fees: s.fees,
      jaarTotal: s.jaarTotal,
      budgetJournal: s.budgetJournal,
      creatieJournal: s.creatieJournal,
      toolingJournal: s.toolingJournal,
      urenJournal: s.urenJournal,
      funnelStages: s.funnelStages,
      nextId: s.nextId,
    };
  }

  function snapshot(label) {
    const arr = loadVersions();
    const lbl = label || ('Snapshot ' + new Date().toLocaleString('nl-NL'));
    const snap = {
      id: 'v' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      label: lbl,
      ts: Date.now(),
      state: JSON.parse(JSON.stringify(FS.state.serialize ? FS.state.serialize() : pickState(FS.state))),
    };
    arr.unshift(snap);
    while (arr.length > MAX_VERSIONS) arr.pop();
    saveVersions(arr);
    if (FS.toast) FS.toast.show('Snapshot opgeslagen: ' + lbl, 'success');
    return snap;
  }

  function applyState(data) {
    if (data.year !== undefined) FS.state.year = data.year;
    if (data.client !== undefined) FS.state.client = data.client;
    if (data.campaigns) FS.state.campaigns = JSON.parse(JSON.stringify(data.campaigns));
    if (data.fees) FS.state.fees = JSON.parse(JSON.stringify(data.fees));
    if (data.jaarTotal !== undefined) FS.state.jaarTotal = data.jaarTotal;
    if (data.budgetJournal) FS.state.budgetJournal = JSON.parse(JSON.stringify(data.budgetJournal));
    if (data.creatieJournal) FS.state.creatieJournal = JSON.parse(JSON.stringify(data.creatieJournal));
    if (data.toolingJournal) FS.state.toolingJournal = JSON.parse(JSON.stringify(data.toolingJournal));
    if (data.urenJournal) FS.state.urenJournal = JSON.parse(JSON.stringify(data.urenJournal));
    if (data.funnelStages) FS.state.funnelStages = JSON.parse(JSON.stringify(data.funnelStages));
    if (data.nextId !== undefined) FS.state.nextId = data.nextId;
    FS.calc.calcJaar();
  }

  function restoreVersion(id) {
    const arr = loadVersions();
    const snap = arr.find((v) => v.id === id);
    if (!snap) return;
    FS.modals.showConfirm(
      'Versie <b>' + escapeHTML(snap.label) + '</b> herstellen?<br><br>De huidige planning wordt overschreven.',
      () => {
        applyState(snap.state);
        if (FS.history) FS.history.reset();
        FS.render.render();
        if (FS.toast) FS.toast.show('Versie hersteld', 'success');
        closeCollab();
      },
      '\u21BA',
    );
  }

  function deleteVersion(id) {
    const arr = loadVersions().filter((v) => v.id !== id);
    saveVersions(arr);
    renderCollab();
  }

  function openCollab() {
    closeCollab();
    const wrap = document.createElement('div');
    wrap.id = 'collabBg';
    wrap.className = 'modal-bg open';
    wrap.style.zIndex = '88';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) closeCollab();
    });
    renderCollab();
  }

  function closeCollab() {
    const w = document.getElementById('collabBg');
    if (w) w.remove();
  }

  function renderCollab() {
    const wrap = document.getElementById('collabBg');
    if (!wrap) return;
    const versions = loadVersions();

    let html = '<div class="ins-modal" style="max-width:760px">'
      + '<div class="ins-head"><h2>\ud83d\udcf8 Versie-historie</h2><button class="mbtn" id="cbClose">Sluit</button></div>'
      + '<div class="cb-grid">';

    html += '<div class="cb-sec cb-sec-wide">'
      + '<div class="cb-sec-head"><h3>Snapshots</h3>'
      + '<button class="mbtn pri" id="cbSnap">+ Nieuwe snapshot</button></div>';
    if (!versions.length) {
      html += '<div class="ins-empty">Nog geen snapshots. Maak er één om later naar deze stand terug te keren.</div>';
    } else {
      html += '<div class="cb-list">';
      versions.forEach((v) => {
        const dt = new Date(v.ts).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' });
        const camps = (v.state.campaigns || []);
        const tot = camps.reduce((s, c) => s + (c.budget || c.b || 0), 0);
        html += '<div class="cb-item">'
          + `<div class="cb-item-info"><div class="cb-item-n">${escapeHTML(v.label)}</div>`
          + `<div class="cb-item-meta">${dt} · ${camps.length} campagnes · ${fmtEUR(tot)}</div></div>`
          + `<div class="cb-item-act">`
          + `<button class="mbtn pri" data-rest="${v.id}">\u21BA Herstel</button>`
          + `<button class="mbtn del" data-vdel="${v.id}" title="Verwijder">\u2715</button>`
          + `</div></div>`;
      });
      html += '</div>';
    }
    html += '<div class="cb-hint">Snapshots blijven lokaal in je browser (localStorage).</div>';
    html += '</div>';

    html += '</div></div>';
    wrap.innerHTML = html;

    wrap.querySelector('#cbClose').onclick = closeCollab;
    wrap.querySelector('#cbSnap').onclick = () => {
      const def = 'Snapshot ' + new Date().toLocaleString('nl-NL');
      const label = prompt('Naam voor snapshot:', def);
      if (label === null) return;
      snapshot(label.trim() || def);
      renderCollab();
    };
    wrap.querySelectorAll('[data-rest]').forEach((b) => { b.onclick = () => restoreVersion(b.dataset.rest); });
    wrap.querySelectorAll('[data-vdel]').forEach((b) => { b.onclick = () => deleteVersion(b.dataset.vdel); });
  }

  function fmtEUR(n) {
    const v = Math.round(n || 0);
    return '\u20AC ' + v.toLocaleString('nl-NL');
  }
  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  FS.collab = {
    open: openCollab,
    close: closeCollab,
    snapshot,
  };
})(window.FS = window.FS || {});
