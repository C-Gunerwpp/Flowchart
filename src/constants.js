/* Flowchart Studio — constants
 * Statische lookups: kanalen, metrics, statussen, kleurpalet.
 */
(function (FS) {
  'use strict';

  FS.constants = {
    CHANNELS: [
      { id: 'tv', name: 'TV', icon: '📺' },
      { id: 'radio', name: 'Radio', icon: '📻' },
      { id: 'cinema', name: 'Cinema', icon: '🎬' },
      { id: 'digital_audio', name: 'Digital Audio', icon: '🎧' },
      { id: 'display', name: 'Display', icon: '🖥️' },
      { id: 'gaming', name: 'Gaming', icon: '🎮' },
      { id: 'native', name: 'Native', icon: '📰' },
      { id: 'ooh', name: 'Out of Home', icon: '🏙️' },
      { id: 'print', name: 'Print', icon: '📄' },
      { id: 'search', name: 'Search', icon: '🔍' },
      { id: 'social', name: 'Social', icon: '💬' },
      { id: 'video', name: 'Video (OLV)', icon: '🎥' },
      { id: 'affiliate', name: 'Affiliate', icon: '🔗' },
      { id: 'branded', name: 'Branded Content', icon: '©️' },
    ],

    CHANNEL_METRICS: {
      tv: ['GRPs', 'Reach %', 'OTS', 'Spotlengte', 'CPP'],
      radio: ['GRPs', 'Reach %', 'Spotlengte', 'CPP'],
      social: ['Impressies', 'CPM', 'Clicks', 'CTR', 'Qvisits', 'Video Views', 'VTR'],
      display: ['Impressies', 'CPM', 'Clicks', 'CTR', 'Viewability', 'Qvisits'],
      video: ['Views', 'VTR', 'CPCV', 'Impressies', 'CPM', 'Qvisits'],
      search: ['Clicks', 'CPC', 'ROAS', 'Qvisits', 'Impressies', 'CTR'],
      digital_audio: ['Impressies', 'Luisteraars', 'CPM', 'Bereik'],
      ooh: ['Reach', 'Contacten', 'Frequentie'],
      native: ['Impressies', 'Clicks', 'CTR', 'CPM', 'Qvisits'],
      cinema: ['Bezoekers', 'Impressies', 'CPM'],
      gaming: ['Impressies', 'Clicks', 'CPM', 'Qvisits'],
      affiliate: ['Clicks', 'Conversies', 'CPA', 'Revenue'],
      branded: ['Views', 'Engagement', 'Impressies', 'CPM'],
      print: ['Oplage', 'Bereik', 'Kosten p/p'],
    },

    STATUSES: [
      { id: 'concept', name: 'Concept', color: '#F59E0B' },
      { id: 'bevestigd', name: 'Bevestigd', color: '' },
      { id: 'live', name: 'Live', color: '#10B981' },
      { id: 'afgerond', name: 'Afgerond', color: '#94A3B8' },
    ],

    /* Kleurgroepen — WPP Media + de vier agentschappen + accenten/neutraal.
       Elke groep heeft meerdere shades (donker → licht) zodat er onderscheid
       blijft binnen één bureau-kleur. */
    PALETTE_GROUPS: [
      { name: 'WPP Media',       colors: ['#000050','#001A8C','#0026C5','#1E40AF','#3B82F6','#60A5FA','#93C5FD','#BFDBFE'] },
      { name: 'EssenceMediacom', colors: ['#831843','#9D174D','#BE185D','#DB2777','#EC4899','#F472B6','#F9A8D4','#FBCFE8'] },
      { name: 'Mindshare',       colors: ['#7C2D12','#C2410C','#EA580C','#F97316','#FB923C','#FDBA74'] },
      { name: 'Wavemaker',       colors: ['#4C1D95','#6D28D9','#7C3AED','#8B5CF6','#A78BFA','#C4B5FD'] },
      { name: 'Accent',          colors: ['#065F46','#0D9488','#14B8A6','#2DD4BF','#5EEAD4','#A2D2BF'] },
      { name: 'Neutraal',        colors: ['#0F172A','#1E293B','#475569','#94A3B8','#CBD5E1','#E2E8F0'] },
    ],
    /* Vlakke lijst voor backwards-compat (bestaande logica gebruikt PALETTE). */
    get PALETTE() { return this.PALETTE_GROUPS.flatMap((g) => g.colors); },

    DEFAULT_YEAR: 2026,
    DEFAULT_BASE_BUDGET: 1700000,
    NOW_WEEK_INDICATOR: 15,
    STORAGE_KEY: 'fs13',
    FILE_VERSION: 7,
  };
})(window.FS = window.FS || {});
