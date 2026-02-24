/**
 * Viz Archetype Template
 *
 * Chart or data visualization with optional supporting data.
 * Use cases: line chart, bar chart, gauge, sparkline, progress ring.
 */

import type { ArchetypeTemplate } from '../types.js';

const skeleton = `<body class="p-stack pad-2 full gap-1">
  <div id="mainContent" class="p-stack full gap-1">
    <div class="p-terminal-header">
      <span class="p-label-tech" id="appTitle">{{APP_TITLE}}</span>
      {{STATUS_INDICATOR}}
    </div>
    <div id="chartContainer" style="height:120px;flex-shrink:0">
      {{CHART_CONTAINER}}
    </div>
    <div class="p-stack gap-1 flex-1" id="legendOrData">
      {{LEGEND_OR_DATA}}
    </div>
    <div class="p-split p-feed-meta" style="flex-shrink:0">
      {{FOOTER}}
    </div>
  </div>
  <div id="errorState" class="p-center full-height" style="display:none">
    <div class="p-empty"><div class="p-empty-message" id="errorMsg">NO SIGNAL</div></div>
  </div>
</body>`;

export const vizTemplate: ArchetypeTemplate = {
  id: 'viz',
  skeleton,
  slots: [
    {
      name: 'APP_TITLE',
      required: true,
      description: 'Short uppercase app title for terminal header',
      defaultContent: 'VISUALIZER',
    },
    {
      name: 'STATUS_INDICATOR',
      required: false,
      description: 'Right side of terminal header — p-status-live or p-label-tech status',
      defaultContent: '<span class="p-status-live">LIVE</span>',
    },
    {
      name: 'CHART_CONTAINER',
      required: true,
      description: 'Chart element with explicit height (sparkline, bar, line, gauge)',
      defaultContent: '',
    },
    {
      name: 'LEGEND_OR_DATA',
      required: false,
      description: 'Supporting data rows or chart legend',
      defaultContent: '',
    },
    {
      name: 'FOOTER',
      required: false,
      description: 'Footer metadata content (p-label-tech label + text-muted value)',
      defaultContent:
        '<span class="p-label-tech" style="font-size:10px;opacity:0.7">DATA</span><span class="text-muted">--</span>',
    },
  ],
  sizePreset: 'standard',
  requiredClasses: ['p-terminal-header'],
  forbiddenPatterns: ['<h1', '<header'],
};
