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
      // Budget potjes: klanten die hun budget uit meerdere potjes verdelen.
      // Aan/uit + een lijst met benoembare potjes ({id,name}). Flights kunnen
      // dan per stuk kiezen uit welk potje hun budget komt (flight.pot = id).
      pots: {
        enabled: false,
        list: [],
      },
      // Doelgroepen (target audiences) op flight-niveau: aan/uit. Wanneer aan
      // kun je per flight één doelgroep instellen (geslacht + leeftijdsrange),
      // opgeslagen als flight.audience = {gender, ageMin, ageMax}.
      audiences: {
        enabled: false,
      },
    };
  }

  /** Standaard-funnelmodel. Instelbaar per plan; hier de fallback zodat nieuwe
   *  of oudere bestanden altijd een werkend model hebben. */
  function defaultFunnelStages() {
    return C.FUNNEL_STAGES.map((s) => ({ id: s.id, name: s.name, color: s.color, icon: s.icon || '' }));
  }

  /** Optionele handling-feestaffels. De bestaande `fees` per kanaal blijven
   *  de fallback wanneer deze configuratie uit staat. Percentages worden,
   *  net als `fees`, intern als fractie bewaard (8% = 0.08). */
  function defaultFeeTiers() {
    return {
      enabled: false,
      scope: 'campaign',
      tiers: [],
      cap: { enabled: false, above: 0, kind: 'amount', value: 0 },
    };
  }

  function feeTierId() {
    return 'fee_' + Math.random().toString(36).slice(2, 9);
  }

  function feeTierNumber(value, fallback) {
    if (value === undefined) return fallback;
    if (value === null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  /** Voeg ingelezen staffels samen met veilige defaults. Ongeldige waarden
   *  blijven als 0 zichtbaar in de editor; de calculator negeert zulke regels. */
  function mergeFeeTiers(loaded) {
    const def = defaultFeeTiers();
    const src = loaded && typeof loaded === 'object' ? loaded : {};
    const out = {
      enabled: !!src.enabled,
      scope: src.scope === 'flight' ? 'flight' : 'campaign',
      tiers: [],
      cap: Object.assign({}, def.cap, src.cap && typeof src.cap === 'object' ? src.cap : {}),
    };
    const used = new Set();
    (Array.isArray(src.tiers) ? src.tiers : []).forEach((tier) => {
      const row = tier && typeof tier === 'object' ? tier : {};
      let id = typeof row.id === 'string' && row.id ? row.id : feeTierId();
      while (used.has(id)) id = feeTierId();
      used.add(id);
      const channelRates = {};
      if (row.channelRates && typeof row.channelRates === 'object') {
        Object.keys(row.channelRates).forEach((ch) => {
          channelRates[ch] = feeTierNumber(row.channelRates[ch], null);
        });
      }
      out.tiers.push({
        id,
        upTo: feeTierNumber(row.upTo, null),
        rate: feeTierNumber(row.rate, null),
        channelRates,
      });
    });
    out.tiers.sort((a, b) => {
      const left = Number.isFinite(a.upTo) && a.upTo > 0 ? a.upTo : Number.MAX_VALUE;
      const right = Number.isFinite(b.upTo) && b.upTo > 0 ? b.upTo : Number.MAX_VALUE;
      return left - right;
    });
    out.cap.enabled = !!out.cap.enabled;
    out.cap.above = feeTierNumber(out.cap.above, 0);
    out.cap.kind = out.cap.kind === 'rate' ? 'rate' : 'amount';
    out.cap.value = feeTierNumber(out.cap.value, 0);
    return out;
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
    feeTiers: defaultFeeTiers(),
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
    out.pots = Object.assign({}, def.pots, (loaded && loaded.pots) || {});
    if (!Array.isArray(out.pots.list)) out.pots.list = [];
    out.audiences = Object.assign({}, def.audiences, (loaded && loaded.audiences) || {});
    return out;
  }
  FS.state.mergeSettings = mergeSettings;
  FS.state.defaultFunnelStages = defaultFunnelStages;
  FS.state.defaultFeeTiers = defaultFeeTiers;
  FS.state.mergeFeeTiers = mergeFeeTiers;
  FS.state.newFeeTierId = feeTierId;

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
    s.feeTiers = defaultFeeTiers();
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
