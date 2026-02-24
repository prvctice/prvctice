/**
 * Image Editor -- Layer-based canvas editor with brush engine,
 * tool palette, HSV color wheel, undo/redo, and PNG/JPEG export.
 */

import type { BuiltinAppConfig } from '../types';

const config: BuiltinAppConfig = {
  id: 'image-editor',
  name: 'Image Editor',
  category: 'creative',
  icon: 'ph:paint-brush',
  description: 'Layer-based editor with brush engine and filters',
  permissions: [],
  defaultSize: { w: 720, h: 560 },
  minSize: { w: 600, h: 460 },
  load: () => import('./image-editor.build.js').then((m) => m.IMAGE_EDITOR_HTML),
};

export default config;
