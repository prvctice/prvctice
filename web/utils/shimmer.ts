// web/utils/shimmer.ts
// Liquid glass edge light leaks - audio reactive
// Organic breathing animation with vibrant audio response

import { frameCoordinator, Priority, type FrameInfo } from './frameCoordinator.js';
import { debugLog } from './debugLog.js';

// ===========================================
// CONFIGURATION
// ===========================================

interface ShimmerConfig {
  /** Audio sensitivity (0.3 = very sensitive, 0.7 = need to be loud) */
  audioSensitivity: number;
  /** Base intensity when idle (0-1) */
  baseIntensity: number;
  /** Max intensity at full audio (0-1) */
  maxIntensity: number;
  /** How far the glow reaches at rest (0-1, as fraction of screen) */
  baseReach: number;
  /** How far the glow reaches at full audio */
  maxReach: number;
  /** Animation speed (lower = slower breathing) */
  breatheSpeed: number;
  /** Audio smoothing (higher = more responsive, lower = smoother) */
  audioSmoothing: number;
  /** Blend mode for canvas rendering */
  blendMode: GlobalCompositeOperation;
}

interface HSLColor {
  h: number;
  s: number;
  l: number;
}

const CONFIG: ShimmerConfig = {
  audioSensitivity: 0.4,
  baseIntensity: 0.4,
  maxIntensity: 1.0,
  baseReach: 0.7,
  maxReach: 0.99,
  breatheSpeed: 0.2,
  audioSmoothing: 0.1,
  blendMode: 'overlay',
};

// Theme color mapping - uses accent/circle color from each theme
const THEME_COLORS: Record<string, HSLColor> = {
  light: { h: 177, s: 100, l: 42 },
  night: { h: 258, s: 33, l: 6 },
  'vera-baxter': { h: 240, s: 98, l: 36 },
  vitti: { h: 165, s: 7, l: 7 },
  'share-bear': { h: 218, s: 100, l: 70 },
  eva: { h: 29, s: 99, l: 68 },
  fragile: { h: 174, s: 100, l: 35 },
  custom: { h: 40, s: 97, l: 49 },
  'high-contrast': { h: 177, s: 98, l: 39 },
  purple: { h: 291, s: 93, l: 69 },
  dev: { h: 291, s: 93, l: 69 },
};

// Default to a visible blue if theme not found
const DEFAULT_COLOR: HSLColor = { h: 210, s: 80, l: 55 };

// ===========================================
// AUDIO NORMALIZATION CONFIG
// ===========================================

interface AudioNormalizationConfig {
  /** Number of frames to track for peak detection (~1 second at 60fps) */
  windowSize: number;
  /** Minimum peak threshold to prevent division by small numbers */
  minPeakThreshold: number;
  /** How quickly the peak decays when no loud audio (per frame, 0-1) */
  peakDecayRate: number;
}

const AUDIO_NORMALIZATION: AudioNormalizationConfig = {
  windowSize: 60,
  minPeakThreshold: 0.05,
  peakDecayRate: 0.995,
};

// ===========================================
// STATE
// ===========================================

let shimmerContainer: HTMLDivElement | null = null;
let isActive = false;
let animationFrameId: number | null = null;

// Audio level with smoothing
let currentAudioLevel = 0;
let targetAudioLevel = 0;

// Audio normalization state
let peakHistory: number[] = [];
let dynamicPeak = AUDIO_NORMALIZATION.minPeakThreshold;

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let time = 0;

// Current theme color
let currentColor: HSLColor = { ...DEFAULT_COLOR };

// ===========================================
// HELPERS
// ===========================================

function getCurrentTheme(): string {
  const html = document.documentElement;
  const themeClass = Array.from(html.classList).find((c) => /-theme$/.test(c));
  if (themeClass) {
    return themeClass.replace(/-theme$/, '');
  }
  return 'night';
}

