import { createApp, type App, type Directive } from 'vue';
import { createPinia, type Pinia } from 'pinia';
import AppShell from '@web/AppShell.vue';
import { magnet as vMagnet } from '@web/directives/magnet.js';
import { initializeStorage } from '@web/storage/storage.js';
import { registerServiceWorker } from '@web/sw/register.js';
import { setConfig } from '@web/stores/config.js';
import { initLegacyEventBridge } from '@web/services/eventBus.js';
// Register Iconify web component (loads icons from Iconify API on demand)
import 'iconify-icon';
// Ensure app settings are initialised before the Vue app grabs them.
import '@web/config/appSettings.js';

// UI utilities (migrated from public/scripts/ui/)
import { initIOSViewport } from '@web/utils/iosViewport.js';
import { initBarGestures } from '@web/composables/useBarGestures.js';
import { initGamepad } from '@web/composables/useGamepad.js';
// Dotmatrix GPU particle animation (migrated from public/scripts/ui/dotmatrix*.js)
import { initDotMatrix } from '@web/graphics/dotmatrix/index.js';
// FrameCoordinator and shimmer are imported where needed (shimmer via window.shimmer)

// CSS imports consolidated into Vite bundle (moved from index.html)
import '@web/styles/main.css';

await initializeStorage();

// Inject API base for cross-origin deployments (build-time constant or Electron preload)
declare const __API_BASE__: string;
const apiBase =
  __API_BASE__ ||
  (typeof window !== 'undefined' &&
    (window.API_BASE_URL || (window.prvctice && window.prvctice.apiBaseUrl))) ||
  '';
if (apiBase) {
  setConfig({ apiBase });
}

// Initialize UI utilities (migrated from public/scripts/ui/)
initIOSViewport();
initBarGestures();
initGamepad();
initDotMatrix();

// Bridge legacy window events (e.g., firstPromptSent) to the typed event bus
initLegacyEventBridge();

// Production entry: mount a single Vue app as the source of truth.
const app: App = createApp(AppShell);
const pinia: Pinia = createPinia();
app.use(pinia);
app.directive('magnet', vMagnet as Directive);
app.mount('#app');

registerServiceWorker();
