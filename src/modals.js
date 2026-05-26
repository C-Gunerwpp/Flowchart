/* Flowchart Studio — modals
 * Detail-modals voor Campagne / Flight / Tactic + Settings + Bevestiging.
 * Tekstvelden hebben gerichte updates (geen volledige modal-rerender) zodat
 * de cursorpositie behouden blijft tijdens typen.
 */
(function (FS) {
  'use strict';

  const { escapeHtml: esc, escapeAttr: a, formatCurrency: fC, formatCurrency2: fC2,
    formatK: fK, pickColor, statusColor, dateToWeek, today } = FS.utils;
  const { palHTML } = FS.render;

  /* ------- Custom confirm dialog ------- */
  let confirmCallback = null;

  function showConfirm(msgHtml, callback, icon) {
    document.getElementById('cfmIcon').textContent = icon || '⚠️';
    // msgHtml may contain trusted <strong>/<br> from callers — keep innerHTML.
    document.getElementById('cfmMsg').innerHTML = msgHtml;
    document.getElementById('cfmBg').classList.add('open');
    confirmCallback = callback;
  }

  function answerConfirm(value) {
    document.getElementById('cfmBg').classList.remove('open');
    const cb = confirmCallback;
    confirmCallback = null;
    if (cb) cb(value);
  }

  /* ------- Modal open/close ------- */
  function openModal() { document.getElementById('modalBg').classList.add('open'); }
  function closeModal() {
    document.getElementById('modalBg').classList.remove('open');
    document.getElementById('modal').classList.remove('wide');
    FS.state.selectedCamp = null;
    FS.state.selectedFlight = null;
    FS.state.selectedTactic = null;
    FS.render.render();
  }
  function openSett() { renderSettings(); document.getElementById('settBg').classList.add('open'); }
  function closeSett() {
    document.getElementById('settBg').classList.remove('open');
    FS.render.render();
  }

  /* ------- Budget check (campagne overschrijdt of laat over) -------
   * Wordt aangeroepen na elke wijziging op flight/tactic niveau die het
   * totaal kan beïnvloeden: budget aanpassen, flight verwijderen, flight
   * dupliceren, tactic verwijderen, tactic budget aanpassen, etc.
   * Drempel is verlaagd naar €1 zodat het campagne-budget echt meeschuift
   * met flights die kleiner worden of verdwijnen.
   */
  function checkCampBudget(ci, afterFn) {
    const c = FS.state.campaigns[ci];
    if (!c || c.budget <= 0) { if (afterFn) afterFn(); return; }
    // Geen flights? Dan is er niets te synchroniseren — budget mag vrij ingevuld worden.
    if (!c.segs || !c.segs.length) { if (afterFn) afterFn(); return; }
    const flTotal = FS.calc.campaignFlightSum(c);
    // Flights bestaan maar staan allemaal op €0 — geen popup, geen aanpassing.
    if (flTotal <= 0) { if (afterFn) afterFn(); return; }
    const diff = c.budget - flTotal;
    if (flTotal > c.budget) {
      showConfirm(
        `De flights samen kosten <strong>${esc(fC(flTotal))}</strong>, `
        + `maar het campagne budget staat op <strong>${esc(fC(c.budget))}</strong>.<br><br>`
        + `Wil je het campagne budget ophogen naar <strong>${esc(fC(flTotal))}</strong> om te matchen?`,
        (ok) => { if (ok) c.budget = flTotal; if (afterFn) afterFn(); },
        '📈',
      );
    } else if (flTotal < c.budget && diff >= 1) {
      showConfirm(
        `De flights samen kosten <strong>${esc(fC(flTotal))}</strong>, `
        + `dat is <strong>${esc(fC(diff))}</strong> minder dan het campagne budget van ${esc(fC(c.budget))}.<br><br>`
        + `Wil je het campagne budget verlagen naar <strong>${esc(fC(flTotal))}</strong>?<br>`
        + `<span style="font-size:11px;color:#6B7280">Annuleer = budget blijft op ${esc(fC(c.budget))}.</span>`,
        (ok) => { if (ok) c.budget = flTotal; if (afterFn) afterFn(); },
        '📉',
      );
    } else if (afterFn) {
      afterFn();
    }
  }

  /* ------- Tactics buiten flight-periode -------
   * Wordt aangeroepen nadat de start- of einddatum van een flight wijzigt.
   * Detecteert tactics die nu buiten de flight-periode vallen en vraagt
   * via een popup of ze meegeschoven moeten worden. "Nee" zet de
   * flight-datums terug naar de oude waarden.
   */
  function clampFlightTactics(ci, fi, prevSd, prevEd, afterFn) {
    const camp = FS.state.campaigns[ci];
    if (!camp) { if (afterFn) afterFn(); return; }
    const f = camp.segs[fi];
    if (!f || !f.tac || !f.tac.length) { if (afterFn) afterFn(); return; }

    const outside = [];
    f.tac.forEach((t, ti) => {
      if (t.sd < f.sd || t.ed > f.ed || t.sd > f.ed || t.ed < f.sd) {
        outside.push({ ti, name: t.n || `Tactic ${ti + 1}`, sd: t.sd, ed: t.ed });
      }
    });
    if (!outside.length) { if (afterFn) afterFn(); return; }

    const list = outside.map((o) =>
      `<strong>${esc(o.name)}</strong> <span style="opacity:.6">(W${dateToWeek(o.sd)}–W${dateToWeek(o.ed)})</span>`,
    ).join('<br>');

    showConfirm(
      `${outside.length} tactic${outside.length === 1 ? '' : 's'} ${outside.length === 1 ? 'valt' : 'vallen'} buiten de nieuwe flight-periode `
      + `(<strong>W${dateToWeek(f.sd)}–W${dateToWeek(f.ed)}</strong>):<br><br>${list}<br><br>`
      + `Wilt u ${outside.length === 1 ? 'deze tactic' : 'deze tactics'} meeschuiven naar de flight-periode?<br>`
      + `<span style="opacity:.6;font-size:10px">"Nee" zet de flight-datums terug.</span>`,
      (ok) => {
        if (ok) {
          f.tac.forEach((t) => {
            if (t.sd < f.sd) t.sd = f.sd;
            if (t.sd > f.ed) t.sd = f.ed;
            if (t.ed > f.ed) t.ed = f.ed;
            if (t.ed < f.sd) t.ed = f.sd;
            if (t.ed < t.sd) t.ed = t.sd;
          });
        } else {
          f.sd = prevSd;
          f.ed = prevEd;
        }
        if (afterFn) afterFn();
      },
      '📅',
    );
  }

  /* ------- Campagne-modal ------- */
  function showCampModal(ci) {
    const camp = FS.state.campaigns[ci];
    FS.state.selectedCamp = camp.id;
    FS.state.selectedFlight = null;
    FS.state.selectedTactic = null;

    const nav = `<strong>${esc(camp.label)}</strong>`
      + `<span style="opacity:.5;margin-left:8px;font-size:9px">${camp.segs.length} flights</span>`;

    let h = `<div class="mf"><div class="mf-row">`
      + `<div class="mf-field" style="flex:2"><label>Campagnenaam</label>`
      + `<input id="mCname" type="text" value="${a(camp.label)}"></div>`
      + `<div class="mf-field"><label>Sectie</label><select id="mCsec">`
      + `<option value="losse"${camp.sec === 'losse' ? ' selected' : ''}>Campagnes</option>`
      + `<option value="ao"${camp.sec === 'ao' ? ' selected' : ''}>Always-On</option>`
      + `</select></div></div>`;
    h += `<div class="mf-row"><div class="mf-field"><label>Budget (0=auto)</label>`
      + `<input id="mCbudget" type="number" value="${camp.budget || 0}" step="1000"></div>`
      + `<div class="mf-field"><label>Kleur</label>${palHTML(camp.col)}</div></div>`;
    h += `<div class="mf-actions">`
      + `<button class="mbtn" id="mCup">▲</button>`
      + `<button class="mbtn" id="mCdn">▼</button>`
      + `<button class="mbtn grn" id="mCdup">📋 Dupliceer</button>`
      + `<button class="mbtn del" id="mCdel">🗑 Verwijder</button></div></div>`;
    h += `<div class="m-section"><h4>✈️ Flights</h4><button class="mbtn pri" id="mFadd">+ Flight</button></div>`;

    if (!camp.segs.length) {
      h += `<div style="text-align:center;padding:24px;color:#94A3B8;font-size:11px">Nog geen flights.</div>`;
    } else {
      camp.segs.forEach((f, fi) => {
        const stc = statusColor(f.st);
        h += `<div class="m-item" data-fi="${fi}">`
          + `<div class="m-item-dot" style="background:${a(pickColor(f, camp))}"></div>`
          + `<div class="m-item-info"><div class="m-item-name">${esc(f.n || `Flight ${fi + 1}`)}`
          + (stc ? `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${a(stc)};margin-left:6px;vertical-align:middle"></span>` : '')
          + `</div><div class="m-item-meta">`
          + `<span>${esc(fK(FS.calc.flightBudget(f)))}</span>`
          + (f.cb ? `<span style="color:#EC4899">🎨${esc(fK(f.cb))}</span>` : '')
          + (f.tc ? `<span style="color:#1E40AF">🔧${esc(fK(f.tc))}</span>` : '')
          + `<span>W${dateToWeek(f.sd)}–W${dateToWeek(f.ed)}</span>`
          + `<span>${f.tac ? f.tac.length : 0} tac</span></div></div>`
          + `<div style="color:#C5CAE9;font-size:18px">›</div></div>`;
      });
    }

    const flSum = FS.calc.campaignFlightSum(camp);
    if (camp.budget > 0) {
      const diff = camp.budget - flSum;
      h += `<div class="m-total"><span>Flights: ${esc(fC(flSum))} / Budget: ${esc(fC(camp.budget))}</span>`
        + `<span style="color:${diff >= 0 ? '#059669' : '#DC2626'}">`
        + (diff >= 0 ? `✓ ${esc(fC(diff))}` : `⚠ ${esc(fC(Math.abs(diff)))}`)
        + `</span></div>`;
    } else {
      h += `<div class="m-total"><span>Media: ${esc(fC(flSum))}</span></div>`;
    }

    document.getElementById('modalNav').innerHTML = nav;
    document.getElementById('modalBody').innerHTML = h;
    openModal();
    FS.render.render();
  }

  /* ------- Flight-modal ------- */
  function showFlightModal(ci, fi) {
    const camp = FS.state.campaigns[ci];
    const f = camp.segs[fi];
    FS.state.selectedCamp = camp.id;
    FS.state.selectedFlight = fi;
    FS.state.selectedTactic = null;

    const nav = `<span class="mnav-back" id="mBack">← ${esc(camp.label)}</span>`
      + `<span style="opacity:.4;margin:0 6px">›</span>`
      + `<strong>✈️ ${esc(f.n || `Flight ${fi + 1}`)}</strong>`;

    let h = `<div class="mf"><div class="mf-row">`
      + `<div class="mf-field" style="flex:2"><label>Flight naam</label>`
      + `<input id="mFname" type="text" value="${a(f.n || '')}"></div>`
      + `<div class="mf-field"><label>Status</label><select id="mFst">`;
    FS.constants.STATUSES.forEach((s) => {
      h += `<option value="${a(s.id)}"${f.st === s.id ? ' selected' : ''}>${esc(s.name)}</option>`;
    });
    h += `</select></div></div>`;

    h += `<div class="mf-row">`
      + `<div class="mf-field"><label>Start / Week</label><div style="display:flex;gap:4px">`
      + `<input id="mFsd" type="date" value="${a(f.sd)}" style="width:130px">`
      + `<input id="mFsw" type="number" value="${dateToWeek(f.sd)}" min="1" max="53" style="width:52px;text-align:center;background:#EEF2FF;font-weight:700;color:#0026C5"></div></div>`
      + `<div class="mf-field"><label>Eind / Week</label><div style="display:flex;gap:4px">`
      + `<input id="mFed" type="date" value="${a(f.ed)}" style="width:130px">`
      + `<input id="mFew" type="number" value="${dateToWeek(f.ed)}" min="1" max="53" style="width:52px;text-align:center;background:#EEF2FF;font-weight:700;color:#0026C5"></div></div>`
      + `<div class="mf-field"><label>Budget (0=auto)</label>`
      + `<input id="mFb" type="number" value="${f.b || 0}" step="1000"></div></div>`;

    h += `<div class="mf-row">`
      + `<div class="mf-field"><label style="color:#EC4899">🎨 Creatie</label>`
      + `<input id="mFcb" type="number" value="${f.cb || 0}" step="100" style="border-color:#FBCFE8;background:#FDF2F8"></div>`
      + `<div class="mf-field"><label style="color:#1E40AF">🔧 Tooling</label>`
      + `<input id="mFtc" type="number" value="${f.tc || 0}" step="100" style="border-color:#BFDBFE;background:#EFF6FF"></div></div>`;

    h += `<div class="mf-actions">`
      + `<button class="mbtn" id="mFshiftL4" title="4 weken naar links">«</button>`
      + `<button class="mbtn" id="mFshiftL1" title="1 week naar links">‹</button>`
      + `<span class="mf-shift-lbl">Verschuif flight</span>`
      + `<button class="mbtn" id="mFshiftR1" title="1 week naar rechts">›</button>`
      + `<button class="mbtn" id="mFshiftR4" title="4 weken naar rechts">»</button>`
      + `<span style="flex:1"></span>`
      + `<button class="mbtn grn" id="mFdup">📋 Dupliceer</button>`
      + `<button class="mbtn del" id="mFdel">🗑 Verwijder</button></div></div>`;

    h += `<div class="m-section"><h4>🎯 Tactics</h4><button class="mbtn pri" id="mTadd">+ Tactic</button></div>`;
    if (!f.tac || !f.tac.length) {
      h += `<div style="text-align:center;padding:24px;color:#94A3B8;font-size:11px">Geen tactics — budget op flight niveau.</div>`;
    } else {
      f.tac.forEach((t, ti) => {
        const chs = [];
        for (const k in t.ch) if (t.ch[k]) chs.push(k);
        h += `<div class="m-item" data-ti="${ti}">`
          + `<div class="m-item-dot" style="background:${a(pickColor(t, { col: pickColor(f, camp) }))}"></div>`
          + `<div class="m-item-info"><div class="m-item-name">${esc(t.n || `Tactic ${ti + 1}`)}</div>`
          + `<div class="m-item-meta"><span>${esc(fK(t.b))}</span>`
          + `<span>W${dateToWeek(t.sd)}–W${dateToWeek(t.ed)}</span>`
          + `<span>${esc(chs.join(', ') || '–')}</span></div></div>`
          + `<div style="color:#C5CAE9;font-size:18px">›</div></div>`;
      });
    }

    const tacSum = FS.calc.flightBudgetFromTactics(f);
    if (f.b > 0 && f.tac && f.tac.length) {
      const diff = f.b - tacSum;
      h += `<div class="m-total"><span>Tactics: ${esc(fC(tacSum))} / Budget: ${esc(fC(f.b))}</span>`
        + `<span style="color:${diff >= 0 ? '#059669' : '#DC2626'}">`
        + (diff >= 0 ? `✓ ${esc(fC(diff))}` : `⚠ ${esc(fC(Math.abs(diff)))}`)
        + `</span></div>`;
    } else {
      h += `<div class="m-total"><span>Totaal: ${esc(fC(FS.calc.flightBudget(f)))}</span>`
        + (f.cb ? `<span style="color:#EC4899">🎨${esc(fC(f.cb))}</span>` : '')
        + (f.tc ? `<span style="color:#1E40AF">🔧${esc(fC(f.tc))}</span>` : '')
        + `</div>`;
    }

    document.getElementById('modalNav').innerHTML = nav;
    document.getElementById('modalBody').innerHTML = h;
    openModal();
    FS.render.render();
  }

  /* ------- Tactic-modal ------- */
  function showTacticModal(ci, fi, ti) {
    const camp = FS.state.campaigns[ci];
    const f = camp.segs[fi];
    const t = f.tac[ti];
    FS.state.selectedCamp = camp.id;
    FS.state.selectedFlight = fi;
    FS.state.selectedTactic = ti;

    const nav = `<span class="mnav-back" id="mBack">← ${esc(f.n || 'Flight')}</span>`
      + `<span style="opacity:.4;margin:0 6px">›</span>`
      + `<strong>${esc(t.n || `Tactic ${ti + 1}`)}</strong>`;

    let h = `<div class="mf"><div class="mf-row">`
      + `<div class="mf-field" style="flex:2"><label>Tactic naam</label>`
      + `<input id="mTname" type="text" value="${a(t.n || '')}"></div></div>`;

    h += `<div class="mf-row">`
      + `<div class="mf-field"><label>Start / Week</label><div style="display:flex;gap:4px">`
      + `<input id="mTsd" type="date" value="${a(t.sd)}" min="${a(f.sd)}" max="${a(f.ed)}" style="width:130px">`
      + `<input id="mTsw" type="number" value="${dateToWeek(t.sd)}" style="width:52px;text-align:center;background:#EEF2FF;font-weight:700;color:#0026C5"></div></div>`
      + `<div class="mf-field"><label>Eind / Week</label><div style="display:flex;gap:4px">`
      + `<input id="mTed" type="date" value="${a(t.ed)}" min="${a(f.sd)}" max="${a(f.ed)}" style="width:130px">`
      + `<input id="mTew" type="number" value="${dateToWeek(t.ed)}" style="width:52px;text-align:center;background:#EEF2FF;font-weight:700;color:#0026C5"></div></div>`
      + `<div class="mf-field"><label>Budget (incl. fee)</label>`
      + `<input id="mTb" type="number" value="${t.b}" step="100"></div></div>`;

    const act = t.actual || 0;
    const dAct = act - t.b;
    const dCol = dAct > 0 ? '#DC2626' : dAct < 0 ? '#059669' : '#6B7280';
    const dSign = dAct > 0 ? '+' : '';
    const dHtml = act
      ? `<input value="${dSign}${esc(fC(dAct))}" disabled style="color:${dCol};font-weight:700">`
      : `<input value="–" disabled style="color:#94A3B8">`;
    h += `<div class="mf-row">`
      + `<div class="mf-field"><label>💵 Werkelijk besteed</label>`
      + `<input id="mTact" type="number" value="${act}" step="100" placeholder="0" style="border-color:#FED7AA;background:#FFF7ED"></div>`
      + `<div class="mf-field"><label>Verschil</label>${dHtml}</div></div>`;

    h += `<div class="mf-row"><div class="mf-field"><label>Kleur</label>${palHTML(t.col || '')}</div></div>`;
    h += `<div class="mf-row"><div class="mf-field" style="flex:2"><label>Notities</label>`
      + `<textarea id="mTnt" style="width:100%;min-height:40px;resize:vertical">${esc(t.nt || '')}</textarea></div></div>`;
    h += `<div class="mf-actions"><button class="mbtn del" id="mTdel">🗑 Verwijder</button></div></div>`;

    const channelTotal = FS.calc.channelSum(t.ch || {});
    const diff = t.b - channelTotal;
    const fee = FS.calc.tacticFee(t);
    h += `<div class="m-section"><h4>📊 Kanaalverdeling + Metrics</h4></div><div class="ch-grid">`;
    FS.constants.CHANNELS.forEach((ch) => {
      const v = (t.ch && t.ch[ch.id]) || 0;
      const hasV = v > 0;
      const feeR = FS.state.fees[ch.id] || 0;
      const chF = FS.calc.channelFee(ch.id, v);
      const fp = feeR ? `${parseFloat((feeR * 100).toPrecision(10))}%` : '';
      h += `<div class="ch-item${hasV ? ' hv' : ''}"><div class="ch-top"><div class="ch-left">`
        + `<div class="ch-ic">${ch.icon}</div><span class="ch-nm">${esc(ch.name)}</span>`
        + (fp ? `<span class="ch-fp">${esc(fp)}</span>` : '')
        + `</div><input type="number" class="chv" data-ch="${a(ch.id)}" value="${v}" step="100" min="0"></div>`;
      if (hasV) {
        const mets = FS.constants.CHANNEL_METRICS[ch.id] || ['Impressies'];
        const tm = (t.met && t.met[ch.id]) || {};
        h += `<div class="ch-det">`;
        if (chF > 0.005) {
          h += `<div class="ch-mf"><label>💰 Fee</label><input value="${esc(fC2(chF))}" disabled></div>`
            + `<div class="ch-mf"><label>Netto</label><input class="netto" value="${esc(fC2(v - chF))}" disabled></div>`;
        }
        mets.forEach((mk) => {
          const mkey = mk.toLowerCase().replace(/[^a-z0-9]/g, '');
          h += `<div class="ch-mf"><label>${esc(mk)}</label>`
            + `<input class="metv" data-ch="${a(ch.id)}" data-mk="${a(mkey)}" value="${a(tm[mkey] || '')}" placeholder="–"></div>`;
        });
        h += `</div>`;
      }
      h += `</div>`;
    });
    h += `</div><div class="ch-comp"><span>Kanalen: <strong>${esc(fC(channelTotal))}</strong> / Budget: <strong>${esc(fC(t.b))}</strong></span>`
      + `<span class="${diff === 0 ? 'ch-ok' : 'ch-warn'}">`
      + (diff === 0 ? '✓ Volledig'
        : diff > 0 ? `⚠ ${esc(fC(diff))} over`
        : `⚠ ${esc(fC(Math.abs(diff)))} te veel`)
      + `</span></div>`;
    if (fee > 0.005) {
      h += `<div style="margin-top:6px;font-size:9px;color:#8B5CF6;font-weight:600">💰 Fee: ${esc(fC2(fee))} · Netto: ${esc(fC2(channelTotal - fee))}</div>`;
    }

    document.getElementById('modalNav').innerHTML = nav;
    document.getElementById('modalBody').innerHTML = h;
    document.getElementById('modal').classList.add('wide');
    openModal();
    FS.render.render();
  }

  /* ------- Settings ------- */
  function renderSettings() {
    const s = FS.state;
    const bj = s.budgetJournal;

    // -- Budget --
    let h = `<section class="ss-card"><div class="ss-head"><span class="ss-ic ss-ic-bg">💰</span><h4>Budget</h4></div><div class="ss-body">`
      + `<div class="j-row j-row-base"><span class="j-lbl">Basisbudget</span>`
      + `<input type="number" class="j-amt" id="sjBase" value="${bj.base}" step="1000"></div>`;
    bj.mods.forEach((m, i) => { h += journalRow('bj', i, m, 1000); });
    h += `</div><div class="ss-foot"><button class="ss-add sjm-add" data-j="bj">+ Wijziging</button>`
      + `<span class="ss-tot">Totaal <strong>${esc(fC(s.jaarTotal))}</strong></span></div></section>`;

    // -- Creatie --
    const totCreatie = FS.calc.totalCreatieFlights();
    h += `<section class="ss-card"><div class="ss-head"><span class="ss-ic ss-ic-cr">🎨</span><h4>Creatie</h4>`
      + `<span class="ss-auto">${esc(fC(totCreatie))} <em>uit flights</em></span></div><div class="ss-body">`;
    s.creatieJournal.mods.forEach((m, i) => { h += journalRow('cj', i, m, 100); });
    if (!s.creatieJournal.mods.length) h += `<div class="ss-empty">Nog geen overige creatiekosten</div>`;
    h += `</div><div class="ss-foot"><button class="ss-add sjm-add" data-j="cj">+ Overig creatie</button>`
      + `<span class="ss-tot">Totaal <strong>${esc(fC(totCreatie + FS.calc.calcCreatie()))}</strong></span></div></section>`;

    // -- Tooling --
    const totTooling = FS.calc.totalToolingFlights();
    h += `<section class="ss-card"><div class="ss-head"><span class="ss-ic ss-ic-tl">🔧</span><h4>Tooling</h4>`
      + `<span class="ss-auto">${esc(fC(totTooling))} <em>uit flights</em></span></div><div class="ss-body">`;
    s.toolingJournal.mods.forEach((m, i) => { h += journalRow('tj', i, m, 100); });
    if (!s.toolingJournal.mods.length) h += `<div class="ss-empty">Nog geen overige toolingkosten</div>`;
    h += `</div><div class="ss-foot"><button class="ss-add sjm-add" data-j="tj">+ Overig tooling</button>`
      + `<span class="ss-tot">Totaal <strong>${esc(fC(totTooling + FS.calc.calcTooling()))}</strong></span></div></section>`;

    // -- Fees --
    h += `<section class="ss-card"><div class="ss-head"><span class="ss-ic ss-ic-fe">⚙️</span><h4>Handling Fee per kanaal</h4>`
      + `<span class="ss-hint">Fee = budget × (% / (100 + %))</span></div><div class="ss-body"><div class="fee-grid">`;
    FS.constants.CHANNELS.forEach((ch) => {
      const rawPct = s.fees[ch.id] ? s.fees[ch.id] * 100 : 0;
      const dp = rawPct ? String(parseFloat(rawPct.toPrecision(10))) : '';
      h += `<div class="fee-item"><label><span class="fi-ic">${ch.icon}</span>${esc(ch.name)}</label>`
        + `<div class="fi-input"><input type="number" class="sf-in" data-ch="${a(ch.id)}" value="${a(dp)}" placeholder="0" min="0" max="50" step="any"><span class="fi-suf">%</span></div></div>`;
    });
    h += `</div></div></section>`;

    document.getElementById('settBody').innerHTML = h;
  }

  function journalRow(journalKey, index, mod, step) {
    return `<div class="j-row">`
      + `<span class="j-sign ${mod.a >= 0 ? 'j-pos' : 'j-neg'}">${mod.a >= 0 ? '+' : '−'}</span>`
      + `<input type="number" class="j-amt sjm-a" data-j="${a(journalKey)}" data-i="${index}" value="${mod.a}" step="${step}">`
      + `<input type="text" class="j-nt sjm-n" data-j="${a(journalKey)}" data-i="${index}" value="${a(mod.n || '')}" placeholder="Notitie">`
      + `<button class="j-del sjm-d" data-j="${a(journalKey)}" data-i="${index}" title="Verwijderen">✕</button></div>`;
  }

  /* ------- Add new flight / tactic helpers ------- */
  function addFlight(ci) {
    FS.state.campaigns[ci].segs.push({
      n: '', sd: today(), ed: today(), b: 0, cb: 0, tc: 0, col: '', st: 'concept', nt: '', tac: [],
    });
    showCampModal(ci);
  }

  function addTactic(ci, fi) {
    const f = FS.state.campaigns[ci].segs[fi];
    f.tac.push({ n: '', sd: f.sd, ed: f.ed, b: 0, ch: {}, col: '', nt: '', met: {} });
    showFlightModal(ci, fi);
  }

  FS.modals = {
    showConfirm, answerConfirm, openModal, closeModal, openSett, closeSett,
    checkCampBudget, clampFlightTactics, showCampModal, showFlightModal, showTacticModal,
    renderSettings, addFlight, addTactic,
  };
})(window.FS = window.FS || {});
