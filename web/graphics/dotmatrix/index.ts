// dotmatrix/index.ts
// Public API for dot-matrix animation system

// Import for internal use
import { DotMatrixSystem, getDotMatrixSystem, initDotMatrixGlobals, type Landmark } from './core';

import { HandTrackingSystem, getHandTrackingSystem, initHandTrackingGlobals } from './handtrack';

// Re-export core system
export { DotMatrixSystem, getDotMatrixSystem, initDotMatrixGlobals, type Landmark };

// Re-export hand tracking
export { HandTrackingSystem, getHandTrackingSystem, initHandTrackingGlobals };

// Re-export constants for external configuration
export {
  AWARENESS_STATES,
  ATMOSPHERE_PRESETS,
  CONFIG_TEMPLATES,
  INTENSITY_PRESETS,
  type AwarenessState,
  type AtmospherePreset,
  type DotMatrixConfig,
  type StateModifier,
} from './constants';

// Re-export Perlin utilities
export { p5noiseCPU, buildPerlinTexture } from './perlin';

/**
 * Initialize the entire dotmatrix system including window globals.
 * Call this once during app startup.
 */
export function initDotMatrix(): void {
  // Initialize the main animation system and its window globals
  initDotMatrixGlobals();

  // Initialize hand tracking and its window globals
  initHandTrackingGlobals();

  // Auto-start when canvas-container is ready
  if (typeof window !== 'undefined') {
    const waitForContainer = (attempts: number) => {
      const container = document.getElementById('canvas-container');
      if (container) {
        getDotMatrixSystem().start(true);
        return;
      }
      if (attempts > 0) {
        setTimeout(() => waitForContainer(attempts - 1), 100);
      }
    };
    waitForContainer(60);
  }
}
