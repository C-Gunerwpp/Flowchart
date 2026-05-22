/* Flowchart Studio — Samenwerking
 * Versie-historie (snapshots), templates, JSON-vergelijking en deel-link.
 * Alle data in localStorage; geen netwerkcommunicatie.
 */
(function (FS) {
  'use strict';

  const VK = 'fs13_versions';
  const TK = 'fs13_templates';
  const MAX_VERSIONS = 20;
  const MAX_URL_BYTES = 30000; // grens voor share-URL voor we waarschuwen

  /* ============ VERSIONS ============ */
  function loadVersions() {
    try { return JSON.parse(localStorage.getItem(VK) || '[]'); } catch { return []; }
  }
  function saveVersions(arr) { localStorage.setItem(VK, JSON.stringify(arr)); }

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
      nextId: s.nextId,
    };
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

  function applyState(data) {
    if (data.year !== undefined) FS.state.year = data.year;
    if (data.client !== undefined) FS.state.client = data.client;
    if (data.campaigns) FS.state.campaigns = JSON.parse(JSON.stringify(data.campaigns));
    if (data.fees) FS.state.fees = JSON.parse(JSON.stringify(data.fees));
    if (data.jaarTotal !== undefined) FS.state.jaarTotal = data.jaarTotal;
    if (data.budgetJournal) FS.state.budgetJournal = JSON.parse(JSON.stringify(data.budgetJournal));
    if (data.creatieJournal) FS.state.creatieJournal = JSON.parse(JSON.stringify(data.creatieJournal));
    if (data.toolingJournal) FS.state.toolingJournal = JSON.parse(JSON.stringify(data.toolingJournal));
    if (data.nextId !== undefined) FS.state.nextId = data.nextId;
    FS.calc.calcJaar();
  }

  function deleteVersion(id) {
    const arr = loadVersions().filter((v) => v.id !== id);
    saveVersions(arr);
    renderCollab();
  }

  /* ============ TEMPLATES ============ */
  function loadTemplates() {
    try { return JSON.parse(localStorage.getItem(TK) || '[]'); } catch { return []; }
  }
  function saveTemplates(arr) { localStorage.setItem(TK, JSON.stringify(arr)); }

  function saveAsTemplate(ci) {
    const camp = FS.state.campaigns[ci];
    if (!camp) return;
    const name = prompt('Templatenaam:', (camp.label || 'Campagne') + ' (template)');
    if (!name) return;
    const arr = loadTemplates();
    arr.push({
      id: 't' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name,
      ts: Date.now(),
      camp: JSON.parse(JSON.stringify(camp)),
    });
    saveTemplates(arr);
    if (FS.toast) FS.toast.show('Template "' + name + '" opgeslagen', 'success');
  }

  function useTemplate(id) {
    const arr = loadTemplates();
    const tpl = arr.find((t) => t.id === id);
    if (!tpl) return;
    const newCamp = JSON.parse(JSON.stringify(tpl.camp));
    newCamp.id = FS.state.nextId++;
    newCamp.label = (newCamp.label || 'Campagne') + ' (uit template)';
    FS.state.campaigns.push(newCamp);
    FS.calc.calcJaar();
    FS.render.render();
    if (FS.toast) FS.toast.show('Campagne toegevoegd vanuit template', 'success');
    closeCollab();
  }

  function deleteTemplate(id) {
    const arr = loadTemplates().filter((t) => t.id !== id);
    saveTemplates(arr);
    renderCollab();
  }

  /* ============ SHARE LINK ============ */
  function buildShareUrl() {
    const data = JSON.stringify(pickState(FS.state));
    const enc = btoa(unescape(encodeURIComponent(data)));
    return location.href.split('#')[0].split('?')[0] + '#s=' + enc;
  }

  function copyShareUrl() {
    const url = buildShareUrl();
    if (url.length > MAX_URL_BYTES) {
      if (FS.toast) FS.toast.show('Planning te groot voor URL (' + Math.round(url.length / 1024) + 'KB). Gebruik JSON-export.', 'warn', 6500);
      return;
    }
    const finish = () => {
      if (FS.toast) FS.toast.show('Deel-link gekopieerd (' + Math.round(url.length / 1024) + 'KB)', 'success');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(finish).catch(() => fallbackCopy(url, finish));
    } else {
      fallbackCopy(url, finish);
    }
  }

  function fallbackCopy(text, cb) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); cb(); } catch (e) {
      if (FS.toast) FS.toast.show('Kopiëren mislukt', 'error');
    }
    ta.remove();
  }

  function loadFromHash() {
    const hash = location.hash || '';
    if (!hash.startsWith('#s=')) return false;
    try {
      const decoded = decodeURIComponent(escape(atob(hash.substring(3))));
      const data = JSON.parse(decoded);
      applyState(data);
      // Schoon URL op zodat refresh de localStorage gebruikt
      history.replaceState(null, '', location.href.split('#')[0]);
      if (FS.toast) FS.toast.show('Gedeelde planning geladen', 'success');
      return true;
    } catch (e) {
      console.error('share decode failed', e);
      if (FS.toast) FS.toast.show('Deel-link kon niet gelezen worden', 'error');
      return false;
    }
  }

  /* ============ COMPARE ============ */
  function pickCompareFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const other = JSON.parse(ev.target.result);
          showCompareResult(pickState(FS.state), other);
        } catch (err) {
          if (FS.toast) FS.toast.show('Kan JSON niet lezen', 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function diffStates(a, b) {
    const lines = [];
    const aCamps = a.campaigns || [];
    const bCamps = b.campaigns || [];
    const keyOf = (c) => c.label || c.n || ('id:' + c.id);
    const budOf = (c) => (c.budget || c.b || 0);
    const aMap = new Map(aCamps.map((c) => [keyOf(c), c]));
    const bMap = new Map(bCamps.map((c) => [keyOf(c), c]));

    const totA = aCamps.reduce((s, c) => s + budOf(c), 0);
    const totB = bCamps.reduce((s, c) => s + budOf(c), 0);

    lines.push({ type: 'header', text:
      `Huidige planning: ${fmtEUR(totA)} (${aCamps.length} campagnes)`
      + ` · Bestand: ${fmtEUR(totB)} (${bCamps.length} campagnes)`
      + ` · Δ ${fmtEUR(totB - totA)}` });

    aMap.forEach((ca, n) => {
      const cb = bMap.get(n);
      if (!cb) {
        lines.push({ type: 'removed', text: `− Niet meer in bestand: "${n}" (${fmtEUR(budOf(ca))})` });
      } else {
        const da = budOf(ca);
        const db = budOf(cb);
        if (da !== db) {
          lines.push({ type: 'changed', text: `~ "${n}": budget ${fmtEUR(da)} → ${fmtEUR(db)} (Δ ${fmtEUR(db - da)})` });
        }
        const sa = (ca.segs || []).length;
        const sb = (cb.segs || []).length;
        if (sa !== sb) {
          lines.push({ type: 'changed', text: `  ↳ "${n}" flights: ${sa} → ${sb}` });
        }
      }
    });
    bMap.forEach((cb, n) => {
      if (!aMap.has(n)) {
        lines.push({ type: 'added', text: `+ Nieuw in bestand: "${n}" (${fmtEUR(budOf(cb))})` });
      }
    });
    return lines;
  }

  function showCompareResult(a, b) {
    const lines = diffStates(a, b);
    const existing = document.getElementById('cmpBg');
    if (existing) existing.remove();
    const wrap = document.createElement('div');
    wrap.id = 'cmpBg';
    wrap.className = 'modal-bg on';
    wrap.style.zIndex = '92';
    let html = '<div class="ins-modal" style="max-width:820px"><div class="ins-head"><h2>\ud83d\udd00 Vergelijking</h2><button class="mbtn" id="cmpClose">Sluit</button></div><div class="cmp-list">';
    if (lines.length === 1) {
      html += '<div class="ins-empty">Geen verschillen gevonden. \u2728</div>';
      html += '<div class="cmp-line cmp-header">' + escapeHTML(lines[0].text) + '</div>';
    } else {
      lines.forEach((l) => {
        html += `<div class="cmp-line cmp-${l.type}">${escapeHTML(l.text)}</div>`;
      });
    }
    html += '</div></div>';
    wrap.innerHTML = html;
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.id === 'cmpClose') wrap.remove();
    });
    document.body.appendChild(wrap);
  }

  /* ============ MAIN MODAL ============ */
  function openCollab() {
    closeCollab();
    const wrap = document.createElement('div');
    wrap.id = 'collabBg';
    wrap.className = 'modal-bg on';
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
    const templates = loadTemplates();

    let html = '<div class="ins-modal" style="max-width:920px">'
      + '<div class="ins-head"><h2>\ud83d\uddc2 Versies & Samenwerking</h2><button class="mbtn" id="cbClose">Sluit</button></div>'
      + '<div class="cb-grid">';

    // ----- Versies -----
    html += '<div class="cb-sec">'
      + '<div class="cb-sec-head"><h3>\ud83d\udcf8 Versie-historie</h3>'
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
    html += '</div>';

    // ----- Templates -----
    html += '<div class="cb-sec">'
      + '<div class="cb-sec-head"><h3>\ud83d\udccb Templates</h3></div>';
    if (!templates.length) {
      html += '<div class="ins-empty">Nog geen templates. Open een campagne en kies "Opslaan als template" om er één te maken.</div>';
    } else {
      html += '<div class="cb-list">';
      templates.forEach((t) => {
        const tot = t.camp.budget || t.camp.b || 0;
        const flights = (t.camp.segs || []).length;
        const dt = new Date(t.ts || 0).toLocaleDateString('nl-NL');
        html += '<div class="cb-item">'
          + `<div class="cb-item-info"><div class="cb-item-n">${escapeHTML(t.name)}</div>`
          + `<div class="cb-item-meta">${flights} flights · ${fmtEUR(tot)} · ${dt}</div></div>`
          + `<div class="cb-item-act">`
          + `<button class="mbtn pri" data-use="${t.id}">+ Gebruik</button>`
          + `<button class="mbtn del" data-tdel="${t.id}" title="Verwijder">\u2715</button>`
          + `</div></div>`;
      });
      html += '</div>';
    }
    html += '</div>';

    // ----- Compare & Share -----
    html += '<div class="cb-sec cb-sec-wide">'
      + '<div class="cb-sec-head"><h3>\ud83d\udd00 Vergelijken & \ud83d\udd17 Delen</h3></div>'
      + '<div class="cb-actions">'
      + '<button class="mbtn" id="cbCmp">\ud83d\udd00 Vergelijk huidige stand met JSON-bestand\u2026</button>'
      + '<button class="mbtn pri" id="cbShare">\ud83d\udd17 Kopieer deel-link</button>'
      + '</div>'
      + '<div class="cb-hint">Snapshots en templates blijven lokaal in je browser (localStorage). De deel-link bevat de hele planning in de URL na <code>#s=</code> — alleen delen met collega\'s die je vertrouwt.</div>'
      + '</div>';

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
    wrap.querySelector('#cbCmp').onclick = pickCompareFile;
    wrap.querySelector('#cbShare').onclick = copyShareUrl;
    wrap.querySelectorAll('[data-rest]').forEach((b) => { b.onclick = () => restoreVersion(b.dataset.rest); });
    wrap.querySelectorAll('[data-vdel]').forEach((b) => { b.onclick = () => deleteVersion(b.dataset.vdel); });
    wrap.querySelectorAll('[data-use]').forEach((b) => { b.onclick = () => useTemplate(b.dataset.use); });
    wrap.querySelectorAll('[data-tdel]').forEach((b) => { b.onclick = () => deleteTemplate(b.dataset.tdel); });
  }

  /* ============ Helpers ============ */
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
    saveAsTemplate,
    loadFromHash,
    copyShareUrl,
  };
})(window.FS = window.FS || {});
