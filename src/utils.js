/* Flowchart Studio — utilities
 * HTML-escaping, debounce, datum/week-conversie, geldformatters,
 * kleurberekening en kleine helpers.
 */
(function (FS) {
  'use strict';

  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  /** Escape gebruikersinvoer voor veilig gebruik in innerHTML. */
  function escapeHtml(value) {
    if (value == null) return '';
    return String(value).replace(/[&<>"']/g, (ch) => ESC_MAP[ch]);
  }

  /** Escape voor gebruik in dubbele attributen (style/value/etc.). */
  function escapeAttr(value) {
    return escapeHtml(value);
  }

  /** Standaard debounce — voor autosave en metric-keyboard input. */
  function debounce(fn, ms) {
    let timer = null;
    const debounced = function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
    debounced.cancel = () => clearTimeout(timer);
    debounced.flush = function (...args) {
      clearTimeout(timer);
      fn.apply(this, args);
    };
    return debounced;
  }

  /** ISO-datumstring (yyyy-mm-dd) → ISO 8601 weeknummer voor het actieve jaar. */
  function dateToWeek(dateStr) {
    if (!dateStr) return 1;
    const date = new Date(`${dateStr}T12:00:00`);
    const jan4 = new Date(FS.state.year, 0, 4);
    const dow = jan4.getDay() || 7;
    const week1 = new Date(jan4);
    week1.setDate(jan4.getDate() - (dow - 1));
    const week = Math.floor((date - week1) / 86400000 / 7) + 1;
    return Math.max(1, Math.min(53, week));
  }

  /** Weeknummer → maandag van die week (yyyy-mm-dd) in het actieve jaar. */
  function weekToDate(week) {
    const jan4 = new Date(FS.state.year, 0, 4);
    const dow = jan4.getDay() || 7;
    const week1 = new Date(jan4);
    week1.setDate(jan4.getDate() - (dow - 1));
    const target = new Date(week1);
    target.setDate(week1.getDate() + (week - 1) * 7);
    const yyyy = target.getFullYear();
    const mm = String(target.getMonth() + 1).padStart(2, '0');
    const dd = String(target.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function today() {
    return new Date().toISOString().substring(0, 10);
  }

  /** € 1.234 (afgerond). */
  function formatCurrency(value) {
    return `€${Math.round(value).toLocaleString('nl-NL')}`;
  }

  /** € 1.234,56 (twee decimalen). */
  function formatCurrency2(value) {
    return `€${value.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
  }

  /** Compact: € 1,2M / € 12K / € 123. Geeft lege string voor 0. */
  function formatK(value) {
    if (!value) return '';
    if (value >= 1e6) return `€${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `€${Math.round(value / 1e3)}K`;
    return `€${value}`;
  }

  /** Item.col valt terug op parent.col valt terug op standaard. */
  function pickColor(item, parent) {
    return item.col || (parent && parent.col) || '#0026C5';
  }

  /** WCAG-luminance-gebaseerde tekstkleur (#000050 of #fff). */
  function autoTextColor(hex) {
    let r = parseInt(hex.substr(1, 2), 16) / 255;
    let g = parseInt(hex.substr(3, 2), 16) / 255;
    let b = parseInt(hex.substr(5, 2), 16) / 255;
    r = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    g = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
    b = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.35 ? '#000050' : '#fff';
  }

  /** Index van campagne in state.campaigns op basis van id. */
  function findCampaignIndex(id) {
    const camps = FS.state.campaigns;
    for (let i = 0; i < camps.length; i++) if (camps[i].id === id) return i;
    return -1;
  }

  /** Kleur uit lijst van statussen. */
  function statusColor(id) {
    const s = FS.constants.STATUSES.find((x) => x.id === id);
    return s ? s.color : '';
  }

  /** Begrens tactics binnen flight-dates. */
  function clampTactics(flight) {
    if (!flight.tac) return;
    flight.tac.forEach((t) => {
      if (t.sd < flight.sd) t.sd = flight.sd;
      if (t.ed > flight.ed) t.ed = flight.ed;
      if (t.ed < t.sd) t.ed = t.sd;
    });
  }

  /** Normaliseert oudere data-formats naar het huidige schema. */
  function normalize(campaigns) {
    campaigns.forEach((camp) => {
      if (camp.budget == null) camp.budget = 0;
      (camp.segs || []).forEach((f) => {
        if (!f.sd) f.sd = f.s ? weekToDate(f.s) : '2026-01-05';
        if (!f.ed) f.ed = f.e ? weekToDate(f.e) : f.sd;
        if (f.cb == null) f.cb = 0;
        if (f.tc == null) f.tc = 0;
        if (f.b == null) f.b = 0;
        if (!f.tac) {
          if (f.ch && Object.keys(f.ch).length) {
            f.tac = [{ n: f.n || '', sd: f.sd, ed: f.ed, b: f.b, ch: f.ch, col: f.col || '', nt: '', met: {} }];
          } else {
            f.tac = [];
          }
          delete f.ch;
        }
        f.tac.forEach((t) => {
          if (!t.sd) t.sd = t.s ? weekToDate(t.s) : f.sd;
          if (!t.ed) t.ed = t.e ? weekToDate(t.e) : f.ed;
          if (!t.ch) t.ch = {};
          if (!t.met) t.met = {};
        });
        clampTactics(f);
      });
    });
  }

  FS.utils = {
    escapeHtml,
    escapeAttr,
    debounce,
    dateToWeek,
    weekToDate,
    today,
    formatCurrency,
    formatCurrency2,
    formatK,
    pickColor,
    autoTextColor,
    findCampaignIndex,
    statusColor,
    clampTactics,
    normalize,
  };
})(window.FS = window.FS || {});
