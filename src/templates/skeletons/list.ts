/**
 * List Archetype Template
 *
 * Scrollable list with optional status header row.
 * Use cases: news, scores, search results, standings, feeds.
 */

import type { ArchetypeTemplate } from '../types.js';

const skeleton = `<body class="p-stack pad-2 full gap-1">
  <div id="mainContent" class="p-stack full gap-1">
    <div class="p-terminal-header">
      <span class="p-label-tech" id="appTitle">{{APP_TITLE}}</span>
      {{STATUS_INDICATOR}}
    </div>
    {{TAB_BAR}}
    <div class="p-scroll flex-1" id="listContainer">
      {{LIST_ITEMS}}
    </div>
    <div class="p-split p-feed-meta" style="flex-shrink:0">
      {{FOOTER}}
    </div>
  </div>
  <div id="errorState" class="p-center full-height" style="display:none">
    <div class="p-empty"><div class="p-empty-message" id="errorMsg">NO SIGNAL</div></div>
  </div>
</body>`;

export const listTemplate: ArchetypeTemplate = {
  id: 'list',
  skeleton,
  slots: [
    {
      name: 'APP_TITLE',
      required: true,
      description: 'Short uppercase app title for terminal header',
      defaultContent: 'FEED',
    },
    {
      name: 'STATUS_INDICATOR',
      required: false,
      description: 'Right side of terminal header — p-status-live or p-label-tech status',
      defaultContent: '<span class="p-status-live">LIVE</span>',
    },
    {
      name: 'TAB_BAR',
      required: false,
      description: 'Optional p-tab-bar with p-tab buttons for category filtering',
      defaultContent: '',
    },
    {
      name: 'LIST_ITEMS',
      required: true,
      description: 'Repeating p-list-item elements',
      defaultContent:
        '<div class="p-center full-height"><span class="text-muted text-xs">LOADING</span></div>',
    },
    {
      name: 'FOOTER',
      required: false,
      description: 'Footer metadata content (p-label-tech label + text-muted value)',
      defaultContent:
        '<span class="p-label-tech" style="font-size:10px;opacity:0.7">ITEMS</span><span id="itemCount" class="text-muted">0</span>',
    },
  ],
  sizePreset: 'tall',
  requiredClasses: ['p-scroll', 'p-list-item', 'p-terminal-header'],
  forbiddenPatterns: ['<h1', '<header'],
};
