/* Flowchart Studio — IO
 * localStorage autosave (debounced), JSON file save/load,
 * CSV en XLS exports.
 */
(function (FS) {
  'use strict';

  const { escapeHtml: esc, debounce, normalize } = FS.utils;

  /** Werkelijk schrijven naar localStorage; aanroepen via debounced autoSave. */
  function writeLocal() {
    const s = FS.state;
    try {
      const clientInput = document.getElementById('clientIn');
      if (clientInput) s.client = clientInput.value;
      localStorage.setItem(FS.constants.STORAGE_KEY, JSON.stringify({
        bj: s.budgetJournal,
        cj: s.creatieJournal,
        tj: s.toolingJournal,
        uj: s.urenJournal,
        fn: s.funnelStages,
        D: s.campaigns,
        n: s.nextId,
        fees: s.fees,
        yr: s.year,
        client: s.client,
        settings: s.settings,
      }));
      const status = document.getElementById('autoSaveStatus');
      if (status) {
        status.textContent = `✓ ${new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`;
      }
      if (FS.history && FS.history.commit) FS.history.commit();
    } catch (_e) {
      // Quota of disabled storage — silently ignore.
    }
  }

  const autoSave = debounce(writeLocal, 250);

  function hasLocal() {
    try {
      const raw = localStorage.getItem(FS.constants.STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return !!(parsed && parsed.D && parsed.D.length > 0);
    } catch (_e) {
      return false;
    }
  }

  function loadLocal() {
    const s = FS.state;
    try {
      const raw = localStorage.getItem(FS.constants.STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      s.budgetJournal = d.bj || { base: d.j || FS.constants.DEFAULT_BASE_BUDGET, mods: [] };
      FS.calc.calcJaar();
      s.creatieJournal = d.cj || { mods: d.c > 0 ? [{ a: d.c, n: 'Overig' }] : [] };
      s.toolingJournal = d.tj || { mods: d.t > 0 ? [{ a: d.t, n: 'Overig' }] : [] };
      s.urenJournal = d.uj || { mods: [] };
      s.funnelStages = (Array.isArray(d.fn) && d.fn.length) ? d.fn : FS.state.defaultFunnelStages();
      s.year = d.yr || FS.constants.DEFAULT_YEAR;
      s.client = d.client || '';
      s.campaigns = d.D || [];
      s.nextId = d.n || 100;
      s.fees = d.fees || {};
      s.settings = FS.state.mergeSettings(d.settings);
      normalize(s.campaigns);
    } catch (_e) {
      // Corrupt storage — leave defaults.
    }
  }

  function makeFilenamePrefix() {
    if (!FS.state.client) return '';
    return FS.state.client.replace(/[^a-zA-Z0-9 ]/g, '').replace(/ +/g, '-').toLowerCase() + '-';
  }

  /** Lichte schemacontrole voor ingelezen JSON. Geeft een lijst met problemen
   *  terug (leeg = OK). Werpt geen exceptie; loadFile beslist zelf wat te doen. */
  function validateImport(d) {
    const probs = [];
    if (!d || typeof d !== 'object') { probs.push('Bestand is geen JSON-object'); return probs; }
    if (!Array.isArray(d.campaigns)) { probs.push('Veld "campaigns" ontbreekt of is geen lijst'); return probs; }
    d.campaigns.forEach((c, i) => {
      if (!c || typeof c !== 'object') { probs.push(`Campagne #${i + 1}: ongeldig`); return; }
      if (typeof c.label !== 'string' && typeof c.n !== 'string') probs.push(`Campagne #${i + 1}: ontbrekende naam`);
      if (!Array.isArray(c.segs)) probs.push(`Campagne #${i + 1} "${c.label || ''}": flights ("segs") ontbreekt`);
      else c.segs.forEach((f, j) => {
        if (!f || typeof f !== 'object') { probs.push(`Flight ${i + 1}.${j + 1}: ongeldig`); return; }
        if (typeof f.sd !== 'string' || typeof f.ed !== 'string') probs.push(`Flight ${i + 1}.${j + 1}: ontbrekende start/eind-datum`);
        if (f.tac && !Array.isArray(f.tac)) probs.push(`Flight ${i + 1}.${j + 1}: tactics ("tac") is geen lijst`);
      });
    });
    if (d.settings && typeof d.settings !== 'object') probs.push('settings is geen object');
    return probs;
  }

  function saveFile() {
    const s = FS.state;
    const ci = document.getElementById('clientIn');
    if (ci) s.client = ci.value;
    const now = new Date();
    const ds = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const name = `${makeFilenamePrefix()}flowchart-${ds}`;
    const payload = {
      meta: {
        name,
        modified: now.toISOString(),
        author: (FS.locks && FS.locks.getUserName && FS.locks.getUserName()) || '',
        client: s.client,
        version: FS.constants.FILE_VERSION,
      },
      settings: {
        budget: s.budgetJournal,
        creatie: s.creatieJournal,
        tooling: s.toolingJournal,
        uren: s.urenJournal,
        funnelStages: s.funnelStages,
        fees: s.fees,
        year: s.year,
        user: s.settings,
      },
      campaigns: s.campaigns,
      nextId: s.nextId,
    };
    if (FS.locks) FS.locks.stampPayload(payload);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${name}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    if (FS.locks) {
      FS.locks.setActiveFile({
        name: `${name}.json`,
        editedBy: payload.meta.editedBy,
        editedAt: payload.meta.editedAt,
      });
      FS.locks.pushRecent({
        name: `${name}.json`,
        label: s.client || name,
        ts: Date.now(),
        editedBy: payload.meta.editedBy,
        campaigns: s.campaigns.length,
      });
    }
  }

  function loadFile(file) {
    const reader = new FileReader();
    reader.addEventListener('load', (e) => {
      try {
        const d = JSON.parse(e.target.result);
        const probs = validateImport(d);
        if (probs.length) {
          throw new Error('Ongeldig bestand:\n• ' + probs.slice(0, 6).join('\n• '));
        }
        if (FS.locks) {
          FS.locks.checkLock(d, file && file.name, () => applyLoadedData(d, file));
        } else {
          applyLoadedData(d, file);
        }
      } catch (x) {
        if (FS.toast) FS.toast.show(`Fout: ${x.message}`, 'error', 5000);
        else alert(`Fout: ${x.message}`);
      }
    });
    reader.readAsText(file);
  }

  function applyLoadedData(d, file) {
    try {
        const s = FS.state;
        const settings = d.settings || {};
        s.budgetJournal = settings.budget && settings.budget.base !== undefined
          ? settings.budget
          : { base: settings.jaar || FS.constants.DEFAULT_BASE_BUDGET, mods: [] };
        FS.calc.calcJaar();
        if (settings.creatie && settings.creatie.mods !== undefined) {
          s.creatieJournal = settings.creatie;
        } else {
          const cv = settings.creatie || 0;
          s.creatieJournal = { mods: cv > 0 ? [{ a: cv, n: 'Overig' }] : [] };
        }
        if (settings.tooling && settings.tooling.mods !== undefined) {
          s.toolingJournal = settings.tooling;
        } else {
          const tv = settings.tooling || 0;
          s.toolingJournal = { mods: tv > 0 ? [{ a: tv, n: 'Overig' }] : [] };
        }
        if (settings.uren && settings.uren.mods !== undefined) {
          s.urenJournal = settings.uren;
        } else {
          s.urenJournal = { mods: [] };
        }
        s.funnelStages = (Array.isArray(settings.funnelStages) && settings.funnelStages.length)
          ? settings.funnelStages
          : FS.state.defaultFunnelStages();
        s.fees = settings.fees || {};
        s.year = settings.year || FS.constants.DEFAULT_YEAR;
        s.settings = FS.state.mergeSettings(settings.user);
        s.client = (d.meta && d.meta.client) || '';
        s.campaigns = d.campaigns;
        s.nextId = d.nextId || 100;
        normalize(s.campaigns);
        const ciEl = document.getElementById('clientIn');
        if (ciEl) ciEl.value = s.client;
        s.selectedCamp = null;
        s.selectedFlight = null;
        s.selectedTactic = null;
        FS.modals.closeModal();
        FS.modals.closeSett();
        FS.events.showApp();
        autoSave.flush();
        if (FS.history && FS.history.reset) FS.history.reset();
        if (FS.locks) {
          FS.locks.setActiveFile({
            name: (file && file.name) || 'plan.json',
            editedBy: (d.meta && d.meta.editedBy) || null,
            editedAt: (d.meta && d.meta.editedAt) || null,
          });
          FS.locks.pushRecent({
            name: (file && file.name) || 'plan.json',
            label: s.client || (d.meta && d.meta.name) || 'Plan',
            ts: Date.now(),
            editedBy: (d.meta && d.meta.editedBy) || null,
            campaigns: s.campaigns.length,
          });
        }
        if (FS.toast) FS.toast.show(`${s.campaigns.length} campagnes geladen${s.client ? ' — ' + s.client : ''}`, 'success');
      } catch (x) {
        if (FS.toast) FS.toast.show(`Fout: ${x.message}`, 'error', 5000);
        else alert(`Fout: ${x.message}`);
      }
  }

  function exportCSV() {
    const s = FS.state;
    const ci = document.getElementById('clientIn');
    if (ci) s.client = ci.value;
    const csvSafe = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const rows = [['Klant', 'Merk', 'Campagne', 'Flight', 'Status', 'Budget', 'Creatie', 'Tooling', 'Uren',
      'Tactic', 'Tac.Budget', 'Start', 'Eind', 'Kanalen']];
    s.campaigns.forEach((c) => {
      c.segs.forEach((f) => {
        if (!f.tac || !f.tac.length) {
          rows.push([csvSafe(s.client), csvSafe(c.brand || ''), csvSafe(c.label), csvSafe(f.n || ''), f.st || '',
            FS.calc.flightBudget(f), f.cb || 0, f.tc || 0, f.ub || 0, '',
            FS.calc.flightBudget(f), f.sd, f.ed, '']);
        } else {
          f.tac.forEach((t) => {
            const chs = [];
            for (const k in t.ch) if (t.ch[k]) chs.push(`${k}:${t.ch[k]}`);
            rows.push([csvSafe(s.client), csvSafe(c.brand || ''), csvSafe(c.label), csvSafe(f.n || ''), f.st || '',
              FS.calc.flightBudget(f), f.cb || 0, f.tc || 0, f.ub || 0, csvSafe(t.n || ''),
              t.b, t.sd, t.ed, csvSafe(chs.join(';'))]);
          });
        }
      });
    });
    const csv = rows.map((r) => r.join(';')).join('\n');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(csv).then(() => {
        if (FS.toast) FS.toast.show('CSV gekopieerd naar klembord', 'success');
        else alert('✅ CSV gekopieerd');
      });
    }
  }

  function exportXLS() {
    const s = FS.state;
    const ci = document.getElementById('clientIn');
    if (ci) s.client = ci.value;
    const channels = FS.constants.CHANNELS;
    let h = `<html><head><meta charset="UTF-8"><style>td,th{border:1px solid #999;padding:4px 6px;font-family:Calibri;font-size:10pt}th{background:#000050;color:#fff;font-weight:bold}.tot{background:#E0E7FF;font-weight:bold}.hdr{font-size:14pt;font-weight:bold;padding:8px}</style></head><body>`;
    if (s.client) h += `<div class="hdr">${esc(s.client)} — Flowchart ${esc(s.year)}</div>`;
    const ct = FS.calc.budgetBreakdown();
    const ctcLine = ct.btwIncluded
      ? `${esc(FS.utils.formatCurrency(ct.ctcInclBtw))} (incl. ${ct.btwPct}% BTW)`
      : esc(FS.utils.formatCurrency(ct.ctc));
    h += `<div style="font-size:10pt;padding:0 8px 8px;color:#334155">Communicatie: <b>${ct.mode === 'excl' ? 'excl. CTC — handling fee erbovenop' : 'incl. CTC — handling fee in budget'}</b> · Netto media: <b>${esc(FS.utils.formatCurrency(ct.media))}</b> · Handling fee: <b>${esc(FS.utils.formatCurrency(ct.fee))}</b> · Totaal CTC: <b>${ctcLine}</b></div>`;
    h += `<table><tr><th>Merk</th><th>Campagne</th><th>Camp.Budget</th><th>Flight</th><th>Fl.Budget</th><th>Status</th><th>Creatie</th><th>Tooling</th><th>Uren</th><th>Tactic</th><th>Budget</th><th>Fee</th><th>Netto</th><th>Start</th><th>Eind</th>`;
    channels.forEach((ch) => { h += `<th>${esc(ch.name)}</th>`; });
    h += `</tr>`;
    let tB = 0, tFe = 0, tCb = 0, tTc = 0, tUb = 0;
    const tCh = {};
    channels.forEach((ch) => { tCh[ch.id] = 0; });
    s.campaigns.forEach((c) => {
      c.segs.forEach((f) => {
        const cb = f.cb || 0, tc = f.tc || 0, ub = f.ub || 0, st = f.st || '';
        tCb += cb; tTc += tc; tUb += ub;
        if (!f.tac || !f.tac.length) {
          const fb = FS.calc.flightBudget(f);
          tB += fb;
          h += `<tr><td>${esc(c.brand || '')}</td><td>${esc(c.label)}</td><td>${c.budget || ''}</td><td>${esc(f.n || '')}</td><td>${f.b || ''}</td><td>${esc(st)}</td><td>${cb}</td><td>${tc}</td><td>${ub}</td><td></td><td>${fb}</td><td>0</td><td>${fb}</td><td>${esc(f.sd)}</td><td>${esc(f.ed)}</td>`;
          channels.forEach(() => { h += `<td></td>`; });
          h += `</tr>`;
        } else {
          f.tac.forEach((t) => {
            const fe = FS.calc.tacticFee(t), ne = t.b - fe;
            tB += t.b; tFe += fe;
            h += `<tr><td>${esc(c.brand || '')}</td><td>${esc(c.label)}</td><td>${c.budget || ''}</td><td>${esc(f.n || '')}</td><td>${f.b || ''}</td><td>${esc(st)}</td><td>${cb}</td><td>${tc}</td><td>${ub}</td><td>${esc(t.n || '')}</td><td>${t.b || ''}</td><td>${fe.toFixed(2)}</td><td>${ne.toFixed(2)}</td><td>${esc(t.sd)}</td><td>${esc(t.ed)}</td>`;
            channels.forEach((ch) => {
              const v = (t.ch && t.ch[ch.id]) || 0;
              tCh[ch.id] += v;
              h += `<td>${v || ''}</td>`;
            });
            h += `</tr>`;
          });
        }
      });
    });
    const crT = FS.calc.calcCreatie();
    const tcT = FS.calc.calcTooling();
    const urT = FS.calc.calcUren();
    h += `<tr><td class="tot" colspan="6">TOTAAL</td><td class="tot">${tCb + crT}</td><td class="tot">${tTc + tcT}</td><td class="tot">${tUb + urT}</td><td class="tot"></td><td class="tot">${tB}</td><td class="tot">${tFe.toFixed(2)}</td><td class="tot">${(tB - tFe).toFixed(2)}</td><td class="tot"></td><td class="tot"></td>`;
    channels.forEach((ch) => { h += `<td class="tot">${tCh[ch.id] || ''}</td>`; });
    h += `</tr><tr><td colspan="5">Jaarbudget</td><td colspan="${10 + channels.length}">${s.jaarTotal}</td></tr></table>`;
    if (s.budgetJournal.mods.length) {
      h += `<br><table><tr><th colspan="3">Budget Journal</th></tr><tr><th>Type</th><th>Bedrag</th><th>Notitie</th></tr><tr><td>Basis</td><td>${s.budgetJournal.base}</td><td></td></tr>`;
      s.budgetJournal.mods.forEach((m) => {
        h += `<tr><td>Wijziging</td><td>${m.a}</td><td>${esc(m.n || '')}</td></tr>`;
      });
      h += `<tr class="tot"><td>Totaal</td><td>${s.jaarTotal}</td><td></td></tr></table>`;
    }
    h += `</body></html>`;
    const blob = new Blob(['\ufeff' + h], { type: 'application/vnd.ms-excel' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${makeFilenamePrefix()}flowchart-export.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  FS.io = { autoSave, writeLocal, hasLocal, loadLocal, saveFile, loadFile, exportCSV, exportXLS, validateImport };
})(window.FS = window.FS || {});
