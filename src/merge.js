/* Flowchart Studio — Merken samenvoegen (sub-merk-consolidatie)
 *
 * Veel klanten zijn een groep met meerdere (sub-)merken die elk hun eigen
 * flowchart (JSON) bijhouden — bv. Volkswagen-groep met Audi, Porsche, Škoda.
 * Deze module voegt meerdere flowcharts samen tot één geconsolideerd overzicht
 * waarin alle campagnes en budgetten over alle kanalen in één Gantt verschijnen,
 * gegroepeerd en filterbaar per merk.
 *
 * Werkwijze:
 *  - De gebruiker voegt meerdere .json-plannen toe in de merge-modal.
 *  - Per plan wordt een merknaam afgeleid (meta.client of bestandsnaam, instelbaar).
 *  - Bij samenvoegen worden alle campagnes getagd met `brand`, de budget-/creatie-/
 *    tooling-journals samengevoegd en de fees verenigd. Het resultaat is een nieuw
 *    plan dat als losse JSON opgeslagen en herladen kan worden (merken blijven behouden).
 */
(function (FS) {
  'use strict';

  const esc = (v) => FS.utils.escapeHtml(v);
  const a = (v) => FS.utils.escapeAttr(v);
  const fC = (v) => FS.utils.formatCurrency(v);

  // Wachtrij met toegevoegde merk-plannen: { uid, brand, fileName, data }.
  let pending = [];
  let groupName = '';
  let uidSeq = 1;
  let fileInput = null;

  /** Verborgen multi-file input (eenmalig aangemaakt). */
  function ensureFileInput() {
    if (fileInput) return fileInput;
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', (e) => {
      addFiles(e.target.files);
      e.target.value = '';
    });
    document.body.appendChild(fileInput);
    return fileInput;
  }

  /** Leid een nette merknaam af uit de klantnaam of bestandsnaam. */
  function deriveBrand(data, fileName) {
    const client = data && data.meta && data.meta.client;
    if (client && String(client).trim()) return String(client).trim();
    return String(fileName || 'Merk')
      .replace(/\.json$/i, '')
      .replace(/\d{4}-\d{2}-\d{2}/g, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\bflowchart\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim() || 'Merk';
  }

  /** Jaarbudget van een ingelezen plan (basis + wijzigingen). */
  function planJaar(budget) {
    if (!budget) return 0;
    const base = budget.base || 0;
    return base + (budget.mods || []).reduce((acc, m) => acc + (m.a || 0), 0);
  }

  /** Haal de relevante onderdelen uit een opgeslagen flowchart-bestand.
   *  Ondersteunt het standaard exportformaat (meta/settings/campaigns). */
  function extractPlan(d) {
    const settings = d.settings || {};
    const budget = (settings.budget && settings.budget.base !== undefined)
      ? settings.budget
      : { base: settings.jaar || 0, mods: [] };
    let creatie;
    if (settings.creatie && settings.creatie.mods !== undefined) creatie = settings.creatie;
    else { const cv = settings.creatie || 0; creatie = { mods: cv > 0 ? [{ a: cv, n: 'Overig' }] : [] }; }
    let tooling;
    if (settings.tooling && settings.tooling.mods !== undefined) tooling = settings.tooling;
    else { const tv = settings.tooling || 0; tooling = { mods: tv > 0 ? [{ a: tv, n: 'Overig' }] : [] }; }
    return {
      campaigns: Array.isArray(d.campaigns) ? d.campaigns : [],
      budget,
      creatie,
      tooling,
      fees: settings.fees || {},
      year: settings.year || FS.constants.DEFAULT_YEAR,
    };
  }

  function countCampaigns(d) {
    return Array.isArray(d.campaigns) ? d.campaigns.length : 0;
  }

  /** Lees toegevoegde bestanden in, valideer en zet in de wachtrij. */
  function addFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => /\.json$/i.test(f.name));
    if (!files.length) {
      if (FS.toast) FS.toast.show('Alleen .json-bestanden worden ondersteund', 'warn');
      return;
    }
    files.forEach((file) => {
      const reader = new FileReader();
      reader.addEventListener('load', (e) => {
        try {
          const data = JSON.parse(e.target.result);
          const probs = FS.io.validateImport ? FS.io.validateImport(data) : [];
          if (probs.length) {
            throw new Error(probs.slice(0, 4).join(' · '));
          }
          pending.push({
            uid: uidSeq++,
            brand: deriveBrand(data, file.name),
            fileName: file.name,
            data,
          });
          renderModal();
        } catch (x) {
          if (FS.toast) FS.toast.show(`"${file.name}" overslaan: ${x.message}`, 'error', 5000);
        }
      });
      reader.readAsText(file);
    });
  }

  function removePending(uid) {
    pending = pending.filter((p) => p.uid !== uid);
    renderModal();
  }

  function prefixNote(brand, note) {
    return note ? `[${brand}] ${note}` : `[${brand}]`;
  }

  /** Voeg alle wachtrij-plannen samen tot één geconsolideerd plan in FS.state. */
  function consolidate() {
    const s = FS.state;
    const newCampaigns = [];
    const budgetMods = [];
    const creatieMods = [];
    const toolingMods = [];
    const fees = {};
    let feeConflicts = 0;
    let nextId = 100;
    let firstYear = null;

    pending.forEach((p) => {
      const plan = extractPlan(p.data);
      const brand = p.brand || 'Merk';
      if (firstYear === null) firstYear = plan.year;

      const jaar = planJaar(plan.budget);
      if (jaar) budgetMods.push({ a: jaar, n: `Jaarbudget — ${brand}` });

      (plan.creatie.mods || []).forEach((m) => creatieMods.push({ a: m.a || 0, n: prefixNote(brand, m.n) }));
      (plan.tooling.mods || []).forEach((m) => toolingMods.push({ a: m.a || 0, n: prefixNote(brand, m.n) }));

      for (const k in plan.fees) {
        if (fees[k] === undefined) fees[k] = plan.fees[k];
        else if (fees[k] !== plan.fees[k]) feeConflicts++;
      }

      plan.campaigns.forEach((c) => {
        const copy = JSON.parse(JSON.stringify(c));
        copy.id = nextId++;
        copy.brand = brand;
        newCampaigns.push(copy);
      });
    });

    s.reset();
    s.budgetJournal = { base: 0, mods: budgetMods };
    s.creatieJournal = { mods: creatieMods };
    s.toolingJournal = { mods: toolingMods };
    s.fees = fees;
    s.campaigns = newCampaigns;
    s.nextId = nextId;
    s.year = firstYear || FS.constants.DEFAULT_YEAR;
    s.client = (groupName || '').trim() || 'Geconsolideerd overzicht';
    FS.utils.normalize(s.campaigns);
    FS.calc.calcJaar();
    return { campaigns: newCampaigns.length, brands: pending.length, feeConflicts };
  }

  function confirmMerge() {
    if (pending.length < 1) return;
    const result = consolidate();
    pending = [];
    closeModal();
    FS.modals.closeModal();
    FS.modals.closeSett();
    if (FS.history && FS.history.reset) FS.history.reset();
    FS.events.showApp();
    if (FS.io && FS.io.autoSave) FS.io.autoSave();
    if (FS.toast) {
      let msg = `${result.brands} merken samengevoegd — ${result.campaigns} campagnes in één overzicht.`;
      if (result.feeConflicts) msg += ` (${result.feeConflicts} afwijkende fee(s): eerste merk leidend.)`;
      FS.toast.show(msg, 'success', 5500);
    }
  }

  /* ----------------------- UI ----------------------- */

  function renderModal() {
    const body = document.getElementById('mergeBody');
    if (!body) return;
    let h = `<p class="mg-intro">Voeg de flowcharts (.json) van losse (sub-)merken samen tot één geconsolideerd overzicht. `
      + `Alle campagnes en budgetten verschijnen samen in de Gantt, gegroepeerd en filterbaar per merk.</p>`;

    h += `<div class="mg-drop" id="mgDrop"><span class="mg-drop-ic">🏢</span>`
      + `<div><strong>Klik of sleep .json-bestanden hierheen</strong>`
      + `<span class="mg-drop-sub">Eén bestand per merk — bv. audi.json, porsche.json, skoda.json</span></div></div>`;

    if (pending.length) {
      h += `<div class="mg-list">`;
      pending.forEach((p) => {
        const jaar = planJaar(extractPlan(p.data).budget);
        h += `<div class="mg-item">`
          + `<span class="mg-item-ic">🏷️</span>`
          + `<input type="text" class="mg-brand" data-uid="${p.uid}" value="${a(p.brand)}" placeholder="Merknaam" title="Merknaam (pas aan indien nodig)">`
          + `<span class="mg-item-meta"><span class="mg-item-file" title="${a(p.fileName)}">${esc(p.fileName)}</span>`
          + `<span class="mg-item-stat">${countCampaigns(p.data)} campagnes · ${esc(fC(jaar))}</span></span>`
          + `<button class="mg-del" data-uid="${p.uid}" title="Verwijderen">✕</button>`
          + `</div>`;
      });
      h += `</div>`;
    } else {
      h += `<div class="mg-empty">Nog geen merken toegevoegd.</div>`;
    }

    h += `<div class="mg-group"><label for="mgGroup">Naam van de groep / overkoepelend overzicht</label>`
      + `<input type="text" id="mgGroup" value="${a(groupName)}" placeholder="bv. Volkswagen Groep"></div>`;

    const totalCamps = pending.reduce((acc, p) => acc + countCampaigns(p.data), 0);
    h += `<div class="mg-foot">`
      + `<span class="mg-sum">${pending.length} merk(en) · ${totalCamps} campagnes</span>`
      + `<div class="mg-foot-btns"><button class="mbtn" id="mgCancel">Annuleer</button>`
      + `<button class="mbtn pri" id="mgConfirm"${pending.length ? '' : ' disabled'}>🏢 Samenvoegen</button></div></div>`;

    body.innerHTML = h;
    wireBody();
  }

  /** (Her)koppel de dynamische elementen na elke render. */
  function wireBody() {
    const drop = document.getElementById('mgDrop');
    if (drop) {
      drop.addEventListener('click', () => ensureFileInput().click());
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('ov'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('ov'));
      drop.addEventListener('drop', (e) => {
        e.preventDefault();
        drop.classList.remove('ov');
        if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
      });
    }
    document.querySelectorAll('#mergeBody .mg-del').forEach((btn) => {
      btn.addEventListener('click', () => removePending(parseInt(btn.dataset.uid, 10)));
    });
    document.querySelectorAll('#mergeBody .mg-brand').forEach((inp) => {
      inp.addEventListener('input', () => {
        const p = pending.find((x) => x.uid === parseInt(inp.dataset.uid, 10));
        if (p) p.brand = inp.value;
      });
    });
    const grp = document.getElementById('mgGroup');
    if (grp) grp.addEventListener('input', () => { groupName = grp.value; });
    const cancel = document.getElementById('mgCancel');
    if (cancel) cancel.addEventListener('click', closeModal);
    const confirm = document.getElementById('mgConfirm');
    if (confirm) confirm.addEventListener('click', confirmMerge);
  }

  function openModal() {
    renderModal();
    const bg = document.getElementById('mergeBg');
    if (bg) bg.classList.add('open');
  }

  function closeModal() {
    const bg = document.getElementById('mergeBg');
    if (bg) bg.classList.remove('open');
  }

  FS.merge = { openModal, closeModal, addFiles, confirmMerge, isOpen };

  function isOpen() {
    const bg = document.getElementById('mergeBg');
    return !!(bg && bg.classList.contains('open'));
  }
})(window.FS = window.FS || {});
