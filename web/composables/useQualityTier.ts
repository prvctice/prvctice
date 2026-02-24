import { ref, readonly } from 'vue';
import { storage } from '@web/storage/storage.js';
import { STORAGE_KEYS } from '@web/constants/storageKeys.js';
import type { QualityTier, QualityDetectionResult } from '@web/graphics/dotmatrix/types.js';

// =============================================================================
// Singleton State
// =============================================================================

const currentTier = ref<QualityTier>('high');
const isAutoDetected = ref(true);
const detectionResult = ref<QualityDetectionResult | null>(null);
let initialized = false;

// =============================================================================
// GPU Detection
// =============================================================================

/**
 * Detect GPU capabilities via WEBGL_debug_renderer_info extension.
 * Falls back to device heuristics when WebGL is unavailable.
 */
function detectGPU(): QualityDetectionResult {
  const result: QualityDetectionResult = {
    suggestedTier: 'high',
    gpuVendor: null,
    gpuRenderer: null,
    deviceMemory: null,
    hardwareConcurrency: navigator.hardwareConcurrency || 4,
    isMobile: /Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent),
    confidence: 'low',
  };

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl && gl instanceof WebGLRenderingContext) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        result.gpuVendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
        result.gpuRenderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
        result.confidence = 'high';
      }
    }
  } catch {
    // WebGL not available - will use fallback heuristics
  }

  // Device memory API (Chrome/Edge only)
  if ('deviceMemory' in navigator) {
    result.deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null;
  }

  // Determine tier based on detected capabilities
  result.suggestedTier = determineTierFromGPU(result);

  return result;
}

/**
 * Match GPU renderer string against known patterns to determine quality tier.
 * Patterns are ordered from weakest to strongest GPUs.
 */
function determineTierFromGPU(result: QualityDetectionResult): QualityTier {
  const renderer = (result.gpuRenderer || '').toLowerCase();

  // LOW tier - integrated/budget GPUs, older mobile
  const lowPatterns = [
    /intel.*(hd|uhd).*[345]\d{2}/, // Intel HD 3000-5000 series
    /intel.*iris.*5\d{2}/, // Older Intel Iris (5xx)
    /mali-[gt][1-5]/i, // Mali G1-G5, T1-T5
    /adreno.*[1-4]\d{2}/, // Adreno 100-499
    /powervr/i, // PowerVR (older iOS/Android)
    /sgx/i, // SGX (very old mobile)
    /videocore/i, // Raspberry Pi
    /llvmpipe/i, // Software renderer
    /swiftshader/i, // Software renderer
  ];

  // MEDIUM tier - mid-range GPUs, 2017-era MacBook Pro level
  const mediumPatterns = [
    /intel.*(hd|uhd).*6[0-3]\d/, // Intel HD 600-630 (2017 MacBook Pro)
    /intel.*iris.*6\d{2}/, // Intel Iris 600 series
    /intel.*iris.*plus/, // Intel Iris Plus
    /mali-g[67]/i, // Mali G6-G7
    /adreno.*[56]\d{2}/, // Adreno 500-600 series
    /apple.*a1[0-4]/i, // Apple A10-A14 (iPhone 12 and below)
    /geforce.*(mx|gt)\s*\d/i, // NVIDIA MX/GT series (mobile)
    /radeon.*(vega|rx\s*5[0-5]0)/i, // AMD integrated/lower-end discrete
    /radeon.*graphics/i, // AMD APU integrated
  ];

  // ULTRA tier - ProMotion-capable devices (M3/M4 Macs with 120Hz displays)
  const ultraPatterns = [
    /apple.*m[3-9]/i, // Apple M3, M4, etc. (ProMotion MacBooks)
    /apple.*m[1-9]\d/i, // Future M10+ chips
  ];

  // HIGH tier - powerful dedicated GPUs, Apple Silicon, modern flagships
  const highPatterns = [
    /apple.*m[1-2]/i, // Apple M1, M2 (60Hz Macs)
    /apple.*a1[5-9]/i, // Apple A15+ (iPhone 13+)
    /apple.*a[2-9]\d/i, // Future Apple A chips
    /geforce.*rtx/i, // NVIDIA RTX series
    /geforce.*gtx.*1[0-9]{3}/i, // NVIDIA GTX 1000+ series
    /geforce.*gtx.*[2-9]\d{3}/i, // Future NVIDIA GTX
    /radeon.*rx.*[67]\d{3}/i, // AMD RX 6000/7000 series
    /radeon.*rx.*[89]\d{3}/i, // Future AMD RX
    /mali-g[89]/i, // Mali G8-G9
    /mali-g[1-9]\d{2}/i, // Mali G100+ (future)
    /adreno.*[789]\d{2}/i, // Adreno 700-900 series
    /intel.*arc/i, // Intel Arc discrete GPUs
  ];

  // Check LOW patterns first (worst GPUs)
  for (const pattern of lowPatterns) {
    if (pattern.test(renderer)) return 'low';
  }

  // Check MEDIUM patterns
  for (const pattern of mediumPatterns) {
    if (pattern.test(renderer)) return 'medium';
  }

  // Check ULTRA patterns (ProMotion-capable M3/M4)
  for (const pattern of ultraPatterns) {
    if (pattern.test(renderer)) return 'ultra';
  }

  // Check HIGH patterns
  for (const pattern of highPatterns) {
    if (pattern.test(renderer)) return 'high';
  }

  // Fallbacks when no pattern matched
  if (result.isMobile) {
    // Default mobile to medium - safe for iPhone 12 and similar
    return 'medium';
  }

  if (result.deviceMemory !== null && result.deviceMemory < 4) {
    // Low memory devices likely have weak GPUs
    return 'low';
  }

  if (result.hardwareConcurrency < 4) {
    // Few cores suggests older/weaker device
    return 'medium';
  }

  // Default desktop to high - modern machines can handle it
  return 'high';
}

