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

  function calcUren() {
    let total = 0;
    (FS.state.urenJournal.mods || []).forEach((m) => { total += m.a; });
    return total;
  }

  function totalUrenFlights() {
    let total = 0;
    FS.state.campaigns.forEach((c) => c.segs.forEach((f) => { total += f.ub || 0; }));
    return total;
  }

  function flightBudgetFromTactics(flight) {
    if (!flight.tac || !flight.tac.length) return 0;
    return flight.tac.reduce((a, t) => a + (Number(t.b) || 0), 0);
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

  /* ----- Communicatie-basis (handling fee + BTW) -----
   * Bepaalt of de handling fee IN de campagnebudgetten zit of erbovenop komt.
   * Dit verschilt per klant en bepaalt hoe het budget over alle campagnes en
   * flights wordt weergegeven.
   * - 'incl' (CTC): budgetten zijn cost-to-client → fee zit erin → media = budget − fee
   * - 'excl' (media): budgetten zijn netto media → fee komt erbovenop → CTC = budget + fee
   */
  function feeMode() {
    const comm = (FS.state.settings && FS.state.settings.comm) || {};
    return (comm.exclCtc && !comm.inclCtc) ? 'excl' : 'incl';
  }
  /** BTW-tarief als fractie (0 wanneer "incl. BTW" uit staat). */
  function btwRate() {
    const comm = (FS.state.settings && FS.state.settings.comm) || {};
    if (!comm.inclBtw) return 0;
    return Number.isFinite(comm.btwPct) ? comm.btwPct / 100 : 0.21;
  }
  function btwPctValue() {
    const comm = (FS.state.settings && FS.state.settings.comm) || {};
    return Number.isFinite(comm.btwPct) ? comm.btwPct : 21;
  }

  /** Volledige budgetopbouw over alle campagnes/flights heen, rekening houdend
   *  met de fee-richting (incl./excl. CTC) en optioneel BTW. Altijd actual-leidend:
   *  geactualiseerde flights tellen met hun werkelijk bestede budget, de rest valt
   *  terug op de planning. */
  function budgetBreakdown() {
    const total = grandTotalActual(); // actual-leidend (valt terug op planning)
    const feeInfo = feeBreakdown();
    const fee = feeInfo.total;       // fee-richting volgt feeMode()
    const mode = feeMode();
    const media = mode === 'excl' ? total : total - fee;
    const ctc = mode === 'excl' ? total + fee : total;
    const rate = btwRate();
    const btwAmount = ctc * rate;
    return {
      mode,
      total,
      fee,
      media,
      ctc,
      btwIncluded: rate > 0,
      btwPct: btwPctValue(),
      btwAmount,
      ctcInclBtw: ctc + btwAmount,
      feeStatus: feeInfo.status,
      feeTiersEnabled: feeInfo.enabled,
      feeScope: feeInfo.scope,
      feeBase: feeInfo.baseTotal,
      feeErrors: feeInfo.errors || [],
    };
  }

  /* ----- Effectief (actual-leidend) budget -----
   * Zodra een flight geactualiseerd is, is het werkelijk bestede budget
   * (actualBudget) leidend voor het berekenen van het resterende budget.
   * Het planned budget (flightBudget) blijft bewaard puur ter referentie.
   */
  function flightEffective(flight) {
    if (flight && flight.actualized && flight.actualBudget != null) {
      return flight.actualBudget;
    }
    return flightBudget(flight);
  }

  function campaignEffectiveSum(camp) {
    return camp.segs.reduce((a, f) => a + flightEffective(f), 0);
  }

  function campaignEffective(camp) {
    // Handmatig campagnebudget blijft leidend zolang geen enkele flight
    // geactualiseerd is; zodra er actuals zijn telt de werkelijke besteding.
    const hasActuals = (camp.segs || []).some((f) => f.actualized);
    if (camp.budget > 0 && !hasActuals) return camp.budget;
    return campaignEffectiveSum(camp);
  }

  function grandTotalActual() {
    return FS.state.campaigns.reduce((a, c) => a + campaignEffective(c), 0);
  }

  function channelSum(channels) {
    let total = 0;
    for (const k in channels) total += channels[k] || 0;
    return total;
  }

  function channelFee(channelId, amount) {
    const rate = FS.state.fees[channelId] || 0;
    if (rate <= 0) return 0;
    return feeFromRate(amount, rate);
  }

  /** Zet een percentage om naar een fee volgens de gekozen CTC-richting. */
  function feeFromRate(amount, rate) {
    if (!(amount > 0) || !(rate > 0)) return 0;
    // 'excl' (media-budget): fee komt bovenop → fee = bedrag × rate.
    // 'incl' (CTC-budget): fee zit erin → fee = bedrag × rate/(1+rate).
    return feeMode() === 'excl' ? amount * rate : amount * (rate / (1 + rate));
  }

  function flatTacticFee(tactic) {
    let total = 0;
    for (const k in (tactic.ch || {})) total += channelFee(k, tactic.ch[k]);
    return total;
  }

  function hasOwn(obj, key) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function numericValue(value) {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function validRate(value) {
    const number = numericValue(value);
    return number != null && number >= 0 && number <= 1;
  }

  /** Verdeel een exact aantal centen naar rato van gewichten. De grootste
   *  fracties ontvangen eventuele restcenten, zodat de som exact sluit. */
  function distributeCents(totalCents, weights) {
    const out = weights.map(() => 0);
    if (totalCents <= 0 || !weights.length) return out;
    let totalWeight = weights.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    const safeWeights = totalWeight > 0 ? weights.map((v) => Math.max(0, Number(v) || 0)) : weights.map(() => 1);
    if (totalWeight <= 0) totalWeight = safeWeights.length;
    const fractions = [];
    let used = 0;
    safeWeights.forEach((weight, index) => {
      const raw = totalCents * weight / totalWeight;
      const base = Math.floor(raw);
      out[index] = base;
      used += base;
      fractions.push({ index, fraction: raw - base });
    });
    fractions.sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    for (let i = 0; i < totalCents - used; i++) out[fractions[i % fractions.length].index]++;
    return out;
  }

  /** Pure planning van tactic-actuals binnen een flight. Handmatige actuals
   *  blijven staan; alleen ontbrekende of eerder automatisch verdeelde regels
   *  delen het restant van het flighttotaal. */
  function planFlightActualDistribution(flight, actualTotal) {
    const tactics = (flight && flight.tac) || [];
    const targetCents = Math.max(0, Math.round((Number(actualTotal) || 0) * 100));
    const rows = tactics.map((tactic, index) => {
      const explicit = hasOwn(tactic, 'actual') && !tactic.actualAuto;
      const cents = explicit ? Math.max(0, Math.round((Number(tactic.actual) || 0) * 100)) : 0;
      return { index, tactic, explicit, automatic: !explicit, cents, amount: cents / 100 };
    });
    const explicitCents = rows.reduce((sum, row) => sum + (row.explicit ? row.cents : 0), 0);
    if (explicitCents > targetCents) {
      return {
        ok: false,
        error: 'De handmatig ingevulde tactic-actuals zijn hoger dan het flighttotaal.',
        target: targetCents / 100,
        explicit: explicitCents / 100,
        unassigned: 0,
        rows,
      };
    }
    const automaticRows = rows.filter((row) => row.automatic);
    const remainingCents = targetCents - explicitCents;
    if (automaticRows.length) {
      const allocated = distributeCents(remainingCents, automaticRows.map((row) => Number(row.tactic.b) || channelSum(row.tactic.ch || {})));
      automaticRows.forEach((row, index) => {
        row.cents = allocated[index];
        row.amount = row.cents / 100;
      });
    }
    const assignedCents = rows.reduce((sum, row) => sum + row.cents, 0);
    return {
      ok: true,
      error: '',
      target: targetCents / 100,
      explicit: explicitCents / 100,
      unassigned: Math.max(0, targetCents - assignedCents) / 100,
      rows,
    };
  }

  function applyFlightActualDistribution(flight, actualTotal) {
    const result = planFlightActualDistribution(flight, actualTotal);
    if (!result.ok) return result;
    result.rows.forEach((row) => {
      if (!row.automatic) return;
      row.tactic.actual = row.amount;
      row.tactic.actualAuto = true;
    });
    return result;
  }

  function component(meta, amount, channelId, unassigned) {
    return Object.assign({}, meta, {
      channelId: channelId || '',
      unassigned: !!unassigned,
      amount: Math.max(0, Number(amount) || 0),
    });
  }

  /** Laat componenten exact aansluiten op het officiële scopebudget. */
  function reconcileComponents(amount, rawComponents, remainderMeta) {
    const target = Math.max(0, Number(amount) || 0);
    if (target <= 0) return [];
    const rows = (rawComponents || []).filter((row) => row.amount > 0).map((row) => Object.assign({}, row));
    const rawTotal = rows.reduce((sum, row) => sum + row.amount, 0);
    if (rawTotal > target && rawTotal > 0) {
      const factor = target / rawTotal;
      rows.forEach((row) => { row.amount *= factor; });
    } else if (rawTotal < target) {
      rows.push(component(remainderMeta || {}, target - rawTotal, '', true));
    }
    return rows;
  }

  function plannedTacticComponents(tactic, meta) {
    const channels = tactic.ch || {};
    const rows = [];
    let channelTotal = 0;
    Object.keys(channels).forEach((channelId) => {
      const amount = Math.max(0, Number(channels[channelId]) || 0);
      if (!amount) return;
      channelTotal += amount;
      rows.push(component(meta, amount, channelId, false));
    });
    const tacticAmount = Number(tactic.b) > 0 ? Number(tactic.b) : channelTotal;
    return reconcileComponents(tacticAmount, rows, meta);
  }

  function actualTacticComponents(tactic, amount, meta) {
    const channels = tactic.ch || {};
    const keys = Object.keys(channels).filter((key) => Number(channels[key]) > 0);
    if (!keys.length) return amount > 0 ? [component(meta, amount, '', true)] : [];
    const weights = keys.map((key) => Number(channels[key]) || 0);
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    return keys.map((channelId, index) => component(meta, amount * weights[index] / totalWeight, channelId, false));
  }

  function flightIsActual(flight) {
    return !!(flight && flight.actualized && flight.actualBudget != null);
  }

  function flightMediaAllocation(campIndex, flightIndex) {
    const flight = FS.state.campaigns[campIndex].segs[flightIndex];
    const actual = flightIsActual(flight);
    const amount = actual ? Math.max(0, Number(flight.actualBudget) || 0) : Math.max(0, flightBudget(flight));
    let rows = [];
    (flight.tac || []).forEach((tactic, tacticIndex) => {
      const meta = { campIndex, flightIndex, tacticIndex };
      if (actual) return;
      rows = rows.concat(plannedTacticComponents(tactic, meta));
    });
    if (actual) {
      const distribution = planFlightActualDistribution(flight, amount);
      if (!distribution.ok) {
        return { amount, components: [], status: 'actual', invalid: true, error: distribution.error };
      }
      distribution.rows.forEach((row) => {
        rows = rows.concat(actualTacticComponents(row.tactic, row.amount, {
          campIndex, flightIndex, tacticIndex: row.index,
        }));
      });
    }
    rows = reconcileComponents(amount, rows, { campIndex, flightIndex, tacticIndex: null });
    return { amount, components: rows, status: actual ? 'actual' : 'planned' };
  }

  function campaignMediaAllocation(campIndex) {
    const camp = FS.state.campaigns[campIndex];
    let rows = [];
    let actualCount = 0;
    const errors = [];
    (camp.segs || []).forEach((_flight, flightIndex) => {
      const allocation = flightMediaAllocation(campIndex, flightIndex);
      if (allocation.invalid) errors.push(allocation.error);
      rows = rows.concat(allocation.components);
      if (allocation.status === 'actual') actualCount++;
    });
    const amount = Math.max(0, campaignEffective(camp));
    rows = reconcileComponents(amount, rows, { campIndex, flightIndex: null, tacticIndex: null });
    const count = (camp.segs || []).length;
    const status = actualCount === 0 ? 'planned' : actualCount === count && count > 0 ? 'actual' : 'forecast';
    return { amount, components: rows, status, invalid: errors.length > 0, error: errors[0] || '' };
  }

  function validTiers(config) {
    const source = Array.isArray(config.tiers) ? config.tiers : [];
    const boundaryCounts = {};
    source.forEach((tier) => {
      const boundary = numericValue(tier && tier.upTo);
      if (boundary != null && boundary > 0) boundaryCounts[boundary] = (boundaryCounts[boundary] || 0) + 1;
    });
    return source
      .filter((tier) => numericValue(tier.upTo) != null && Number(tier.upTo) > 0
        && boundaryCounts[Number(tier.upTo)] === 1 && validRate(tier.rate)
        && Object.keys(tier.channelRates || {}).every((channelId) => validRate(tier.channelRates[channelId])))
      .map((tier) => Object.assign({}, tier, { upTo: Number(tier.upTo), rate: Number(tier.rate) }))
      .sort((a, b) => a.upTo - b.upTo);
  }

  function selectTier(config, amount) {
    const tiers = validTiers(config);
    if (!tiers.length) return null;
    return tiers.find((tier) => amount <= tier.upTo) || tiers[tiers.length - 1];
  }

  function rateForComponent(tier, row) {
    const overrides = tier.channelRates && typeof tier.channelRates === 'object' ? tier.channelRates : {};
    if (row.channelId && hasOwn(overrides, row.channelId)) {
      const value = numericValue(overrides[row.channelId]);
      if (validRate(value)) return value;
    }
    return Number(tier.rate) || 0;
  }

  function capForScope(config, amount, rawFee) {
    const cap = config.cap || {};
    const above = numericValue(cap.above);
    const value = numericValue(cap.value);
    if (!cap.enabled || !(above > 0) || !(amount > above) || value == null || value < 0) {
      return { eligible: false, applied: false, amount: null, fee: rawFee };
    }
    const capAmount = cap.kind === 'rate' && validRate(value) ? feeFromRate(amount, value)
      : cap.kind === 'amount' ? value : rawFee;
    const finalFee = Math.min(rawFee, Math.max(0, capAmount));
    return { eligible: true, applied: finalFee < rawFee - 0.000001, amount: capAmount, fee: finalFee };
  }

  function calculateTierScope(config, scopeData) {
    const rows = scopeData.components.map((row) => Object.assign({}, row));
    if (scopeData.invalid) {
      return Object.assign({}, scopeData, {
        tier: null, rawFee: 0, fee: 0,
        cap: { eligible: false, applied: false, amount: null },
        components: [],
      });
    }
    const tier = selectTier(config, scopeData.amount);
    if (!tier) {
      rows.forEach((row) => { row.rate = 0; row.rawFee = 0; row.fee = 0; });
      return Object.assign({}, scopeData, { tier: null, rawFee: 0, fee: 0, cap: { eligible: false, applied: false, amount: null }, components: rows });
    }
    rows.forEach((row) => {
      row.rate = rateForComponent(tier, row);
      row.rawFee = feeFromRate(row.amount, row.rate);
    });
    const rawFee = rows.reduce((sum, row) => sum + row.rawFee, 0);
    const cap = capForScope(config, scopeData.amount, rawFee);
    const finalCents = Math.max(0, Math.round(cap.fee * 100));
    const feeCents = distributeCents(finalCents, rows.map((row) => row.rawFee));
    rows.forEach((row, index) => { row.fee = feeCents[index] / 100; });
    return Object.assign({}, scopeData, {
      tier,
      rawFee,
      fee: finalCents / 100,
      cap: { eligible: cap.eligible, applied: cap.applied, amount: cap.amount },
      components: rows,
    });
  }

  function tierFeeBreakdown(config) {
    const scopes = [];
    if (config.scope === 'flight') {
      FS.state.campaigns.forEach((camp, campIndex) => (camp.segs || []).forEach((_flight, flightIndex) => {
        const allocation = flightMediaAllocation(campIndex, flightIndex);
        scopes.push(calculateTierScope(config, Object.assign({
          id: `${camp.id}:${flightIndex}`,
          campIndex,
          flightIndex,
        }, allocation)));
      }));
    } else {
      FS.state.campaigns.forEach((camp, campIndex) => {
        const allocation = campaignMediaAllocation(campIndex);
        scopes.push(calculateTierScope(config, Object.assign({
          id: String(camp.id),
          campIndex,
          flightIndex: null,
        }, allocation)));
      });
    }
    const components = scopes.reduce((all, scope) => all.concat(scope.components), []);
    const errors = scopes.filter((scope) => scope.invalid).map((scope) => scope.error).filter(Boolean);
    const actualScopes = scopes.filter((scope) => scope.status === 'actual').length;
    const hasForecast = scopes.some((scope) => scope.status === 'forecast');
    const status = scopes.length && actualScopes === scopes.length ? 'actual'
      : actualScopes > 0 || hasForecast ? 'forecast' : 'planned';
    return {
      enabled: true,
      scope: config.scope === 'flight' ? 'flight' : 'campaign',
      status,
      baseTotal: scopes.reduce((sum, scope) => sum + scope.amount, 0),
      total: scopes.reduce((sum, scope) => sum + scope.fee, 0),
      scopes,
      components,
      errors,
    };
  }

  function flatFeeBreakdown() {
    const components = [];
    let total = 0;
    let baseTotal = 0;
    FS.state.campaigns.forEach((camp, campIndex) => (camp.segs || []).forEach((flight, flightIndex) => {
      (flight.tac || []).forEach((tactic, tacticIndex) => {
        Object.keys(tactic.ch || {}).forEach((channelId) => {
          const amount = Math.max(0, Number(tactic.ch[channelId]) || 0);
          if (!amount) return;
          const fee = channelFee(channelId, amount);
          baseTotal += amount;
          total += fee;
          components.push({ campIndex, flightIndex, tacticIndex, channelId, unassigned: false, amount, rate: FS.state.fees[channelId] || 0, rawFee: fee, fee });
        });
      });
    }));
    return { enabled: false, scope: 'flat', status: 'planned', baseTotal, total, scopes: [], components, errors: [] };
  }

  function feeBreakdown() {
    const config = FS.state.feeTiers || (FS.state.defaultFeeTiers && FS.state.defaultFeeTiers()) || { enabled: false };
    return config.enabled ? tierFeeBreakdown(config) : flatFeeBreakdown();
  }

  function feeForTactic(camp, flight, tactic, breakdown) {
    if (!camp || !flight || !tactic) return 0;
    const campIndex = FS.state.campaigns.indexOf(camp);
    const flightIndex = (camp.segs || []).indexOf(flight);
    const tacticIndex = (flight.tac || []).indexOf(tactic);
    if (campIndex < 0 || flightIndex < 0 || tacticIndex < 0) return 0;
    const info = breakdown || feeBreakdown();
    return info.components.reduce((sum, row) => sum + (
      row.campIndex === campIndex && row.flightIndex === flightIndex && row.tacticIndex === tacticIndex ? row.fee : 0
    ), 0);
  }

  function allocationForTactic(camp, flight, tactic, breakdown) {
    if (!camp || !flight || !tactic) return { amount: 0, fee: 0 };
    const campIndex = FS.state.campaigns.indexOf(camp);
    const flightIndex = (camp.segs || []).indexOf(flight);
    const tacticIndex = (flight.tac || []).indexOf(tactic);
    if (campIndex < 0 || flightIndex < 0 || tacticIndex < 0) return { amount: 0, fee: 0 };
    const info = breakdown || feeBreakdown();
    return info.components.reduce((result, row) => {
      if (row.campIndex === campIndex && row.flightIndex === flightIndex && row.tacticIndex === tacticIndex) {
        result.amount += row.amount;
        result.fee += row.fee;
      }
      return result;
    }, { amount: 0, fee: 0 });
  }

  /** Backwards-compatible tactic helper. In staffelmodus is oudercontext nodig
   *  omdat het toepasselijke tarief van het hele campaign/flightbudget afhangt. */
  function tacticFee(tactic, camp, flight) {
    const config = FS.state.feeTiers || {};
    return config.enabled && camp && flight ? feeForTactic(camp, flight, tactic) : flatTacticFee(tactic);
  }

  function totalFee() {
    return feeBreakdown().total;
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
    calcUren,
    totalCreatieFlights,
    totalToolingFlights,
    totalUrenFlights,
    flightBudgetFromTactics,
    flightBudget,
    campaignFlightSum,
    campaignBudget,
    grandTotal,
    feeMode,
    btwRate,
    btwPctValue,
    budgetBreakdown,
    flightEffective,
    campaignEffectiveSum,
    campaignEffective,
    grandTotalActual,
    channelSum,
    feeFromRate,
    channelFee,
    tacticFee,
    feeForTactic,
    allocationForTactic,
    feeBreakdown,
    totalFee,
    planFlightActualDistribution,
    applyFlightActualDistribution,
    flightEnded,
    flightNeedsActuals,
    listNeedActuals,
  };
})(window.FS = window.FS || {});
