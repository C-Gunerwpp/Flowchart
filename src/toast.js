/* Flowchart Studio — Toast notificaties
 * Niet-blokkerende meldingen rechtsonder. Vervangt veel alert()-aanroepen.
 *
 *   FS.toast.show('Opgeslagen', 'success');     // ok | success | info | warn | error
 *   FS.toast.show('Fout: ...', 'error', 6000);  // optionele duur in ms
 */
(function (FS) {
  'use strict';

  const DEFAULT_DURATION = 3000;
  const ICONS = {
    success: '✅',
    ok: '✅',
    info: 'ℹ️',
    warn: '⚠️',
    error: '❌',
  };

  function container() {
    let c = document.getElementById('toastWrap');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toastWrap';
      c.className = 'toast-wrap';
      document.body.appendChild(c);
    }
    return c;
  }

  function show(message, type, duration) {
    const t = document.createElement('div');
    t.className = `toast toast-${type || 'info'}`;
    const icon = ICONS[type] || ICONS.info;
    t.innerHTML = `<span class="toast-ic">${icon}</span><span class="toast-msg"></span>`;
    t.querySelector('.toast-msg').textContent = message;
    container().appendChild(t);

    requestAnimationFrame(() => t.classList.add('vis'));

    const dur = duration == null ? DEFAULT_DURATION : duration;
    setTimeout(() => {
      t.classList.remove('vis');
      setTimeout(() => t.remove(), 260);
    }, dur);

    t.addEventListener('click', () => {
      t.classList.remove('vis');
      setTimeout(() => t.remove(), 260);
    });
  }

  FS.toast = { show };
})(window.FS = window.FS || {});
