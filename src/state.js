/* Flowchart Studio — application state
 * Alle muteerbare toestand staat hier centraal achter `FS.state`.
 */
(function (FS) {
  'use strict';

  const C = FS.constants;

  FS.state = {
    budgetJournal: { base: C.DEFAULT_BASE_BUDGET, mods: [] },
    creatieJournal: { mods: [] },
    toolingJournal: { mods: [] },
    jaarTotal: C.DEFAULT_BASE_BUDGET,
    year: C.DEFAULT_YEAR,
    fees: {},
    campaigns: [],
    nextId: 100,
    client: '',
    expanded: {},         // campaign id -> bool
    expandedFlight: {},   // "cid_fi" -> bool
    selectedCamp: null,
    selectedFlight: null,
    selectedTactic: null,
  };

  FS.state.reset = function reset() {
    const s = FS.state;
    s.budgetJournal = { base: C.DEFAULT_BASE_BUDGET, mods: [] };
    s.creatieJournal = { mods: [] };
    s.toolingJournal = { mods: [] };
    s.jaarTotal = C.DEFAULT_BASE_BUDGET;
    s.year = C.DEFAULT_YEAR;
    s.fees = {};
    s.campaigns = [];
    s.client = '';
    s.expanded = {};
    s.expandedFlight = {};
    s.selectedCamp = null;
    s.selectedFlight = null;
    s.selectedTactic = null;
  };
})(window.FS = window.FS || {});
