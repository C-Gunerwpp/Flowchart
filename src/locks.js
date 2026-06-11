/* Flowchart Studio — Gebruikers-identiteit en bestandsvergrendeling
 * Geen backend; alles werkt via metadata in het JSON-bestand zelf en
 * lokale opslag voor de huidige gebruiker en recent geopende plannen.
 */
(function (FS) {
  'use strict';

  const KEY_USER = 'fs13_user';
  const KEY_RECENT = 'fs13_recent';
  const MAX_RECENT = 8;
  const LOCK_WARN_MINUTES = 30;

  /* ===== User identity ===== */
  function getUserName() {
    try { return localStorage.getItem(KEY_USER) || ''; } catch { return ''; }
  }
  function setUserName(name) {
    try { localStorage.setItem(KEY_USER, name || ''); } catch (_) { /* full storage */ }
    updateUserPill();
  }

  function ensureUserName(cb) {
    const cur = getUserName();
    if (cur) { if (cb) cb(cur); return; }
    promptUserName(cb);
  }

  function promptUserName(cb) {
    const existing = document.getElementById('userAskBg');
    if (existing) existing.remove();
    const wrap = document.createElement('div');
    wrap.id = 'userAskBg';
    wrap.className = 'modal-bg open';
    wrap.style.zIndex = '110';
    wrap.innerHTML = '<div class="cfm-box" style="max-width:440px">'
      + '<div class="cfm-icon">\ud83d\udc4b</div>'
      + '<h3 style="font-size:15px;color:var(--heading);margin:0 0 10px">Welkom bij Flowchart Studio</h3>'
      + '<div class="cfm-msg">Wat is je naam? Dit verschijnt op de plannen die je opslaat, zodat collega\'s zien wie eraan gewerkt heeft.</div>'
      + '<input id="userNameIn" type="text" placeholder="Voornaam Achternaam" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;font-family:inherit;color:var(--text);background:var(--surface-2);font-weight:600;margin-bottom:18px" value="' + escapeAttr(getUserName()) + '">'
      + '<div class="cfm-btns"><button class="mbtn pri" id="userSaveBtn">Onthouden</button></div>'
      + '</div>';
    document.body.appendChild(wrap);
    const input = document.getElementById('userNameIn');
    input.focus();
    input.select();
    function commit() {
      const v = input.value.trim();
      if (!v) { input.focus(); return; }
      setUserName(v);
      wrap.remove();
      if (cb) cb(v);
    }
    document.getElementById('userSaveBtn').onclick = commit;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
  }

  function updateUserPill() {
    const pill = document.getElementById('userPill');
    if (!pill) return;
    const name = getUserName();
    pill.textContent = name ? '\u270f\ufe0f ' + name : '\u270f\ufe0f Naam instellen';
  }

  /* ===== Lock metadata ===== */
  /** Stempel metadata in een te downloaden payload. */
  function stampPayload(payload) {
    payload.meta = payload.meta || {};
    payload.meta.editedBy = getUserName() || 'Onbekend';
    payload.meta.editedAt = new Date().toISOString();
    return payload;
  }

  /** Check een ingeladen JSON op lock-conflict. Roept onProceed aan
   *  zodra het veilig is om door te gaan; toont anders een waarschuwing. */
  function checkLock(parsed, fileName, onProceed) {
    const meta = parsed && parsed.meta;
    const editedAt = meta && meta.editedAt;
    const editedBy = meta && meta.editedBy;
    const me = (getUserName() || '').toLowerCase();
    if (!editedAt || !editedBy || editedBy.toLowerCase() === me) {
      onProceed();
      return;
    }
    const minutesAgo = (Date.now() - new Date(editedAt).getTime()) / 60000;
    if (!isFinite(minutesAgo) || minutesAgo > LOCK_WARN_MINUTES) {
      onProceed();
      return;
    }
    const mins = Math.max(1, Math.round(minutesAgo));
    const msg = `\u26a0\ufe0f <b>${escapeHTML(fileName || 'Dit plan')}</b> is <b>${mins} minuut${mins === 1 ? '' : 'en'}</b> geleden bewerkt door <b>${escapeHTML(editedBy)}</b>.`
      + `<br><br>Mogelijk werkt deze persoon er nog aan. Als je doorgaat en opslaat, kunnen hun wijzigingen overschreven worden.`
      + `<br><br>Eerst even checken bij ${escapeHTML(editedBy.split(' ')[0])}?`;
    if (FS.modals && FS.modals.showConfirm) {
      FS.modals.showConfirm(msg, onProceed, '\u26a0\ufe0f');
    } else {
      if (confirm(msg.replace(/<[^>]+>/g, ''))) onProceed();
    }
  }

  /* ===== Recent files ===== */
  function loadRecent() {
    try { return JSON.parse(localStorage.getItem(KEY_RECENT) || '[]'); } catch { return []; }
  }
  function saveRecent(arr) {
    try { localStorage.setItem(KEY_RECENT, JSON.stringify(arr)); } catch (_) { /* ignore */ }
  }
  function pushRecent(entry) {
    const arr = loadRecent().filter((r) => r.name !== entry.name);
    arr.unshift(entry);
    while (arr.length > MAX_RECENT) arr.pop();
    saveRecent(arr);
    renderRecentList();
  }
  function clearRecent() {
    saveRecent([]);
    renderRecentList();
  }
  function removeRecent(name) {
    saveRecent(loadRecent().filter((r) => r.name !== name));
    renderRecentList();
  }

  function renderRecentList() {
    const host = document.getElementById('recentList');
    if (!host) return;
    const arr = loadRecent();
    if (!arr.length) {
      host.innerHTML = '';
      host.style.display = 'none';
      return;
    }
    host.style.display = '';
    let html = '<div class="rc-head"><span>\ud83d\udd52 Recente plannen</span><button class="rc-clear" id="rcClear" title="Lijst wissen">\u2715</button></div><div class="rc-grid">';
    arr.forEach((r) => {
      const dt = r.ts ? new Date(r.ts).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' }) : '';
      const editor = r.editedBy ? ('\u270f\ufe0f ' + escapeHTML(r.editedBy)) : '';
      html += '<button class="rc-card" data-name="' + escapeAttr(r.name) + '">'
        + '<div class="rc-card-n">' + escapeHTML(r.label || r.name) + '</div>'
        + '<div class="rc-card-m">' + (r.campaigns ? r.campaigns + ' camp. \u00b7 ' : '') + dt + (editor ? ' \u00b7 ' + editor : '') + '</div>'
        + '<span class="rc-card-x" data-rm="' + escapeAttr(r.name) + '" title="Uit lijst verwijderen">\u2715</span>'
        + '</button>';
    });
    html += '</div>';
    host.innerHTML = html;
    document.getElementById('rcClear').onclick = () => {
      if (confirm('Lijst met recente plannen wissen?')) clearRecent();
    };
    host.querySelectorAll('.rc-card').forEach((b) => {
      b.onclick = (e) => {
        if (e.target.classList.contains('rc-card-x')) {
          e.stopPropagation();
          removeRecent(e.target.dataset.rm);
          return;
        }
        // We hebben geen filesysteem-rechten op een eerder pad, dus we
        // openen de file picker met een hint in de subtitel.
        const hint = b.dataset.name;
        if (FS.toast) FS.toast.show('Selecteer "' + hint + '" in het bestandsvenster', 'info', 4500);
        document.getElementById('FI').click();
      };
    });
  }

  /* ===== Active file indicator ===== */
  let activeFile = null; // { name, editedBy, editedAt }
  function setActiveFile(info) {
    activeFile = info || null;
    updateActiveFilePill();
  }
  function getActiveFile() { return activeFile; }
  function updateActiveFilePill() {
    const pill = document.getElementById('activeFilePill');
    if (!pill) return;
    if (!activeFile) {
      pill.style.display = 'none';
      return;
    }
    pill.style.display = '';
    const who = activeFile.editedBy ? ' \u00b7 \u270f\ufe0f ' + activeFile.editedBy : '';
    pill.innerHTML = '\ud83d\udcc4 <b>' + escapeHTML(activeFile.name) + '</b>' + escapeHTML(who);
  }

  /* ===== Helpers ===== */
  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function escapeAttr(s) { return escapeHTML(s); }

  FS.locks = {
    getUserName,
    setUserName,
    ensureUserName,
    promptUserName,
    updateUserPill,
    stampPayload,
    checkLock,
    pushRecent,
    renderRecentList,
    setActiveFile,
    getActiveFile,
    updateActiveFilePill,
  };
})(window.FS = window.FS || {});
