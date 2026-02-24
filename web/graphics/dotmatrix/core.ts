// dotmatrix/core.ts
// Core Three.js GPU particle animation system

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { debugLog, logError } from '@web/utils/debugLog.js';
import { prefersReducedMotion } from '@web/composables/useMotion';
import type { QualityTier, QualityConfig } from './types';
import {
  FRAME_BASELINE_MS,
  MAX_FRAME_DELTA_MULTIPLIER,
  FADE_DURATION_MS,
  FADE_OUT_DURATION_MS,
  FADE_OUT_TRANSITION,
  MATERIAL_AMBIENT,
  MATERIAL_SHININESS,
  MATERIAL_FRESNEL_POWER,
  MATERIAL_EMISSION_STRENGTH,
  MATERIAL_ROUGHNESS,
  MATERIAL_METALNESS,
  ATMO_POINTER_LERP,
  ATMO_STRENGTH_LERP,
  ATMO_SHIFT_SCALE_NORMAL,
  ATMO_SHIFT_SCALE_REDUCED,
  ATMO_SHIFT_Y_SCALE_NORMAL,
  ATMO_SHIFT_Y_SCALE_REDUCED,
  ATMOSPHERE_RIPPLE_COUNT,
  ATMOSPHERE_RIPPLE_MAX_AGE,
  ATMOSPHERE_RIPPLE_SCALE,
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_FAR,
  MAX_PIXEL_RATIO,
  LS_DOTMATRIX_SIZE,
  LS_DOTMATRIX_REDUCE,
  LS_DOTMATRIX_KEEP_GLOW,
  LS_QUALITY_TIER,
  QUALITY_PRESETS,
  SPRING_STATE_STIFFNESS,
  SPRING_STATE_DAMPING,
  SPRING_FOCUS_STIFFNESS,
  SPRING_FOCUS_DAMPING,
  SPRING_CAMERA_STIFFNESS,
  SPRING_CAMERA_DAMPING,
  SPRING_DEPTH_STIFFNESS,
  SPRING_DEPTH_DAMPING,
  SPRING_ROTATION_STIFFNESS,
  SPRING_ROTATION_DAMPING,
  SPRING_PRESENCE_STIFFNESS,
  SPRING_PRESENCE_DAMPING,
  PARALLAX_STRENGTH_X,
  PARALLAX_STRENGTH_Y,
  DEPTH_RANGE,
  DEPTH_SPREAD_FACTOR,
  LANDMARK_WORLD_SCALE,
  LANDMARK_DEPTH_SCALE,
  LANDMARK_ATTRACTION,
  PRESENCE_RADIUS,
  PRESENCE_ATTRACTION_BASE,
  PRESENCE_DECAY_RATE,
  PRESENCE_FADE_IN_RATE,
  HAND_VELOCITY_SMOOTHING,
  ENERGY_DECAY,
  ENERGY_GAIN_HAND,
  ENERGY_VELOCITY_THRESHOLD,
  ENERGY_MAX,
  ENERGY_MIN,
  STILLNESS_VELOCITY_THRESHOLD,
  STILLNESS_DURATION_THRESHOLD,
  STILLNESS_ENERGY_TARGET,
  BREATH_CYCLE_DURATION,
  BREATH_AMPLITUDE,
  TYPING_IDLE_THRESHOLD,
  FOCUS_ATTRACTION_STRENGTH,
  FOCUS_VELOCITY_SCALE,
  CURSOR_IDLE_THRESHOLD,
  AWARENESS_STATES,
  STATE_MODIFIERS,
  HAND_PRESENCE_MODIFIERS,
  ATMOSPHERE_PRESETS,
  THEME_ALIASES,
  CONFIG_TEMPLATES,
  BLOOM_PRESET_DEFS,
  BLOOM_RESOLUTION_SCALE,
  BLOOM_UPDATE_INTERVAL_DESKTOP,
  BLOOM_UPDATE_INTERVAL_MOBILE,
  IS_MOBILE,
  type AwarenessState,
  type StateModifier,
  type AtmospherePreset,
  type DotMatrixConfig,
} from './constants';

import { buildPerlinTexture, buildNoiseAtlas, p5noiseCPU } from './perlin';
import {
  FRAGMENT_SHADER_LEGACY,
  FRAGMENT_SHADER_MODERN,
  ATMOSPHERE_VERTEX_SHADER,
  createAtmosphereFragmentShader,
  createLegacyVertexShader,
  createModernVertexShader,
} from './shaders';
import { createPointerGate, createDefaultInteractiveCheck, type PointerGate } from './pointerGate';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface Point2D {
  x: number;
  y: number;
}

interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface FocusPoint extends Point2D {
  targetX: number;
  targetY: number;
}

interface RippleState {
  centers: Point2D[];
  times: number[];
  index: number;
}

interface BloomSettings {
  zIndexBase: number;
  zIndexBloom: number;
  blurRadius: number;
  brightness: number;
  blendMode: string;
}

interface AtmoPointer {
  targetX: number;
  targetY: number;
  currentX: number;
  currentY: number;
}

// MediaPipe landmark type
export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

// Image data container with Float32Array data (for landmark textures)
interface Float32ImageData {
  data: Float32Array;
  width: number;
  height: number;
}

// ============================================================================
// SPRING PHYSICS CLASS
// ============================================================================

/**
 * Damped spring for organic interpolation.
 */
class Spring {
  value: number;
  target: number;
  velocity: number;
  stiffness: number;
  damping: number;

