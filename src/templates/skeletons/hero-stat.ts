/**
 * Hero-Stat Archetype Template
 *
 * Single prominent metric with supporting detail rows.
 * Use cases: weather, crypto price, single KPI, countdown.
 */

import type { ArchetypeTemplate } from '../types.js';

const skeleton = `<body class="p-stack pad-2 full gap-1">
  <div id="mainContent" class="p-stack full gap-1">
    <div class="p-terminal-header">
      <span class="p-label-tech" id="appTitle">{{APP_TITLE}}</span>
      {{STATUS_INDICATOR}}
    </div>
    <div class="p-stat p-stat-left" style="padding:0">
      <div class="p-stat-value font-mono font-bold" id="heroValue" style="color:var(--p-primary)">{{HERO_VALUE}}</div>
      <div class="p-stat-label p-label-tech" id="heroLabel">{{HERO_LABEL}}</div>
    </div>
    <div class="p-divider"></div>
    <div class="p-stack gap-2">
      {{DATA_ROWS}}
    </div>
    <div class="p-split p-feed-meta" style="flex-shrink:0">
      {{FOOTER}}
    </div>
  </div>
  <div id="errorState" class="p-center full-height" style="display:none">
    <div class="p-empty"><div class="p-empty-message" id="errorMsg">NO SIGNAL</div></div>
  </div>
</body>`;

export const heroStatTemplate: ArchetypeTemplate = {
  id: 'hero-stat',
  skeleton,
  slots: [
    {
      name: 'APP_TITLE',
      required: true,
      description: 'Short uppercase app title for terminal header',
      defaultContent: 'WIDGET',
    },
    {
      name: 'HERO_VALUE',
      required: true,
      description: 'Big mono number (e.g., temperature, price, time)',
      defaultContent: '--',
    },
    {
      name: 'HERO_LABEL',
      required: true,
      description: 'Technical label below hero value',
      defaultContent: 'LOADING',
    },
    {
      name: 'DATA_ROWS',
      required: false,
      description: '2-4 p-split detail rows (label left, value right)',
      defaultContent: '',
    },
    {
      name: 'STATUS_INDICATOR',
      required: false,
      description:
        'Right side of terminal header — p-status-live, p-feed-meta, or p-label-tech status',
      defaultContent: '<span class="p-status-live">LIVE</span>',
    },
    {
      name: 'FOOTER',
      required: false,
      description: 'Footer metadata content (p-label-tech label + text-muted value)',
      defaultContent:
        '<span class="p-label-tech" style="font-size:10px;opacity:0.7">SOURCE</span><span class="text-muted">--</span>',
    },
  ],
  sizePreset: 'compact',
  requiredClasses: ['p-stat', 'p-stat-left', 'font-mono', 'p-terminal-header'],
  forbiddenPatterns: ['<h1', '<h2', '<h3', '<header'],
};
