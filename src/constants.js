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

    PALETTE: [
      '#000050', '#001A8C', '#0026C5', '#1E40AF', '#3B82F6',
      '#60A5FA', '#93C5FD', '#BFDBFE', '#0D9488', '#14B8A6',
      '#A2D2BF', '#1E293B', '#475569', '#94A3B8', '#CBD5E1',
    ],

    DEFAULT_YEAR: 2026,
    DEFAULT_BASE_BUDGET: 1700000,
    NOW_WEEK_INDICATOR: 15,
    STORAGE_KEY: 'fs13',
    FILE_VERSION: 7,
  };
})(window.FS = window.FS || {});
