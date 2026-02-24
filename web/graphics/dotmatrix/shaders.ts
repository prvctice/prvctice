// dotmatrix/shaders.ts
// Shared shader chunks for dot-matrix animation

import { ATMOSPHERE_RIPPLE_COUNT, ATMOSPHERE_RIPPLE_MAX_AGE } from './constants';
import {
  NOISE_ATLAS_TILE,
  NOISE_ATLAS_Z_SLICES,
  NOISE_ATLAS_COLS,
  NOISE_ATLAS_ROWS,
  NOISE_ATLAS_Z_PERIOD,
  NOISE_ATLAS_RANGE,
} from './perlin';
import sharedPerlin from '../shared/perlin.glsl?raw';

/**
 * Common constants used in vertex shaders.
 * Note: PI, PERLIN_SIZE_F, PERLIN_DIM now come from shared Perlin.
 */
export const SHADER_PERLIN_CONSTANTS = /* glsl */ `
  const float START_JITTER_DECAY = 3.0;
`;

/**
 * Shared Perlin noise functions (imported from ../shared/perlin.glsl).
 * Includes: pLookup, scos, p5noise (4 octaves by default).
 * Requires: uPerlin sampler2D uniform.
 */
export const SHADER_PERLIN_CORE = sharedPerlin;

/**
 * Hand landmark retrieval helpers for hand tracking mode.
 * Requires: uLandmarkTex, uLandmarkWorldScale, uLandmarkDepthScale uniforms
 */
export const SHADER_LANDMARK_HELPERS = /* glsl */ `
  vec3 getLandmarkPos(int idx) {
    int lmX = idx - (idx / 8) * 8;
    int lmY = idx / 8;
    vec4 lm = texture2D(uLandmarkTex, vec2((float(lmX) + 0.5) / 8.0, (float(lmY) + 0.5) / 3.0));
    if (lm.a < 0.5) return vec3(0.0, 0.0, -10000.0);
    return vec3(
      (lm.x - 0.5) * uLandmarkWorldScale,
      (0.5 - lm.y) * uLandmarkWorldScale,
      -lm.z * uLandmarkDepthScale
    );
  }

  int getBoneStart(int boneIdx) {
    int finger = boneIdx / 4;
    int boneInFinger = boneIdx - finger * 4;
    if (boneInFinger == 0) return 0;
    int fingerBase = finger * 4 + 1;
    return fingerBase + boneInFinger - 1;
  }

  int getBoneEnd(int boneIdx) {
    int finger = boneIdx / 4;
    int boneInFinger = boneIdx - finger * 4;
    int fingerBase = finger * 4 + 1;
    return fingerBase + boneInFinger;
  }
`;

/**
 * Combined Perlin noise functions (convenience export).
 * Requires: uPerlin sampler2D uniform
 */
export const SHADER_PERLIN_FUNCTIONS = /* glsl */ `
  ${SHADER_PERLIN_CORE}
  ${SHADER_LANDMARK_HELPERS}
`;

/**
 * Noise atlas lookup function.
 * Replaces 32 texture reads per p5noise call with 2 bilinear fetches.
 * Constants are injected from perlin.ts atlas parameters.
 */
