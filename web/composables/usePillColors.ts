/**
 * Pill color palette and utilities
 *
 * Provides consistent color assignment for skill pills based on ID hashing.
 * Extracted from SkillsDock.vue for reusability.
 */

/** 12 distinct colors for pill dots */
export const DOT_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#d946ef', // Magenta
  '#ec4899', // Pink
  '#78716c', // Stone
  '#64748b', // Slate
] as const;

/**
 * Generate a consistent color index from a skill ID using hash
 */
export function getColorIndex(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % DOT_COLORS.length;
}

/**
 * Get the dot color for a skill
 * Uses existing color if provided, otherwise derives from ID
 */
export function getDotColor(id: string, existingColor?: string): string {
  if (existingColor) return existingColor;
  return DOT_COLORS[getColorIndex(id)] ?? DOT_COLORS[0] ?? '#1a1a24';
}

/**
 * Convert hex to RGB tuple
 */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * Convert RGB to LAB color space for perceptual blending
 * LAB provides more natural color mixing than RGB averaging
 */
function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  // Normalize and apply sRGB gamma
  let rn = r / 255;
  let gn = g / 255;
  let bn = b / 255;

  rn = rn > 0.04045 ? Math.pow((rn + 0.055) / 1.055, 2.4) : rn / 12.92;
  gn = gn > 0.04045 ? Math.pow((gn + 0.055) / 1.055, 2.4) : gn / 12.92;
  bn = bn > 0.04045 ? Math.pow((bn + 0.055) / 1.055, 2.4) : bn / 12.92;

  // Convert to XYZ (D65 illuminant)
  const x = (rn * 0.4124564 + gn * 0.3575761 + bn * 0.1804375) / 0.95047;
  const y = rn * 0.2126729 + gn * 0.7151522 + bn * 0.072175;
  const z = (rn * 0.0193339 + gn * 0.119192 + bn * 0.9503041) / 1.08883;

  // Convert to LAB
  const fx = x > 0.008856 ? Math.pow(x, 1 / 3) : 7.787 * x + 16 / 116;
  const fy = y > 0.008856 ? Math.pow(y, 1 / 3) : 7.787 * y + 16 / 116;
  const fz = z > 0.008856 ? Math.pow(z, 1 / 3) : 7.787 * z + 16 / 116;

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * Convert LAB back to RGB
 */
function labToRgb(l: number, a: number, bLab: number): [number, number, number] {
  const fy = (l + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - bLab / 200;

  const x = 0.95047 * (fx > 0.206897 ? Math.pow(fx, 3) : (fx - 16 / 116) / 7.787);
  const y = fy > 0.206897 ? Math.pow(fy, 3) : (fy - 16 / 116) / 7.787;
  const z = 1.08883 * (fz > 0.206897 ? Math.pow(fz, 3) : (fz - 16 / 116) / 7.787);

  let rn = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  let gn = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  let bn = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;

  // Apply reverse gamma
  rn = rn > 0.0031308 ? 1.055 * Math.pow(rn, 1 / 2.4) - 0.055 : 12.92 * rn;
  gn = gn > 0.0031308 ? 1.055 * Math.pow(gn, 1 / 2.4) - 0.055 : 12.92 * gn;
  bn = bn > 0.0031308 ? 1.055 * Math.pow(bn, 1 / 2.4) - 0.055 : 12.92 * bn;

  return [
    Math.round(Math.max(0, Math.min(255, rn * 255))),
    Math.round(Math.max(0, Math.min(255, gn * 255))),
    Math.round(Math.max(0, Math.min(255, bn * 255))),
  ];
}

/**
 * Blend colors in LAB space for perceptually accurate results
 * Produces vibrant blends instead of muddy RGB averages
 */
export function blendColorsLab(color1: string, color2: string, t = 0.5): string {
  const [r1, g1, b1] = hexToRgb(color1);
  const [r2, g2, b2] = hexToRgb(color2);

  const [l1, a1, b1Lab] = rgbToLab(r1, g1, b1);
  const [l2, a2, b2Lab] = rgbToLab(r2, g2, b2);

  // Interpolate in LAB space
  const l = l1 + (l2 - l1) * t;
  const a = a1 + (a2 - a1) * t;
  const bResult = b1Lab + (b2Lab - b1Lab) * t;

  const [r, g, b] = labToRgb(l, a, bResult);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Blend two hex colors together (simple RGB average)
 * Used for combined pill backgrounds - kept for backwards compatibility
 */
export function blendColors(color1: string, color2: string): string {
  // Use LAB blending for better perceptual results
  return blendColorsLab(color1, color2, 0.5);
}

/**
 * Blend multiple colors together
 */
export function blendMultipleColors(colors: string[]): string {
  if (colors.length === 0) return '#1a1a24';
  const firstColor = colors[0];
  if (colors.length === 1 || !firstColor) return firstColor ?? '#1a1a24';

  let blended = firstColor;
  for (let i = 1; i < colors.length; i++) {
    const nextColor = colors[i];
    if (nextColor) {
      blended = blendColors(blended, nextColor);
    }
  }
  return blended;
}

/**
 * Composable hook for pill colors
 */
export function usePillColors() {
  return {
    DOT_COLORS,
    getColorIndex,
    getDotColor,
    blendColors,
    blendColorsLab,
    blendMultipleColors,
  };
}

export default usePillColors;
