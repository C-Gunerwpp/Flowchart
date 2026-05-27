/* Flowchart Studio — berekeningen
 * Pure functies over state: budgets, totalen, fees.
 */
(function (FS) {
  'use strict';

  function calcJaar() {
    const s = FS.state;
    let total = s.budgetJournal.base;
    s.budgetJournal.mods.forEach((m) => { total += m.a; });
    s.jaarTotal = total;
    return total;
  }

  function calcCreatie() {
    let total = 0;
    FS.state.creatieJournal.mods.forEach((m) => { total += m.a; });
    return total;
  }

  function calcTooling() {
    let total = 0;
    FS.state.toolingJournal.mods.forEach((m) => { total += m.a; });
    return total;
  }

  function totalCreatieFlights() {
    let total = 0;
    FS.state.campaigns.forEach((c) => c.segs.forEach((f) => { total += f.cb || 0; }));
    return total;
  }

  function totalToolingFlights() {
    let total = 0;
    FS.state.campaigns.forEach((c) => c.segs.forEach((f) => { total += f.tc || 0; }));
    return total;
  }

  function flightBudgetFromTactics(flight) {
    if (!flight.tac || !flight.tac.length) return 0;
    return flight.tac.reduce((a, t) => a + t.b, 0);
  }

  /** Effectief flight-budget (handmatig of berekend uit tactics). */
  function flightBudget(flight) {
    return flight.b > 0 ? flight.b : (flightBudgetFromTactics(flight) || flight.b || 0);
  }

  function campaignFlightSum(camp) {
    return camp.segs.reduce((a, f) => a + flightBudget(f), 0);
  }

  function campaignBudget(camp) {
    return camp.budget > 0 ? camp.budget : campaignFlightSum(camp);
  }

  function grandTotal() {
    return FS.state.campaigns.reduce((a, c) => a + campaignBudget(c), 0);
  }

  function channelSum(channels) {
    let total = 0;
    for (const k in channels) total += channels[k] || 0;
    return total;
  }

  function channelFee(channelId, amount) {
    const rate = FS.state.fees[channelId] || 0;
    return rate > 0 ? amount * (rate / (1 + rate)) : 0;
  }

  function tacticFee(tactic) {
    let total = 0;
    for (const k in tactic.ch) total += channelFee(k, tactic.ch[k]);
    return total;
  }

  function totalFee() {
    let total = 0;
    FS.state.campaigns.forEach((c) =>
      c.segs.forEach((f) =>
        (f.tac || []).forEach((t) => { total += tacticFee(t); }),
      ),
    );
    return total;
  }

  /* ----- Actualisatie-helpers ----- */
  function todayStr() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }
  function flightEnded(flight) {
    if (!flight || !flight.ed) return false;
    // Beschouw de flight pas als "afgelopen" zodra de volledige (ISO-)week
    // van de einddatum voorbij is. Dus zondag (einde ISO-week) van flight.ed
    // moet kleiner zijn dan vandaag.
    const parts = flight.ed.split('-');
    if (parts.length !== 3) return false;
    const ed = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]));
    if (Number.isNaN(ed.getTime())) return false;
    // JS UTC: 0=zo..6=za → ISO dow Mon=1..Sun=7
    const dow = ((ed.getUTCDay() + 6) % 7) + 1;
    ed.setUTCDate(ed.getUTCDate() + (7 - dow));
    const m = String(ed.getUTCMonth() + 1).padStart(2, '0');
    const day = String(ed.getUTCDate()).padStart(2, '0');
    const sunday = `${ed.getUTCFullYear()}-${m}-${day}`;
    return sunday < todayStr();
  }
  /** Flight wacht op actualisatie als hij voorbij is en nog niet ge-actualised is. */
  function flightNeedsActuals(flight) {
    return flightEnded(flight) && !flight.actualized;
  }
  /** Lijst van { camp, flight, ci, fi } voor alle flights die nog actual gemaakt moeten worden. */
  function listNeedActuals() {
    const out = [];
    FS.state.campaigns.forEach((c, ci) => {
      (c.segs || []).forEach((f, fi) => {
        if (flightNeedsActuals(f)) out.push({ camp: c, flight: f, ci, fi });
      });
    });
    return out;
  }

  FS.calc = {
    calcJaar,
    calcCreatie,
    calcTooling,
    totalCreatieFlights,
    totalToolingFlights,
    flightBudgetFromTactics,
    flightBudget,
    campaignFlightSum,
    campaignBudget,
    grandTotal,
    channelSum,
    channelFee,
    tacticFee,
    totalFee,
    flightEnded,
    flightNeedsActuals,
    listNeedActuals,
  };
})(window.FS = window.FS || {});