export const SHADER_NOISE_ATLAS = /* glsl */ `
  float sampleNoiseAtlas(sampler2D atlas, float u, float v, float w) {
    const float TILE = ${NOISE_ATLAS_TILE.toFixed(1)};
    const float Z_SLICES = ${NOISE_ATLAS_Z_SLICES.toFixed(1)};
    const float COLS = ${NOISE_ATLAS_COLS.toFixed(1)};
    const float ROWS = ${NOISE_ATLAS_ROWS.toFixed(1)};
    const float Z_PERIOD = ${NOISE_ATLAS_Z_PERIOD.toFixed(1)};
    const float RANGE = ${NOISE_ATLAS_RANGE.toFixed(1)};

    vec2 tileUV = clamp(vec2(u, v) / RANGE, 0.0, 1.0);
    tileUV = tileUV * ((TILE - 1.0) / TILE) + 0.5 / TILE;

    float zWrapped = mod(abs(w), Z_PERIOD);
    float zIdx = (zWrapped / Z_PERIOD) * Z_SLICES;
    float z0 = floor(zIdx);
    float zFrac = zIdx - z0;
    float z1 = mod(z0 + 1.0, Z_SLICES);

    vec2 tile0 = vec2(mod(z0, COLS), floor(z0 / COLS));
    vec2 tile1 = vec2(mod(z1, COLS), floor(z1 / COLS));

    float s0 = texture2D(atlas, (tile0 + tileUV) / vec2(COLS, ROWS)).r;
    float s1 = texture2D(atlas, (tile1 + tileUV) / vec2(COLS, ROWS)).r;
    return mix(s0, s1, zFrac);
  }
`;

// ============================================================================
// INSTANCE POSITION SUB-CHUNKS
// Split for maintainability and reuse. Each chunk is < 50 lines.
// ============================================================================

/**
 * Large mode: Direct 1:1 mapping for 21 landmarks.
 * Extra spheres are hidden off-screen.
 */
export const SHADER_LARGE_MODE_POSITION = /* glsl */ `
  if (instanceIndex < 21) {
    landmarkPos = getLandmarkPos(instanceIndex);
    useLandmarkPosition = true;
  } else {
    useLandmarkPosition = true;
    landmarkPos = vec3(0.0, 0.0, -10000.0);
  }
`;

/**
 * Small mode: Bone interpolation for dense hand visualization.
 * Distributes 15 spheres per bone (300 total for 20 bones).
 */
export const SHADER_BONE_INTERPOLATION = /* glsl */ `
  int boneOffset = instanceIndex - 21;
  int boneIdx = boneOffset / 15;
  int sphereOnBone = boneOffset - boneIdx * 15;
  float t = float(sphereOnBone) / 14.0;

  if (boneIdx < 20) {
    int startLm = getBoneStart(boneIdx);
    int endLm = getBoneEnd(boneIdx);
    vec3 startPos = getLandmarkPos(startLm);
    vec3 endPos = getLandmarkPos(endLm);

    landmarkPos = mix(startPos, endPos, t);

    float seed = float(instanceIndex) * 0.1;
    vec3 boneDir = normalize(endPos - startPos + vec3(0.001));
    vec3 perp1 = normalize(cross(boneDir, vec3(0.0, 1.0, 0.0)));
    vec3 perp2 = normalize(cross(boneDir, perp1));

    float angle = seed * 17.3 + uTime * 0.2;
    float bulge = 1.0 + 0.3 * sin(t * 3.14159);
    float radiusNoise = instanceRandA.x;
    float radius = 18.0 * bulge * radiusNoise;

    landmarkPos += perp1 * cos(angle) * radius + perp2 * sin(angle) * radius;
    useLandmarkPosition = true;
  }
`;

/**
 * Small mode: Palm fill using barycentric distribution.
 * Fills the palm region with scattered spheres.
 */
export const SHADER_PALM_FILL = /* glsl */ `
  vec3 wrist = getLandmarkPos(0);
  vec3 indexMcp = getLandmarkPos(5);
  vec3 middleMcp = getLandmarkPos(9);
  vec3 pinkyMcp = getLandmarkPos(17);

  float u = instanceRandB.x;
  float v = instanceRandB.y;
  if (u + v > 1.0) { u = 1.0 - u; v = 1.0 - v; }
  float w = 1.0 - u - v;

  vec3 palmCenter = (wrist + indexMcp + middleMcp + pinkyMcp) * 0.25;
  landmarkPos = wrist * w + mix(indexMcp, pinkyMcp, v) * u + palmCenter * (1.0 - w - u);

  float jitterX = instanceRandB.z * 25.0 - 12.5;
  float jitterY = instanceRandB.w * 25.0 - 12.5;
  float jitterZ = instanceRandC.x * 20.0 - 10.0;
  landmarkPos += vec3(jitterX, jitterY, jitterZ);

  useLandmarkPosition = true;
`;

