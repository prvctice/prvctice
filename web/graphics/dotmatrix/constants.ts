// dotmatrix/constants.ts
// Configuration constants for dot-matrix animation

import type { QualityTier, QualityConfig } from './types';

// ============================================================================
// ANIMATION TIMING
// ============================================================================

export const FRAME_BASELINE_MS = 1000 / 60;
export const MAX_FRAME_DELTA_MULTIPLIER = 5;
export const FADE_DURATION_MS = 250;
export const FADE_OUT_DURATION_MS = 200;
export const FADE_OUT_TRANSITION = 'opacity 0.2s ease-out';

// ============================================================================
// MATERIAL/LIGHTING DEFAULTS
// ============================================================================

export const MATERIAL_AMBIENT = 0.55; // Keep base vibrancy
export const MATERIAL_FRESNEL_POWER = 2.5; // Balanced rim falloff
export const MATERIAL_EMISSION_STRENGTH = 0.5; // Strong rim glow for pop

// PBR parameters - tuned for vivid, streaky highlights
export const MATERIAL_ROUGHNESS = 0.25; // Glossy for bright specular
export const MATERIAL_METALNESS = 0.2; // Slight metallic for color reflection

// Legacy compatibility
export const MATERIAL_SHININESS = 4000.0;

// ============================================================================
// BLOOM DEFAULTS
// ============================================================================

export const BLOOM_THRESHOLD = 0.84;
export const BLOOM_STRENGTH_LARGE = 0.7;
export const BLOOM_STRENGTH_SMALL = 0.45;
export const BLOOM_RADIUS_LARGE = 0.6;
export const BLOOM_RADIUS_SMALL = 0.4;

// CSS bloom overlay optimization: half-resolution for better perf
export const BLOOM_RESOLUTION_SCALE = 0.5;
// Update bloom less often on mobile (every 2nd frame vs every frame)
export const BLOOM_UPDATE_INTERVAL_DESKTOP = 1;
export const BLOOM_UPDATE_INTERVAL_MOBILE = 2;

// ============================================================================
// ATMOSPHERE POINTER TRACKING
// ============================================================================

export const ATMO_POINTER_LERP = 0.06;
export const ATMO_STRENGTH_LERP = 0.045;
export const ATMO_SHIFT_SCALE_NORMAL = 0.7;
export const ATMO_SHIFT_SCALE_REDUCED = 0.4;
export const ATMO_SHIFT_Y_SCALE_NORMAL = 0.55;
export const ATMO_SHIFT_Y_SCALE_REDUCED = 0.35;

// ============================================================================
// ATMOSPHERE RIPPLES
// ============================================================================

export const ATMOSPHERE_RIPPLE_COUNT = 4;
export const ATMOSPHERE_RIPPLE_MAX_AGE = 4.5;
export const ATMOSPHERE_RIPPLE_SCALE = 0.035;

// ============================================================================
// CAMERA
// ============================================================================

export const CAMERA_FOV = 60;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 5000;

// ============================================================================
// RENDERER
// ============================================================================

export const MAX_PIXEL_RATIO = 2;

// ============================================================================
// LOCAL STORAGE KEYS
// ============================================================================

export const LS_DOTMATRIX_SIZE = 'dotMatrixSizePreference';
export const LS_DOTMATRIX_REDUCE = 'dotMatrixReduceEffects';
export const LS_DOTMATRIX_KEEP_GLOW = 'dotMatrixKeepAtmosphere';
export const LS_DOTMATRIX_HEAD_TRACK = 'dotMatrixHeadTracking';

// ============================================================================
// HEAD TRACKING
// ============================================================================

export const HEAD_TRACK_SMOOTHING = 0.12;
export const HEAD_TRACK_DEAD_ZONE = 0.02;

// ============================================================================
// SPRING PHYSICS
// ============================================================================

export const SPRING_STATE_STIFFNESS = 0.03;
export const SPRING_STATE_DAMPING = 0.78;
export const SPRING_FOCUS_STIFFNESS = 0.035;
export const SPRING_FOCUS_DAMPING = 0.8;
export const SPRING_CAMERA_STIFFNESS = 0.025;
export const SPRING_CAMERA_DAMPING = 0.76;
export const SPRING_DEPTH_STIFFNESS = 0.03;
export const SPRING_DEPTH_DAMPING = 0.78;
export const SPRING_ROTATION_STIFFNESS = 0.03;
export const SPRING_ROTATION_DAMPING = 0.78;
export const SPRING_PRESENCE_STIFFNESS = 0.025;
export const SPRING_PRESENCE_DAMPING = 0.8;

