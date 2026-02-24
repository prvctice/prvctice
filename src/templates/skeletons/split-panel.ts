/**
 * Split-Panel Archetype Template
 *
 * Two sections side by side with flexible content.
 * Use cases: comparison, dual-stat, map+data, before/after.
 */

import type { ArchetypeTemplate } from '../types.js';

const skeleton = `<body class="p-row full" style="padding:0;gap:0">
  <div id="mainContent" class="p-row full" style="gap:0">
    <div class="flex-1 p-stack pad-3 gap-2" id="leftPanel">
      {{LEFT_PANEL}}
    </div>
    <div class="flex-1 p-stack pad-3 gap-2" id="rightPanel" style="background:var(--p-surface)">
      {{RIGHT_PANEL}}
    </div>
  </div>
  <div id="errorState" class="p-center full-height" style="display:none">
    <div class="p-empty"><div class="p-empty-message" id="errorMsg">NO SIGNAL</div></div>
  </div>
</body>`;

export const splitPanelTemplate: ArchetypeTemplate = {
  id: 'split-panel',
  skeleton,
  slots: [
    {
      name: 'LEFT_PANEL',
      required: true,
      description: 'Primary content (stat, image, or chart)',
      defaultContent: '',
    },
    {
      name: 'RIGHT_PANEL',
      required: true,
      description: 'Secondary content (details, list, controls)',
      defaultContent: '',
    },
  ],
  sizePreset: 'wide',
  requiredClasses: ['p-row', 'flex-1'],
  forbiddenPatterns: ['<h1', '<header'],
};