/**
 * Normal animation: Perlin noise, breathing, energy, cohesion, focus.
 * Used when not in landmark mode.
 */
export const SHADER_NORMAL_ANIMATION = /* glsl */ `
  float nx = sampleNoiseAtlas(uNoiseAtlas, instanceIdx.x * 0.1, instanceIdx.y * 0.1, uTime);
  float ny = sampleNoiseAtlas(uNoiseAtlas, instanceIdx.y * 0.1, instanceIdx.z * 0.1, uTime + 100.0);
  float nz = sampleNoiseAtlas(uNoiseAtlas, instanceIdx.z * 0.1, instanceIdx.x * 0.1, uTime + 200.0);
  vec3 offset = (vec3(nx, ny, nz) * 2.0 - 1.0) * uMotionRange;

  // Asynchronous breathing (breathDepth baked in instanceRandA.w)
  float particlePhase = float(instanceIndex) * 0.37;
  float localBreath = sin(uTime * 0.5 + particlePhase) * instanceRandA.w;
  float breathScale = 1.0 + localBreath + uBreathPhase * 0.3;
  offset *= breathScale;

  // Energy boost (energySensitivity baked in instanceRandC.y)
  float energyBoost = 1.0 + uGlobalEnergy * 0.5;
  float particleEnergyBoost = 1.0 + (energyBoost - 1.0) * instanceRandC.y;
  offset *= particleEnergyBoost;

  // Cohesion
  vec3 toCenter = -base * uCohesion;

  vec3 presenceOffset = vec3(0.0);
  float jitterWeight = exp(-uStartElapsed * START_JITTER_DECAY);
  vec3 jitterOffset = instanceJitter * jitterWeight;

  // Calculate animated position BEFORE focus attraction
  vec3 animatedPos = base + instanceScatter + jitterOffset + offset + toCenter;

  // Focus attraction with distance-based falloff (per-particle effect)
  // uFocusScale = (halfWidth, halfHeight) in world units from camera projection
  // Y is flipped: screen Y=0 is top, world Y+ is up
  vec3 focusWorld = vec3(
    (uFocusPoint.x * 2.0 - 1.0) * uFocusScale.x,
    (1.0 - uFocusPoint.y * 2.0) * uFocusScale.y,
    0.0
  );

  // Distance-based attraction - only nearby particles are affected
  vec3 toFocusDir = focusWorld - animatedPos;
  float distToFocus = length(toFocusDir);
  float focusRadius = uMotionRange * 0.5; // Radius of effect in animated space
  float focusFalloff = 1.0 - smoothstep(0.0, focusRadius, distToFocus);
  vec3 toFocus = toFocusDir * uFocusAttraction * focusFalloff * focusFalloff;

  // Pressure for color shift - squared for softer falloff
  vFocusPressure = focusFalloff * focusFalloff;

  vec3 baseAnimated = animatedPos + toFocus;
  transformed = position + baseAnimated + presenceOffset;
`;

/**
 * Instance position calculation (combined).
 * Requires: instanceIdx, uSpacing, uOffset, uTime, uMotionRange, uStartElapsed,
 *           instanceScatter, instanceJitter attributes/uniforms
 * Outputs: vec3 transformed (the final world position)
 */
