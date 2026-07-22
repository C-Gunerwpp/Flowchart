/* Flowchart Studio — Finance
 * Facturen, credits en PO/ID-nummers per flight, aangesloten op expliciete actuals.
 */
(function (FS) {
  'use strict';

  const { escapeHtml: esc, escapeAttr: a, formatCurrency2: fC, dateToWeek, today } = FS.utils;
  const expandedFlights = new Set();
  const collapsedCampaigns = new Set();
  let activeView = 'planning';
  let searchQuery = '';
  let statusFilter = 'all';
  let initialized = false;

  function toCents(value) {
    return Math.round((Number(value) || 0) * 100);
  }

  function fromCents(value) {
    return value / 100;
  }

  function ensureFinance(flight) {
    if (!flight.finance || typeof flight.finance !== 'object') {
      flight.finance = { poNumbers: [], entries: [] };
    }
    if (!Array.isArray(flight.finance.poNumbers)) flight.finance.poNumbers = [];
    if (!Array.isArray(flight.finance.entries)) flight.finance.entries = [];
    return flight.finance;
  }

  function poNumbersFor(flight) {
    return ensureFinance(flight).poNumbers;
  }

  function entriesFor(flight) {
    return ensureFinance(flight).entries;
  }

  function invoiceTotal(flight) {
    const cents = entriesFor(flight).reduce((total, entry) => {
      const amount = Math.abs(toCents(entry.amount));
      return total + (entry.type === 'credit' ? -amount : amount);
    }, 0);
    return fromCents(cents);
  }

  function flightSnapshot(campaign, flight, flightIndex) {
    const plannedCents = toCents(FS.calc.flightBudget(flight));
    const actualCents = toCents(FS.calc.flightActual(flight));
    const invoicedCents = toCents(invoiceTotal(flight));
    const differenceCents = actualCents - invoicedCents;
    const actualized = !!flight.actualized && flight.actualBudget != null;
    const finance = ensureFinance(flight);
    const completed = finance.status === 'completed';
    const attention = finance.attention === true;
    let billingState;
    if (!actualized && invoicedCents !== 0) billingState = 'billed-before-actual';
    else if (!actualized && FS.calc.flightEnded(flight)) billingState = 'awaiting-actual';
    else if (!actualized && flight.sd && flight.sd > today()) billingState = 'planned';
    else if (!actualized) billingState = 'running';
    else if (differenceCents > 0) billingState = 'ready';
    else if (differenceCents < 0) billingState = 'over';
    else billingState = 'matched';
    return {
      campaign,
      flight,
      flightIndex,
      planned: fromCents(plannedCents),
      actual: fromCents(actualCents),
      invoiced: fromCents(invoicedCents),
      difference: fromCents(differenceCents),
      actualized,
      entryCount: entriesFor(flight).length,
      poCount: poNumbersFor(flight).filter((po) => String(po.value || '').trim()).length,
      billingState,
      completed,
      attention,
    };
  }

  function campaignSnapshot(campaign) {
    const flights = (campaign.segs || []).map((flight, flightIndex) => flightSnapshot(campaign, flight, flightIndex));
    const totals = flights.reduce((sum, snapshot) => ({
      planned: sum.planned + toCents(snapshot.planned),
      actual: sum.actual + toCents(snapshot.actual),
      invoiced: sum.invoiced + toCents(snapshot.invoiced),
      difference: sum.difference + toCents(snapshot.difference),
    }), { planned: 0, actual: 0, invoiced: 0, difference: 0 });
    const attentionCount = flights.filter((snapshot) => snapshot.attention).length;
    const completedCount = flights.filter((snapshot) => snapshot.completed).length;
    const readyCount = flights.filter((snapshot) => !snapshot.completed && snapshot.billingState === 'ready').length;
    return {
      campaign,
      flights,
      planned: fromCents(totals.planned),
      actual: fromCents(totals.actual),
      invoiced: fromCents(totals.invoiced),
      difference: fromCents(totals.difference),
      attentionCount,
      completedCount,
      readyCount,
      reconciledCount: flights.filter((snapshot) => snapshot.billingState === 'matched').length,
    };
  }

  function allFlightSnapshots() {
    return FS.state.campaigns.flatMap((campaign) => campaignSnapshot(campaign).flights);
  }

  function money(value) {
    return fC(Math.abs(Number(value) || 0));
  }

  function signedMoney(value) {
    const amount = Number(value) || 0;
    if (amount < 0) return `−${money(amount)}`;
    return money(amount);
  }

  function statusLabel(snapshot) {
    if (snapshot.billingState === 'matched') return 'Aansluitend';
    if (snapshot.billingState === 'ready') return 'Klaar om te factureren';
    if (snapshot.billingState === 'over') return 'Te veel gefactureerd';
    if (snapshot.billingState === 'billed-before-actual') return 'Factuur vóór actual';
    if (snapshot.billingState === 'awaiting-actual') return 'Wacht op actual';
    if (snapshot.billingState === 'running') return 'Loopt';
    return 'Gepland';
  }

  function metric(label, value, className, meta) {
    return `<div class="fin-metric ${className || ''}"><span>${esc(label)}</span>`
      + `<strong>${esc(value)}</strong>${meta ? `<small>${esc(meta)}</small>` : ''}</div>`;
  }

  function poOptions(flight, selectedId) {
    const poNumbers = poNumbersFor(flight);
    let options = `<option value="">${poNumbers.length ? '— Geen PO / ID —' : '— Voeg eerst PO / ID toe —'}</option>`;
    poNumbers.forEach((po, index) => {
      const label = String(po.value || '').trim() || `PO / ID ${index + 1}`;
      options += `<option value="${a(po.id)}"${po.id === selectedId ? ' selected' : ''}>${esc(label)}</option>`;
    });
    return options;
  }

  function entryRow(flight, entry) {
    const credit = entry.type === 'credit';
    return `<div class="fin-entry${credit ? ' credit' : ''}" data-entry-id="${a(entry.id)}">`
      + `<label class="fin-entry-field"><span>Type</span><select data-fin-field="type">`
      + `<option value="invoice"${credit ? '' : ' selected'}>Factuur</option>`
      + `<option value="credit"${credit ? ' selected' : ''}>Credit</option></select></label>`
      + `<label class="fin-entry-field"><span>Datum</span><input type="date" data-fin-field="date" value="${a(entry.date || '')}"></label>`
      + `<label class="fin-entry-field"><span>Bedrag</span><span class="fin-money-input"><span class="fin-money-prefix">${credit ? '−€' : '€'}</span>`
      + `<input type="number" data-fin-field="amount" min="0" step="0.01" value="${a(Number(entry.amount) || 0)}"></span></label>`
      + `<label class="fin-entry-field"><span>Factuurnummer</span><input type="text" data-fin-field="number" value="${a(entry.number || '')}" placeholder="Nummer"></label>`
      + `<label class="fin-entry-field"><span>PO / ID</span><select data-fin-field="poId">${poOptions(flight, entry.poId || '')}</select></label>`
      + `<button class="fin-entry-delete" type="button" data-fin-action="delete-entry" title="Boeking verwijderen" aria-label="Boeking verwijderen">✕</button>`
      + `</div>`;
  }

  function poSection(flight) {
    const poNumbers = poNumbersFor(flight);
    const rows = poNumbers.length ? poNumbers.map((po, index) => `<div class="fin-po-row" data-po-id="${a(po.id)}">`
      + `<span class="fin-po-index">${index + 1}</span>`
      + `<input type="text" data-fin-po-value value="${a(po.value || '')}" placeholder="PO- of ID-nummer">`
      + `<button type="button" data-fin-action="delete-po" title="PO / ID verwijderen" aria-label="PO / ID verwijderen">✕</button></div>`).join('')
      : `<div class="fin-po-empty">Nog geen PO- of ID-nummers voor deze flight</div>`;
    return `<section class="fin-po-section"><div class="fin-po-head"><div><h4>PO / ID-nummers</h4>`
      + `<span>Een flight kan één of meerdere nummers hebben.</span></div>`
      + `<button type="button" class="fin-add" data-fin-action="add-po">+ PO / ID</button></div>`
      + `<div class="fin-po-list">${rows}</div></section>`;
  }

  function flightDetails(snapshot) {
    const flight = snapshot.flight;
    const entries = entriesFor(flight);
    const rows = entries.length
      ? entries.map((entry) => entryRow(flight, entry)).join('')
      : `<div class="fin-entry-empty">Nog geen facturen of credits voor deze flight</div>`;
    return `<div class="fin-details">${poSection(flight)}`
      + `<div class="fin-detail-head"><div><h3>Facturen &amp; credits</h3><span>${snapshot.entryCount} ${snapshot.entryCount === 1 ? 'boeking' : 'boekingen'}</span></div>`
      + `<div class="fin-detail-actions">`
      + `<button type="button" class="fin-open-campaign" data-fin-action="open-flight">Flight openen</button>`
      + `<button type="button" class="fin-add invoice" data-fin-action="add-invoice">+ Factuur</button>`
      + `<button type="button" class="fin-add credit" data-fin-action="add-credit">− Credit</button></div></div>`
      + `<div class="fin-entry-list">${rows}</div>`
      + `<div class="fin-detail-total"><span>Gefactureerd na credits</span><strong>${esc(signedMoney(snapshot.invoiced))}</strong></div>`
      + `</div>`;
  }

  function flightCard(snapshot) {
    const flight = snapshot.flight;
    const key = `${snapshot.campaign.id}:${snapshot.flightIndex}`;
    const isOpen = expandedFlights.has(key);
    const diffLabel = snapshot.difference > 0 ? 'Nog te factureren'
      : snapshot.difference < 0 ? 'Te veel gefactureerd' : 'Verschil';
    const period = flight.sd && flight.ed ? `W${dateToWeek(flight.sd)}–W${dateToWeek(flight.ed)}` : 'Geen periode';
    const poLabel = `${snapshot.poCount} PO/ID`;
    const actualMeta = snapshot.actualized ? `Actual${flight.actualizedAt ? ` · ${flight.actualizedAt}` : ''}` : 'Nog niet actual';
    return `<article class="fin-campaign fin-flight status-${snapshot.billingState}${snapshot.completed ? ' is-completed' : ''}${snapshot.attention ? ' is-attention' : ''}" data-camp-id="${a(snapshot.campaign.id)}" data-flight-index="${snapshot.flightIndex}">`
      + `<div class="fin-card-head"><button type="button" class="fin-toggle" data-fin-action="toggle" aria-expanded="${isOpen}">`
      + `<span class="fin-chevron" aria-hidden="true">${isOpen ? '▾' : '▸'}</span>`
      + `<span class="fin-campaign-name"><strong>${esc(flight.n || `Flight ${snapshot.flightIndex + 1}`)}</strong>`
      + `<small>${esc(period)} · ${esc(actualMeta)} · <span data-fin-po-count>${esc(poLabel)}</span> · ${snapshot.entryCount} ${snapshot.entryCount === 1 ? 'boeking' : 'boekingen'}</small></span></button>`
      + `<span class="fin-flight-actions"><span class="fin-status ${snapshot.billingState}">${esc(statusLabel(snapshot))}</span>`
      + `<button type="button" class="fin-attention-toggle${snapshot.attention ? ' on' : ''}" data-fin-action="toggle-attention" aria-pressed="${snapshot.attention}" title="${snapshot.attention ? 'Aandachtsmarkering verwijderen' : 'Markeer deze flight als aandachtspunt'}">`
      + `<span aria-hidden="true">!</span>${snapshot.attention ? 'Vraagt aandacht' : 'Aandacht'}</button>`
      + `<button type="button" class="fin-complete-toggle${snapshot.completed ? ' on' : ''}" data-fin-action="toggle-complete" role="switch" aria-checked="${snapshot.completed}" title="${snapshot.completed ? 'Flight heropenen' : 'Flight markeren als afgerond'}">`
      + `<span aria-hidden="true">${snapshot.completed ? '✓' : '○'}</span>${snapshot.completed ? 'Afgerond' : 'Afronden'}</button></span></div>`
      + `<div class="fin-campaign-metrics">`
      + metric('Planned', money(snapshot.planned), 'planned')
      + metric('Actual', money(snapshot.actual), 'actual', actualMeta)
      + metric('Gefactureerd', signedMoney(snapshot.invoiced), 'invoiced')
      + metric(diffLabel, money(snapshot.difference), snapshot.difference === 0 ? 'matched' : snapshot.difference > 0 ? 'open' : 'over')
      + `</div>${isOpen ? flightDetails(snapshot) : ''}</article>`;
  }

  function matchesSearch(snapshot) {
    if (!searchQuery) return true;
    const poValues = poNumbersFor(snapshot.flight).map((po) => po.value || '').join(' ');
    const invoiceNumbers = entriesFor(snapshot.flight).map((entry) => entry.number || '').join(' ');
    const haystack = `${snapshot.campaign.label || ''} ${snapshot.campaign.brand || ''} ${snapshot.flight.n || ''} ${poValues} ${invoiceNumbers}`
      .toLocaleLowerCase('nl-NL');
    return haystack.includes(searchQuery.toLocaleLowerCase('nl-NL'));
  }

  function matchesStatus(snapshot) {
    if (statusFilter === 'attention') return snapshot.attention;
    if (statusFilter === 'completed') return snapshot.completed;
    return true;
  }

  function campaignMatchesSearch(campaign) {
    if (!searchQuery) return true;
    const haystack = `${campaign.label || ''} ${campaign.brand || ''}`.toLocaleLowerCase('nl-NL');
    return haystack.includes(searchQuery.toLocaleLowerCase('nl-NL'));
  }

  function campaignGroup(campaign) {
    const snapshot = campaignSnapshot(campaign);
    const campaignSearchMatch = campaignMatchesSearch(campaign);
    const visibleFlights = snapshot.flights.filter((flight) => matchesStatus(flight)
      && (campaignSearchMatch || matchesSearch(flight)));
    const showEmptyCampaign = statusFilter === 'all' && !snapshot.flights.length && campaignSearchMatch;
    if (!visibleFlights.length && !showEmptyCampaign) return '';
    const collapsed = collapsedCampaigns.has(campaign.id);
    const brand = campaign.brand ? `${campaign.brand} · ` : '';
    const statusText = snapshot.flights.length
      ? `${snapshot.completedCount}/${snapshot.flights.length} flights afgerond`
        + (snapshot.readyCount ? ` · ${snapshot.readyCount} klaar voor facturatie` : '')
        + (snapshot.attentionCount ? ` · ${snapshot.attentionCount} aandacht` : '')
      : 'Nog geen flights';
    const differenceClass = snapshot.difference === 0 ? 'matched' : snapshot.difference > 0 ? 'open' : 'over';
    return `<section class="fin-campaign-group${collapsed ? ' is-collapsed' : ''}" data-camp-id="${a(campaign.id)}">`
      + `<header class="fin-group-head"><button type="button" class="fin-group-toggle" data-fin-action="toggle-campaign" aria-expanded="${!collapsed}">`
      + `<span class="fin-group-chevron" aria-hidden="true">${collapsed ? '▸' : '▾'}</span>`
      + `<span class="fin-group-dot" style="background:${a(campaign.col || '#64748b')}"></span>`
      + `<span class="fin-group-title"><strong>${esc(campaign.label || 'Naamloze campagne')}</strong><small>${esc(brand + statusText)}</small></span></button>`
      + `<div class="fin-group-actions"><div class="fin-group-summary"><span>Actual <strong>${esc(money(snapshot.actual))}</strong></span>`
      + `<span>Gefactureerd <strong>${esc(signedMoney(snapshot.invoiced))}</strong></span>`
      + `<span class="${differenceClass}">Verschil <strong>${esc(signedMoney(snapshot.difference))}</strong></span>`
      + `</div><button type="button" class="fin-open-campaign" data-fin-action="open-campaign">Campagne openen</button></div></header>`
      + (collapsed ? '' : `<div class="fin-flight-list">${visibleFlights.length ? visibleFlights.map(flightCard).join('')
        : `<div class="fin-no-flights"><span>Voeg eerst een flight toe om te kunnen factureren.</span>`
          + `<button type="button" data-fin-action="add-flight">+ Flight toevoegen</button></div>`}</div>`)
      + `</section>`;
  }

  function renderCampaignList() {
    const list = document.getElementById('finCampaignList');
    if (!list) return;
    const groups = FS.state.campaigns.map(campaignGroup).filter(Boolean);
    list.innerHTML = groups.length
      ? groups.join('')
      : `<div class="fin-empty-filter">Geen flights in deze selectie</div>`;
  }

  function updateTabBadge(snapshots) {
    const badge = document.getElementById('financeTabCount');
    if (!badge) return;
    const count = snapshots.filter((snapshot) => snapshot.attention).length;
    badge.textContent = count ? String(count) : '';
    badge.hidden = count === 0;
    badge.title = count ? `${count} flight${count === 1 ? '' : 's'} vragen aandacht` : 'Geen handmatige aandachtspunten';
  }

  function render() {
    const root = document.getElementById('financeView');
    if (!root) return;
    const scrollTop = root.scrollTop;
    const snapshots = allFlightSnapshots();
    updateTabBadge(snapshots);
    const totals = snapshots.reduce((sum, snapshot) => ({
      planned: sum.planned + toCents(snapshot.planned),
      actual: sum.actual + toCents(snapshot.actual),
      invoiced: sum.invoiced + toCents(snapshot.invoiced),
      difference: sum.difference + toCents(snapshot.difference),
    }), { planned: 0, actual: 0, invoiced: 0, difference: 0 });
    const completedCount = snapshots.filter((snapshot) => snapshot.completed).length;
    const attentionCount = snapshots.filter((snapshot) => snapshot.attention).length;
    const readyCount = snapshots.filter((snapshot) => !snapshot.completed && snapshot.billingState === 'ready').length;
    const groups = FS.state.campaigns.map(campaignGroup).filter(Boolean);
    root.innerHTML = `<div class="finance-shell">`
      + `<header class="fin-page-head"><div><span class="fin-eyebrow">Finance</span><h2>Facturatie per flight</h2>`
      + `<p><strong>${readyCount}</strong> klaar om te factureren · <strong>${attentionCount}</strong> `
      + `${attentionCount === 1 ? 'vraagt' : 'vragen'} aandacht · <strong>${completedCount}</strong> afgerond</p></div>`
      + `<div class="fin-toolbar"><label class="fin-search"><span aria-hidden="true">⌕</span>`
      + `<input id="finSearch" type="search" value="${a(searchQuery)}" placeholder="Zoek campagne, flight of PO/ID" aria-label="Zoek campagne, flight of PO/ID"></label>`
      + `<select id="finStatusFilter" aria-label="Filter op financiële status">`
      + `<option value="all"${statusFilter === 'all' ? ' selected' : ''}>Alles</option>`
      + `<option value="attention"${statusFilter === 'attention' ? ' selected' : ''}>Vraagt aandacht</option>`
      + `<option value="completed"${statusFilter === 'completed' ? ' selected' : ''}>Afgerond</option>`
      + `</select></div></header>`
      + `<section class="fin-kpis" aria-label="Financiële totalen">`
      + metric('Planned flights', money(fromCents(totals.planned)), 'planned')
      + metric('Actual flights', money(fromCents(totals.actual)), 'actual')
      + metric('Gefactureerd', signedMoney(fromCents(totals.invoiced)), 'invoiced')
      + metric('Netto verschil', signedMoney(fromCents(totals.difference)), totals.difference === 0 ? 'matched' : totals.difference > 0 ? 'open' : 'over')
      + `</section>`
      + `<div class="fin-campaign-list" id="finCampaignList">`
      + (FS.state.campaigns.length ? (groups.length ? groups.join('') : `<div class="fin-empty-filter">Geen flights in deze selectie</div>`)
        : `<div class="fin-empty"><strong>Nog geen campagnes</strong><button type="button" data-fin-action="new-campaign">+ Nieuwe campagne</button></div>`)
      + `</div></div>`;
    root.scrollTop = scrollTop;
  }

  function campaignByElement(element) {
    const container = element.closest('[data-camp-id]');
    if (!container) return null;
    const id = Number(container.dataset.campId);
    return FS.state.campaigns.find((campaign) => Number(campaign.id) === id) || null;
  }

  function flightContextByElement(element) {
    const card = element.closest('[data-flight-index]');
    if (!card) return null;
    const campaign = campaignByElement(card);
    const flightIndex = Number(card.dataset.flightIndex);
    const flight = campaign && campaign.segs && campaign.segs[flightIndex];
    return flight ? { campaign, flight, flightIndex, card } : null;
  }

  function entryByElement(flight, element) {
    const row = element.closest('[data-entry-id]');
    if (!row) return null;
    return entriesFor(flight).find((entry) => entry.id === row.dataset.entryId) || null;
  }

  function poByElement(flight, element) {
    const row = element.closest('[data-po-id]');
    if (!row) return null;
    return poNumbersFor(flight).find((po) => po.id === row.dataset.poId) || null;
  }

  function newFinanceId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function addEntry(context, type) {
    const snapshot = flightSnapshot(context.campaign, context.flight, context.flightIndex);
    const suggested = type === 'credit' ? Math.max(0, -snapshot.difference) : Math.max(0, snapshot.difference);
    const poNumbers = poNumbersFor(context.flight);
    const entry = {
      id: newFinanceId('fin'),
      type,
      amount: fromCents(Math.abs(toCents(suggested))),
      date: today(),
      number: '',
      poId: poNumbers.length === 1 ? poNumbers[0].id : '',
    };
    entriesFor(context.flight).push(entry);
    expandedFlights.add(`${context.campaign.id}:${context.flightIndex}`);
    render();
    if (FS.io) FS.io.autoSave();
    requestAnimationFrame(() => {
      const input = document.querySelector(`[data-entry-id="${entry.id}"] [data-fin-field="amount"]`);
      if (input) { input.focus(); input.select(); }
    });
  }

  function addPo(context) {
    const poNumbers = poNumbersFor(context.flight);
    const po = { id: newFinanceId('po'), value: '' };
    poNumbers.push(po);
    if (poNumbers.length === 1) {
      entriesFor(context.flight).forEach((entry) => { if (!entry.poId) entry.poId = po.id; });
    }
    expandedFlights.add(`${context.campaign.id}:${context.flightIndex}`);
    render();
    if (FS.io) FS.io.autoSave();
    requestAnimationFrame(() => {
      const input = document.querySelector(`[data-po-id="${po.id}"] [data-fin-po-value]`);
      if (input) input.focus();
    });
  }

  function removeEntry(context, entry) {
    const index = entriesFor(context.flight).indexOf(entry);
    if (index < 0) return;
    entriesFor(context.flight).splice(index, 1);
    render();
    if (FS.io) FS.io.autoSave();
    if (FS.toast) FS.toast.show('Boeking verwijderd', 'success');
  }

  function removePo(context, po) {
    const poNumbers = poNumbersFor(context.flight);
    const index = poNumbers.indexOf(po);
    if (index < 0) return;
    poNumbers.splice(index, 1);
    entriesFor(context.flight).forEach((entry) => { if (entry.poId === po.id) entry.poId = ''; });
    render();
    if (FS.io) FS.io.autoSave();
    if (FS.toast) FS.toast.show('PO / ID verwijderd', 'success');
  }

  function handleClick(event) {
    const actionElement = event.target.closest('[data-fin-action]');
    if (!actionElement) return;
    const action = actionElement.dataset.finAction;
    if (action === 'new-campaign') {
      setView('planning');
      if (FS.events && FS.events.addCampaign) FS.events.addCampaign();
      return;
    }
    const campaign = campaignByElement(actionElement);
    if (!campaign) return;
    if (action === 'toggle-campaign') {
      if (collapsedCampaigns.has(campaign.id)) collapsedCampaigns.delete(campaign.id);
      else collapsedCampaigns.add(campaign.id);
      renderCampaignList();
      return;
    }
    if (action === 'open-campaign') {
      setView('planning');
      const campaignIndex = FS.utils.findCampaignIndex(campaign.id);
      if (campaignIndex >= 0) FS.modals.showCampModal(campaignIndex);
      return;
    }
    if (action === 'add-flight') {
      setView('planning');
      const campaignIndex = FS.utils.findCampaignIndex(campaign.id);
      if (campaignIndex >= 0) FS.modals.addFlight(campaignIndex);
      return;
    }
    const context = flightContextByElement(actionElement);
    if (!context) return;
    if (action === 'toggle-attention') {
      const finance = ensureFinance(context.flight);
      if (finance.attention === true) {
        delete finance.attention;
        if (FS.toast) FS.toast.show('Aandachtsmarkering verwijderd', 'info');
      } else {
        finance.attention = true;
        delete finance.status;
        if (FS.toast) FS.toast.show('Flight vraagt aandacht', 'warn');
      }
      render();
      if (FS.io) FS.io.autoSave();
      return;
    }
    if (action === 'toggle-complete') {
      const finance = ensureFinance(context.flight);
      if (finance.status === 'completed') {
        delete finance.status;
        render();
        if (FS.io) FS.io.autoSave();
        if (FS.toast) FS.toast.show('Flight vraagt weer aandacht', 'info');
        return;
      }
      const snapshot = flightSnapshot(context.campaign, context.flight, context.flightIndex);
      const complete = () => {
        finance.status = 'completed';
        delete finance.attention;
        render();
        if (FS.io) FS.io.autoSave();
        if (FS.toast) FS.toast.show('Flight afgerond', 'success');
      };
      if (snapshot.billingState !== 'matched') {
        FS.modals.showConfirm(`<strong>${esc(context.flight.n || `Flight ${context.flightIndex + 1}`)}</strong> sluit financieel nog niet aan.<br>`
          + `Actual: <strong>${esc(money(snapshot.actual))}</strong> · Gefactureerd: <strong>${esc(signedMoney(snapshot.invoiced))}</strong><br><br>`
          + `Toch markeren als afgerond?`, (ok) => { if (ok) complete(); }, '✓');
      } else complete();
      return;
    }
    if (action === 'toggle') {
      const key = `${campaign.id}:${context.flightIndex}`;
      if (expandedFlights.has(key)) expandedFlights.delete(key); else expandedFlights.add(key);
      renderCampaignList();
      return;
    }
    if (action === 'open-flight') {
      setView('planning');
      const campaignIndex = FS.utils.findCampaignIndex(campaign.id);
      if (campaignIndex >= 0) FS.modals.showFlightModal(campaignIndex, context.flightIndex);
      return;
    }
    if (action === 'add-invoice') { addEntry(context, 'invoice'); return; }
    if (action === 'add-credit') { addEntry(context, 'credit'); return; }
    if (action === 'add-po') { addPo(context); return; }
    if (action === 'delete-entry') {
      const entry = entryByElement(context.flight, actionElement);
      if (!entry) return;
      const label = entry.number ? ` <strong>${esc(entry.number)}</strong>` : '';
      FS.modals.showConfirm(`${entry.type === 'credit' ? 'Credit' : 'Factuur'}${label} verwijderen?`, (ok) => {
        if (ok) removeEntry(context, entry);
      }, '🧾');
      return;
    }
    if (action === 'delete-po') {
      const po = poByElement(context.flight, actionElement);
      if (!po) return;
      const usage = entriesFor(context.flight).filter((entry) => entry.poId === po.id).length;
      if (!usage) { removePo(context, po); return; }
      FS.modals.showConfirm(`PO / ID <strong>${esc(po.value || 'zonder nummer')}</strong> verwijderen?<br>`
        + `${usage} ${usage === 1 ? 'boeking wordt' : 'boekingen worden'} losgekoppeld.`, (ok) => {
        if (ok) removePo(context, po);
      }, '🧾');
    }
  }

  function handleInput(event) {
    if (event.target.id === 'finSearch') {
      searchQuery = event.target.value;
      renderCampaignList();
      return;
    }
    const context = flightContextByElement(event.target);
    if (!context) return;
    if (event.target.hasAttribute('data-fin-po-value')) {
      const po = poByElement(context.flight, event.target);
      if (po) {
        po.value = event.target.value;
        const index = poNumbersFor(context.flight).indexOf(po);
        const label = po.value.trim() || `PO / ID ${index + 1}`;
        context.card.querySelectorAll('[data-fin-field="poId"] option').forEach((option) => {
          if (option.value === po.id) option.textContent = label;
        });
        const count = poNumbersFor(context.flight).filter((item) => String(item.value || '').trim()).length;
        const countElement = context.card.querySelector('[data-fin-po-count]');
        if (countElement) countElement.textContent = `${count} PO/ID`;
      }
      if (FS.io) FS.io.autoSave();
      return;
    }
    if (event.target.dataset.finField !== 'number') return;
    const entry = entryByElement(context.flight, event.target);
    if (!entry) return;
    entry.number = event.target.value;
    if (FS.io) FS.io.autoSave();
  }

  function handleChange(event) {
    if (event.target.id === 'finStatusFilter') {
      statusFilter = event.target.value;
      renderCampaignList();
      return;
    }
    const context = flightContextByElement(event.target);
    if (!context) return;
    if (event.target.hasAttribute('data-fin-po-value')) return;
    const field = event.target.dataset.finField;
    if (!field) return;
    const entry = entryByElement(context.flight, event.target);
    if (!entry) return;
    if (field === 'amount') entry.amount = fromCents(Math.abs(toCents(event.target.value)));
    else if (field === 'type') entry.type = event.target.value === 'credit' ? 'credit' : 'invoice';
    else if (field === 'date') entry.date = event.target.value;
    else if (field === 'poId') entry.poId = event.target.value;
    else return;
    render();
    if (FS.io) FS.io.autoSave();
  }

  function applyView() {
    const financeActive = activeView === 'finance';
    document.body.classList.toggle('view-finance', financeActive);
    document.querySelectorAll('[data-workspace-view]').forEach((button) => {
      const selected = button.dataset.workspaceView === activeView;
      button.setAttribute('aria-selected', String(selected));
      button.classList.toggle('on', selected);
    });
    const financeView = document.getElementById('financeView');
    if (financeView) financeView.setAttribute('aria-hidden', String(!financeActive));
    if (financeActive) render();
    else if (FS.ganttInteract) requestAnimationFrame(() => FS.ganttInteract.applyZoom());
  }

  function setView(view) {
    activeView = view === 'finance' ? 'finance' : 'planning';
    applyView();
  }

  function isActive() {
    return activeView === 'finance';
  }

  function init() {
    if (initialized) return;
    initialized = true;
    document.querySelectorAll('[data-workspace-view]').forEach((button) => {
      button.addEventListener('click', () => setView(button.dataset.workspaceView));
    });
    const root = document.getElementById('financeView');
    if (root) {
      root.addEventListener('click', handleClick);
      root.addEventListener('input', handleInput);
      root.addEventListener('change', handleChange);
    }
    applyView();
  }

  FS.finance = { init, render, setView, isActive, ensureFinance, invoiceTotal, flightSnapshot, campaignSnapshot };
})(window.FS = window.FS || {});