// ============================================================================
// PARALLAX AND DEPTH
// ============================================================================

export const PARALLAX_STRENGTH_X = 180;
export const PARALLAX_STRENGTH_Y = 120;
export const DEPTH_RANGE = 1600;
export const DEPTH_SPREAD_FACTOR = 1.2;
export const ROTATION_MAX = Math.PI * 2;

// ============================================================================
// LANDMARK TRACKING
// ============================================================================

export const LANDMARK_WORLD_SCALE = 1400;
export const LANDMARK_DEPTH_SCALE = 450;
export const LANDMARK_ATTRACTION = 0.15;

// ============================================================================
// PRESENCE FIELD
// ============================================================================

export const PRESENCE_RADIUS = 900;
export const PRESENCE_ATTRACTION_BASE = 5;
export const PRESENCE_DECAY_RATE = 0.92;
export const PRESENCE_FADE_IN_RATE = 0.12;
export const HAND_VELOCITY_SMOOTHING = 0.15;

// ============================================================================
// ENERGY SYSTEM
// ============================================================================

export const ENERGY_DECAY = 0.98;
export const ENERGY_GAIN_HAND = 0.15;
export const ENERGY_VELOCITY_THRESHOLD = 0.02;
export const ENERGY_MAX = 1.0;
export const ENERGY_MIN = -0.15;
export const STILLNESS_VELOCITY_THRESHOLD = 0.005;
export const STILLNESS_DURATION_THRESHOLD = 2000;
export const STILLNESS_ENERGY_TARGET = -0.1;

// ============================================================================
// AWARENESS SYSTEM
// ============================================================================

export const AWARENESS_TRANSITION_DURATION = 800;
export const BREATH_CYCLE_DURATION = 4000;
export const BREATH_AMPLITUDE = 0.15;
export const TYPING_IDLE_THRESHOLD = 1500;
export const FOCUS_ATTRACTION_STRENGTH = 3.5;
export const FOCUS_VELOCITY_SCALE = 8.0;
export const CURSOR_IDLE_THRESHOLD = 3000;

// ============================================================================
// AWARENESS STATES
// ============================================================================

export const AWARENESS_STATES = {
  IDLE: 'idle',
  TYPING: 'typing',
  WAITING: 'waiting',
  RESPONDING: 'responding',
} as const;

export type AwarenessState = (typeof AWARENESS_STATES)[keyof typeof AWARENESS_STATES];

// ============================================================================
// STATE MODIFIERS
// ============================================================================

export interface StateModifier {
  speedMultiplier: number;
  motionMultiplier: number;
  cohesion: number;
  brightness: number;
}

export const STATE_MODIFIERS: Record<AwarenessState, StateModifier> = {
  [AWARENESS_STATES.IDLE]: {
    speedMultiplier: 1.0,
    motionMultiplier: 1.0,
    cohesion: 0.0,
    brightness: 0.0,
  },
  [AWARENESS_STATES.TYPING]: {
    speedMultiplier: 1.0,
    motionMultiplier: 1.0,
    cohesion: 0.0,
    brightness: 0.0,
  },
  [AWARENESS_STATES.WAITING]: {
    speedMultiplier: 0.5,
    motionMultiplier: 0.7,
    cohesion: 0.25,
    brightness: 0.1,
  },
  [AWARENESS_STATES.RESPONDING]: {
    speedMultiplier: 1.6,
    motionMultiplier: 0.8,
    cohesion: 0.2,
    brightness: 0.2,
  },
};

export const HAND_PRESENCE_MODIFIERS: StateModifier = {
  speedMultiplier: 0.1,
  motionMultiplier: -0.05,
  cohesion: 0.08,
  brightness: 0.05,
};

// ============================================================================
// THEME-SPECIFIC ATMOSPHERIC GLOW PRESETS
// ============================================================================

export interface AtmospherePreset {
  strength: number;
  left: string;
  right: string;
  top: string;
  bottom: string;
  center: string;
}