export const SHADER_INSTANCE_POSITION = /* glsl */ `
  vec3 base = vec3(
    instanceIdx.x * uSpacing + uOffset.x,
    instanceIdx.y * uSpacing + uOffset.y,
    instanceIdx.z * uSpacing + uOffset.z
  );

  int instanceIndex = int(instanceIdx.x + instanceIdx.y * uGrid.x + instanceIdx.z * uGrid.x * uGrid.y);
  int totalInstances = int(uGrid.x * uGrid.y * uGrid.z);
  bool isLargeMode = totalInstances <= 30;

  bool useLandmarkPosition = false;
  vec3 landmarkPos = vec3(0.0);

  if (uLandmarkMode > 0.5) {
    if (isLargeMode) {
      ${SHADER_LARGE_MODE_POSITION}
    } else {
      if (instanceIndex < 21) {
        landmarkPos = getLandmarkPos(instanceIndex);
        useLandmarkPosition = true;
      } else if (instanceIndex < 321) {
        ${SHADER_BONE_INTERPOLATION}
      } else {
        ${SHADER_PALM_FILL}
      }
    }
  }

  vec3 transformed;
  if (useLandmarkPosition) {
    transformed = position + landmarkPos;
  } else {
    ${SHADER_NORMAL_ANIMATION}
  }
`;

/**
 * Color mixing based on time and position.
 * Requires: uTime, instanceIdx, uBaseColor, uSecondaryColor uniforms
 * Outputs: vColor varying
 */
export const SHADER_COLOR_MIX = /* glsl */ `
  float timeOscillation = (sin(uTime + instanceIdx.x*0.1 + instanceIdx.y*0.1 + instanceIdx.z*0.1) + 1.0) * 0.5;
  float mixFactor = clamp(timeOscillation + vFocusPressure, 0.0, 1.0);
  vec3 baseBlend = mix(uBaseColor, uSecondaryColor, mixFactor);
  // Awareness brightness boost - orbs glow slightly more when engaged
  vColor = baseBlend * (1.0 + uAwarenessBrightness);
`;

/**
 * Legacy (reduced motion) fragment shader.
 */
