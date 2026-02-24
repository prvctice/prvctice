/**
 * Shared UI Component Library
 *
 * Reusable, accessible components with consistent styling.
 * Import individual components or use the plugin for global registration.
 */

import type { App } from 'vue';
import { defineAsyncComponent } from 'vue';

export { default as BaseButton } from './BaseButton.vue';
export { default as BaseInput } from './BaseInput.vue';
export { default as BaseToggle } from './BaseToggle.vue';

/**
 * Vue plugin to globally register all UI components
 *
 * Usage in main.js:
 *   import { UIPlugin } from '@web/components/ui';
 *   app.use(UIPlugin);
 */
export const UIPlugin = {
  install(app: App): void {
    app.component(
      'BaseButton',
      defineAsyncComponent(() => import('./BaseButton.vue'))
    );
    app.component(
      'BaseInput',
      defineAsyncComponent(() => import('./BaseInput.vue'))
    );
    app.component(
      'BaseToggle',
      defineAsyncComponent(() => import('./BaseToggle.vue'))
    );
  },
};