// =============================================================================
// CSS Class Management
// =============================================================================

/**
 * Apply CSS classes to body based on quality tier.
 * Medium and low tiers get lite-mode for reduced visual effects.
 * Ultra tier gets promotion-mode for 120Hz optimizations.
 */
function updateBodyClass(tier: QualityTier): void {
  document.body.classList.remove('lite-mode', 'promotion-mode');
  if (tier === 'medium' || tier === 'low') {
    document.body.classList.add('lite-mode');
  } else if (tier === 'ultra') {
    document.body.classList.add('promotion-mode');
  }
}

// =============================================================================
// Initialization
// =============================================================================

/**
 * Notify dotmatrix system of the current tier.
 * Retries if dotmatrix isn't ready yet.
 */
function notifyDotMatrix(tier: QualityTier, retries = 3): void {
  const setDotMatrixTier = (
    window as Window & { setDotMatrixQualityTier?: (tier: QualityTier) => void }
  ).setDotMatrixQualityTier;

  if (typeof setDotMatrixTier === 'function') {
    setDotMatrixTier(tier);
  } else if (retries > 0) {
    // Dotmatrix not ready yet, retry after a delay
    setTimeout(() => notifyDotMatrix(tier, retries - 1), 500);
  }
}

/**
 * Initialize quality tier - checks saved preference or auto-detects.
 * Called once when module loads.
 */
function initialize(): void {
  if (initialized) return;
  initialized = true;

  // Check for user-saved preference
  const saved = storage.mirror.get(STORAGE_KEYS.GRAPHICS_QUALITY_TIER);
  if (saved === 'ultra' || saved === 'high' || saved === 'medium' || saved === 'low') {
    currentTier.value = saved;
    isAutoDetected.value = false;
  } else {
    // Auto-detect from GPU
    detectionResult.value = detectGPU();
    currentTier.value = detectionResult.value.suggestedTier;
    isAutoDetected.value = true;
  }

  updateBodyClass(currentTier.value);

  // Sync to dotmatrix system (with retry in case it's not ready)
  notifyDotMatrix(currentTier.value);
}

// Initialize on module load (browser only)
if (typeof window !== 'undefined') {
  initialize();
}

// =============================================================================
// Composable Export
// =============================================================================

export interface UseQualityTierReturn {
  /** Current quality tier (readonly) */
  tier: Readonly<typeof currentTier>;
  /** Whether current tier was auto-detected vs manually set */
  isAuto: Readonly<typeof isAutoDetected>;
  /** GPU detection result (null if not yet detected) */
  detection: Readonly<typeof detectionResult>;
  /** Manually set quality tier */
  setTier: (tier: QualityTier) => void;
  /** Reset to auto-detected tier */
  resetToAuto: () => void;
  /** Re-run GPU detection and return result */
  detectTier: () => QualityDetectionResult;
}

/**
 * Composable for GPU detection and quality tier management.
 * Singleton pattern - all components share the same state.
 */
export function useQualityTier(): UseQualityTierReturn {
  /**
   * Manually set quality tier and persist preference.
   */
  function setTier(tier: QualityTier): void {
    // Skip if same tier AND already in manual mode
    if (tier === currentTier.value && !isAutoDetected.value) return;

    currentTier.value = tier;
    isAutoDetected.value = false;

    // Persist user preference
    storage.mirror.set(STORAGE_KEYS.GRAPHICS_QUALITY_TIER, tier);

    // Update CSS class
    updateBodyClass(tier);

    // Notify dotmatrix system
    notifyDotMatrix(tier);
  }

  /**
   * Reset to auto-detected tier and clear saved preference.
   */
  function resetToAuto(): void {
    // Clear saved preference
    storage.mirror.remove(STORAGE_KEYS.GRAPHICS_QUALITY_TIER);

    // Re-detect GPU capabilities
    detectionResult.value = detectGPU();
    currentTier.value = detectionResult.value.suggestedTier;
    isAutoDetected.value = true;

    updateBodyClass(currentTier.value);

    // Notify dotmatrix system
    notifyDotMatrix(currentTier.value);
  }

  /**
   * Re-run GPU detection and return result.
   * Does not change current tier unless resetToAuto() is called.
   */
  function detectTier(): QualityDetectionResult {
    detectionResult.value = detectGPU();
    return detectionResult.value;
  }

  return {
    // Readonly state
    tier: readonly(currentTier),
    isAuto: readonly(isAutoDetected),
    detection: readonly(detectionResult),

    // Actions
    setTier,
    resetToAuto,
    detectTier,
  };
}
