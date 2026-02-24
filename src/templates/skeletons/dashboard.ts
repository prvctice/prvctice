/**
 * Dashboard Archetype Template
 *
 * Multi-metric grid of instrument cards.
 * Use cases: portfolio, system monitor, multi-KPI, analytics overview.
 */

import type { ArchetypeTemplate } from '../types.js';

const skeleton = `<body class="p-stack pad-2 full gap-1">
  <div id="mainContent" class="p-stack full gap-1">
    <div class="p-terminal-header">
      <span class="p-label-tech" id="appTitle">{{APP_TITLE}}</span>
      {{STATUS_INDICATOR}}
    </div>
    <div class="p-grid p-grid-2x2 flex-1" id="gridContainer">
      {{GRID_CELLS}}
    </div>
    <div class="p-split p-feed-meta" style="flex-shrink:0">
      {{FOOTER}}
    </div>
  </div>
  <div id="errorState" class="p-center full-height" style="display:none">
    <div class="p-empty"><div class="p-empty-message" id="errorMsg">NO SIGNAL</div></div>
  </div>
</body>`;

export const dashboardTemplate: ArchetypeTemplate = {
  id: 'dashboard',
  skeleton,
  slots: [
    {
      name: 'APP_TITLE',
      required: true,
      description: 'Short uppercase app title for terminal header',
      defaultContent: 'DASHBOARD',
    },
    {
      name: 'STATUS_INDICATOR',
      required: false,
      description: 'Right side of terminal header — p-status-live or p-label-tech status',
      defaultContent: '<span class="p-status-live">LIVE</span>',
    },
    {
      name: 'GRID_CELLS',
      required: true,
      description: '2-4 p-card-instrument cells with p-label-tech and p-mono-value',
      defaultContent: '',
    },
    {
      name: 'FOOTER',
      required: false,
      description: 'Footer metadata content (p-label-tech label + text-muted value)',
      defaultContent:
        '<span class="p-label-tech" style="font-size:10px;opacity:0.7">UPDATED</span><span class="text-muted">--</span>',
    },
  ],
  sizePreset: 'large',
  requiredClasses: ['p-card-instrument', 'p-label-tech', 'p-terminal-header'],
  forbiddenPatterns: ['<h1', '<header'],
};