export const FRAGMENT_SHADER_LEGACY = /* glsl */ `
  varying vec3 vColor;
  varying vec3 vNormal;
  uniform vec3 uLightDir;
  uniform float uAmbient;
  void main() {
    float ndl = max(dot(normalize(vNormal), normalize(uLightDir)), 0.0);
    float lambert = clamp(uAmbient + ndl * (1.0 - uAmbient), 0.0, 1.0);
    vec3 col = vColor * lambert;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * Modern (full effects) fragment shader.
 * Ultra-realistic with streaky specular highlights:
 * - Anisotropic-style stretched highlights
 * - Multi-layer specular for depth
 * - Vivid fresnel rim lighting
 * - Subsurface scattering approximation
 */
export const FRAGMENT_SHADER_MODERN = /* glsl */ `
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  uniform vec3 uLightDir1;
  uniform vec3 uLightDir2;
  uniform vec3 uLightDir3;
  uniform float uAmbient;
  uniform vec3 uSpecularColor;
  uniform float uRoughness;
  uniform float uMetalness;
  uniform float uFresnelPower;
  uniform float uEmissionStrength;

  // Schlick fresnel with boost for vivid highlights
  vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float roughness) {
    return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
  }

  // Anisotropic-style stretched specular for that "streaky" look
  float streakySpecular(vec3 N, vec3 H, vec3 V, float roughness, float stretch) {
    // Create tangent basis for anisotropic effect
    vec3 tangent = normalize(cross(N, vec3(0.0, 1.0, 0.0)));
    vec3 bitangent = normalize(cross(N, tangent));

    // Anisotropic roughness - stretched in one direction
    float roughX = roughness * stretch;
    float roughY = roughness / stretch;

    // Ward-style anisotropic distribution
    float dotHT = dot(H, tangent);
    float dotHB = dot(H, bitangent);
    float dotNH = max(dot(N, H), 0.0);

    float exponent = -2.0 * ((dotHT * dotHT) / (roughX * roughX) + (dotHB * dotHB) / (roughY * roughY)) / (1.0 + dotNH);
    float D = exp(exponent) / (12.566 * roughX * roughY * pow(dotNH, 4.0) + 0.0001);

    return clamp(D * 0.25, 0.0, 6.0);
  }

  // Specular highlight with smooth edges
  float smoothSpecular(vec3 N, vec3 H, float power) {
    float NdotH = max(dot(N, H), 0.0);
    // Soften the falloff slightly to reduce harsh edges
    float spec = pow(NdotH, power);
    // Blend with a softer version to smooth transitions
    float softSpec = pow(NdotH, power * 0.5);
    return mix(softSpec * 0.3, spec, smoothstep(0.0, 0.5, NdotH));
  }

  // Subsurface scattering approximation - light wrapping around edges
  float subsurfaceWrap(vec3 N, vec3 L, float wrap) {
    float NdotL = dot(N, L);
    return max(0.0, (NdotL + wrap) / (1.0 + wrap));
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(-vViewPos);
    vec3 L1 = normalize(uLightDir1);  // Key light
    vec3 L2 = normalize(uLightDir2);  // Fill light
    vec3 L3 = normalize(uLightDir3);  // Rim light

    float roughness = clamp(uRoughness, 0.05, 1.0);
    float metalness = clamp(uMetalness, 0.0, 1.0);

    // Base fresnel reflectance
    vec3 F0 = mix(vec3(0.04), vColor, metalness);

    // ========================================
    // KEY LIGHT - Main illumination with streaky highlight
    // ========================================
    vec3 H1 = normalize(V + L1);
    float NdotL1 = max(dot(N, L1), 0.0);
    float NdotV = max(dot(N, V), 0.0);

    // Soft diffuse with subsurface wrap
    float diffuse1 = subsurfaceWrap(N, L1, 0.25);

    // Layered specular: sharp core + streaky halo
    float specCore1 = smoothSpecular(N, H1, 800.0) * 2.0;
    float specStreak1 = streakySpecular(N, H1, V, roughness, 2.5);
    float specSoft1 = smoothSpecular(N, H1, 80.0) * 0.4;

    vec3 F1 = fresnelSchlickRoughness(max(dot(H1, V), 0.0), F0, roughness);
    vec3 spec1 = (specCore1 + specStreak1 + specSoft1) * mix(uSpecularColor, vColor, metalness * 0.5);

    vec3 keyLight = vColor * diffuse1 * 0.7 + spec1 * F1;

    // ========================================
    // FILL LIGHT - Softer, warmer
    // ========================================
    vec3 H2 = normalize(V + L2);
    float diffuse2 = subsurfaceWrap(N, L2, 0.35);
    float specCore2 = smoothSpecular(N, H2, 400.0) * 1.2;
    float specStreak2 = streakySpecular(N, H2, V, roughness * 1.2, 1.8);

    vec3 F2 = fresnelSchlickRoughness(max(dot(H2, V), 0.0), F0, roughness);
    vec3 spec2 = (specCore2 + specStreak2) * mix(uSpecularColor, vColor, metalness * 0.3);

    vec3 fillLight = (vColor * diffuse2 * 0.5 + spec2 * F2) * 0.6;

    // ========================================
    // RIM LIGHT - Back lighting for silhouette pop
    // ========================================
    vec3 H3 = normalize(V + L3);
    float NdotL3 = max(dot(N, L3), 0.0);

    // Strong rim with fresnel boost
    float rimFresnel = pow(1.0 - NdotV, 2.5);
    float rimSpec = smoothSpecular(N, H3, 200.0) * 3.0;

    vec3 rimLight = (vColor * rimFresnel * 0.8 + rimSpec * uSpecularColor) * NdotL3 * 0.5;

    // ========================================
    // FRESNEL RIM GLOW - Edge emission
    // ========================================
    float edgeFresnel = pow(1.0 - NdotV, uFresnelPower);
    vec3 rimGlow = vColor * uEmissionStrength * edgeFresnel * 1.5;

    // ========================================
    // AMBIENT - Subtle base with gradient
    // ========================================
    float ambientOcclusion = 0.7 + 0.3 * NdotV; // Brighter facing camera
    vec3 ambient = vColor * uAmbient * ambientOcclusion;

    // ========================================
    // FINAL COMPOSITE
    // ========================================
    vec3 color = ambient + keyLight + fillLight + rimLight + rimGlow;

    // Preserve vibrancy: only compress highlights, keep mids/shadows punchy
    vec3 compressed = color / (color + vec3(1.2));
    // Blend: keep original color for low values, compress only bright spots
    float luminance = dot(color, vec3(0.299, 0.587, 0.114));
    float compressBlend = smoothstep(0.6, 1.5, luminance);
    color = mix(color, compressed, compressBlend);

    // Saturation boost to counter any desaturation from lighting math
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(gray), color, 1.15);

    gl_FragColor = vec4(color, 1.0);
  }
