/* Flowchart Studio — application state
 * Alle muteerbare toestand staat hier centraal achter `FS.state`.
 */
(function (FS) {
  'use strict';

  const C = FS.constants;

  /** Standaard-instellingen. Eén bron van waarheid zodat reset/laden consistent
   *  dezelfde defaults toepassen (incl. communicatie-voorkeuren). */
  function defaultSettings() {
    return {
      notifyActuals: false,
      // Communicatie-basis: bepaalt of de handling fee IN de budgetten zit
      // (CTC) of er bovenop komt (media-budget). Verschilt per klant.
      comm: {
        inclCtc: true,    // budgetten zijn CTC (incl. fee) → fee wordt eraf gehaald
        exclCtc: false,   // budgetten zijn excl. fee → fee komt erbovenop
        inclBtw: false,   // toon bedragen incl. BTW
        btwPct: 21,       // BTW-percentage (instelbaar)
      },
    };
  }

  /** Standaard-funnelmodel. Instelbaar per plan; hier de fallback zodat nieuwe
   *  of oudere bestanden altijd een werkend model hebben. */
  function defaultFunnelStages() {
    return C.FUNNEL_STAGES.map((s) => ({ id: s.id, name: s.name, color: s.color, icon: s.icon || '' }));
  }

  FS.state = {
    budgetJournal: { base: C.DEFAULT_BASE_BUDGET, mods: [] },
    creatieJournal: { mods: [] },
    toolingJournal: { mods: [] },
    urenJournal: { mods: [] },
    funnelStages: defaultFunnelStages(),
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
    settings: defaultSettings(),
    defaultSettings,
  };

  /** Voeg ingeladen instellingen samen met de defaults (incl. geneste `comm`),
   *  zodat oudere bestanden zonder communicatie-voorkeuren correct openen. */
  function mergeSettings(loaded) {
    const def = defaultSettings();
    const out = Object.assign({}, def, loaded || {});
    out.comm = Object.assign({}, def.comm, (loaded && loaded.comm) || {});
    return out;
  }
  FS.state.mergeSettings = mergeSettings;
  FS.state.defaultFunnelStages = defaultFunnelStages;

  FS.state.reset = function reset() {
    const s = FS.state;
    s.budgetJournal = { base: C.DEFAULT_BASE_BUDGET, mods: [] };
    s.creatieJournal = { mods: [] };
    s.toolingJournal = { mods: [] };
    s.urenJournal = { mods: [] };
    s.funnelStages = defaultFunnelStages();
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
    s.settings = defaultSettings();
  };
})(window.FS = window.FS || {});
