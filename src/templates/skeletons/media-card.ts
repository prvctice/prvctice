/**
 * Media-Card Archetype Template
 *
 * Full-bleed image with text overlay at bottom.
 * Use cases: movies, music albums, art, photos, recipes.
 */

import type { ArchetypeTemplate } from '../types.js';

const skeleton = `<body class="p-stack full" style="padding:0;position:relative;overflow:hidden">
  <div id="mainContent" style="position:absolute;inset:0">
    <img id="heroImage" src="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity var(--p-duration) var(--p-ease)" />
    <div style="position:absolute;inset:0;background:linear-gradient(to top, var(--p-bg) 0%, transparent 60%)"></div>
    <div class="p-stack gap-1 pad-4" style="position:absolute;bottom:0;left:0;right:0;z-index:1">
      <div class="text-lg font-bold" id="mediaTitle">{{TITLE}}</div>
      <div class="text-xs text-muted" id="mediaSubtitle">{{SUBTITLE}}</div>
      {{DESCRIPTION}}
    </div>
  </div>
  <div id="errorState" class="p-center full-height" style="display:none">
    <div class="p-empty"><div class="p-empty-message" id="errorMsg">NO SIGNAL</div></div>
  </div>
</body>`;

export const mediaCardTemplate: ArchetypeTemplate = {
  id: 'media-card',
  skeleton,
  slots: [
    {
      name: 'IMAGE_SRC',
      required: true,
      description: 'Full-bleed background image URL',
      defaultContent: '',
    },
    {
      name: 'TITLE',
      required: true,
      description: 'Bold overlay title',
      defaultContent: '--',
    },
    {
      name: 'SUBTITLE',
      required: false,
      description: 'Muted metadata line (year, artist, genre)',
      defaultContent: 'LOADING',
    },
    {
      name: 'DESCRIPTION',
      required: false,
      description: 'Optional 2-line clamped text',
      defaultContent: '',
    },
  ],
  sizePreset: 'standard',
  requiredClasses: ['font-bold', 'text-muted'],
  forbiddenPatterns: ['<h1', '<header'],
};
