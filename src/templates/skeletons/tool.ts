/**
 * Tool Archetype Template
 *
 * Interactive widget with input controls and action buttons.
 * Use cases: calculator, converter, timer, unit converter, color picker.
 */

import type { ArchetypeTemplate } from '../types.js';

const skeleton = `<body class="p-stack pad-2 full gap-2">
  <div id="mainContent" class="p-stack full gap-2">
    <div class="p-terminal-header">
      <span class="p-label-tech" id="appTitle">{{APP_TITLE}}</span>
      {{STATUS_LABEL}}
    </div>
    <div class="p-stack gap-1" id="inputSection">
      {{INPUT_SECTION}}
    </div>
    <div class="p-row gap-2" id="actionButtons">
      {{ACTION_BUTTONS}}
    </div>
    <div id="resultDisplay">
      {{RESULT_DISPLAY}}
    </div>
    <div class="p-split p-feed-meta" style="flex-shrink:0">
      {{FOOTER}}
    </div>
  </div>
  <div id="errorState" class="p-center full-height" style="display:none">
    <div class="p-empty"><div class="p-empty-message" id="errorMsg">NO SIGNAL</div></div>
  </div>
</body>`;

export const toolTemplate: ArchetypeTemplate = {
  id: 'tool',
  skeleton,
  slots: [
    {
      name: 'APP_TITLE',
      required: true,
      description: 'Short uppercase app title for terminal header',
      defaultContent: 'TOOL',
    },
    {
      name: 'STATUS_LABEL',
      required: false,
      description: 'Right side of terminal header — p-label-tech mode label',
      defaultContent:
        '<span class="p-label-tech" style="color:var(--p-text-muted)">STANDARD</span>',
    },
    {
      name: 'INPUT_SECTION',
      required: true,
      description: 'Input controls (p-input, p-slider, p-stepper, p-tabs)',
      defaultContent: '',
    },
    {
      name: 'ACTION_BUTTONS',
      required: true,
      description: 'Primary action button(s)',
      defaultContent: '<button class="p-btn p-btn-primary">GO</button>',
    },
    {
      name: 'RESULT_DISPLAY',
      required: false,
      description: 'Output area (p-stat or data rows)',
      defaultContent: '',
    },
    {
      name: 'FOOTER',
      required: false,
      description: 'Footer metadata content',
      defaultContent: '',
    },
  ],
  sizePreset: 'standard',
  requiredClasses: ['p-btn', 'p-input', 'p-terminal-header'],
  forbiddenPatterns: ['<h1', '<header'],
};
