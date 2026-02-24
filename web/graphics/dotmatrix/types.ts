/**
 * Quality Tier System Types
 * Defines the tiered graphics quality system for performance scaling
 */

/**
 * Available quality tiers
 * - ultra: Maximum quality for ProMotion displays (M3/M4 Macs, 120Hz)
 * - high: Full effects for powerful devices (gaming PCs, M1+ Macs)
 * - medium: Balanced for mid-tier devices (2017 MacBook Pro, iPhone 12)
 * - low: Minimal for older/budget devices
 */
export type QualityTier = 'ultra' | 'high' | 'medium' | 'low';

/**
 * Configuration for each quality tier
 */
export interface QualityConfig {
  // Particle system
  gridDimensions: { x: number; y: number; z: number };
  sphereSegments: number;

  // Shader complexity
  shaderMode: 'modern' | 'legacy';

  // Bloom
  bloomEnabled: boolean;
  bloomBlurRadius: number;
  bloomUpdateInterval: number;

  // Atmosphere
  atmosphereEnabled: boolean;
  atmosphereRippleCount: number;

  // Rendering
  maxPixelRatio: number;
  targetFrameRate: 120 | 60 | 30;

  // CSS class to apply (null for none)
  cssClass: string | null;
}

/**
 * Result from GPU/device capability detection
 */
export interface QualityDetectionResult {
  suggestedTier: QualityTier;
  gpuVendor: string | null;
  gpuRenderer: string | null;
  deviceMemory: number | null;
  hardwareConcurrency: number;
  isMobile: boolean;
  confidence: 'high' | 'medium' | 'low';
}
