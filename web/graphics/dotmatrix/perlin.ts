// dotmatrix/perlin.ts
// Perlin noise utilities for dot-matrix animation

import type * as THREE from 'three';

export const PERLIN_SIZE = 4095;
export const PERLIN_DIM = 64;

let perlin: Uint8Array | null = null;
let perlinFloat: Float32Array | null = null;

/**
 * Ensures the Perlin noise lookup table is initialized.
 * @returns The Perlin noise table
 */
export function ensurePerlin(): Uint8Array {
  if (perlin) return perlin;
  perlin = new Uint8Array(PERLIN_SIZE + 1);
  for (let i = 0; i < PERLIN_SIZE + 1; i++) {
    perlin[i] = Math.floor(Math.random() * 256);
  }
  return perlin;
}

/**
 * Gets the Perlin table as Float32Array (normalized 0-1).
 * @returns Normalized Perlin noise table
 */
export function ensurePerlinFloat(): Float32Array {
  const p = ensurePerlin();
  if (!perlinFloat) {
    perlinFloat = new Float32Array(PERLIN_SIZE + 1);
    for (let i = 0; i < PERLIN_SIZE + 1; i++) {
      perlinFloat[i] = (p[i] ?? 0) / 255;
    }
  }
  return perlinFloat;
}

/**
 * CPU version of p5.js 3D Perlin noise.
 * @param x - X coordinate
 * @param y - Y coordinate (default 0)
 * @param z - Z coordinate (default 0)
 * @returns Noise value (0-1)
 */
export function p5noiseCPU(x: number, y = 0, z = 0): number {
  const table = ensurePerlinFloat();
  if (x < 0) x = -x;
  if (y < 0) y = -y;
  if (z < 0) z = -z;

  let xi = Math.floor(x);
  let yi = Math.floor(y);
  let zi = Math.floor(z);
  let xf = x - xi;
  let yf = y - yi;
  let zf = z - zi;
  let r = 0;
  let ampl = 0.5;
  let of = xi + (yi << 4) + (zi << 8);

  for (let o = 0; o < 4; o++) {
    const rxf = 0.5 * (1 - Math.cos(xf * Math.PI));
    const ryf = 0.5 * (1 - Math.cos(yf * Math.PI));

    // TypedArray access - indices are masked to valid range via & PERLIN_SIZE
    let n1 = table[of & PERLIN_SIZE]!;
    n1 += rxf * (table[(of + 1) & PERLIN_SIZE]! - n1);
    let n2 = table[(of + 16) & PERLIN_SIZE]!;
    n2 += rxf * (table[(of + 16 + 1) & PERLIN_SIZE]! - n2);
    n1 += ryf * (n2 - n1);

    of += 256;
    n2 = table[of & PERLIN_SIZE]!;
    n2 += rxf * (table[(of + 1) & PERLIN_SIZE]! - n2);
    let n3 = table[(of + 16) & PERLIN_SIZE]!;
    n3 += rxf * (table[(of + 16 + 1) & PERLIN_SIZE]! - n3);
    n2 += ryf * (n3 - n2);

    const zc = 0.5 * (1 - Math.cos(zf * Math.PI));
    n1 += zc * (n2 - n1);
    r += n1 * ampl;
    ampl *= 0.5;

    xi <<= 1;
    yi <<= 1;
    zi <<= 1;
    xf *= 2;
    yf *= 2;
    zf *= 2;
    if (xf >= 1) {
      xi++;
      xf--;
    }
    if (yf >= 1) {
      yi++;
      yf--;
    }
    if (zf >= 1) {
      zi++;
      zf--;
    }
    of = xi + (yi << 4) + (zi << 8);
  }
  return r;
}

/**
 * Builds a Three.js DataTexture from the Perlin table.
 * @param THREEModule - Three.js namespace
 * @returns Perlin noise texture
 */
export function buildPerlinTexture(THREEModule: typeof THREE): THREE.DataTexture {
  const data = ensurePerlin();
  const texData = new Uint8Array(PERLIN_DIM * PERLIN_DIM);
  texData.set(data);
  // RedFormat is preferred; LuminanceFormat was deprecated in r155
  const format = THREEModule.RedFormat;
  const tex = new THREEModule.DataTexture(texData, PERLIN_DIM, PERLIN_DIM, format);
  tex.minFilter = THREEModule.NearestFilter;
  tex.magFilter = THREEModule.NearestFilter;
  tex.wrapS = THREEModule.RepeatWrapping;
  tex.wrapT = THREEModule.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

// ============================================================================
// NOISE ATLAS
// Precomputed 2D atlas of p5noise values for single-fetch GPU sampling.
// Replaces 96 texture reads per vertex with 6 (2 per call × 3 calls).
// ============================================================================

/** Texels per tile edge */
export const NOISE_ATLAS_TILE = 64;
/** Number of Z slices stored in the atlas */
export const NOISE_ATLAS_Z_SLICES = 64;
/** Tile columns in atlas grid */
export const NOISE_ATLAS_COLS = 8;
/** Tile rows in atlas grid */
export const NOISE_ATLAS_ROWS = 8;
/** Z period of p5noise (4096 / 256 = 16) */
export const NOISE_ATLAS_Z_PERIOD = 16.0;
/** Noise coordinate range covered by each tile [0, RANGE] */
export const NOISE_ATLAS_RANGE = 1.0;

/**
 * Builds a 2D noise atlas by precomputing p5noiseCPU over a grid of
 * (u, v, z) coordinates. Z slices are tiled in an 8×8 grid layout.
 *
 * Atlas dimensions: (TILE × COLS) × (TILE × ROWS) = 512×512 Uint8
 *
 * @param THREEModule - Three.js namespace
 * @returns DataTexture containing the noise atlas
 */
export function buildNoiseAtlas(THREEModule: typeof THREE): THREE.DataTexture {
  const tile = NOISE_ATLAS_TILE;
  const slices = NOISE_ATLAS_Z_SLICES;
  const cols = NOISE_ATLAS_COLS;
  const range = NOISE_ATLAS_RANGE;
  const zPeriod = NOISE_ATLAS_Z_PERIOD;

  const atlasW = tile * cols;
  const atlasH = tile * NOISE_ATLAS_ROWS;
  const data = new Uint8Array(atlasW * atlasH);

  for (let s = 0; s < slices; s++) {
    const z = (s / slices) * zPeriod;
    const tileCol = s % cols;
    const tileRow = Math.floor(s / cols);

    for (let ty = 0; ty < tile; ty++) {
      const v = (ty / (tile - 1)) * range;
      const rowBase = (tileRow * tile + ty) * atlasW + tileCol * tile;
      for (let tx = 0; tx < tile; tx++) {
        const u = (tx / (tile - 1)) * range;
        data[rowBase + tx] = Math.round(p5noiseCPU(u, v, z) * 255);
      }
    }
  }

  const format = THREEModule.RedFormat;
  const tex = new THREEModule.DataTexture(data, atlasW, atlasH, format);
  tex.minFilter = THREEModule.LinearFilter;
  tex.magFilter = THREEModule.LinearFilter;
  tex.wrapS = THREEModule.ClampToEdgeWrapping;
  tex.wrapT = THREEModule.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