export const ATMOSPHERE_PRESETS: Record<string, AtmospherePreset> = {
  default: {
    strength: 0.15,
    left: '#2f66ff',
    right: '#23d7ff',
    top: '#1b2d64',
    bottom: '#081f2f',
    center: '#3cfb93',
  },
  night: {
    strength: 0.18,
    left: '#0c0a01',
    right: '#1f0c02',
    top: '#110801',
    bottom: '#130901',
    center: '#140211',
  },
  light: {
    strength: 0.16,
    left: '#7ae3f5',
    right: '#7fe2ff',
    top: '#cde5ff',
    bottom: '#0c9ecb',
    center: '#05684f',
  },
  'vera-baxter': {
    strength: 0.18,
    left: '#1694b7',
    right: '#06418a',
    top: '#7455b6',
    bottom: '#572c55',
    center: '#15706d',
  },
  blue: {
    strength: 0.58,
    left: '#ff64e6',
    right: '#4ccfff',
    top: '#2a1d46',
    bottom: '#261325',
    center: '#ffb6f5',
  },
  focus: {
    strength: 0.15,
    left: '#3c6e5a',
    right: '#5cc4a2',
    top: '#dcefe6',
    bottom: '#c1d9cc',
    center: '#f6fff1',
  },
  'share-bear': {
    strength: 0.32,
    left: '#5e4bdf',
    right: '#8ec5ff',
    top: '#f2e6ff',
    bottom: '#382e4e',
    center: '#97b8ca',
  },
  eva: {
    strength: 0.18,
    left: '#961313',
    right: '#12568e',
    top: '#44c4e4',
    bottom: '#241836',
    center: '#674507',
  },
  fragile: {
    strength: 0.15,
    left: '#37c5ff',
    right: '#62ffae',
    top: '#cde5ff',
    bottom: '#9ec9f2',
    center: '#566842',
  },
  'high-contrast': {
    strength: 0.16,
    left: '#eac2aa',
    right: '#9cc2df',
    top: '#f6f6f6',
    bottom: '#dfdfdf',
    center: '#49462d',
  },
  dev: {
    strength: 0.58,
    left: '#d33bff',
    right: '#2bc3ff',
    top: '#14052b',
    bottom: '#25053f',
    center: '#ff9dff',
  },
  purple: {
    strength: 0.58,
    left: '#d33bff',
    right: '#2bc3ff',
    top: '#14052b',
    bottom: '#25053f',
    center: '#ff9dff',
  },
  custom: {
    strength: 0,
    left: '#000000',
    right: '#000000',
    top: '#000000',
    bottom: '#000000',
    center: '#000000',
  },
  surf: {
    strength: 0,
    left: '#000000',
    right: '#000000',
    top: '#000000',
    bottom: '#000000',
    center: '#000000',
  },
};

// ============================================================================
// THEME ALIASES
// ============================================================================

export const THEME_ALIASES: Record<string, string> = {
  dark: 'night',
  cool: 'vera-baxter',
  minimal: 'vitti',
  focus: 'vitti',
  paper: 'share-bear',
  sunset: 'eva',
  dusk: 'fragile',
  monday: 'custom',
  blue: 'vera-baxter',
};

// ============================================================================
// CONFIG TEMPLATES
// ============================================================================

export interface DotMatrixConfig {
  gridXCount: number;
  gridYCount: number;
  gridZCount: number;
  spacing: number;
  waveSpeed: number;
  motionRange: number;
  sphereSize: number;
  smoothFactor: number;
  detailX: number;
  detailY: number;
  backgroundAlpha: number;
  blendModeType: string;
  cameraZ: number;
  baseColor?: string;
  secondaryColor?: string;
}

export interface ConfigTemplateSet {
  normal: DotMatrixConfig;
  large: DotMatrixConfig;
}

export const CONFIG_TEMPLATES: Record<string, ConfigTemplateSet> = {
  modern: {
    normal: {
      gridXCount: 7,
      gridYCount: 8,
      gridZCount: 9,
      spacing: 1,
      waveSpeed: 0.0009,
      motionRange: 1000,
      sphereSize: 6,
      smoothFactor: 1,
      detailX: 16,
      detailY: 16,
      backgroundAlpha: 0,
      blendModeType: 'ADD',
      cameraZ: 800,
    },
    large: {
      gridXCount: 2,
      gridYCount: 3,
      gridZCount: 4,
      spacing: 160,
      waveSpeed: 0.001,
      motionRange: 800,
      sphereSize: 40,
      smoothFactor: 1,
      detailX: 24,
      detailY: 24,
      backgroundAlpha: 0,
      blendModeType: 'ADD',
      cameraZ: 1100,
    },
  },
  legacy: {
    normal: {
      gridXCount: 7,
      gridYCount: 8,
      gridZCount: 9,
      spacing: 1,
      waveSpeed: 0.0004,
      motionRange: 800,
      sphereSize: 3,
      smoothFactor: 1,
      detailX: 16,
      detailY: 16,
      backgroundAlpha: 0,
      blendModeType: 'ADD',
      cameraZ: 700,
    },
    large: {
      gridXCount: 2,
      gridYCount: 3,
      gridZCount: 4,
      spacing: 60,
      waveSpeed: 0.0004,
      motionRange: 800,
      sphereSize: 26,
      smoothFactor: 1,
      detailX: 24,
      detailY: 24,
      backgroundAlpha: 0,
      blendModeType: 'ADD',
      cameraZ: 820,
    },
  },
};