function updateColorForTheme(): void {
  const theme = getCurrentTheme();
  const color = THEME_COLORS[theme] || DEFAULT_COLOR;
  currentColor = { ...color };

  // For very dark colors (vitti theme), brighten for visibility
  if (currentColor.l < 20) {
    currentColor.l = 40;
    currentColor.s = Math.max(currentColor.s, 50);
  }
}

function resizeCanvas(): void {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
}

function createShimmerElements(): void {
  shimmerContainer = document.createElement('div');
  shimmerContainer.id = 'shimmer-container';
  shimmerContainer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 800;
    opacity: 0;
    transition: opacity 0.3s ease-out;
  `;

  canvas = document.createElement('canvas');
  canvas.id = 'shimmer-canvas';
  canvas.style.cssText = `
    width: 100%;
    height: 100%;
  `;
  shimmerContainer.appendChild(canvas);
  document.body.appendChild(shimmerContainer);

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas, { passive: true });

  ctx = canvas.getContext('2d');

  // Listen for theme changes
  document.addEventListener('themeChange', updateColorForTheme);
  updateColorForTheme();

  debugLog('graphics', 'shimmer:canvasCreated', {});
}

// ===========================================
// DRAWING
// ===========================================

type EdgeType = 'left' | 'right' | 'top' | 'bottom';

function drawSoftBlob(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  hue: number,
  sat: number,
  light: number,
  alpha: number
): void {
  const gradient = context.createRadialGradient(x, y, 0, x, y, size);
  gradient.addColorStop(0, `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`);
  gradient.addColorStop(0.3, `hsla(${hue}, ${sat}%, ${light}%, ${alpha * 0.7})`);
  gradient.addColorStop(0.5, `hsla(${hue}, ${sat}%, ${light}%, ${alpha * 0.4})`);
  gradient.addColorStop(0.7, `hsla(${hue}, ${sat}%, ${light}%, ${alpha * 0.15})`);
  gradient.addColorStop(1, `hsla(${hue}, ${sat}%, ${light}%, 0)`);

  context.fillStyle = gradient;
  context.beginPath();
  context.arc(x, y, size, 0, Math.PI * 2);
  context.fill();
}

function drawOrganicEdge(
  context: CanvasRenderingContext2D,
  edge: EdgeType,
  w: number,
  h: number,
  reach: number,
  alpha: number,
  hue: number,
  sat: number,
  light: number,
  t: number,
  audio: number,
  breathe: number
): void {
  context.save();

  // Organic wobble
  const baseWobble = 15 + breathe * 10;
  const audioWobble = audio * 40;
  const totalWobble = baseWobble + audioWobble;

  const wobble = (pos: number, offset: number): number => {
    return (
      Math.sin(pos * 2 + t * 1.2 + offset) * totalWobble * 0.5 +
      Math.sin(pos * 4 + t * 0.8 + offset * 1.5) * totalWobble * 0.3 +
      Math.sin(pos * 1 + t * 1.8 + offset * 0.7) * totalWobble * 0.2
    );
  };

  switch (edge) {
    case 'left':
      for (let i = 0; i < 5; i++) {
        const yPos = h / 6 + ((h / 6) * 2 * i) / 4;
        const xOffset = wobble(i * 0.5, 0);
        drawSoftBlob(
          context,
          -reach * 0.3 + xOffset,
          yPos,
          reach * (0.8 + Math.sin(t + i) * 0.2),
          hue,
          sat,
          light,
          alpha * (0.7 + Math.sin(t * 0.5 + i) * 0.3)
        );
      }
      break;

    case 'right':
      for (let i = 0; i < 5; i++) {
        const yPos = h / 6 + ((h / 6) * 2 * i) / 4;
        const xOffset = wobble(i * 0.5, 1);
        drawSoftBlob(
          context,
          w + reach * 0.3 - xOffset,
          yPos,
          reach * (0.8 + Math.sin(t + i + 1) * 0.2),
          hue,
          sat,
          light,
          alpha * (0.7 + Math.sin(t * 0.5 + i + 1) * 0.3)
        );
      }
      break;

    case 'top':
      for (let i = 0; i < 5; i++) {
        const xPos = w / 6 + ((w / 6) * 2 * i) / 4;
        const yOffset = wobble(i * 0.5, 2);
        drawSoftBlob(
          context,
          xPos,
          -reach * 0.3 + yOffset,
          reach * (0.8 + Math.sin(t + i + 2) * 0.2),
          hue,
          sat,
          light,
          alpha * (0.7 + Math.sin(t * 0.5 + i + 2) * 0.3)
        );
      }
      break;

    case 'bottom':
      for (let i = 0; i < 5; i++) {
        const xPos = w / 6 + ((w / 6) * 2 * i) / 4;
        const yOffset = wobble(i * 0.5, 3);
        drawSoftBlob(
          context,
          xPos,
          h + reach * 0.3 - yOffset,
          reach * (0.8 + Math.sin(t + i + 3) * 0.2),
          hue,
          sat,
          light,
          alpha * (0.7 + Math.sin(t * 0.5 + i + 3) * 0.3)
        );
      }
      break;
  }

  context.restore();
}

function drawLiquidGlassEdges(): void {
  if (!ctx || !canvas) return;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Apply blend mode
  ctx.globalCompositeOperation = CONFIG.blendMode;

  time += 0.012;

  // Ambient breathing - always present
  const breathe = Math.sin(time * CONFIG.breatheSpeed) * 0.5 + 0.5;
  const ambientPulse = 0.3 + breathe * 0.15;

  // Audio amplifies everything
  const audioBoost = currentAudioLevel;

  // Reach calculation
  const baseReach = CONFIG.baseReach + ambientPulse * 0.04;
  const reach = baseReach + audioBoost * (CONFIG.maxReach - baseReach);
  const reachPx = Math.min(w, h) * reach;

  // Intensity calculation
  const baseAlpha = CONFIG.baseIntensity + breathe * 0.1;
  const alpha = baseAlpha + audioBoost * (CONFIG.maxIntensity - baseAlpha);

  // Use current theme color
  const hue = currentColor.h;
  const saturation = currentColor.s + audioBoost * 15;
  const lightness = currentColor.l + audioBoost * 10;

  // Draw organic blob edges
  drawOrganicEdge(
    ctx,
    'left',
    w,
    h,
    reachPx,
    alpha,
    hue,
    saturation,
    lightness,
    time,
    audioBoost,
    breathe
  );
  drawOrganicEdge(
    ctx,
    'right',
    w,
    h,
    reachPx,
    alpha,
    hue,
    saturation,
    lightness,
    time,
    audioBoost,
    breathe
  );
  drawOrganicEdge(
    ctx,
    'top',
    w,
    h,
    reachPx,
    alpha,
    hue,
    saturation,
    lightness,
    time,
    audioBoost,
    breathe
  );
  drawOrganicEdge(
    ctx,
    'bottom',
    w,
    h,
    reachPx,
    alpha,
    hue,
    saturation,
    lightness,
    time,
    audioBoost,
    breathe
  );
}

// ===========================================
// ANIMATION
// ===========================================

// Core update logic (called each frame)
function shimmerUpdate(): void {
  if (!isActive) return;

  currentAudioLevel += (targetAudioLevel - currentAudioLevel) * CONFIG.audioSmoothing;

  drawLiquidGlassEdges();
}

// Wrapper for FrameCoordinator integration
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function shimmerTick(_frameInfo: FrameInfo): void {
  shimmerUpdate();
}

// Legacy animate function (fallback RAF loop)
function animate(): void {
  if (!isActive) return;
  animationFrameId = requestAnimationFrame(animate);
  shimmerUpdate();
}

// ===========================================
// PUBLIC API
// ===========================================

function showShimmer(): void {
  if (!shimmerContainer) {
    createShimmerElements();
  }

  updateColorForTheme();

  isActive = true;
  if (shimmerContainer) {
    shimmerContainer.style.display = 'block';
    requestAnimationFrame(() => {
      if (shimmerContainer) {
        shimmerContainer.style.opacity = '1';
      }
    });
  }

  // Subscribe to FrameCoordinator or fallback to standalone RAF
  try {
    frameCoordinator.subscribe('shimmer', shimmerTick, Priority.RENDER);
  } catch (_) {
    animate();
  }
  debugLog('graphics', 'shimmer:shown', {});
}

function hideShimmer(): void {
  isActive = false;

  // Unsubscribe from FrameCoordinator
  try {
    frameCoordinator.unsubscribe('shimmer');
  } catch (_) {
    // ignore
  }

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (shimmerContainer) {
    shimmerContainer.style.opacity = '0';
    setTimeout(() => {
      if (!isActive && shimmerContainer) {
        shimmerContainer.style.display = 'none';
      }
    }, 300);
  }

  targetAudioLevel = 0;
  currentAudioLevel = 0;
  // Reset audio normalization state
  peakHistory = [];
  dynamicPeak = AUDIO_NORMALIZATION.minPeakThreshold;
  debugLog('graphics', 'shimmer:hidden', {});
}

/**
 * Normalize audio level against dynamic peak.
 * Tracks recent peak levels in a rolling window and normalizes incoming
 * audio against that peak for consistent behavior across microphones.
 */
function normalizeAudioLevel(rawLevel: number): number {
  // Add to peak history
  peakHistory.push(rawLevel);

  // Trim to window size
  if (peakHistory.length > AUDIO_NORMALIZATION.windowSize) {
    peakHistory.shift();
  }

  // Find max in window
  const windowMax = Math.max(...peakHistory);

  // Update dynamic peak: rise immediately, decay slowly
  if (windowMax > dynamicPeak) {
    dynamicPeak = windowMax;
  } else {
    dynamicPeak *= AUDIO_NORMALIZATION.peakDecayRate;
  }

  // Clamp peak to minimum threshold
  const effectivePeak = Math.max(dynamicPeak, AUDIO_NORMALIZATION.minPeakThreshold);

  // Normalize against effective peak
  return Math.min(1, rawLevel / effectivePeak);
}

function updateShimmerAudio(level: number): void {
  const clamped = Math.max(0, Math.min(1, level));
  // Normalize against dynamic peak for consistent behavior across microphones
  const normalized = normalizeAudioLevel(clamped);
  // Apply sensitivity curve - lower exponent = more sensitive
  targetAudioLevel = Math.pow(normalized, CONFIG.audioSensitivity);
}

function isShimmerActive(): boolean {
  return isActive;
}

function checkReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function destroyShimmer(): void {
  hideShimmer();
  window.removeEventListener('resize', resizeCanvas);
  document.removeEventListener('themeChange', updateColorForTheme);

  if (shimmerContainer && shimmerContainer.parentNode) {
    shimmerContainer.parentNode.removeChild(shimmerContainer);
    shimmerContainer = null;
  }

  canvas = null;
  ctx = null;
  debugLog('graphics', 'shimmer:destroyed', {});
}

function initShimmer(): void {
  if (!shimmerContainer) {
    createShimmerElements();
    // shimmerContainer is set by createShimmerElements()
    shimmerContainer!.style.display = 'none';
  }
  debugLog('graphics', 'shimmer:init', {});
}

// Allow runtime config changes
function setConfig(newConfig: Partial<ShimmerConfig>): void {
  Object.assign(CONFIG, newConfig);
}

function getConfig(): ShimmerConfig {
  return { ...CONFIG };
}

// ===========================================
// EXPORTS
// ===========================================

export const shimmer = {
  init: initShimmer,
  show: showShimmer,
  hide: hideShimmer,
  updateAudio: updateShimmerAudio,
  isActive: isShimmerActive,
  destroy: destroyShimmer,
  checkReducedMotion,
  setConfig,
  getConfig,
};

// Expose globally for legacy scripts
if (typeof window !== 'undefined') {
  (window as Window & { shimmer?: typeof shimmer }).shimmer = shimmer;
}

export default shimmer;