`;

/**
 * Creates the atmosphere layer vertex shader.
 */
export const ATMOSPHERE_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * Creates the atmosphere layer fragment shader.
 */
export function createAtmosphereFragmentShader(): string {
  return /* glsl */ `
    varying vec2 vUv;
    uniform float uTime;
    uniform float uStrength;
    uniform vec3 uLeftColor;
    uniform vec3 uRightColor;
    uniform vec3 uTopColor;
    uniform vec3 uBottomColor;
    uniform vec3 uCenterColor;
    uniform vec2 uShift;
    uniform float uGlobalTime;
    uniform float uRippleScale;
    uniform vec2 uRippleCenters[${ATMOSPHERE_RIPPLE_COUNT}];
    uniform float uRippleTimes[${ATMOSPHERE_RIPPLE_COUNT}];

    float softEdge(float value, float power) {
      value = clamp(value, 0.0, 1.0);
      return pow(value, power);
    }

    vec2 applyRipples(vec2 uv) {
      vec2 distorted = uv;
      for (int i = 0; i < ${ATMOSPHERE_RIPPLE_COUNT}; i++) {
        float start = uRippleTimes[i];
        if (start < 0.0) {
          continue;
        }
        float age = uGlobalTime - start;
        if (age < 0.0) {
          continue;
        }
        if (age > ${ATMOSPHERE_RIPPLE_MAX_AGE.toFixed(1)}) {
          continue;
        }
        vec2 center = uRippleCenters[i];
        vec2 delta = uv - center;
        float dist = length(delta);
        if (dist < 0.001) {
          continue;
        }
        float phase = dist * 32.0 - age * 14.0;
        float wave = sin(phase) * exp(-age * 2.6) / (dist + 0.02);
        distorted += (delta / dist) * wave * uRippleScale;
      }
      return distorted;
    }

    void main() {
      vec2 uv = vUv + uShift * 0.12;
      uv = applyRipples(uv);
      float wave = sin(uTime * 0.12) * 0.5 + 0.5;
      float sweep = sin(uTime * 0.05) * 0.5 + 0.5;
      float left = softEdge(1.0 - uv.x, 1.8);
      float right = softEdge(uv.x, 1.8);
      float top = softEdge(1.0 - uv.y, 2.2);
      float bottom = softEdge(uv.y, 2.0);
      float centerDist = distance(uv, vec2(0.52 + (sweep - 0.5) * 0.18, 0.54 - wave * 0.06));
      float halo = clamp(1.0 - smoothstep(0.22, 0.78, centerDist), 0.0, 1.0);
      float shimmer = sin((uv.x + uv.y) * 6.283 + uTime * 0.45) * 0.5 + 0.5;

      vec3 color = vec3(0.0);
      color += uLeftColor * left;
      color += uRightColor * right;
      color += uTopColor * top * 0.55;
      color += uBottomColor * bottom * 0.55;
      color += uCenterColor * pow(halo, 1.6) * (0.6 + shimmer * 0.35);

      float alpha = (left + right) * 0.33 + (top + bottom) * 0.17 + pow(halo, 1.2) * 0.5;
      alpha = clamp(alpha * (0.42 + wave * 0.32), 0.0, 1.0);
      alpha *= uStrength;
      gl_FragColor = vec4(color, alpha);
    }
  `;
}

/**
 * Creates the legacy vertex shader.
 */
export function createLegacyVertexShader(): string {
  return /* glsl */ `
    attribute vec3 instanceIdx;
    attribute vec3 instanceScatter;
    attribute vec3 instanceJitter;
    attribute vec4 instanceRandA;
    attribute vec4 instanceRandB;
    attribute vec2 instanceRandC;
    uniform float uTime;
    uniform float uStartElapsed;
    uniform float uSpacing; uniform vec3 uGrid; uniform vec3 uOffset; uniform float uMotionRange;
    uniform sampler2D uPerlin;
    uniform sampler2D uNoiseAtlas;
    uniform vec3 uBaseColor; uniform vec3 uSecondaryColor;
    // Awareness uniforms
    uniform float uBreathPhase;
    uniform float uCohesion;
    uniform vec2 uFocusPoint;
    uniform vec2 uFocusScale;
    uniform float uFocusAttraction;
    uniform float uAwarenessBrightness;
    // Hand landmark uniforms
    uniform sampler2D uLandmarkTex;
    uniform float uLandmarkMode;
    uniform float uLandmarkWorldScale;
    uniform float uLandmarkDepthScale;
    uniform float uLandmarkAttraction;
    // Presence field uniforms
    uniform vec3 uHandCenter;
    uniform vec3 uHandVelocity;
    uniform float uHandApproaching;
    uniform float uPresenceStrength;
    uniform float uPresenceRadius;
    uniform float uPresenceAttraction;
    // Global energy uniform
    uniform float uGlobalEnergy;
    varying vec3 vColor;
    varying vec3 vNormal;

    ${SHADER_PERLIN_CONSTANTS}
    ${SHADER_PERLIN_FUNCTIONS}
    ${SHADER_NOISE_ATLAS}

    void main() {
      float vFocusPressure = 0.0;
      ${SHADER_INSTANCE_POSITION}
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      ${SHADER_COLOR_MIX}
    }
  `;
}

/**
 * Creates the modern vertex shader.
 */
export function createModernVertexShader(): string {
  return /* glsl */ `
    attribute vec3 instanceIdx;
    attribute vec3 instanceScatter;
    attribute vec3 instanceJitter;
    attribute vec4 instanceRandA;
    attribute vec4 instanceRandB;
    attribute vec2 instanceRandC;
    uniform float uTime;
    uniform float uStartElapsed;
    uniform float uSpacing; uniform vec3 uGrid; uniform vec3 uOffset; uniform float uMotionRange;
    uniform sampler2D uPerlin;
    uniform sampler2D uNoiseAtlas;
    uniform vec3 uBaseColor; uniform vec3 uSecondaryColor;
    // Awareness uniforms
    uniform float uBreathPhase;
    uniform float uCohesion;
    uniform vec2 uFocusPoint;
    uniform vec2 uFocusScale;
    uniform float uFocusAttraction;
    uniform float uAwarenessBrightness;
    // Hand landmark uniforms
    uniform sampler2D uLandmarkTex;
    uniform float uLandmarkMode;
    uniform float uLandmarkWorldScale;
    uniform float uLandmarkDepthScale;
    uniform float uLandmarkAttraction;
    // Presence field uniforms
    uniform vec3 uHandCenter;
    uniform vec3 uHandVelocity;
    uniform float uHandApproaching;
    uniform float uPresenceStrength;
    uniform float uPresenceRadius;
    uniform float uPresenceAttraction;
    // Global energy uniform
    uniform float uGlobalEnergy;
    varying vec3 vColor;
    varying vec3 vNormal;
    varying vec3 vViewPos;

    ${SHADER_PERLIN_CONSTANTS}
    ${SHADER_PERLIN_FUNCTIONS}
    ${SHADER_NOISE_ATLAS}

    void main() {
      float vFocusPressure = 0.0;
      ${SHADER_INSTANCE_POSITION}
      vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
      vViewPos = mvPosition.xyz;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * mvPosition;
      ${SHADER_COLOR_MIX}
    }
  `;
}