// ============================================================================
// INTENSITY PRESETS
// ============================================================================

export interface IntensityPreset {
  motionRange: number;
  waveSpeed: number;
}

export const INTENSITY_PRESETS: Record<string, IntensityPreset> = {
  default: { motionRange: 1, waveSpeed: 1 },
  relaxed: { motionRange: 0.75, waveSpeed: 0.8 },
  calm: { motionRange: 0.55, waveSpeed: 0.65 },
};

// ============================================================================
// BLOOM PRESET DEFINITIONS
// ============================================================================

export interface BloomPreset {
  blurRadius: number;
  brightness: number;
  blendMode: string;
}

export const BLOOM_PRESET_DEFS: Record<string, Record<string, BloomPreset>> = {
  modern: {
    small: { blurRadius: 6, brightness: 0.25, blendMode: 'screen' },
    large: { blurRadius: 10, brightness: 0.18, blendMode: 'screen' },
  },
  legacy: {
    small: { blurRadius: 3, brightness: 0.1, blendMode: 'multiply' },
    large: { blurRadius: 3, brightness: 0.01, blendMode: 'multiply' },
  },
};

// ============================================================================
// DEVICE DETECTION
// ============================================================================

export const IS_MOBILE =
  typeof navigator !== 'undefined' &&
  /Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile/.test(navigator.userAgent);

// ============================================================================
// QUALITY TIER SYSTEM
// ============================================================================

export const LS_QUALITY_TIER = 'graphicsQualityTier';

/**
 * Quality presets for performance scaling
 * - ultra: Maximum for ProMotion displays (M3/M4 Macs, 120Hz targets)
 * - high: Full effects for modern desktops/flagships (M2+ Macs, gaming PCs)
 * - medium: Balanced for mid-tier laptops/phones (2018-2020 Intel, M1, newer phones)
 * - low: Baseline support for older devices (iPhone 12-class, Intel Macs)
 */
export const QUALITY_PRESETS: Record<QualityTier, QualityConfig> = {
  ultra: {
    gridDimensions: { x: 7, y: 8, z: 9 }, // 504 particles (same as high)
    sphereSegments: 16, // Full detail
    shaderMode: 'modern',
    bloomEnabled: true,
    bloomBlurRadius: 6,
    bloomUpdateInterval: 2, // Every 2nd frame (60Hz bloom at 120Hz render)
    atmosphereEnabled: true,
    atmosphereRippleCount: 4,
    maxPixelRatio: 2,
    targetFrameRate: 120, // ProMotion target
    cssClass: null,
  },
  high: {
    gridDimensions: { x: 7, y: 8, z: 9 }, // 504 particles
    sphereSegments: 16, // 512 triangles per sphere
    shaderMode: 'modern',
    bloomEnabled: true,
    bloomBlurRadius: 6,
    bloomUpdateInterval: 1,
    atmosphereEnabled: true,
    atmosphereRippleCount: 4,
    maxPixelRatio: 2,
    targetFrameRate: 60,
    cssClass: null,
  },
  medium: {
    gridDimensions: { x: 6, y: 7, z: 8 }, // 336 particles (~33% reduction)
    sphereSegments: 12, // ~45% reduction in triangles
    shaderMode: 'modern',
    bloomEnabled: true,
    bloomBlurRadius: 4,
    bloomUpdateInterval: 2,
    atmosphereEnabled: true,
    atmosphereRippleCount: 3,
    maxPixelRatio: 1.5,
    targetFrameRate: 60,
    cssClass: 'lite-mode',
  },
  low: {
    gridDimensions: { x: 5, y: 6, z: 6 }, // 180 particles (~65% reduction)
    sphereSegments: 10,
    shaderMode: 'legacy',
    bloomEnabled: false,
    bloomBlurRadius: 0,
    bloomUpdateInterval: 0,
    atmosphereEnabled: true,
    atmosphereRippleCount: 2,
    maxPixelRatio: 1.25,
    targetFrameRate: 30,
    cssClass: 'lite-mode',
  },
};
