/* Flowchart Studio — Undo / Redo
 * Snapshot-based history. Wordt gevoed door autosave (writeLocal) zodat
 * elke meaningful state change in de stack belandt. Ctrl+Z / Ctrl+Y
 * (of Ctrl+Shift+Z) navigeren door de stack.
 */
(function (FS) {
  'use strict';

  const MAX = 60;

  const H = {
    past: [],
    future: [],
    suspended: false,
  };

  function snap() {
    const s = FS.state;
    return JSON.stringify({
      bj: s.budgetJournal,
      cj: s.creatieJournal,
      tj: s.toolingJournal,
      D: s.campaigns,
      n: s.nextId,
      fees: s.fees,
      yr: s.year,
      client: s.client,
    });
  }

  function apply(payload) {
    const d = JSON.parse(payload);
    const s = FS.state;
    s.budgetJournal = d.bj;
    s.creatieJournal = d.cj;
    s.toolingJournal = d.tj;
    s.campaigns = d.D;
    s.nextId = d.n;
    s.fees = d.fees;
    s.year = d.yr;
    s.client = d.client || '';
    FS.calc.calcJaar();
  }

  /** Snapshot huidige state. Wordt aangeroepen na writeLocal. */
  function commit() {
    if (H.suspended) return;
    const s = snap();
    if (H.past.length && H.past[H.past.length - 1] === s) return;
    H.past.push(s);
    if (H.past.length > MAX) H.past.shift();
    H.future.length = 0;
    updateButtons();
  }

  /** Reset history (na file load / nieuw / vorige sessie). */
  function reset() {
    H.past = [snap()];
    H.future = [];
    updateButtons();
  }

  function canUndo() { return H.past.length > 1; }
  function canRedo() { return H.future.length > 0; }

  function undo() {
    if (!canUndo()) return false;
    H.suspended = true;
    H.future.push(H.past.pop());
    apply(H.past[H.past.length - 1]);
    H.suspended = false;
    afterRestore('↶ Ongedaan gemaakt');
    return true;
  }

  function redo() {
    if (!canRedo()) return false;
    H.suspended = true;
    const s = H.future.pop();
    H.past.push(s);
    apply(s);
    H.suspended = false;
    afterRestore('↷ Opnieuw uitgevoerd');
    return true;
  }

  function afterRestore(msg) {
    const clientIn = document.getElementById('clientIn');
    const yearIn = document.getElementById('yearIn');
    if (clientIn) clientIn.value = FS.state.client || '';
    if (yearIn) yearIn.value = FS.state.year;
    FS.modals.closeModal();
    FS.modals.closeSett();
    FS.render.render();
    if (FS.io && FS.io.writeLocal) {
      H.suspended = true;
      FS.io.writeLocal();
      H.suspended = false;
    }
    updateButtons();
    if (FS.toast) FS.toast.show(msg, 'info');
  }

  function updateButtons() {
    const u = document.getElementById('btnUndo');
    const r = document.getElementById('btnRedo');
    if (u) u.disabled = !canUndo();
    if (r) r.disabled = !canRedo();
  }

  FS.history = { commit, reset, undo, redo, canUndo, canRedo, updateButtons };
})(window.FS = window.FS || {});
