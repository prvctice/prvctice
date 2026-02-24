# Dotmatrix Graphics System

> **Why this doc:** The Dotmatrix system renders the ambient particle background and integrates hand tracking via MediaPipe. Read this when working on visual effects, shader performance, or hand gesture input.
>
> **Related systems:** [FRAME_COORDINATOR_SYSTEM.md](./FRAME_COORDINATOR_SYSTEM.md) | [INTENT_COORDINATOR_SYSTEM.md](./INTENT_COORDINATOR_SYSTEM.md) | [THEME_SYSTEM.md](./THEME_SYSTEM.md)
> **Architecture context:** [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md) | [CODEMAP.md](./CODEMAP.md)

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Core Concepts](#3-core-concepts)
4. [Shader Pipeline](#4-shader-pipeline)
5. [Hand Tracking System](#5-hand-tracking-system)
6. [Configuration Reference](#6-configuration-reference)
7. [Window API](#7-window-api)
8. [Pointer Gate System](#8-pointer-gate-system)
9. [Failure Modes & Debugging](#9-failure-modes--debugging)
10. [Common Patterns](#10-common-patterns)
11. [Integration Points](#11-integration-points)
12. [Reference Mapping](#12-reference-mapping)
13. [Performance Considerations](#13-performance-considerations)

---

## 1. Overview

The Dotmatrix Graphics System is a Three.js-based particle animation system that creates an ambient, interactive visual background. It renders a 3D grid of animated spheres with awareness states that respond to user activity (typing, waiting, cursor movement) and optional hand tracking via MediaPipe.

### Purpose

- Provide ambient visual feedback reflecting application state
- Create responsive particle effects that follow cursor/hand position
- Support theme-based color palettes with smooth transitions
- Enable performance scaling via quality tiers

### Key Files

| File             | Lines  | Purpose                                              |
| ---------------- | ------ | ---------------------------------------------------- |
| `core.ts`        | ~2,840 | Main DotMatrixSystem class, animation loop, uniforms |
| `handtrack.ts`   | ~1,905 | MediaPipe hand tracking, gesture detection           |
| `constants.ts`   | ~570   | Config templates, presets, atmosphere settings       |
| `shaders.ts`     | ~665   | GLSL vertex/fragment shaders                         |
| `pointerGate.ts` | ~230   | OrbitControls pointer event filtering                |
| `perlin.ts`      | ~190   | Perlin noise texture generation                      |
| `types.ts`       | ~55    | Type definitions                                     |
| `index.ts`       | ~55    | Public API exports                                   |

---

## 2. Architecture

### High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DOTMATRIX GRAPHICS SYSTEM                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │   INPUTS     │    │   CORE       │    │   OUTPUTS    │                   │
│  ├──────────────┤    ├──────────────┤    ├──────────────┤                   │
│  │ Cursor Pos   │───▶│ Awareness    │───▶│ WebGL Canvas │                   │
│  │ Hand Track   │───▶│ State        │───▶│ Bloom Canvas │                   │
│  │ Keyboard     │───▶│ Machine      │───▶│ Window API   │                   │
│  │ Theme        │    │              │    │              │                   │
│  │ Quality Tier │    │ Spring       │    │              │                   │
│  └──────────────┘    │ Smoothing    │    └──────────────┘                   │
│                      │              │                                        │
│                      │ Shader       │                                        │
│                      │ Uniforms     │                                        │
│                      └──────────────┘                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Rendering Pipeline

```
┌─────────────────────────────────────────────────────────────────────────── ┐
│                           RENDERING PIPELINE                               │
├─────────────────────────────────────────────────────────────────────────── ┤
│                                                                            │
│  Frame Request (FrameCoordinator or RAF)                                   │
│         │                                                                  │
│         ▼                                                                  │
│  ┌─────────────────┐                                                       │
│  │  animate()      │  Delta time calculation, frame skipping for 30fps     │
│  └────────┬────────┘                                                       │
│           │                                                                │
│           ▼                                                                │
│  ┌─────────────────┐                                                       │
│  │ updateAwareness │  Breath phase, focus springs, cursor idle check       │
│  └────────┬────────┘                                                       │
│           │                                                                │
│           ▼                                                                │
│  ┌─────────────────┐                                                       │
│  │ updateGlobalEnergy │  Stillness detection, velocity contribution        │
│  └────────┬────────┘                                                       │
│           │                                                                │
│           ▼                                                                │
│  ┌─────────────────┐                                                       │
│  │ Update Uniforms │  uTime, uGrid, uMotionRange, uBaseColor, etc.         │
│  └────────┬────────┘                                                       │
│           │                                                                │
│           ▼                                                                │
│  ┌─────────────────┐                                                       │
│  │ Update Camera   │  Parallax offset, depth spring, OrbitControls         │
│  └────────┬────────┘                                                       │
│           │                                                                │
│           ▼                                                                │
│  ┌─────────────────────────────────────────────────────────┐               │
│  │                    THREE.JS RENDER                       │              │
│  │  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐    │               │
│  │  │ Atmosphere  │   │ Particle    │   │ Bloom       │    │               │
│  │  │ Mesh (-1)   │   │ Mesh (0)    │   │ Overlay     │    │               │
│  │  │ (behind)    │   │ (spheres)   │   │ (CSS blend) │    │               │
│  │  └─────────────┘   └─────────────┘   └─────────────┘    │               │
│  └─────────────────────────────────────────────────────────┘               │
│                                                                            │
└─────────────────────────────────────────────────────────────────────────── ┘
```

### Component Hierarchy

```
DotMatrixSystem (singleton)
├── Three.js Scene
│   ├── PerspectiveCamera
│   ├── OrbitControls (optional, pointer-gated)
│   ├── Root Group (position offset for centering)
│   │   └── InstancedMesh (spheres, 504 default)
│   │       ├── InstancedBufferGeometry
│   │       └── ShaderMaterial (custom vertex + fragment)
│   └── Atmosphere Mesh (PlaneGeometry, behind spheres)
├── Bloom Overlay (separate canvas, CSS blur + blend)
├── Spring Systems
│   ├── Focus Springs (X, Y) - cursor attraction
│   ├── Camera Springs (X, Y, depth, rotation)
│   └── Modifier Springs (speed, motion, cohesion, brightness)
├── Awareness State Machine
│   └── States: IDLE, TYPING, WAITING, RESPONDING
└── Hand Tracking Integration
    └── Landmark texture, presence field uniforms
```

---

## 3. Core Concepts

### 3.1 Awareness States

The system maintains an awareness state that affects particle behavior through modifier values:

```typescript
// constants.ts:170
const AWARENESS_STATES = {
  IDLE: 'idle',
  TYPING: 'typing',
  WAITING: 'waiting',
  RESPONDING: 'responding',
} as const;
```

Each state applies different modifiers to the animation:

| State      | Speed | Motion | Cohesion | Brightness |
| ---------- | ----- | ------ | -------- | ---------- |
| IDLE       | 1.0   | 1.0    | 0.2      | 1.0        |
| TYPING     | 1.2   | 1.15   | 0.35     | 1.1        |
| WAITING    | 0.8   | 0.7    | 0.5      | 0.9        |
| RESPONDING | 1.5   | 1.4    | 0.1      | 1.2        |

Transitions are smoothed via spring physics (see [core.ts:1544-1549](web/graphics/dotmatrix/core.ts#L1544-L1549)).

### 3.2 Spring Physics

All smooth transitions use a simple spring system:

```typescript
// core.ts:167-197
class Spring {
  position: number = 0;
  velocity: number = 0;
  target: number = 0;
  stiffness: number;
  damping: number;

  update(deltaFactor: number): number {
    const force = (this.target - this.position) * this.stiffness;
    this.velocity += force * deltaFactor;
    this.velocity *= this.damping;
    this.position += this.velocity * deltaFactor;
    return this.position;
  }
}
```

Springs are used for:

- Focus point tracking (cursor/hand → particle attraction)
- Camera parallax (depth, X/Y offset, rotation)
- Awareness modifier transitions
- Hand presence blending

### 3.3 Instanced Rendering

Particles use Three.js `InstancedMesh` for performance:

```typescript
// core.ts:805-826 - Instance attribute setup
const instanceIdx = new Float32Array(instanceCount);
const instanceScatter = new Float32Array(instanceCount * 3);
const instanceJitter = new Float32Array(instanceCount);

// Each sphere gets: index, scatter offset, jitter phase
for (let i = 0; i < instanceCount; i++) {
  instanceIdx[i] = i;
  instanceScatter[i * 3] = (Math.random() - 0.5) * 0.3;
  instanceScatter[i * 3 + 1] = (Math.random() - 0.5) * 0.3;
  instanceScatter[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
  instanceJitter[i] = Math.random() * Math.PI * 2;
}
```

Default grid: 7×8×9 = 504 spheres (adjustable via quality tier).

### 3.4 Atmosphere Layer

A fullscreen gradient mesh renders behind the spheres:

```typescript
// core.ts:1017-1074
private initAtmosphereLayer(): void {
  // PlaneGeometry(2, 2) covers NDC space
  this.atmosphereMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: this.atmosphereUniforms,
      vertexShader: ATMOSPHERE_VERTEX_SHADER,
      fragmentShader: createAtmosphereFragmentShader(),
      transparent: true,
      blending: THREE.AdditiveBlending,
    })
  );
  this.atmosphereMesh.renderOrder = -1; // Render BEFORE spheres
}
```

Features:

- 5-point gradient (left, right, top, bottom, center colors)
- Ripple effects on pointer down
- Strength tied to theme presets

### 3.5 Bloom Effect

Post-processing bloom via CSS, not Three.js EffectComposer:

```typescript
// core.ts:1193-1215
private initBloomOverlay(container, baseCanvas): void {
  this.bloomCanvas = document.createElement('canvas');
  this.bloomCanvas.style.filter =
    `blur(${this.bloomSettings.blurRadius}px) brightness(${1 + this.bloomSettings.brightness})`;
  this.bloomCanvas.style.mixBlendMode = this.bloomSettings.blendMode;
  // Draw main canvas to bloom canvas at reduced resolution
}
```

Benefits:

- Simpler than WebGL post-processing
- Works with CSS blend modes per theme (screen vs multiply)
- Reduced resolution for performance

---

## 4. Shader Pipeline

### 4.1 Vertex Shader

The vertex shader positions each sphere in the 3D grid with Perlin noise displacement:

```glsl
// shaders.ts:23-120 (simplified)
attribute float instanceIdx;
attribute vec3 instanceScatter;
attribute float instanceJitter;

uniform float uTime;
uniform vec3 uGrid;        // gridX, gridY, gridZ
uniform vec3 uOffset;      // centering offset
uniform float uSpacing;
uniform float uMotionRange;
uniform sampler2D uPerlin;

void main() {
  // Calculate grid position from instance index
  float idx = instanceIdx;
  float iz = floor(idx / (uGrid.x * uGrid.y));
  float remainder = mod(idx, uGrid.x * uGrid.y);
  float iy = floor(remainder / uGrid.x);
  float ix = mod(remainder, uGrid.x);

  vec3 gridPos = vec3(ix, iy, iz) * uSpacing + uOffset;

  // Sample Perlin noise for displacement
  vec2 noiseUV = vec2(ix / uGrid.x, iy / uGrid.y) + uTime * 0.01;
  vec3 noise = texture2D(uPerlin, noiseUV).rgb;
  vec3 displacement = (noise * 2.0 - 1.0) * uMotionRange;

  // Apply scatter + jitter + displacement
  vec3 finalPos = gridPos + instanceScatter + displacement;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos + position, 1.0);
}
```

### 4.2 Fragment Shader

Basic sphere shading with color interpolation:

```glsl
// shaders.ts:130-180 (simplified)
uniform vec3 uBaseColor;
uniform vec3 uSecondaryColor;
uniform float uAwarenessBrightness;

varying vec3 vNormal;
varying float vDepthFactor;

void main() {
  // Simple diffuse lighting
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
  float diff = max(dot(vNormal, lightDir), 0.0) * 0.5 + 0.5;

  // Interpolate colors based on depth
  vec3 color = mix(uBaseColor, uSecondaryColor, vDepthFactor);
  color *= diff * uAwarenessBrightness;

  gl_FragColor = vec4(color, 1.0);
}
```

### 4.3 Shader Variants

Reduced effects mode uses simpler shaders:

```typescript
// shaders.ts:200-220
export function createVertexShader(reduceEffects: boolean): string {
  if (reduceEffects) {
    return VERTEX_SHADER_REDUCED; // No Perlin, no presence field
  }
  return VERTEX_SHADER_FULL;
}
```

---

## 5. Hand Tracking System

### 5.1 MediaPipe Integration

Hand tracking uses MediaPipe's Hand Landmarker:

```typescript
// handtrack.ts:18-24
const MEDIAPIPE_VISION_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/vision_bundle.mjs';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
```

Initialization sequence:

1. Load MediaPipe Vision module from CDN
2. Create HandLandmarker with GPU delegate
3. Request camera access (640×480)
4. Start detection loop via FrameCoordinator

### 5.2 Coordinate Transformation

Camera → screen mapping with mirroring and offset:

```typescript
// handtrack.ts:1174-1187
private handleHandDetected(landmarks: Landmark[]): void {
  const palm = this.getPalmCenter(landmarks);

  // Mirror for front-facing camera
  const rawX = 1 - palm.x;
  const rawY = 1 - palm.y;

  // Apply smoothing
  this.smoothedPosition.x = lerp(this.smoothedPosition.x, rawX, POSITION_SMOOTHING);
  this.smoothedPosition.y = lerp(this.smoothedPosition.y, rawY, POSITION_SMOOTHING);
}
```

### 5.3 Gesture Detection

| Gesture | Detection                               | Action               |
| ------- | --------------------------------------- | -------------------- |
| Pinch   | Thumb-index distance < 0.2 × palm width | Grab/drag widgets    |
| Fist    | All 4 fingers curled                    | Push-to-talk mic     |
| Poke    | Index extended, others curled           | Spawn ripple effect  |
| Swipe   | Speed > 0.015, duration 80-400ms        | Motion gesture event |
| Flick   | High acceleration + speed               | Motion gesture event |
| Punch   | Z-axis forward > 0.05                   | Motion gesture event |

### 5.4 Event System

Hand tracking emits events for external consumers:

```typescript
// handtrack.ts:333-339
export type HandTrackingEventType =
  | 'hand:move' // Every frame with position/velocity
  | 'hand:zone-enter'
  | 'hand:zone-exit'
  | 'hand:grab-start'
  | 'hand:grab-end'
  | 'hand:gesture'; // Swipe, flick, punch detected
```

---

## 6. Configuration Reference

### 6.1 Quality Tiers

```typescript
// constants.ts:511-551
const QUALITY_PRESETS = {
  high: {
    gridDimensions: { x: 7, y: 8, z: 9 }, // 504 particles
    sphereSegments: 16,
    shaderMode: 'modern',
    bloomEnabled: true,
    bloomBlurRadius: 6,
    bloomUpdateInterval: 1,
    atmosphereEnabled: true,
    atmosphereRippleCount: 4,
    maxPixelRatio: 2,
    targetFrameRate: 60,
  },
  medium: {
    gridDimensions: { x: 5, y: 6, z: 6 }, // 180 particles (~65% reduction)
    sphereSegments: 10,
    shaderMode: 'modern',
    bloomEnabled: true,
    bloomBlurRadius: 4,
    bloomUpdateInterval: 2,
    atmosphereEnabled: true,
    atmosphereRippleCount: 2,
    maxPixelRatio: 1.5,
    targetFrameRate: 60,
  },
  low: {
    gridDimensions: { x: 3, y: 4, z: 4 }, // 48 particles (~90% reduction)
    sphereSegments: 8,
    shaderMode: 'legacy',
    bloomEnabled: false,
    bloomBlurRadius: 0,
    bloomUpdateInterval: 0,
    atmosphereEnabled: true,
    atmosphereRippleCount: 0,
    maxPixelRatio: 1,
    targetFrameRate: 30,
  },
};
```

Target devices:

- **high**: Full effects for powerful devices (gaming PCs, M1+ Macs)
- **medium**: Balanced for mid-tier devices (2017 MacBook Pro, iPhone 12)
- **low**: Minimal for older/budget devices

### 6.2 Atmosphere Presets

Each theme has color presets:

```typescript
// constants.ts:180-280 (approximate)
const ATMOSPHERE_PRESETS = {
  night: {
    left: '#001a33',
    right: '#1a0033',
    top: '#000d1a',
    bottom: '#0d001a',
    center: '#000000',
    strength: 0.6,
  },
  light: {
    left: '#e6f2ff',
    right: '#fff2e6',
    top: '#f2f2f2',
    bottom: '#e6e6e6',
    center: '#ffffff',
    strength: 0.3,
  },
  // ... other themes
};
```

### 6.3 Config Templates

Size presets for normal vs large mode:

```typescript
// constants.ts:380-440 (approximate)
const CONFIG_TEMPLATES = {
  modern: {
    normal: {
      gridXCount: 7,
      gridYCount: 8,
      gridZCount: 9,
      spacing: 1,
      sphereSize: 6,
      motionRange: 1000,
      waveSpeed: 0.0009,
      cameraZ: 800,
    },
    large: {
      gridXCount: 2,
      gridYCount: 3,
      gridZCount: 4, // 24 spheres
      spacing: 160,
      sphereSize: 40,
      motionRange: 800,
      waveSpeed: 0.001,
      cameraZ: 1100,
    },
  },
};
```

---

## 7. Window API

The system exposes globals for Vue integration:

```typescript
// core.ts:2660-2757
window.startDotMatrix = (force?: boolean) => system.start(force);
window.stopDotMatrix = () => system.stop();
window.setDotMatrixHeadPosition = (x, y) => system.setHeadPosition(x, y);
window.setDotMatrixHandLandmarks = (landmarks) => system.setHandLandmarks(landmarks);
window.setDotMatrixAwarenessState = (state) => system.setAwarenessState(state);
window.setDotMatrixQualityTier = (tier) => system.setQualityTier(tier);
// ... many more
```

Key APIs:

| Global                              | Purpose                                        |
| ----------------------------------- | ---------------------------------------------- |
| `startDotMatrix(force?)`            | Start animation (respects theme/overlay state) |
| `stopDotMatrix()`                   | Stop and fade out                              |
| `setDotMatrixHeadPosition(x, y)`    | Set cursor/hand position (0-1)                 |
| `setDotMatrixAwarenessState(state)` | 'idle', 'typing', 'waiting', 'responding'      |
| `setDotMatrixQualityTier(tier)`     | 'low', 'medium', 'high'                        |
| `setDotMatrixSize(size)`            | 'normal', 'large'                              |
| `spawnDotMatrixRipple(x, y)`        | Trigger atmosphere ripple                      |
| `setDotMatrixInteractive(active)`   | Enable/disable OrbitControls                   |

---

## 8. Pointer Gate System

OrbitControls are gated to prevent interference with UI:

```typescript
// pointerGate.ts:45-100 (approximate)
export function createPointerGate(controls: OrbitControls, options: PointerGateOptions) {
  const checkInteractive = (event: PointerEvent): boolean => {
    // Don't orbit if over interactive elements
    const target = event.target as HTMLElement;
    if (target.closest('button, input, [role="button"], .modal')) {
      return false;
    }
    // Check if system wants interactive mode
    return options.isInteractive();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (checkInteractive(event)) {
      controls.enabled = true;
    }
  };

  const onPointerUp = () => {
    controls.enabled = false;
  };

  return {
    enable: () => {
      /* add listeners */
    },
    disable: () => {
      /* remove listeners */
    },
    dispose: () => {
      /* cleanup */
    },
  };
}
```

---

## 9. Failure Modes & Debugging

### 9.1 Common Issues

| Symptom                   | Cause                       | Solution                                    |
| ------------------------- | --------------------------- | ------------------------------------------- |
| Black screen              | WebGL context lost          | Auto-restores via `handleContextRestored()` |
| No animation              | Theme is 'surf' or 'custom' | These themes disable dotmatrix              |
| Spheres frozen            | `animationActive = false`   | Check `window.__dotmatrixSuppressAutoStart` |
| Hand tracking no response | Camera permission denied    | Check `navigator.mediaDevices`              |
| Jittery tracking          | Smoothing too high          | Adjust `POSITION_SMOOTHING`                 |
| Grab misaligned           | Screen/camera mismatch      | Check mirroring in `handleHandDetected`     |

### 9.2 Debug Flags

```typescript
// handtrack.ts:12
const DEBUG_HANDTRACK = import.meta.env.DEV;

// Enable verbose logging in dev mode:
// - Position coordinates every 60 frames
// - Grab start/end with target info
// - Gesture detection events
```

### 9.3 Shader Error Checking

```typescript
// core.ts:1508-1517
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
```

---

## 10. Common Patterns

### 10.1 Starting Dotmatrix

```typescript
// Wait for ready event
window.addEventListener('dotmatrixReady', () => {
  window.startDotMatrix(true); // force=true bypasses suppress flag
});
```

### 10.2 Responding to Chat Activity

```typescript
// In chat input component
const onInput = () => {
  window.onDotMatrixKeystroke?.(); // Transitions to TYPING
};

const onSubmit = () => {
  window.onDotMatrixUserSubmit?.(); // Transitions to WAITING
};

// In chat response handler
const onStreamStart = () => {
  window.onDotMatrixAIResponseStart?.(); // Transitions to RESPONDING
};

const onStreamEnd = () => {
  window.onDotMatrixAIResponseEnd?.(); // Transitions back to IDLE
};
```

### 10.3 Subscribing to Hand Events

```typescript
const handTracking = getHandTrackingSystem();

handTracking.subscribe('hand:grab-start', (event) => {
  if (event.target === 'inputBar') {
    // Start dragging input bar
  }
});

handTracking.subscribe('hand:grab-end', (event) => {
  // Apply momentum with event.velocity
});
```

---

## 11. Integration Points

### 11.1 FrameCoordinator

Dotmatrix integrates with the app's frame coordination system:

```typescript
// core.ts:2009-2023
if (window.frameCoordinator) {
  window.frameCoordinator.subscribe(
    'dotmatrix',
    (frameInfo) => this.animate(frameInfo.now),
    window.FramePriority?.RENDER ?? 2
  );
}
```

Priority levels:

- `TRACKING (0)` - Hand tracking runs first
- `INPUT (1)` - Input processing
- `RENDER (2)` - Dotmatrix animation

### 11.2 Event Bus

Hand tracking emits to the app's event bus:

```typescript
// handtrack.ts:1151, 1501
useEventBus().emit('handtrack:grab-end');
```

And listens for physics events:

```typescript
// handtrack.ts:1708-1714
useEventBus().on('physics:snap', () => {
  if (this.isGrabbing) {
    this.isGrabbing = false;
    this.grabTarget = null;
  }
});
```

### 11.3 Input Adapters

Hand tracking emits through the input adapter system:

```typescript
// handtrack.ts:1509-1513
handTrackingAdapter().emit('move', {
  target: this.grabTarget,
  value: { deltaX, deltaY },
});
```

---

## 12. Reference Mapping

### Core Types

| Type               | Location                                                     | Purpose                     |
| ------------------ | ------------------------------------------------------------ | --------------------------- |
| `DotMatrixSystem`  | [core.ts:224](web/graphics/dotmatrix/core.ts#L224)           | Main singleton class        |
| `DotMatrixConfig`  | [constants.ts:20](web/graphics/dotmatrix/constants.ts#L20)   | Grid/render configuration   |
| `QualityTier`      | [constants.ts:380](web/graphics/dotmatrix/constants.ts#L380) | 'low' \| 'medium' \| 'high' |
| `AwarenessState`   | [core.ts:74](web/graphics/dotmatrix/core.ts#L74)             | State machine values        |
| `AtmospherePreset` | [constants.ts:160](web/graphics/dotmatrix/constants.ts#L160) | Theme gradient colors       |
| `Landmark`         | [types.ts:8](web/graphics/dotmatrix/types.ts#L8)             | MediaPipe hand point        |

### Key Methods

| Method                 | Location                                                       | Purpose                    |
| ---------------------- | -------------------------------------------------------------- | -------------------------- |
| `animate()`            | [core.ts:1278](web/graphics/dotmatrix/core.ts#L1278)           | Main animation loop        |
| `updateAwareness()`    | [core.ts:1530](web/graphics/dotmatrix/core.ts#L1530)           | State + spring updates     |
| `setHeadPosition()`    | [core.ts:2186](web/graphics/dotmatrix/core.ts#L2186)           | Cursor/hand input          |
| `start()`              | [core.ts:1956](web/graphics/dotmatrix/core.ts#L1956)           | Initialize and run         |
| `detectAndUpdate()`    | [handtrack.ts:1067](web/graphics/dotmatrix/handtrack.ts#L1067) | MediaPipe frame processing |
| `handleHandDetected()` | [handtrack.ts:1142](web/graphics/dotmatrix/handtrack.ts#L1142) | Landmark processing        |

### Shader Functions

| Function                           | Location                                                 | Purpose             |
| ---------------------------------- | -------------------------------------------------------- | ------------------- |
| `createVertexShader()`             | [shaders.ts:8](web/graphics/dotmatrix/shaders.ts#L8)     | Build vertex GLSL   |
| `createFragmentShader()`           | [shaders.ts:130](web/graphics/dotmatrix/shaders.ts#L130) | Build fragment GLSL |
| `createAtmosphereFragmentShader()` | [shaders.ts:300](web/graphics/dotmatrix/shaders.ts#L300) | Atmosphere gradient |

---

## 13. Performance Considerations

### Memory

- Instance attributes: ~20KB per 1000 spheres (5 float attributes)
- Perlin texture: 64×64 Red = ~4KB
- Landmark textures: 8×3 + 24×20 RGBA Float = ~8KB total

### CPU

- Spring updates: O(1) per spring, ~10 springs active
- Awareness checks: O(1) per frame
- Ripple pruning: O(n) where n = ripple count (max 8)

### GPU

- Vertex shader: Perlin lookup + math per vertex
- Fragment shader: Simple diffuse, no shadows
- Bloom overlay: CSS filter, not GPU post-process
- Frame skipping: 30fps mode skips every other frame

### Optimization Tips

1. Use `setQualityTier('low')` for iPhone 12-class phones and Intel Macs
2. Disable bloom overlay on mobile (`bloomEnabled: false`)
3. Reduce grid dimensions for embedded use
4. Set `reduceEffects: true` for accessibility mode

---

_Last verified: 2026-02-23_