  constructor(value: number, stiffness = 0.1, damping = 0.8) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.stiffness = stiffness;
    this.damping = damping;
  }

  update(deltaFactor = 1): number {
    const force = (this.target - this.value) * this.stiffness;
    this.velocity += force * deltaFactor;
    this.velocity *= Math.pow(this.damping, deltaFactor);
    this.value += this.velocity * deltaFactor;
    return this.value;
  }

  set(target: number): void {
    this.target = target;
  }

  snap(value: number): void {
    this.value = this.target = value;
    this.velocity = 0;
  }

  isSettled(threshold = 0.001): boolean {
    return Math.abs(this.value - this.target) < threshold && Math.abs(this.velocity) < threshold;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function clamp01(value: number): number {
  const num = Number(value);
  if (!isFinite(num) || num <= 0) return 0;
  if (num >= 1) return 1;
  return num;
}

function fract(x: number): number {
  return x - Math.floor(x);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const b = parseInt(hex.slice(1), 16);
  return { r: (b >> 16) & 255, g: (b >> 8) & 255, b: b & 255 };
}

function normalizeTheme(theme: string): string {
  return THEME_ALIASES[theme] || theme;
}

function seedWavePhase(): number {
  try {
    if (
      typeof window !== 'undefined' &&
      window.crypto &&
      typeof window.crypto.getRandomValues === 'function'
    ) {
      const buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      return ((buf[0] ?? 0) % 4096) + Math.random();
    }
  } catch {
    // Fall through
  }
  return Math.random() * 4096;
}

function pseudoRandomUnit(i: number, j: number, k: number, salt: number): number {
  let seed =
    Math.imul(i + 1, 73856093) ^ Math.imul(j + 1, 19349663) ^ Math.imul(k + 1, 83492791) ^ salt;
  seed >>>= 0;
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  seed >>>= 0;
  return seed / 4294967295;
}

// ============================================================================
// SHADER ERROR HANDLING
// ============================================================================

interface ShaderErrorInfo {
  hasError: boolean;
  materialName: string;
  errorLog?: string;
}

/**
 * Check for shader compilation errors after first render.
 * Three.js compiles shaders lazily on first use, so this must be called
 * after renderer.render() has been invoked at least once.
 */
function checkShaderErrors(
  renderer: THREE.WebGLRenderer,
  materials: Array<{ name: string; material: THREE.ShaderMaterial | null }>
): ShaderErrorInfo[] {
  const errors: ShaderErrorInfo[] = [];

  for (const { name, material } of materials) {
    if (!material) continue;

    // Access the internal WebGL program to check for errors
    // After first render, material.program should exist
    const program = (material as unknown as { program?: { diagnostics?: { runnable: boolean } } })
      .program;

    if (program && program.diagnostics && !program.diagnostics.runnable) {
      errors.push({
        hasError: true,
        materialName: name,
        errorLog: 'Shader program is not runnable',
      });
    }
  }

  // Also check renderer.info.programs for any errors
  const programs = renderer.info.programs;
  if (programs) {
    for (const prog of programs) {
      // Check if program has errors via WebGL context
      const gl = renderer.getContext();
      const webglProgram = (prog as unknown as { program?: WebGLProgram }).program;
      if (webglProgram && gl) {
        const linked = gl.getProgramParameter(webglProgram, gl.LINK_STATUS);
        if (!linked) {
          const log = gl.getProgramInfoLog(webglProgram) || 'Unknown linking error';
          errors.push({
            hasError: true,
            materialName: (prog as unknown as { name?: string }).name || 'Unknown',
            errorLog: log,
          });
        }
      }
    }
  }

  return errors;
}

/**
 * Log shader errors gracefully (single consolidated message).
 */
function logShaderErrors(context: string, errors: ShaderErrorInfo[]): void {
  if (errors.length === 0) return;

  const errorMessages = errors.map(
    (e) => `  - ${e.materialName}: ${e.errorLog || 'Unknown error'}`
  );
  logError(
    'graphics',
    `shader:${context}`,
    `Shader compilation issues:\n${errorMessages.join('\n')}`
  );
}

// ============================================================================
// STORAGE HELPERS
// ============================================================================

function storageGet(key: string): string | null {
  try {
    const store = typeof window !== 'undefined' ? window.prvStorage : null;
    return store && typeof store.get === 'function' ? store.get(key) : null;
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    const store = typeof window !== 'undefined' ? window.prvStorage : null;
    if (store && typeof store.set === 'function') store.set(key, value);
  } catch {
    // Ignore
  }
}

// ============================================================================
// DOTMATRIX ANIMATION SYSTEM
// ============================================================================

export class DotMatrixSystem {
  // Three.js objects
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private root: THREE.Group | null = null;
  private mesh: THREE.Mesh | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private instGeo: THREE.InstancedBufferGeometry | null = null;
  private perlinTex: THREE.DataTexture | null = null;
  private noiseAtlasTex: THREE.DataTexture | null = null;
  private landmarkTexture: THREE.DataTexture | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private canvasContainer: HTMLElement | null = null;

  // Atmosphere layer
  private atmosphereUniforms: Record<string, THREE.IUniform> | null = null;
  private atmosphereMaterial: THREE.ShaderMaterial | null = null;
  private atmosphereMesh: THREE.Mesh | null = null;

  // Bloom overlay (CSS fallback)
  private bloomCanvas: HTMLCanvasElement | null = null;
  private bloomCtx: CanvasRenderingContext2D | null = null;
  private usingComposerBloom = false;
  private bloomFrameCounter = 0;
  private bloomUpdateEveryNFrames = IS_MOBILE
    ? BLOOM_UPDATE_INTERVAL_MOBILE
    : BLOOM_UPDATE_INTERVAL_DESKTOP;
  private bloomResolutionScale = BLOOM_RESOLUTION_SCALE;

  // Animation state
  private animationActive = false;
  private startPending = false;
  private contextLost = false;
  private shaderErrorChecked = false;
  private waveTime = 0;
  private lastFrameTime: number | null = null;
  private elapsedSinceStartMs = 0;
  private rippleTimeline = 0;

  // Configuration
  private config: DotMatrixConfig;
  private currentSizePreference: 'normal' | 'large' = 'normal';
  private reduceEffectsActive = false;
  private keepGlowPreference = true;
  private currentTheme = 'custom';
  private intensityPreset = 'default';
  private baseMotionRange = 0;
  private baseWaveSpeed = 0;
  private instanceCount = 0;

  // Quality tier system
  private currentQualityTier: QualityTier = 'high';
  private frameSkipCounter = 0;
  private targetFrameRate = 60;

  // Bloom settings
  private bloomPresets = BLOOM_PRESET_DEFS['modern']!;
  private bloomSettings: BloomSettings = {
    zIndexBase: 1,
    zIndexBloom: 2,
    blurRadius: 0,
    brightness: 0,
    blendMode: 'screen',
  };
  private currentBloomMode: 'small' | 'large' = 'small';

  // Atmosphere state
  private pendingAtmospherePreset: AtmospherePreset =
    ATMOSPHERE_PRESETS.default ?? ATMOSPHERE_PRESETS['night']!;
  private atmoStrengthOverride: number | null = null;
  private atmoStrengthCurrent = ATMOSPHERE_PRESETS.default?.strength ?? 0.5;
  private atmoStrengthTarget = ATMOSPHERE_PRESETS.default?.strength ?? 0.5;
  private atmoPointer: AtmoPointer = { targetX: 0.5, targetY: 0.5, currentX: 0.5, currentY: 0.5 };
  private atmosphereRipplesEnabled = true;
  private rippleState: RippleState = {
    centers: Array.from({ length: ATMOSPHERE_RIPPLE_COUNT }, () => ({ x: 0.5, y: 0.5 })),
    times: new Array(ATMOSPHERE_RIPPLE_COUNT).fill(-1000),
    index: 0,
  };

  // Awareness system
  private awarenessState: AwarenessState = AWARENESS_STATES.IDLE;
  private awarenessTransitionStart = 0;
  private breathPhase = 0;
  private lastKeystrokeTime = 0;
  private focusPoint: FocusPoint = { x: 0.5, y: 0.5, targetX: 0.5, targetY: 0.5 };
  private cursorPoint: Point2D = { x: 0.5, y: 0.5 };
  private cursorActive = false;
  private lastCursorMoveTime = 0;
  private lastFocusTargetX = 0.5;
  private lastFocusTargetY = 0.5;
  private focusVelocity = 0;

  // Spring instances
  private focusSpringX = new Spring(0.5, SPRING_FOCUS_STIFFNESS, SPRING_FOCUS_DAMPING);
  private focusSpringY = new Spring(0.5, SPRING_FOCUS_STIFFNESS, SPRING_FOCUS_DAMPING);
  private cameraSpringX = new Spring(0, SPRING_CAMERA_STIFFNESS, SPRING_CAMERA_DAMPING);
  private cameraSpringY = new Spring(0, SPRING_CAMERA_STIFFNESS, SPRING_CAMERA_DAMPING);
  private depthSpring = new Spring(0.5, SPRING_DEPTH_STIFFNESS, SPRING_DEPTH_DAMPING);
  private rotationSpring = new Spring(0, SPRING_ROTATION_STIFFNESS, SPRING_ROTATION_DAMPING);
  private handPresenceSpring = new Spring(0, SPRING_PRESENCE_STIFFNESS, SPRING_PRESENCE_DAMPING);
  private modifierSprings = {
    speedMultiplier: new Spring(
      STATE_MODIFIERS[AWARENESS_STATES.IDLE].speedMultiplier,
      SPRING_STATE_STIFFNESS,
      SPRING_STATE_DAMPING
    ),
    motionMultiplier: new Spring(
      STATE_MODIFIERS[AWARENESS_STATES.IDLE].motionMultiplier,
      SPRING_STATE_STIFFNESS,
      SPRING_STATE_DAMPING
    ),
    cohesion: new Spring(
      STATE_MODIFIERS[AWARENESS_STATES.IDLE].cohesion,
      SPRING_STATE_STIFFNESS,
      SPRING_STATE_DAMPING
    ),
    brightness: new Spring(
      STATE_MODIFIERS[AWARENESS_STATES.IDLE].brightness,
      SPRING_STATE_STIFFNESS,
      SPRING_STATE_DAMPING
    ),
  };

  // Camera/depth state
  private depthTarget = 0.5;
  private depthCurrent = 0.5;
  private rotationTarget = 0;
  private rotationCurrent = 0;
  private cameraOffsetX = 0;
  private cameraOffsetY = 0;

  // Current modifiers
  private currentModifiers: StateModifier = { ...STATE_MODIFIERS[AWARENESS_STATES.IDLE] };
  private targetModifiers: StateModifier = { ...STATE_MODIFIERS[AWARENESS_STATES.IDLE] };

  // Cached parsed colors (avoid hexToRgb per frame)
  private baseColorParsed = new THREE.Color(0, 0, 0);
  private secondaryColorParsed = new THREE.Color(0, 0, 0);

  // Hand tracking state
  private handPresent = false;
  private handPresenceStrength = 0;
  private handLandmarks: Landmark[] | null = null;
  private handLandmarksActive = false;

  // Presence field state
  private handCenterWorld: Point3D = { x: 0, y: 0, z: 0 };
  private lastHandCenterWorld: Point3D = { x: 0, y: 0, z: 0 };
  private handVelocityWorld: Point3D = { x: 0, y: 0, z: 0 };
  private handApproaching = 0;
  private presenceStrength = 0;

  // Energy state
  private globalEnergy = 0;
  private stillnessTimer = 0;
  private lastKeystrokeEnergy = 0;
  private keystrokeEnergyDecay = 0.92;

  // Visibility state
  private spheresVisible = true;
  private gameModeOpacity = 1.0;
  private readingOverlayOpen = false;

  // OrbitControls state
  private controls: OrbitControls | null = null;
  private pointerGate: PointerGate | null = null;
  private wantsInteractiveControls = true;
  private controlsSuppressedByOverlay = false;
  private wasOrbitActive = false;
  private orbitRecoveryPending = false; // Block parallax until cursor moves after orbit
  private orbitWasUsed = false; // Once true, parallax camera positioning is permanently disabled

  // Event handlers (bound for removal)
  private boundOnResize: () => void;
  private boundOnPointerMove: (e: PointerEvent) => void;
  private boundOnPointerDown: (e: PointerEvent) => void;
  private boundOnContextLost: (e: Event) => void;
  private boundOnContextRestored: () => void;
  private boundOnThemeChange: (e: Event) => void;

  constructor() {
    // Initialize config from templates
    const templates = CONFIG_TEMPLATES.modern;
    if (!templates) throw new Error('Missing CONFIG_TEMPLATES.modern');
    this.config = { ...(templates.normal ?? {}) };

    // Read preferences
    this.readPreferences();

    // Bind event handlers
    this.boundOnResize = this.onResize.bind(this);
    this.boundOnPointerMove = this.onPointerMove.bind(this);
    this.boundOnPointerDown = this.onPointerDown.bind(this);
    this.boundOnContextLost = this.handleContextLost.bind(this);
    this.boundOnContextRestored = this.handleContextRestored.bind(this);
    this.boundOnThemeChange = this.onThemeChange.bind(this);
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private readPreferences(): void {
    // Size preference
    const pref = storageGet(LS_DOTMATRIX_SIZE);
    if (pref === 'normal' || pref === 'large') {
      this.currentSizePreference = pref;
    } else {
      this.currentSizePreference = 'normal';
      storageSet(LS_DOTMATRIX_SIZE, 'normal');
    }

    // Reduce effects — the UI toggle was removed; use OS preference only.
    // Clear stale localStorage key so legacy users aren't trapped in legacy shader mode.
    try {
      localStorage.removeItem(LS_DOTMATRIX_REDUCE);
    } catch {
      // Ignore — may not have localStorage access
    }
    this.reduceEffectsActive = prefersReducedMotion();

    // Keep glow
    const glowStored = storageGet(LS_DOTMATRIX_KEEP_GLOW);
    this.keepGlowPreference = glowStored !== 'false';
    this.atmosphereRipplesEnabled = this.keepGlowPreference;

    // Quality tier
    const savedTier = storageGet(LS_QUALITY_TIER);
    if (
      savedTier === 'ultra' ||
      savedTier === 'high' ||
      savedTier === 'medium' ||
      savedTier === 'low'
    ) {
      this.currentQualityTier = savedTier;
    }

    // Apply template based on preferences
    const activeTemplates = CONFIG_TEMPLATES[this.reduceEffectsActive ? 'legacy' : 'modern'];
    if (!activeTemplates) throw new Error('Missing CONFIG_TEMPLATES');
    this.config = { ...(activeTemplates.normal ?? {}) };
    if (this.currentSizePreference === 'large' && activeTemplates.large) {
      Object.assign(this.config, activeTemplates.large);
    }

    this.instanceCount = this.config.gridXCount * this.config.gridYCount * this.config.gridZCount;
    this.baseMotionRange = this.config.motionRange;
    this.baseWaveSpeed = this.config.waveSpeed;

    // Bloom presets
    this.bloomPresets = BLOOM_PRESET_DEFS[this.reduceEffectsActive ? 'legacy' : 'modern']!;
    this.currentBloomMode = this.currentSizePreference === 'large' ? 'large' : 'small';
    this.applyBloomMode(this.currentBloomMode);
    // Reduced effects or mobile gets less frequent bloom updates
    const mobileInterval = IS_MOBILE ? BLOOM_UPDATE_INTERVAL_MOBILE : BLOOM_UPDATE_INTERVAL_DESKTOP;
    this.bloomUpdateEveryNFrames = this.reduceEffectsActive ? 3 : mobileInterval;
  }

  private setupThree(): void {
    const container = document.getElementById('canvas-container');
    if (!container) return;
    this.canvasContainer = container;

    try {
      const rendererOpts: THREE.WebGLRendererParameters = this.reduceEffectsActive
        ? { antialias: true, alpha: true }
        : { antialias: true, alpha: true, powerPreference: 'high-performance' };
      this.renderer = new THREE.WebGLRenderer(rendererOpts);

      if (THREE.SRGBColorSpace) {
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      }
      if (!this.reduceEffectsActive && THREE.ACESFilmicToneMapping) {
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
      }
    } catch (err) {
      logError('graphics', 'dotmatrix:webglFailed', err as Error);
      const cc = document.getElementById('canvas-container');
      if (cc) {
        cc.style.display = 'none';
        cc.style.pointerEvents = 'none';
      }
      return;
    }

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x000000, 0);

    this.canvasEl = this.renderer.domElement;
    this.canvasEl.style.display = 'none';
    this.canvasEl.style.opacity = '0';
    this.canvasEl.style.pointerEvents = IS_MOBILE ? 'auto' : 'none';
    this.canvasEl.style.willChange = 'transform, opacity';
    this.canvasEl.style.transform = 'translateZ(0)';
    this.canvasEl.style.contain = 'strict';
    this.canvasEl.style.background = 'transparent';
    this.canvasEl.style.position = 'absolute';
    this.canvasEl.style.top = '0';
    this.canvasEl.style.left = '0';
    this.canvasEl.style.width = '100%';
    this.canvasEl.style.height = '100%';
    this.canvasEl.style.zIndex = String(this.bloomSettings.zIndexBase);

    container.appendChild(this.canvasEl);

    // WebGL context loss handlers
    this.canvasEl.addEventListener('webglcontextlost', this.boundOnContextLost, false);
    this.canvasEl.addEventListener('webglcontextrestored', this.boundOnContextRestored, false);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      window.innerWidth / window.innerHeight,
      CAMERA_NEAR,
      CAMERA_FAR
    );
    this.camera.position.set(0, 0, this.config.cameraZ);
    this.scene.add(this.camera);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.initAtmosphereLayer();

    // Use CSS bloom (composer bloom disabled for reliability)
    this.usingComposerBloom = false;
    this.initBloomOverlay(container, this.canvasEl);

    this.perlinTex = buildPerlinTexture(THREE);
    this.noiseAtlasTex = buildNoiseAtlas(THREE);
    this.landmarkTexture = this.buildLandmarkTexture();
    this.createMaterial();

    const sphereGeo = new THREE.SphereGeometry(
      this.config.sphereSize,
      this.config.detailX,
      this.config.detailY
    );
    // Cast needed: Three.js runtime accepts BufferGeometry but @types/three restricts to InstancedBufferGeometry
    this.instGeo = new THREE.InstancedBufferGeometry().copy(
      sphereGeo as unknown as THREE.InstancedBufferGeometry
    );
    sphereGeo.dispose();

    this.populateInstanceAttributes(this.instGeo);
    this.mesh = new THREE.Mesh(this.instGeo, this.material!);
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);

    this.applySpheresVisibility();

    window.addEventListener('resize', this.boundOnResize, { passive: true });
    window.addEventListener('pointermove', this.boundOnPointerMove, { passive: true });
    window.addEventListener('pointerdown', this.boundOnPointerDown, { passive: true });
    window.addEventListener('themeChange', this.boundOnThemeChange);

    // Initialize OrbitControls
    this.refreshControlsState();
  }

  // ============================================================================
  // MATERIAL CREATION
  // ============================================================================

  private createMaterial(): void {
    this.updateCachedColors();

    const uniforms: Record<string, THREE.IUniform> = {
      uTime: { value: this.waveTime },
      uBaseColor: { value: this.baseColorParsed.clone() },
      uSecondaryColor: { value: this.secondaryColorParsed.clone() },
      uSpacing: { value: this.config.spacing },
      uGrid: {
        value: new THREE.Vector3(
          this.config.gridXCount,
          this.config.gridYCount,
          this.config.gridZCount
        ),
      },
      uOffset: {
        value: new THREE.Vector3(
          (-(this.config.gridXCount - 1) * this.config.spacing) / 2,
          (-(this.config.gridYCount - 1) * this.config.spacing) / 2,
          (-(this.config.gridZCount - 1) * this.config.spacing) / 2
        ),
      },
      uMotionRange: { value: this.config.motionRange },
      uPerlin: { value: this.perlinTex },
      uNoiseAtlas: { value: this.noiseAtlasTex },
      uStartElapsed: { value: this.elapsedSinceStartMs / 1000 },
      // Awareness uniforms
      uBreathPhase: { value: 0.0 },
      uCohesion: { value: 0.0 },
      uFocusPoint: { value: new THREE.Vector2(0.5, 0.5) },
      uFocusScale: { value: new THREE.Vector2(462, 462) },
      uFocusAttraction: { value: 0.0 },
      uAwarenessBrightness: { value: 0.0 },
      // Hand landmark uniforms
      uLandmarkTex: { value: this.landmarkTexture },
      uLandmarkMode: { value: 0.0 },
      uLandmarkWorldScale: { value: LANDMARK_WORLD_SCALE },
      uLandmarkDepthScale: { value: LANDMARK_DEPTH_SCALE },
      uLandmarkAttraction: { value: LANDMARK_ATTRACTION },
      // Presence field uniforms
      uHandCenter: { value: new THREE.Vector3(0, 0, 0) },
      uHandVelocity: { value: new THREE.Vector3(0, 0, 0) },
      uHandApproaching: { value: 0.0 },
      uPresenceStrength: { value: 0.0 },
      uPresenceRadius: { value: PRESENCE_RADIUS },
      uPresenceAttraction: { value: PRESENCE_ATTRACTION_BASE },
      // Global energy uniform
      uGlobalEnergy: { value: 0.0 },
    };

    if (this.reduceEffectsActive) {
      uniforms.uLightDir = { value: new THREE.Vector3(0, -1, 1).normalize() };
      uniforms.uAmbient = { value: 1.0 };

      this.material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: createLegacyVertexShader(),
        fragmentShader: FRAGMENT_SHADER_LEGACY,
        transparent: false,
        depthWrite: true,
        depthTest: true,
        blending: THREE.NormalBlending,
      });
    } else {
      // Three-point lighting for ultra-realistic look
      uniforms.uLightDir1 = { value: new THREE.Vector3(0.5, -0.6, 0.6).normalize() }; // Key light (front-right-top)
      uniforms.uLightDir2 = { value: new THREE.Vector3(-0.6, 0.2, 0.4).normalize() }; // Fill light (left-front)
      uniforms.uLightDir3 = { value: new THREE.Vector3(0.0, 0.4, -0.9).normalize() }; // Rim light (back)
      uniforms.uAmbient = { value: MATERIAL_AMBIENT };
      uniforms.uSpecularColor = { value: new THREE.Color(1, 1, 1) };
      uniforms.uShininess = { value: MATERIAL_SHININESS }; // Legacy compatibility
      uniforms.uRoughness = { value: MATERIAL_ROUGHNESS };
      uniforms.uMetalness = { value: MATERIAL_METALNESS };
      uniforms.uFresnelPower = { value: MATERIAL_FRESNEL_POWER };
      uniforms.uEmissionStrength = { value: MATERIAL_EMISSION_STRENGTH };

      this.material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: createModernVertexShader(),
        fragmentShader: FRAGMENT_SHADER_MODERN,
        transparent: false,
        depthWrite: true,
        depthTest: true,
        blending: THREE.NormalBlending,
      });
    }

    this.updateFocusScale();
  }

  // ============================================================================
  // INSTANCE ATTRIBUTES
  // ============================================================================

  private populateInstanceAttributes(targetGeo: THREE.InstancedBufferGeometry): void {
    this.instanceCount = this.config.gridXCount * this.config.gridYCount * this.config.gridZCount;

    const idxArray = new Float32Array(this.instanceCount * 3);
    const jitterArray = new Float32Array(this.instanceCount * 3);
    const scatterArray = new Float32Array(this.instanceCount * 3);

    const jitterScale = this.getStartupJitterScale();
    const scatterScale = this.getPersistentScatterScale();

    let idxPtr = 0;
    let jPtr = 0;
    let sPtr = 0;
    let jitterSumX = 0,
      jitterSumY = 0,
      jitterSumZ = 0;
    let scatterSumX = 0,
      scatterSumY = 0,
      scatterSumZ = 0;

    for (let i = 0; i < this.config.gridXCount; i++) {
      for (let j = 0; j < this.config.gridYCount; j++) {
        for (let k = 0; k < this.config.gridZCount; k++) {
          idxArray[idxPtr++] = i;
          idxArray[idxPtr++] = j;
          idxArray[idxPtr++] = k;

          const jx = (Math.random() * 2 - 1) * jitterScale;
          const jy = (Math.random() * 2 - 1) * jitterScale;
          const jz = (Math.random() * 2 - 1) * jitterScale;
          jitterArray[jPtr++] = jx;
          jitterArray[jPtr++] = jy;
          jitterArray[jPtr++] = jz;
          jitterSumX += jx;
          jitterSumY += jy;
          jitterSumZ += jz;

          const sx = (pseudoRandomUnit(i, j, k, 11) * 2 - 1) * scatterScale;
          const sy = (pseudoRandomUnit(i, j, k, 23) * 2 - 1) * scatterScale;
          const sz = (pseudoRandomUnit(i, j, k, 37) * 2 - 1) * scatterScale;
          scatterArray[sPtr++] = sx;
          scatterArray[sPtr++] = sy;
          scatterArray[sPtr++] = sz;
          scatterSumX += sx;
          scatterSumY += sy;
          scatterSumZ += sz;
        }
      }
    }

    // Center the offsets
    const invCount = this.instanceCount > 0 ? 1 / this.instanceCount : 0;
    const jitterAvgX = jitterSumX * invCount;
    const jitterAvgY = jitterSumY * invCount;
    const jitterAvgZ = jitterSumZ * invCount;
    const scatterAvgX = scatterSumX * invCount;
    const scatterAvgY = scatterSumY * invCount;
    const scatterAvgZ = scatterSumZ * invCount;

    for (let n = 0; n < this.instanceCount; n++) {
      const base = n * 3;
      // TypedArray indices are valid by construction (instanceCount * 3 = array length)
      jitterArray[base] = (jitterArray[base] ?? 0) - jitterAvgX;
      jitterArray[base + 1] = (jitterArray[base + 1] ?? 0) - jitterAvgY;
      jitterArray[base + 2] = (jitterArray[base + 2] ?? 0) - jitterAvgZ;
      scatterArray[base] = (scatterArray[base] ?? 0) - scatterAvgX;
      scatterArray[base + 1] = (scatterArray[base + 1] ?? 0) - scatterAvgY;
      scatterArray[base + 2] = (scatterArray[base + 2] ?? 0) - scatterAvgZ;
    }

    // Bake per-instance pseudo-random values that the shader would otherwise
    // recompute identically every frame using sin/fract ALU.
    // Layout:
    //   instanceRandA (vec4): radiusNoise, unused, unused, breathDepth
    //   instanceRandB (vec4): baryU, baryV, jitterX_raw, jitterY_raw
    //   instanceRandC (vec2): jitterZ_raw, energySensitivity
    const randAArray = new Float32Array(this.instanceCount * 4);
    const randBArray = new Float32Array(this.instanceCount * 4);
    const randCArray = new Float32Array(this.instanceCount * 2);

    for (let n = 0; n < this.instanceCount; n++) {
      const idxF = n;
      const seed = idxF * 0.1;

      // Bone interpolation: radiusNoise = 0.7 + 0.6 * fract(sin(seed * 43.17) * 12345.6)
      const radiusNoise = 0.7 + 0.6 * fract(Math.sin(seed * 43.17) * 12345.6);

      // Normal animation: breathDepth = 0.1 + fract(sin(idx * 12.9898)) * 0.1
      const breathDepth = 0.1 + fract(Math.sin(idxF * 12.9898)) * 0.1;

      randAArray[n * 4] = radiusNoise;
      randAArray[n * 4 + 1] = 0;
      randAArray[n * 4 + 2] = 0;
      randAArray[n * 4 + 3] = breathDepth;

      // Palm fill: barycentric + jitter (use palmIdx = n - 321 as seed)
      const palmSeed = n - 321;
      const baryU = fract(Math.sin(palmSeed * 12.9898) * 43758.5453);
      const baryV = fract(Math.sin(palmSeed * 78.233) * 43758.5453);
      const jitterXRaw = fract(Math.sin(palmSeed * 45.17) * 12345.6);
      const jitterYRaw = fract(Math.sin(palmSeed * 67.89) * 23456.7);

      randBArray[n * 4] = baryU;
      randBArray[n * 4 + 1] = baryV;
      randBArray[n * 4 + 2] = jitterXRaw;
      randBArray[n * 4 + 3] = jitterYRaw;

      // jitterZ + energySensitivity
      const jitterZRaw = fract(Math.sin(palmSeed * 89.12) * 34567.8);
      const energySensitivity = 0.7 + fract(Math.sin(idxF * 45.233) * 43758.5453) * 0.6;

      randCArray[n * 2] = jitterZRaw;
      randCArray[n * 2 + 1] = energySensitivity;
    }

    const idxAttr = new THREE.InstancedBufferAttribute(idxArray, 3);
    const scatterAttr = new THREE.InstancedBufferAttribute(scatterArray, 3);
    const jitterAttr = new THREE.InstancedBufferAttribute(jitterArray, 3);
    const randAAttr = new THREE.InstancedBufferAttribute(randAArray, 4);
    const randBAttr = new THREE.InstancedBufferAttribute(randBArray, 4);
    const randCAttr = new THREE.InstancedBufferAttribute(randCArray, 2);

    targetGeo.setAttribute('instanceIdx', idxAttr);
    targetGeo.setAttribute('instanceScatter', scatterAttr);
    targetGeo.setAttribute('instanceJitter', jitterAttr);
    targetGeo.setAttribute('instanceRandA', randAAttr);
    targetGeo.setAttribute('instanceRandB', randBAttr);
    targetGeo.setAttribute('instanceRandC', randCAttr);
    targetGeo.instanceCount = this.instanceCount;
  }

  private getStartupJitterScale(): number {
    const spacing = Math.max(1, this.config.spacing);
    const motion = Math.max(1, this.config.motionRange);
    const spacingFactor = spacing * 3 + 60;
    const motionFactor = motion * 0.12;
    const scale = Math.min(motionFactor, spacingFactor);
    return Math.max(6, scale);
  }

  private getPersistentScatterScale(): number {
    const spacing = Math.max(1, this.config.spacing);
    const motion = Math.max(1, this.config.motionRange);
    const spacingInfluence = spacing * 0.45 + 8;
    const motionInfluence = Math.min(spacing * 0.75, motion * 0.06 + 12);
    const scale = Math.min(spacingInfluence + motionInfluence, spacing * 1.35 + 40);
    return Math.max(10, scale);
  }

  // ============================================================================
  // LANDMARK TEXTURES
  // ============================================================================

  private buildLandmarkTexture(): THREE.DataTexture {
    const data = new Float32Array(8 * 3 * 4);
    for (let i = 0; i < data.length; i++) data[i] = 0;
    const tex = new THREE.DataTexture(data, 8, 3, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }

  private updateLandmarkTexture(): void {
    if (!this.landmarkTexture || !this.handLandmarks || this.handLandmarks.length !== 21) return;
    const data = (this.landmarkTexture.image as Float32ImageData).data;

    // Calculate palm center
    const wrist = this.handLandmarks[0]!;
    const indexMcp = this.handLandmarks[5]!;
    const middleMcp = this.handLandmarks[9]!;
    const ringMcp = this.handLandmarks[13]!;
    const pinkyMcp = this.handLandmarks[17]!;

    const palmCenterX = (wrist.x + indexMcp.x + middleMcp.x + ringMcp.x + pinkyMcp.x) / 5;
    const palmCenterY = (wrist.y + indexMcp.y + middleMcp.y + ringMcp.y + pinkyMcp.y) / 5;
    const palmCenterZ =
      ((wrist.z || 0) +
        (indexMcp.z || 0) +
        (middleMcp.z || 0) +
        (ringMcp.z || 0) +
        (pinkyMcp.z || 0)) /
      5;

    const palmWidth = Math.sqrt((indexMcp.x - pinkyMcp.x) ** 2 + (indexMcp.y - pinkyMcp.y) ** 2);

    const referencePalmWidth = 0.15;
    const scale = palmWidth > 0.01 ? referencePalmWidth / palmWidth : 1.0;

    // Update presence field hand center
    const worldScale = this.config.motionRange * 2.0;
    const depthScale = this.config.motionRange * 0.5;
    const mirroredX = 1.0 - palmCenterX;
    const newHandX = (mirroredX - 0.5) * worldScale;
    const newHandY = (0.5 - palmCenterY) * worldScale;
    const newHandZ = -palmCenterZ * scale * depthScale;

    if (this.presenceStrength < 0.05) {
      this.handCenterWorld = { x: newHandX, y: newHandY, z: newHandZ };
      this.lastHandCenterWorld = { ...this.handCenterWorld };
      this.handVelocityWorld = { x: 0, y: 0, z: 0 };
    } else {
      this.lastHandCenterWorld = { ...this.handCenterWorld };
      this.handCenterWorld = { x: newHandX, y: newHandY, z: newHandZ };

      const rawVelX = this.handCenterWorld.x - this.lastHandCenterWorld.x;
      const rawVelY = this.handCenterWorld.y - this.lastHandCenterWorld.y;
      const rawVelZ = this.handCenterWorld.z - this.lastHandCenterWorld.z;
      this.handVelocityWorld.x += (rawVelX - this.handVelocityWorld.x) * HAND_VELOCITY_SMOOTHING;
      this.handVelocityWorld.y += (rawVelY - this.handVelocityWorld.y) * HAND_VELOCITY_SMOOTHING;
      this.handVelocityWorld.z += (rawVelZ - this.handVelocityWorld.z) * HAND_VELOCITY_SMOOTHING;
    }

    const distToCenter = Math.sqrt(
      this.handCenterWorld.x ** 2 + this.handCenterWorld.y ** 2 + this.handCenterWorld.z ** 2
    );
    const lastDistToCenter = Math.sqrt(
      this.lastHandCenterWorld.x ** 2 +
        this.lastHandCenterWorld.y ** 2 +
        this.lastHandCenterWorld.z ** 2
    );
    this.handApproaching = (lastDistToCenter - distToCenter) * 10;
    this.presenceStrength += (1.0 - this.presenceStrength) * PRESENCE_FADE_IN_RATE;

    for (let i = 0; i < 21; i++) {
      const lm = this.handLandmarks[i]!;
      const idx = i * 4;

      const normalizedX = palmCenterX + (lm.x - palmCenterX) * scale;
      const normalizedY = palmCenterY + (lm.y - palmCenterY) * scale;

      data[idx + 0] = 1.0 - normalizedX;
      data[idx + 1] = normalizedY;
      data[idx + 2] = (lm.z || 0) * scale;
      data[idx + 3] = 1.0;
    }

    for (let i = 21; i < 24; i++) {
      const idx = i * 4;
      data[idx + 3] = 0.0;
    }
    this.landmarkTexture.needsUpdate = true;
  }

  // ============================================================================
  // ATMOSPHERE LAYER
  // ============================================================================

  private initAtmosphereLayer(): void {
    if (!this.scene || !this.camera) return;
    if (this.atmosphereMesh) return;

    const seedPreset = this.pendingAtmospherePreset || this.getAtmospherePreset(this.currentTheme);
    const defaultPreset = ATMOSPHERE_PRESETS.default!;
    const rippleCenters: THREE.Vector2[] = [];
    for (let i = 0; i < ATMOSPHERE_RIPPLE_COUNT; i++) {
      const center = this.rippleState.centers[i]!;
      rippleCenters.push(new THREE.Vector2(center.x, center.y));
    }
    const rippleTimes = new Float32Array(ATMOSPHERE_RIPPLE_COUNT);
    for (let i = 0; i < ATMOSPHERE_RIPPLE_COUNT; i++) {
      rippleTimes[i] = this.rippleState.times[i]!;
    }

    this.atmosphereUniforms = {
      uTime: { value: this.waveTime },
      uStrength: { value: this.atmoStrengthCurrent },
      uLeftColor: { value: new THREE.Color(seedPreset.left || defaultPreset.left) },
      uRightColor: { value: new THREE.Color(seedPreset.right || defaultPreset.right) },
      uTopColor: { value: new THREE.Color(seedPreset.top || defaultPreset.top) },
      uBottomColor: {
        value: new THREE.Color(seedPreset.bottom || defaultPreset.bottom),
      },
      uCenterColor: {
        value: new THREE.Color(seedPreset.center || defaultPreset.center),
      },
      uShift: { value: new THREE.Vector2(0, 0) },
      uGlobalTime: { value: this.rippleTimeline },
      uRippleScale: {
        value:
          !this.reduceEffectsActive && this.atmosphereRipplesEnabled ? ATMOSPHERE_RIPPLE_SCALE : 0,
      },
      uRippleCenters: { value: rippleCenters },
      uRippleTimes: { value: rippleTimes },
    };

    this.syncAtmosphereRippleUniforms();

    this.atmosphereMaterial = new THREE.ShaderMaterial({
      uniforms: this.atmosphereUniforms,
      vertexShader: ATMOSPHERE_VERTEX_SHADER,
      fragmentShader: createAtmosphereFragmentShader(),
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.atmosphereMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.atmosphereMaterial);
    this.atmosphereMesh.frustumCulled = false;
    this.atmosphereMesh.renderOrder = -1; // Render BEFORE spheres so atmosphere appears behind
    this.scene.add(this.atmosphereMesh);

    this.applyAtmospherePreset(seedPreset, { immediate: true });
  }

  private disposeAtmosphereLayer(): void {
    if (this.atmosphereMesh?.parent) {
      this.atmosphereMesh.parent.remove(this.atmosphereMesh);
    }
    this.atmosphereMesh?.geometry?.dispose();
    this.atmosphereMaterial?.dispose();
    this.atmosphereMesh = null;
    this.atmosphereMaterial = null;
    this.atmosphereUniforms = null;
  }

  private getAtmospherePreset(themeName: string): AtmospherePreset {
    const key = normalizeTheme(themeName);
    return ATMOSPHERE_PRESETS[key] || ATMOSPHERE_PRESETS.default!;
  }

  private applyAtmospherePreset(
    preset: AtmospherePreset,
    options: { immediate?: boolean } = {}
  ): void {
    if (!preset) return;
    this.pendingAtmospherePreset = preset;

    if (this.atmosphereUniforms) {
      const fallback = ATMOSPHERE_PRESETS.default!;
      (this.atmosphereUniforms.uLeftColor!.value as THREE.Color).set(preset.left || fallback.left);
      (this.atmosphereUniforms.uRightColor!.value as THREE.Color).set(
        preset.right || fallback.right
      );
      (this.atmosphereUniforms.uTopColor!.value as THREE.Color).set(preset.top || fallback.top);
      (this.atmosphereUniforms.uBottomColor!.value as THREE.Color).set(
        preset.bottom || fallback.bottom
      );
      (this.atmosphereUniforms.uCenterColor!.value as THREE.Color).set(
        preset.center || fallback.center
      );
    }

    const baseStrength = clamp01(
      typeof preset.strength === 'number' ? preset.strength : ATMOSPHERE_PRESETS.default!.strength
    );
    const override = this.atmoStrengthOverride;
    let target = override !== null ? clamp01(override) : baseStrength;
    if (this.reduceEffectsActive) {
      target = override === null ? 0 : Math.min(target, 0.2);
    }
    this.atmoStrengthTarget = target;

    if (options.immediate) {
      this.atmoStrengthCurrent = this.atmoStrengthTarget;
      if (this.atmosphereUniforms) {
        this.atmosphereUniforms.uStrength!.value = this.atmoStrengthCurrent;
      }
    }
  }

  private syncAtmosphereRippleUniforms(): void {
    if (!this.atmosphereUniforms) return;
    const centersUniform = this.atmosphereUniforms.uRippleCenters;
    const timesUniform = this.atmosphereUniforms.uRippleTimes;

    if (centersUniform && Array.isArray(centersUniform.value)) {
      const centers = centersUniform.value as THREE.Vector2[];
      for (let i = 0; i < Math.min(centers.length, ATMOSPHERE_RIPPLE_COUNT); i++) {
        const rippleCenter = this.rippleState.centers[i]!;
        centers[i]!.set(rippleCenter.x, rippleCenter.y);
      }
    }

    if (timesUniform && timesUniform.value) {
      const times = timesUniform.value as Float32Array;
      for (let i = 0; i < ATMOSPHERE_RIPPLE_COUNT; i++) {
        times[i] = this.rippleState.times[i]!;
      }
    }
  }

  private resetAtmosphereRipples(): void {
    this.rippleTimeline = 0;
    this.rippleState.index = 0;
    for (let i = 0; i < ATMOSPHERE_RIPPLE_COUNT; i++) {
      this.rippleState.centers[i] = { x: 0.5, y: 0.5 };
      this.rippleState.times[i] = -1000;
    }
    this.syncAtmosphereRippleUniforms();
    this.updateRippleScaleUniform();
  }

  private pruneExpiredRipples(): void {
    if (!this.atmosphereRipplesEnabled) return;
    let changed = false;
    for (let i = 0; i < ATMOSPHERE_RIPPLE_COUNT; i++) {
      const start = this.rippleState.times[i]!;
      if (start >= 0) {
        const age = this.rippleTimeline - start;
        if (!isFinite(age) || age > ATMOSPHERE_RIPPLE_MAX_AGE) {
          this.rippleState.times[i] = -1000;
          changed = true;
        }
      }
    }
    if (changed) {
      this.syncAtmosphereRippleUniforms();
    }
  }

  private updateRippleScaleUniform(): void {
    if (this.atmosphereUniforms?.uRippleScale) {
      this.atmosphereUniforms.uRippleScale.value =
        !this.reduceEffectsActive && this.atmosphereRipplesEnabled ? ATMOSPHERE_RIPPLE_SCALE : 0;
    }
  }

  // ============================================================================
  // BLOOM OVERLAY
  // ============================================================================

  private initBloomOverlay(container: HTMLElement, baseCanvas: HTMLCanvasElement): void {
    if (!container || !baseCanvas) return;
    if (!this.bloomCanvas) {
      this.bloomCanvas = document.createElement('canvas');
      this.bloomCanvas.id = 'bloom-canvas';
      // Use reduced resolution for better performance (CSS scales it up)
      const scale = this.bloomResolutionScale;
      this.bloomCanvas.width = Math.floor(baseCanvas.width * scale);
      this.bloomCanvas.height = Math.floor(baseCanvas.height * scale);
      this.bloomCanvas.style.position = 'absolute';
      this.bloomCanvas.style.top = '0';
      this.bloomCanvas.style.left = '0';
      this.bloomCanvas.style.width = baseCanvas.style.width || `${window.innerWidth}px`;
      this.bloomCanvas.style.height = baseCanvas.style.height || `${window.innerHeight}px`;
      this.bloomCanvas.style.pointerEvents = 'none';
      this.bloomCanvas.style.background = 'transparent';
      this.bloomCanvas.style.zIndex = String(this.bloomSettings.zIndexBloom);
      this.bloomCanvas.style.mixBlendMode = this.bloomSettings.blendMode;
      this.bloomCanvas.style.filter = `blur(${this.bloomSettings.blurRadius}px) brightness(${1 + this.bloomSettings.brightness})`;
      container.appendChild(this.bloomCanvas);
      this.bloomCtx = this.bloomCanvas.getContext('2d');
    }
  }

  private resizeBloomOverlay(): void {
    if (!this.bloomCanvas || !this.renderer) return;
    const scale = this.bloomResolutionScale;
    const w = Math.floor(this.renderer.domElement.width * scale);
    const h = Math.floor(this.renderer.domElement.height * scale);
    if (this.bloomCanvas.width !== w || this.bloomCanvas.height !== h) {
      this.bloomCanvas.width = w;
      this.bloomCanvas.height = h;
    }
    this.bloomCanvas.style.width = this.renderer.domElement.style.width;
    this.bloomCanvas.style.height = this.renderer.domElement.style.height;
  }

  private updateBloomOverlay(): void {
    if (!this.bloomCtx || !this.renderer?.domElement) return;
    this.bloomFrameCounter++;
    if (
      this.bloomUpdateEveryNFrames > 1 &&
      this.bloomFrameCounter % this.bloomUpdateEveryNFrames !== 0
    )
      return;
    // Draw to half-res canvas; CSS scales up (blur hides resolution loss)
    this.bloomCtx.clearRect(0, 0, this.bloomCanvas!.width, this.bloomCanvas!.height);
    this.bloomCtx.drawImage(
      this.renderer.domElement,
      0,
      0,
      this.renderer.domElement.width,
      this.renderer.domElement.height,
      0,
      0,
      this.bloomCanvas!.width,
      this.bloomCanvas!.height
    );
  }

  private disposeBloomOverlay(): void {
    if (this.bloomCanvas?.parentNode) {
      this.bloomCanvas.parentNode.removeChild(this.bloomCanvas);
    }
    this.bloomCanvas = null;
    this.bloomCtx = null;
  }

  private applyBloomMode(mode: 'small' | 'large'): void {
    // bloomPresets always has 'small' and 'large' keys (initialized from BLOOM_PRESET_DEFS)
    const preset = this.bloomPresets[mode]!;
    this.currentBloomMode = mode;
    this.bloomSettings.blurRadius = preset.blurRadius;
    this.bloomSettings.brightness = preset.brightness;
    this.bloomSettings.blendMode = preset.blendMode;
    if (this.bloomCanvas) {
      this.bloomCanvas.style.mixBlendMode = this.bloomSettings.blendMode;
      this.bloomCanvas.style.filter = `blur(${this.bloomSettings.blurRadius}px) brightness(${1 + this.bloomSettings.brightness})`;
    }
  }

  // ============================================================================
  // ANIMATION LOOP
  // ============================================================================

  private animate(now?: number): void {
    if (!this.animationActive) {
      this.lastFrameTime = null;
      return;
    }

    // Frame skipping for 30fps mode (low quality tier)
    // The caller (FrameCoordinator or fallback loop) already schedules the next frame,
    // so we just return without rendering on skipped frames.
    if (this.targetFrameRate === 30) {
      this.frameSkipCounter++;
      if (this.frameSkipCounter % 2 === 1) {
        return;
      }
    }

    const stamp = typeof now === 'number' ? now : performance.now();
    if (this.lastFrameTime === null) this.lastFrameTime = stamp;
    const deltaMs = stamp - this.lastFrameTime;
    this.lastFrameTime = stamp;
    const deltaFactor = Math.min(
      Math.max(deltaMs / FRAME_BASELINE_MS, 0),
      MAX_FRAME_DELTA_MULTIPLIER
    );

    let deltaSeconds = 0;
    if (isFinite(deltaMs) && deltaMs >= 0) {
      this.elapsedSinceStartMs += deltaMs;
      deltaSeconds = deltaMs / 1000;
      this.rippleTimeline += deltaSeconds;
    }

    if (deltaSeconds > 0) {
      this.pruneExpiredRipples();
    }

    // Update awareness system
    this.updateAwareness(deltaMs, stamp, deltaFactor);

    // Update global energy
    this.updateGlobalEnergy(deltaMs);

    // Apply awareness speed modifier to wave progression
    const awarenessSpeedMod =
      this.currentModifiers.speedMultiplier +
      HAND_PRESENCE_MODIFIERS.speedMultiplier * this.handPresenceStrength;
    this.waveTime += this.config.waveSpeed * deltaFactor * awarenessSpeedMod;

    // Update material uniforms
    if (this.material?.uniforms) {
      const uniforms = this.material.uniforms;
      uniforms.uTime!.value = this.waveTime;

      const depthSpreadMult = 1 + Math.max(0, this.depthCurrent - 0.5) * 2 * DEPTH_SPREAD_FACTOR;
      const effectiveSpacing = this.config.spacing * depthSpreadMult;
      uniforms.uSpacing!.value = effectiveSpacing;
      (uniforms.uGrid!.value as THREE.Vector3).set(
        this.config.gridXCount,
        this.config.gridYCount,
        this.config.gridZCount
      );
      (uniforms.uOffset!.value as THREE.Vector3).set(
        (-(this.config.gridXCount - 1) * effectiveSpacing) / 2,
        (-(this.config.gridYCount - 1) * effectiveSpacing) / 2,
        (-(this.config.gridZCount - 1) * effectiveSpacing) / 2
      );

      const motionMod =
        this.currentModifiers.motionMultiplier +
        HAND_PRESENCE_MODIFIERS.motionMultiplier * this.handPresenceStrength;
      uniforms.uMotionRange!.value = this.config.motionRange * motionMod;

      (uniforms.uBaseColor!.value as THREE.Color).copy(this.baseColorParsed);
      (uniforms.uSecondaryColor!.value as THREE.Color).copy(this.secondaryColorParsed);

      if (uniforms.uStartElapsed) {
        uniforms.uStartElapsed.value = Math.min(this.elapsedSinceStartMs / 1000, 60);
      }

      // Awareness uniforms
      if (uniforms.uBreathPhase) {
        uniforms.uBreathPhase.value = this.getBreathOffset();
      }
      if (uniforms.uCohesion) {
        const cohesionMod =
          this.currentModifiers.cohesion +
          HAND_PRESENCE_MODIFIERS.cohesion * this.handPresenceStrength;
        uniforms.uCohesion.value = cohesionMod;
      }
      if (uniforms.uFocusPoint) {
        (uniforms.uFocusPoint.value as THREE.Vector2).set(this.focusPoint.x, this.focusPoint.y);
      }
      if (uniforms.uFocusAttraction) {
        uniforms.uFocusAttraction.value = this.cursorActive ? FOCUS_ATTRACTION_STRENGTH : 0;
      }
      if (uniforms.uAwarenessBrightness) {
        const brightnessMod =
          this.currentModifiers.brightness +
          HAND_PRESENCE_MODIFIERS.brightness * this.handPresenceStrength;
        uniforms.uAwarenessBrightness.value = brightnessMod;
      }
      if (uniforms.uLandmarkMode) {
        uniforms.uLandmarkMode.value = this.handLandmarksActive ? 1.0 : 0.0;
      }

      // Presence field uniforms
      if (uniforms.uHandCenter) {
        if (!this.handLandmarksActive) {
          this.presenceStrength *= PRESENCE_DECAY_RATE;
          if (this.presenceStrength < 0.01) this.presenceStrength = 0;
        }
        (uniforms.uHandCenter.value as THREE.Vector3).set(
          this.handCenterWorld.x,
          this.handCenterWorld.y,
          this.handCenterWorld.z
        );
        (uniforms.uHandVelocity!.value as THREE.Vector3).set(
          this.handVelocityWorld.x,
          this.handVelocityWorld.y,
          this.handVelocityWorld.z
        );
        uniforms.uHandApproaching!.value = this.handApproaching;
        uniforms.uPresenceStrength!.value = this.presenceStrength;
      }
      if (uniforms.uGlobalEnergy) {
        uniforms.uGlobalEnergy.value = this.globalEnergy;
      }
    }

    // Update atmosphere uniforms
    if (this.atmosphereUniforms) {
      this.atmosphereUniforms.uTime!.value = this.waveTime;
      if (this.atmosphereUniforms.uGlobalTime) {
        this.atmosphereUniforms.uGlobalTime.value = this.rippleTimeline;
      }
      if (this.atmosphereUniforms.uRippleScale) {
        this.atmosphereUniforms.uRippleScale.value =
          !this.reduceEffectsActive && this.atmosphereRipplesEnabled ? ATMOSPHERE_RIPPLE_SCALE : 0;
      }
      this.atmoStrengthCurrent +=
        (this.atmoStrengthTarget - this.atmoStrengthCurrent) * ATMO_STRENGTH_LERP;
      this.atmosphereUniforms.uStrength!.value = this.atmoStrengthCurrent;

      this.atmoPointer.currentX +=
        (this.atmoPointer.targetX - this.atmoPointer.currentX) * ATMO_POINTER_LERP;
      this.atmoPointer.currentY +=
        (this.atmoPointer.targetY - this.atmoPointer.currentY) * ATMO_POINTER_LERP;
      const shiftX =
        (this.atmoPointer.currentX - 0.5) *
        (this.reduceEffectsActive ? ATMO_SHIFT_SCALE_REDUCED : ATMO_SHIFT_SCALE_NORMAL);
      const shiftY =
        (this.atmoPointer.currentY - 0.5) *
        (this.reduceEffectsActive ? ATMO_SHIFT_Y_SCALE_REDUCED : ATMO_SHIFT_Y_SCALE_NORMAL);
      (this.atmosphereUniforms.uShift!.value as THREE.Vector2).set(shiftX, shiftY);
    }

    // Update camera position
    if (this.camera) {
      const orbitActive = this.controls?.enabled ?? false;

      // When orbit ends, block parallax updates until user hovers again
      if (this.wasOrbitActive && !orbitActive) {
        this.orbitRecoveryPending = true;
        this.cursorActive = false;
      }
      // Once orbit is used, permanently disable parallax camera positioning
      if (orbitActive) {
        this.orbitWasUsed = true;
      }
      this.wasOrbitActive = orbitActive;

      // Only run parallax logic if not in orbit recovery mode
      if (!this.orbitRecoveryPending && !orbitActive) {
        if (!this.cursorActive) {
          this.depthTarget = 0.5;
          this.rotationTarget = 0;
        }

        this.depthSpring.set(this.depthTarget);
        this.depthCurrent = this.depthSpring.update(deltaFactor);
        this.rotationSpring.set(this.rotationTarget);
        this.rotationCurrent = this.rotationSpring.update(deltaFactor);

        const targetOffsetX =
          (this.focusPoint.x - 0.5) * PARALLAX_STRENGTH_X * (this.cursorActive ? 1 : 0);
        const targetOffsetY =
          (this.focusPoint.y - 0.5) * PARALLAX_STRENGTH_Y * (this.cursorActive ? 1 : 0);

        this.cameraSpringX.set(targetOffsetX);
        this.cameraSpringY.set(targetOffsetY);
        this.cameraOffsetX = this.cameraSpringX.update(deltaFactor);
        this.cameraOffsetY = this.cameraSpringY.update(deltaFactor);

        const stillDrifting =
          !this.cameraSpringX.isSettled() ||
          !this.cameraSpringY.isSettled() ||
          !this.depthSpring.isSettled() ||
          !this.rotationSpring.isSettled();

        // Skip camera positioning if orbit was used - let OrbitControls own the camera
        if (!this.orbitWasUsed && (this.cursorActive || stillDrifting)) {
          const baseZ = this.config.cameraZ;
          const offsetZ = (0.5 - this.depthCurrent) * DEPTH_RANGE;
          this.camera.position.set(this.cameraOffsetX, this.cameraOffsetY, baseZ + offsetZ);
          this.camera.lookAt(0, 0, 0);
        }
      }
    }

    // Apply rotation to mesh
    if (this.mesh) {
      this.mesh.rotation.y = this.rotationCurrent;
    }

    // Update OrbitControls (required for damping)
    if (this.controls && this.controls.enabled) {
      try {
        this.controls.update();
      } catch {
        // Ignore
      }
    }

    // Skip rendering if context is lost
    if (this.contextLost) return;

    // Render
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);

      // Check for shader compilation errors after first render
      if (!this.shaderErrorChecked) {
        this.shaderErrorChecked = true;
        const errors = checkShaderErrors(this.renderer, [
          { name: 'dotmatrix-main', material: this.material },
          { name: 'dotmatrix-atmosphere', material: this.atmosphereMaterial },
        ]);
        if (errors.length > 0) {
          logShaderErrors('DotMatrix', errors);
        }
      }
    }

    // Update bloom overlay
    if (!this.usingComposerBloom) {
      this.updateBloomOverlay();
    }
  }

  // ============================================================================
  // AWARENESS SYSTEM
  // ============================================================================

  private updateAwareness(deltaMs: number, now: number, deltaFactor: number): void {
    // Update breathing phase
    this.breathPhase += (deltaMs / BREATH_CYCLE_DURATION) * Math.PI * 2;
    if (this.breathPhase > Math.PI * 2) this.breathPhase -= Math.PI * 2;

    // Check if we should transition from TYPING back to IDLE
    if (this.awarenessState === AWARENESS_STATES.TYPING) {
      const timeSinceKeystroke = now - this.lastKeystrokeTime;
      if (timeSinceKeystroke > TYPING_IDLE_THRESHOLD) {
        this.applyAwarenessState(AWARENESS_STATES.IDLE);
      }
    }

    // Update modifier springs
    this.currentModifiers.speedMultiplier =
      this.modifierSprings.speedMultiplier.update(deltaFactor);
    this.currentModifiers.motionMultiplier =
      this.modifierSprings.motionMultiplier.update(deltaFactor);
    this.currentModifiers.cohesion = this.modifierSprings.cohesion.update(deltaFactor);
    this.currentModifiers.brightness = this.modifierSprings.brightness.update(deltaFactor);

    // Update hand presence spring
    this.handPresenceSpring.set(this.handPresent ? 1 : 0);
    this.handPresenceStrength = this.handPresenceSpring.update(deltaFactor);

    // Check if cursor has been idle too long
    if (this.cursorActive && now - this.lastCursorMoveTime > CURSOR_IDLE_THRESHOLD) {
      this.cursorActive = false;
    }

    // When cursor is active, orbs are drawn toward it
    if (this.cursorActive) {
      this.focusPoint.targetX = this.cursorPoint.x;
      this.focusPoint.targetY = this.cursorPoint.y;
    }

    // Calculate velocity of target movement
    const targetDx = this.focusPoint.targetX - this.lastFocusTargetX;
    const targetDy = this.focusPoint.targetY - this.lastFocusTargetY;
    const instantVelocity = Math.sqrt(targetDx * targetDx + targetDy * targetDy);
    this.lastFocusTargetX = this.focusPoint.targetX;
    this.lastFocusTargetY = this.focusPoint.targetY;

    // Smooth the velocity measurement
    this.focusVelocity = this.focusVelocity * 0.7 + instantVelocity * 0.3;

    // Adaptive spring stiffness
    if (this.cursorActive) {
      const velocityFactor = Math.min(1, this.focusVelocity * FOCUS_VELOCITY_SCALE);
      const adaptiveStiffness = SPRING_FOCUS_STIFFNESS + velocityFactor * 0.03;
      this.focusSpringX.stiffness = adaptiveStiffness;
      this.focusSpringY.stiffness = adaptiveStiffness;
    } else {
      this.focusSpringX.stiffness = SPRING_FOCUS_STIFFNESS * 0.5;
      this.focusSpringY.stiffness = SPRING_FOCUS_STIFFNESS * 0.5;
    }

    // Update focus springs
    this.focusSpringX.set(this.focusPoint.targetX);
    this.focusSpringY.set(this.focusPoint.targetY);
    this.focusPoint.x = this.focusSpringX.update(deltaFactor);
    this.focusPoint.y = this.focusSpringY.update(deltaFactor);
  }

  private getBreathOffset(): number {
    return Math.sin(this.breathPhase) * BREATH_AMPLITUDE;
  }

  private applyAwarenessState(newState: AwarenessState): void {
    if (newState === this.awarenessState) return;
    this.awarenessState = newState;
    this.awarenessTransitionStart = performance.now();
    this.targetModifiers = { ...STATE_MODIFIERS[newState] };
    this.modifierSprings.speedMultiplier.set(this.targetModifiers.speedMultiplier);
    this.modifierSprings.motionMultiplier.set(this.targetModifiers.motionMultiplier);
    this.modifierSprings.cohesion.set(this.targetModifiers.cohesion);
    this.modifierSprings.brightness.set(this.targetModifiers.brightness);
  }

  // ============================================================================
  // ENERGY SYSTEM
  // ============================================================================

  private updateGlobalEnergy(deltaMs: number): void {
    const handVelMagnitude = Math.sqrt(
      this.handVelocityWorld.x ** 2 + this.handVelocityWorld.y ** 2 + this.handVelocityWorld.z ** 2
    );

    // Stillness detection
    if (this.handPresent && handVelMagnitude < STILLNESS_VELOCITY_THRESHOLD) {
      this.stillnessTimer += deltaMs;
      if (this.stillnessTimer > STILLNESS_DURATION_THRESHOLD) {
        this.globalEnergy += (STILLNESS_ENERGY_TARGET - this.globalEnergy) * 0.02;
      }
    } else {
      this.stillnessTimer = 0;
    }

    // Hand velocity energy
    if (handVelMagnitude > ENERGY_VELOCITY_THRESHOLD) {
      const velocityContribution = Math.min(handVelMagnitude * ENERGY_GAIN_HAND, 0.1);
      this.globalEnergy += velocityContribution;
    }

    // Keyboard energy decay
    this.lastKeystrokeEnergy *= this.keystrokeEnergyDecay;
    this.globalEnergy += this.lastKeystrokeEnergy;

    // Decay and clamp
    if (this.stillnessTimer <= STILLNESS_DURATION_THRESHOLD) {
      this.globalEnergy *= ENERGY_DECAY;
    }
    this.globalEnergy = Math.max(ENERGY_MIN, Math.min(ENERGY_MAX, this.globalEnergy));
  }

  // ============================================================================
  // ORBIT CONTROLS
  // ============================================================================

  /**
   * Creates OrbitControls instance with pointer gate for selective orbit.
   * Uses the extracted pointerGate utility for clean event listener management.
   */
  private createControls(): void {
    if (!this.camera) return;
    this.disposeControls();

    const domTarget = IS_MOBILE
      ? this.canvasEl || this.renderer?.domElement || document.body
      : document.body;

    this.controls = new OrbitControls(this.camera, domTarget);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.2;
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.95;

    try {
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    } catch {
      // Ignore
    }

    // Create and enable the pointer gate
    this.pointerGate = createPointerGate(this.controls, {
      isMobile: IS_MOBILE,
      canvasEl: this.canvasEl,
      canvasContainer: this.canvasContainer,
      isInteractive: () => this.wantsInteractiveControls && !this.controlsSuppressedByOverlay,
      isInteractiveTarget: createDefaultInteractiveCheck(),
    });
    this.pointerGate.enable();
  }

  /**
   * Disposes OrbitControls and removes event listeners.
   */
  private disposeControls(): void {
    // Dispose pointer gate first (removes all event listeners)
    if (this.pointerGate) {
      this.pointerGate.dispose();
      this.pointerGate = null;
    }

    // Dispose OrbitControls
    if (this.controls) {
      try {
        this.controls.dispose();
      } catch {
        // Ignore
      }
      this.controls = null;
    }

    this.setPrechatState(false);
  }

  /**
   * Sets body class for prechat state (controls interactive).
   */
  private setPrechatState(active: boolean): void {
    try {
      const body = document.body;
      const cls = 'dotmatrix-prechat';
      if (!body) return;
      if (active) body.classList.add(cls);
      else body.classList.remove(cls);
    } catch {
      // Ignore
    }
  }

  /**
   * Refreshes controls state based on wantsInteractiveControls and overlay suppression.
   */
  private refreshControlsState(): void {
    const shouldEnable = this.wantsInteractiveControls && !this.controlsSuppressedByOverlay;
    this.setPrechatState(shouldEnable);

    if (!shouldEnable) {
      this.disposeControls();
      try {
        if (this.canvasEl) this.canvasEl.style.pointerEvents = 'none';
        if (this.canvasContainer) this.canvasContainer.style.pointerEvents = 'none';
      } catch {
        // Ignore
      }
      return;
    }

    // Create controls if not already created
    if (!this.controls) this.createControls();
    if (this.controls) {
      this.controls.enabled = false; // Pointer gate will enable when appropriate
      try {
        this.controls.update();
      } catch {
        // Ignore
      }
    }

    // Set pointer events mode
    try {
      const pointerMode = IS_MOBILE ? 'auto' : 'none';
      if (this.canvasEl) this.canvasEl.style.pointerEvents = pointerMode;
      if (this.canvasContainer) this.canvasContainer.style.pointerEvents = pointerMode;
    } catch {
      // Ignore
    }
  }

  /**
   * Public API: Set whether interactive controls are desired.
   */
  public setInteractive(active: boolean): void {
    this.wantsInteractiveControls = !!active;
    this.refreshControlsState();
  }

  /**
   * Public API: Suppress controls when overlay is open.
   */
  public setOverlaySuppressed(suppressed: boolean): void {
    this.controlsSuppressedByOverlay = !!suppressed;
    this.refreshControlsState();
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  private onResize(): void {
    if (!this.renderer || !this.camera) return;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.updateFocusScale();
    if (!this.usingComposerBloom) {
      this.resizeBloomOverlay();
    }
  }

  /** Compute world-space half-extents visible by the camera and push to shader. */
  private updateFocusScale(): void {
    const uniforms = this.material?.uniforms;
    if (!uniforms?.uFocusScale) return;
    const halfH = Math.tan((CAMERA_FOV / 2) * (Math.PI / 180)) * this.config.cameraZ;
    const halfW = halfH * (window.innerWidth / window.innerHeight);
    (uniforms.uFocusScale.value as THREE.Vector2).set(halfW, halfH);
  }

  private onPointerMove(event: PointerEvent): void {
    if (!event || typeof event.clientX !== 'number') return;
    const width = window.innerWidth || 1;
    const height = window.innerHeight || 1;
    const normX = clamp01(event.clientX / width);
    const normY = clamp01(event.clientY / height);

    this.atmoPointer.targetX = normX;
    this.atmoPointer.targetY = normY;

    // Enable mouse attraction on hover (not when hand tracking or orbit controls are active)
    if (!this.handLandmarksActive && !this.controls?.enabled) {
      this.setHeadPosition(normX, normY);
    }
  }

  private onPointerDown(event: PointerEvent): void {
    if (!event) return;
    if (typeof event.isPrimary === 'boolean' && !event.isPrimary) return;
    if (typeof event.button === 'number' && event.pointerType !== 'touch' && event.button !== 0)
      return;
    if (typeof event.clientX !== 'number' || typeof event.clientY !== 'number') return;

    // Ripple effect
    if (!this.reduceEffectsActive && this.atmosphereRipplesEnabled && this.atmosphereUniforms) {
      const width = window.innerWidth || 1;
      const height = window.innerHeight || 1;
      if (width > 0 && height > 0) {
        const normX = clamp01(event.clientX / width);
        const normY = clamp01(1 - event.clientY / height);
        this.spawnAtmosphereRipple(normX, normY);
      }
    }
  }

  private onThemeChange(event: Event): void {
    try {
      const detail = (event as CustomEvent).detail;
      const theme = detail?.theme;
      if (theme && this.animationActive) {
        this.setThemeColors(theme);
      }
    } catch {
      // Ignore errors
    }
  }

  private handleContextLost(event: Event): void {
    debugLog('graphics', 'dotmatrix:contextLost', {});
    event.preventDefault();
    this.contextLost = true;
  }

  private handleContextRestored(): void {
    debugLog('graphics', 'dotmatrix:contextRestored', {});
    this.contextLost = false;

    // Rebuild textures
    if (this.perlinTex) {
      this.perlinTex.dispose();
      this.perlinTex = buildPerlinTexture(THREE);
    }
    if (this.noiseAtlasTex) {
      this.noiseAtlasTex.dispose();
      this.noiseAtlasTex = buildNoiseAtlas(THREE);
    }
    if (this.landmarkTexture) {
      this.landmarkTexture.dispose();
      this.landmarkTexture = this.buildLandmarkTexture();
    }

    // Recreate material
    if (this.material) {
      this.material.dispose();
      this.createMaterial();
      if (this.mesh) this.mesh.material = this.material!;
    }

    // Reset atmosphere layer
    this.disposeAtmosphereLayer();
    this.initAtmosphereLayer();

    // Rebuild bloom overlay
    if (!this.usingComposerBloom && this.bloomCanvas) {
      this.disposeBloomOverlay();
      const cc = document.getElementById('canvas-container');
      if (cc && this.renderer?.domElement) {
        this.initBloomOverlay(cc, this.renderer.domElement);
      }
    }
  }

  // ============================================================================
  // VISIBILITY CONTROL
  // ============================================================================

  private applySpheresVisibility(): void {
    if (this.root) this.root.visible = this.spheresVisible;
    if (this.mesh) this.mesh.visible = this.spheresVisible;
  }

  private fadeInCanvases(durationMs = FADE_DURATION_MS): void {
    if (!this.renderer?.domElement) return;
    const el = this.renderer.domElement;
    const bloom = this.bloomCanvas;

    el.style.display = 'block';
    el.style.opacity = '0';
    el.style.transition = `opacity ${durationMs}ms ease-in`;

    if (!this.usingComposerBloom && bloom) {
      bloom.style.opacity = '0';
      bloom.style.transition = `opacity ${durationMs}ms ease-in`;
    }

    requestAnimationFrame(() => {
      el.style.opacity = '1';
      if (!this.usingComposerBloom && bloom) bloom.style.opacity = '1';
    });
  }

  private fadeOutCanvases(durationMs = FADE_OUT_DURATION_MS): void {
    if (!this.renderer?.domElement) return;
    const el = this.renderer.domElement;
    const bloom = this.bloomCanvas;

    el.style.transition = `opacity ${durationMs}ms ease-out`;
    el.style.opacity = '0';

    if (!this.usingComposerBloom && bloom) {
      bloom.style.transition = `opacity ${durationMs}ms ease-out`;
      bloom.style.opacity = '0';
    }
  }

  private computeAverageOffsetAt(time: number): Point3D {
    const gx = this.config.gridXCount;
    const gy = this.config.gridYCount;
    const gz = this.config.gridZCount;
    let sx = 0,
      sy = 0,
      sz = 0;
    const count = gx * gy * gz;

    for (let i = 0; i < gx; i++) {
      for (let j = 0; j < gy; j++) {
        for (let k = 0; k < gz; k++) {
          const nx = p5noiseCPU(i * 0.1, j * 0.1, time);
          const ny = p5noiseCPU(j * 0.1, k * 0.1, time + 100);
          const nz = p5noiseCPU(k * 0.1, i * 0.1, time + 200);
          sx += (nx * 2 - 1) * this.config.motionRange;
          sy += (ny * 2 - 1) * this.config.motionRange;
          sz += (nz * 2 - 1) * this.config.motionRange;
        }
      }
    }
    return { x: sx / count, y: sy / count, z: sz / count };
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  public start(force = false): void {
    if (window.__disableDotmatrix === true) return;
    if (window.__dotmatrixSuppressAutoStart && !force) return;
    if (force) window.__dotmatrixSuppressAutoStart = false;
    if (this.readingOverlayOpen) return;

    // Theme check
    const theme = this.getAppliedTheme();
    const canonical = normalizeTheme(theme);
    this.currentTheme = canonical;
    if (canonical === 'surf' || canonical === 'custom') return;
    this.setThemeColors(canonical);

    if (!force && (this.animationActive || this.startPending)) return;
    this.startPending = true;

    if (!this.renderer) this.setupThree();
    if (!this.renderer) {
      this.startPending = false;
      return;
    }

    // Apply saved quality tier config now that renderer exists
    this.applyQualityTierConfig();

    // Ensure bloom overlay exists
    const cc = document.getElementById('canvas-container');
    if (!this.usingComposerBloom && cc && (!this.bloomCanvas || !this.bloomCanvas.parentNode)) {
      this.initBloomOverlay(cc, this.renderer.domElement);
    }

    if (!this.animationActive) {
      if (this.instGeo) this.populateInstanceAttributes(this.instGeo);
      this.waveTime = seedWavePhase();
      this.lastFrameTime = null;
      this.elapsedSinceStartMs = 0;
      this.shaderErrorChecked = false;
      this.resetAtmosphereRipples();

      if (this.material?.uniforms) {
        this.material.uniforms.uTime!.value = this.waveTime;
        if (this.material.uniforms.uStartElapsed) {
          this.material.uniforms.uStartElapsed.value = 0;
        }
      }

      const avg = this.computeAverageOffsetAt(this.waveTime);
      if (this.root) this.root.position.set(-avg.x, -avg.y, -avg.z);

      if (cc) cc.style.display = 'block';
      this.fadeInCanvases(250);
      this.animationActive = true;

      // Use FrameCoordinator if available
      if (window.frameCoordinator) {
        window.frameCoordinator.subscribe(
          'dotmatrix',
          (frameInfo: { now: number }) => this.animate(frameInfo.now),
          window.FramePriority?.RENDER ?? 2
        );
      } else {
        const fallbackLoop = (now: number) => {
          if (!this.animationActive) return;
          this.animate(now);
          requestAnimationFrame(fallbackLoop);
        };
        requestAnimationFrame(fallbackLoop);
      }
    }

    this.startPending = false;
  }

  public stop(): void {
    this.startPending = false;
    if (!this.animationActive) return;
    this.animationActive = false;

    try {
      window.frameCoordinator?.unsubscribe('dotmatrix');
    } catch {
      // Ignore
    }

    this.spheresVisible = true;
    this.lastFrameTime = null;

    if (this.renderer?.domElement) {
      const el = this.renderer.domElement;
      el.style.transition = FADE_OUT_TRANSITION;
      el.style.opacity = '0';
      const hide = () => {
        el.style.display = 'none';
        el.style.transition = '';
        el.style.opacity = '';
      };
      el.addEventListener('transitionend', hide, { once: true });
      setTimeout(hide, FADE_DURATION_MS);
    }

    if (!this.usingComposerBloom && this.bloomCanvas) {
      this.bloomCanvas.style.transition = FADE_OUT_TRANSITION;
      this.bloomCanvas.style.opacity = '0';
    }

    const cc = document.getElementById('canvas-container');
    if (cc) {
      cc.style.display = 'none';
      cc.style.pointerEvents = 'none';
    }

    window.__dotmatrixSuppressAutoStart = true;

    const bc = !this.usingComposerBloom ? this.bloomCanvas : null;
    if (bc) {
      const cleanup = () => this.disposeBloomOverlay();
      bc.addEventListener('transitionend', cleanup, { once: true });
      setTimeout(cleanup, 300);
    } else {
      this.disposeBloomOverlay();
    }
  }

  public dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.boundOnResize);
    window.removeEventListener('pointermove', this.boundOnPointerMove);
    window.removeEventListener('pointerdown', this.boundOnPointerDown);
    window.removeEventListener('themeChange', this.boundOnThemeChange);

    if (this.canvasEl) {
      this.canvasEl.removeEventListener('webglcontextlost', this.boundOnContextLost);
      this.canvasEl.removeEventListener('webglcontextrestored', this.boundOnContextRestored);
    }

    this.disposeControls();
    this.disposeAtmosphereLayer();
    this.resetAtmosphereRipples();
    this.mesh?.geometry?.dispose();
    this.material?.dispose();
    this.perlinTex?.dispose();
    this.noiseAtlasTex?.dispose();
    this.landmarkTexture?.dispose();

    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement?.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }

    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.root = null;
    this.mesh = null;
    this.material = null;
    this.instGeo = null;
    this.canvasEl = null;
    this.perlinTex = null;
    this.noiseAtlasTex = null;
    this.landmarkTexture = null;
  }

  // ============================================================================
  // THEME AND COLOR API
  // ============================================================================

  private getAppliedTheme(): string {
    try {
      if (window.currentTheme) return normalizeTheme(window.currentTheme);
      const ls = storageGet('theme');
      if (ls) return normalizeTheme(ls);
      const html = document.documentElement;
      for (const cls of Array.from(html.classList)) {
        if (/-theme$/.test(cls)) return normalizeTheme(cls.replace(/-theme$/, ''));
      }
      return 'light';
    } catch {
      return 'light';
    }
  }

  /**
   * Parse hex config colors into cached THREE.Color objects.
   * Called on theme change and material creation — avoids per-frame parseInt.
   */
  private updateCachedColors(): void {
    const base = hexToRgb(this.config.baseColor || '#19f00a');
    const sec = hexToRgb(this.config.secondaryColor || '#b2d408');
    this.baseColorParsed.setRGB(base.r / 255, base.g / 255, base.b / 255);
    this.secondaryColorParsed.setRGB(sec.r / 255, sec.g / 255, sec.b / 255);
  }

  private setThemeColors(themeName: string): void {
    const canonical = normalizeTheme(themeName);
    this.currentTheme = canonical;
    if (canonical === 'surf' || canonical === 'custom') return;

    // Set colors based on theme
    const themeColors: Record<string, { base: string; secondary: string }> = {
      night: { base: '#140f05', secondary: '#010a07' },
      light: { base: '#509a7b', secondary: '#42919f' },
      'vera-baxter': { base: '#006f9a', secondary: '#08249f' },
      focus: { base: '#121212', secondary: '#121212' },
      dev: { base: '#7d0632', secondary: '#e26bfa' },
      purple: { base: '#000000', secondary: '#000000' },
      eva: { base: '#0f5da1', secondary: '#cd1504' },
      fragile: { base: '#208906', secondary: '#124caa' },
      'share-bear': { base: '#6d4e85', secondary: '#3660a0' },
      'high-contrast': { base: '#936b0c', secondary: '#01acbc' },
    };

    const colors = themeColors[canonical];
    if (colors) {
      this.config.baseColor = colors.base;
      this.config.secondaryColor = colors.secondary;
      this.updateCachedColors();
    }

    // Light themes need multiply blend mode for bloom (screen washes out dark spheres)
    const lightThemes = ['vitti', 'light'];
    const isLightTheme = lightThemes.includes(canonical);
    const targetPresets = isLightTheme
      ? BLOOM_PRESET_DEFS['legacy']!
      : BLOOM_PRESET_DEFS['modern']!;

    // Only update if presets actually changed
    if (this.bloomPresets !== targetPresets) {
      this.bloomPresets = targetPresets;
      this.applyBloomMode(this.currentBloomMode);
    }

    this.applyAtmospherePreset(this.getAtmospherePreset(canonical), {
      immediate: !this.animationActive,
    });
  }

  // ============================================================================
  // PUBLIC SETTERS/GETTERS
  // ============================================================================

  public setHeadPosition(x: number, y: number): void {
    this.cursorPoint.x = clamp01(x);
    this.cursorPoint.y = clamp01(y);
    this.lastCursorMoveTime = performance.now();
    this.cursorActive = true;

    // When coming out of orbit recovery, sync springs to current camera position
    // so parallax smoothly transitions from where orbit left it
    if (this.orbitRecoveryPending && this.camera) {
      // Sync X/Y position
      this.cameraSpringX.snap(this.camera.position.x);
      this.cameraSpringY.snap(this.camera.position.y);
      this.cameraOffsetX = this.camera.position.x;
      this.cameraOffsetY = this.camera.position.y;
      // Sync depth from Z position: depthCurrent = 0.5 - (z - baseZ) / DEPTH_RANGE
      const baseZ = this.config.cameraZ;
      const computedDepth = 0.5 - (this.camera.position.z - baseZ) / DEPTH_RANGE;
      const clampedDepth = Math.max(0, Math.min(1, computedDepth));
      this.depthSpring.snap(clampedDepth);
      this.depthCurrent = clampedDepth;
      this.depthTarget = 0.5; // Will animate back to neutral
    }
    this.orbitRecoveryPending = false;
  }

  public setCursorActive(active: boolean): void {
    this.cursorActive = active;
  }

  public getCursorActive(): boolean {
    return this.cursorActive;
  }

  public getFocusPosition(): Point2D {
    return { x: this.focusPoint.x, y: this.focusPoint.y };
  }

  public setDepth(depth: number): void {
    this.depthTarget = Math.max(0, Math.min(1, depth));
  }

  public getDepth(): number {
    return this.depthCurrent;
  }

  public setRotation(rotation: number): void {
    this.rotationTarget = rotation;
  }

  public getRotation(): number {
    return this.rotationCurrent;
  }

  public setHandLandmarks(landmarks: Landmark[] | null): void {
    this.handLandmarks = landmarks;
    this.handLandmarksActive = !!landmarks && landmarks.length === 21;
    if (this.handLandmarksActive) {
      this.updateLandmarkTexture();
    } else {
      // Reset tracking state to prevent velocity spikes on re-entry
      this.handVelocityWorld = { x: 0, y: 0, z: 0 };
      this.handCenterWorld = { x: 0, y: 0, z: 0 };
      this.lastHandCenterWorld = { x: 0, y: 0, z: 0 };
      this.handApproaching = 0;
      this.presenceStrength = 0;
    }
  }

  public getHandLandmarks(): Landmark[] | null {
    return this.handLandmarks;
  }

  public getHandLandmarksActive(): boolean {
    return this.handLandmarksActive;
  }

  public setHandPresent(present: boolean): void {
    this.handPresent = present;
  }

  public getHandPresent(): boolean {
    return this.handPresent;
  }

  public setAwarenessState(state: string): void {
    if (state === 'idle') this.applyAwarenessState(AWARENESS_STATES.IDLE);
    else if (state === 'typing') this.applyAwarenessState(AWARENESS_STATES.TYPING);
    else if (state === 'waiting') this.applyAwarenessState(AWARENESS_STATES.WAITING);
    else if (state === 'responding') this.applyAwarenessState(AWARENESS_STATES.RESPONDING);
  }

  public getAwarenessState(): AwarenessState {
    return this.awarenessState;
  }

  /**
   * Set quality tier for performance scaling.
   * Adjusts particle count, bloom settings, and frame rate.
   */
  public setQualityTier(tier: QualityTier): void {
    if (tier === this.currentQualityTier) return;
    this.currentQualityTier = tier;

    // Save preference
    storageSet(LS_QUALITY_TIER, tier);

    // Apply the config
    this.applyQualityTierConfig();
  }

  /**
   * Apply quality tier config settings.
   * Called on init and when tier changes.
   */
  private applyQualityTierConfig(): void {
    const config = QUALITY_PRESETS[this.currentQualityTier];

    // Update frame rate
    this.targetFrameRate = config.targetFrameRate;
    this.frameSkipCounter = 0;

    // Update pixel ratio
    if (this.renderer) {
      const maxRatio = config.maxPixelRatio;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxRatio));
    }

    // Update bloom settings
    this.bloomUpdateEveryNFrames = config.bloomUpdateInterval || 1;
    if (!config.bloomEnabled && this.bloomCanvas) {
      this.bloomCanvas.style.display = 'none';
    } else if (config.bloomEnabled && this.bloomCanvas) {
      this.bloomCanvas.style.display = '';
    }

    // Atmosphere ripples
    this.atmosphereRipplesEnabled = config.atmosphereEnabled && config.atmosphereRippleCount > 0;

    // Trigger geometry rebuild if grid changed
    // Skip for 'large' size preference - BIG mode uses different grid topology (24 vs 504 spheres)
    // that should not be overwritten by quality tier presets
    if (this.renderer && this.animationActive && this.currentSizePreference !== 'large') {
      this.rebuildGeometry(config);
    }
  }

  /**
   * Get current quality tier.
   */
  public getQualityTier(): QualityTier {
    return this.currentQualityTier;
  }

  /**
   * Toggle reduce effects mode at runtime.
   * Rebuilds shader material with appropriate shader variant.
   */
  public setReduceEffects(reduce: boolean): void {
    if (reduce === this.reduceEffectsActive) return;

    this.reduceEffectsActive = reduce;

    // Update bloom presets
    this.bloomPresets = BLOOM_PRESET_DEFS[reduce ? 'legacy' : 'modern']!;
    this.applyBloomMode(this.currentBloomMode);
    this.bloomUpdateEveryNFrames = reduce
      ? 3
      : IS_MOBILE
        ? BLOOM_UPDATE_INTERVAL_MOBILE
        : BLOOM_UPDATE_INTERVAL_DESKTOP;

    // Rebuild material with new shaders
    if (this.material && this.mesh) {
      const oldMaterial = this.material;

      // Recreate material with appropriate shaders
      this.createMaterial();

      // Update mesh material
      if (this.material) {
        this.mesh.material = this.material;
      }

      // Dispose old material
      oldMaterial.dispose();
    }

    // Update atmosphere shift scale
    if (this.atmosphereUniforms) {
      const shiftScale = reduce ? ATMO_SHIFT_SCALE_REDUCED : ATMO_SHIFT_SCALE_NORMAL;
      const shiftYScale = reduce ? ATMO_SHIFT_Y_SCALE_REDUCED : ATMO_SHIFT_Y_SCALE_NORMAL;
      this.atmosphereUniforms.uShiftScale!.value = shiftScale;
      this.atmosphereUniforms.uShiftYScale!.value = shiftYScale;
    }
  }

  /**
   * Rebuild instanced geometry with new particle count from quality config.
   */
  private rebuildGeometry(config: QualityConfig): void {
    const { gridDimensions, sphereSegments } = config;
    const newCount = gridDimensions.x * gridDimensions.y * gridDimensions.z;

    if (newCount === this.instanceCount) return;

    // Store reference to old geometry for disposal after new one is assigned
    const oldGeo = this.instGeo;

    // Update config first
    this.instanceCount = newCount;
    this.config.gridXCount = gridDimensions.x;
    this.config.gridYCount = gridDimensions.y;
    this.config.gridZCount = gridDimensions.z;
    this.config.detailX = sphereSegments;
    this.config.detailY = sphereSegments;

    // Create new sphere geometry with updated segments
    const sphereGeo = new THREE.SphereGeometry(
      this.config.sphereSize,
      this.config.detailX,
      this.config.detailY
    );
    this.instGeo = new THREE.InstancedBufferGeometry().copy(
      sphereGeo as unknown as THREE.InstancedBufferGeometry
    );
    sphereGeo.dispose();

    // Repopulate instance attributes
    this.populateInstanceAttributes(this.instGeo);

    // Update mesh geometry BEFORE disposing old one
    if (this.mesh) {
      this.mesh.geometry = this.instGeo;
    }

    // Update material uniforms for new grid
    if (this.material?.uniforms) {
      (this.material.uniforms.uGrid!.value as THREE.Vector3).set(
        this.config.gridXCount,
        this.config.gridYCount,
        this.config.gridZCount
      );
    }

    // Now dispose old geometry after mesh has new reference
    if (oldGeo) {
      // Explicitly dispose instance attributes
      const attrs = [
        'instanceIdx',
        'instanceScatter',
        'instanceJitter',
        'instanceRandA',
        'instanceRandB',
        'instanceRandC',
      ];
      for (const attrName of attrs) {
        const attr = oldGeo.getAttribute(attrName);
        if (attr && typeof (attr as THREE.BufferAttribute).array !== 'undefined') {
          oldGeo.deleteAttribute(attrName);
        }
      }
      oldGeo.dispose();
    }
  }

  public setAtmosphereStrength(
    strength: number,
    options: { immediate?: boolean; asOverride?: boolean } = {}
  ): void {
    const num = Number(strength);
    if (!isFinite(num)) return;
    const value = clamp01(num);
    const treatAsOverride = options.asOverride !== false;
    if (treatAsOverride) {
      this.atmoStrengthOverride = value;
    }
    let effective = treatAsOverride ? value : clamp01(value);
    if (this.reduceEffectsActive) {
      effective = treatAsOverride ? Math.min(effective, 0.2) : 0;
    }
    this.atmoStrengthTarget = effective;
    if (options.immediate) {
      this.atmoStrengthCurrent = this.atmoStrengthTarget;
    }
    if (this.atmosphereUniforms) {
      this.atmosphereUniforms.uStrength!.value = this.atmoStrengthCurrent;
    }
  }

  public setSpheresVisible(visible: boolean): void {
    if (this.spheresVisible === visible) return;
    this.spheresVisible = visible;
    this.applySpheresVisibility();
  }

  public getSpheresVisible(): boolean {
    return this.spheresVisible;
  }

  public setRipplesEnabled(enabled: boolean, options: { reset?: boolean } = {}): void {
    if (enabled === this.atmosphereRipplesEnabled) return;
    this.atmosphereRipplesEnabled = enabled;
    if (!this.atmosphereRipplesEnabled || options.reset) {
      this.resetAtmosphereRipples();
    }
    this.updateRippleScaleUniform();
  }

  public getRipplesEnabled(): boolean {
    return this.atmosphereRipplesEnabled;
  }

  public spawnRipple(normX: number, normY: number): void {
    this.spawnAtmosphereRipple(normX, normY);
  }

  private spawnAtmosphereRipple(normX: number, normY: number): void {
    if (!this.atmosphereRipplesEnabled) return;
    if (!isFinite(normX) || !isFinite(normY)) return;
    const idx = this.rippleState.index;
    this.rippleState.centers[idx] = { x: clamp01(normX), y: clamp01(normY) };
    this.rippleState.times[idx] = this.rippleTimeline;
    this.rippleState.index = (idx + 1) % ATMOSPHERE_RIPPLE_COUNT;
    this.syncAtmosphereRippleUniforms();
  }

  public setGameModeOpacity(opacity: number): void {
    const value = Math.max(0, Math.min(1, Number(opacity)));
    if (!isFinite(value)) return;
    this.gameModeOpacity = value;
    if (this.renderer?.domElement) {
      this.renderer.domElement.style.opacity = String(value);
    }
    if (!this.usingComposerBloom && this.bloomCanvas) {
      this.bloomCanvas.style.opacity = String(value);
    }
  }

  public getGameModeOpacity(): number {
    return this.gameModeOpacity;
  }

  public setSizePreference(size: 'normal' | 'large'): void {
    if (size !== 'normal' && size !== 'large') return;
    if (size === this.currentSizePreference) return;

    this.currentSizePreference = size;
    storageSet(LS_DOTMATRIX_SIZE, size);

    // Preserve theme colors before replacing config
    const preservedBaseColor = this.config.baseColor;
    const preservedSecondaryColor = this.config.secondaryColor;

    // Apply new config template
    const activeTemplates = CONFIG_TEMPLATES[this.reduceEffectsActive ? 'legacy' : 'modern']!;
    this.config = { ...activeTemplates.normal! };
    if (size === 'large' && activeTemplates.large) {
      Object.assign(this.config, activeTemplates.large);
    }

    // Restore theme colors
    if (preservedBaseColor) this.config.baseColor = preservedBaseColor;
    if (preservedSecondaryColor) this.config.secondaryColor = preservedSecondaryColor;

    // Update derived values
    this.instanceCount = this.config.gridXCount * this.config.gridYCount * this.config.gridZCount;
    this.baseMotionRange = this.config.motionRange;
    this.baseWaveSpeed = this.config.waveSpeed;

    // Update bloom mode
    this.currentBloomMode = size === 'large' ? 'large' : 'small';
    this.applyBloomMode(this.currentBloomMode);

    // Rebuild geometry with new sphere size and grid dimensions
    if (this.instGeo && this.mesh) {
      // Dispose old geometry
      this.instGeo.dispose();

      // Create new sphere geometry with updated size
      const sphereGeo = new THREE.SphereGeometry(
        this.config.sphereSize,
        this.config.detailX,
        this.config.detailY
      );
      // Cast needed: Three.js runtime accepts BufferGeometry but @types/three restricts to InstancedBufferGeometry
      this.instGeo = new THREE.InstancedBufferGeometry().copy(
        sphereGeo as unknown as THREE.InstancedBufferGeometry
      );
      sphereGeo.dispose();

      // Populate instance attributes for new grid
      this.populateInstanceAttributes(this.instGeo);

      // Update mesh geometry reference
      this.mesh.geometry = this.instGeo;
    }

    // Update shader uniforms
    if (this.material?.uniforms) {
      const u = this.material.uniforms;
      if (u.uSpacing) u.uSpacing.value = this.config.spacing;
      if (u.uMotionRange) u.uMotionRange.value = this.config.motionRange;
      if (u.uGrid) {
        u.uGrid.value.set(this.config.gridXCount, this.config.gridYCount, this.config.gridZCount);
      }
      if (u.uOffset) {
        u.uOffset.value.set(
          (-(this.config.gridXCount - 1) * this.config.spacing) / 2,
          (-(this.config.gridYCount - 1) * this.config.spacing) / 2,
          (-(this.config.gridZCount - 1) * this.config.spacing) / 2
        );
      }
    }

    // Update camera position for better framing
    if (this.camera) {
      this.camera.position.z = this.config.cameraZ;
    }

    // Update root position to center the new grid
    const avg = this.computeAverageOffsetAt(this.waveTime);
    if (this.root) {
      this.root.position.set(-avg.x, -avg.y, -avg.z);
    }
  }

  public getSizePreference(): 'normal' | 'large' {
    return this.currentSizePreference;
  }

  public onUserKeystroke(): void {
    const now = performance.now();
    this.lastKeystrokeTime = now;
    if (this.awarenessState === AWARENESS_STATES.IDLE) {
      this.applyAwarenessState(AWARENESS_STATES.TYPING);
    }
  }

  public onUserSubmit(): void {
    this.applyAwarenessState(AWARENESS_STATES.WAITING);
  }

  public onAIResponseStart(): void {
    this.applyAwarenessState(AWARENESS_STATES.RESPONDING);
  }

  public onAIResponseEnd(): void {
    this.applyAwarenessState(AWARENESS_STATES.IDLE);
  }

  public isActive(): boolean {
    return this.animationActive;
  }

  public isStarting(): boolean {
    return this.startPending;
  }

  /** Public wrapper to update theme colors (used by window global) */
  public updateTheme(theme: string): void {
    if (this.animationActive) {
      this.setThemeColors(theme);
    }
  }

  /** Public wrapper to set reading overlay open state (used by window global) */
  public setReadingOpen(open: boolean): void {
    this.readingOverlayOpen = open;
    if (open) {
      this.stop();
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE AND WINDOW GLOBALS
// ============================================================================

let instance: DotMatrixSystem | null = null;

export function getDotMatrixSystem(): DotMatrixSystem {
  if (!instance) {
    instance = new DotMatrixSystem();
  }
  return instance;
}

export function initDotMatrixGlobals(): void {
  if (typeof window === 'undefined') return;

  const system = getDotMatrixSystem();

  // Expose window globals for Vue integration
  window.startDotMatrix = (force?: boolean) => system.start(force);
  window.stopDotMatrix = () => system.stop();
  window.setDotMatrixHeadPosition = (x: number, y: number) => system.setHeadPosition(x, y);
  window.setDotMatrixCursorActive = (active: boolean) => system.setCursorActive(active);
  window.getDotMatrixCursorActive = () => system.getCursorActive();
  window.getDotMatrixFocusPosition = () => system.getFocusPosition();
  window.setDotMatrixDepth = (depth: number) => system.setDepth(depth);
  window.getDotMatrixDepth = () => system.getDepth();
  window.setDotMatrixRotation = (rotation: number) => system.setRotation(rotation);
  window.getDotMatrixRotation = () => system.getRotation();
  window.setDotMatrixHandLandmarks = (landmarks: Landmark[] | null) =>
    system.setHandLandmarks(landmarks);
  window.getDotMatrixHandLandmarks = () => system.getHandLandmarks();
  window.getDotMatrixHandLandmarksActive = () => system.getHandLandmarksActive();
  window.onDotMatrixHandPresent = () => system.setHandPresent(true);
  window.onDotMatrixHandLost = () => system.setHandPresent(false);
  window.getDotMatrixHandPresent = () => system.getHandPresent();
  window.setDotMatrixAwarenessState = (state: string) =>
    system.setAwarenessState(state as 'idle' | 'typing' | 'waiting' | 'responding');
  window.getDotMatrixAwarenessState = () => system.getAwarenessState();
  window.setDotMatrixAtmosphereStrength = (
    strength: number,
    options?: { immediate?: boolean; asOverride?: boolean }
  ) => system.setAtmosphereStrength(strength, options);
  window.setDotMatrixSpheresVisible = (visible: boolean) => system.setSpheresVisible(visible);
  window.getDotMatrixSpheresVisible = () => system.getSpheresVisible();
  window.setDotMatrixRipplesEnabled = (enabled: boolean, options?: { reset?: boolean }) =>
    system.setRipplesEnabled(enabled, options);
  window.getDotMatrixRipplesEnabled = () => system.getRipplesEnabled();
  window.spawnDotMatrixRipple = (x: number, y: number) => system.spawnRipple(x, y);
  window.setDotMatrixGameModeOpacity = (opacity: number) => system.setGameModeOpacity(opacity);
  window.getDotMatrixGameModeOpacity = () => system.getGameModeOpacity();
  window.setDotMatrixSize = (size: 'normal' | 'large') => system.setSizePreference(size);
  window.getDotMatrixSize = () => system.getSizePreference();
  window.onDotMatrixKeystroke = () => system.onUserKeystroke();
  window.onDotMatrixUserSubmit = () => system.onUserSubmit();
  window.onDotMatrixAIResponseStart = () => system.onAIResponseStart();
  window.onDotMatrixAIResponseEnd = () => system.onAIResponseEnd();
  window.setDotMatrixTheme = (theme: string) => system.updateTheme(theme);
  window.setDotMatrixReadingOpen = (open: boolean) => system.setReadingOpen(open);

  // OrbitControls interactivity
  window.setDotMatrixInteractive = (active: boolean) => system.setInteractive(active);
  window.setDotMatrixOverlaySuppressed = (suppressed: boolean) =>
    system.setOverlaySuppressed(suppressed);

  // Quality tier API
  window.setDotMatrixQualityTier = (tier: QualityTier) => system.setQualityTier(tier);
  window.getDotMatrixQualityTier = () => system.getQualityTier();

  // Store instance reference for external access
  window.__dotMatrixInstance = {
    setQualityTier: (tier) => system.setQualityTier(tier),
    getQualityTier: () => system.getQualityTier(),
  };

  // Motion state object
  window.dotMatrixMotion = {
    isReduced: () => prefersReducedMotion(),
    hasExplicitPreference: () => prefersReducedMotion(),
    isActive: () => system.isActive(),
    isStarting: () => system.isStarting(),
  };

  // Listen for size change events from settings UI
  document.addEventListener('dotmatrixSizeChange', ((
    e: CustomEvent<{ size: 'normal' | 'large' }>
  ) => {
    if (e.detail?.size) {
      system.setSizePreference(e.detail.size);
    }
  }) as EventListener);

  // Listen for ripples toggle events from settings UI
  document.addEventListener('dotmatrixRipplesChange', ((e: CustomEvent<{ enabled: boolean }>) => {
    if (typeof e.detail?.enabled === 'boolean') {
      system.setRipplesEnabled(e.detail.enabled);
    }
  }) as EventListener);

  // Dispatch ready event
  window.dispatchEvent(new Event('dotmatrixReady'));
}
