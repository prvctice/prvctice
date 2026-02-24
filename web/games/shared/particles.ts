import { easeOutQuart } from './easing';

export type ParticleShape = 'circle' | 'square' | 'diamond' | 'drop';

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  rotationSpeed: number;
  life: number;
  maxLife: number;
  color: string;
  shape: ParticleShape;
}

export interface ParticlePool {
  particles: Particle[];
  gravity: number;
  friction: number;
}

export interface ParticleConfig {
  poolSize?: number;
  gravity?: number;
  friction?: number;
}

export interface EmitConfig {
  x: number;
  y: number;
  count: number;
  color: string;
  spread?: number;
  speed?: { min: number; max: number };
  size?: { min: number; max: number };
  life?: { min: number; max: number };
  shapes?: ParticleShape[];
  initialVelocity?: { x: number; y: number };
  reduceMotion?: boolean;
}

const DEFAULT_POOL_SIZE = 200;
const DEFAULT_GRAVITY = 0.15;
const DEFAULT_FRICTION = 0.98;
const FIXED_TIMESTEP = 1000 / 60;

export function createParticlePool(config: ParticleConfig = {}): ParticlePool {
  const poolSize = config.poolSize ?? DEFAULT_POOL_SIZE;
  const particles: Particle[] = [];

  for (let i = 0; i < poolSize; i++) {
    particles.push({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 0,
      rotation: 0,
      rotationSpeed: 0,
      life: 0,
      maxLife: 0,
      color: '#fff',
      shape: 'circle',
    });
  }

  return {
    particles,
    gravity: config.gravity ?? DEFAULT_GRAVITY,
    friction: config.friction ?? DEFAULT_FRICTION,
  };
}

function getInactiveParticle(pool: ParticlePool): Particle | null {
  for (const p of pool.particles) {
    if (!p.active) return p;
  }
  return null;
}

export function emitParticles(pool: ParticlePool, config: EmitConfig): void {
  let count = config.count;
  if (config.reduceMotion) {
    count = Math.floor(count / 3);
  }

  const spread = config.spread ?? 40;
  const speedMin = config.speed?.min ?? 3;
  const speedMax = config.speed?.max ?? 8;
  const sizeMin = config.size?.min ?? 4;
  const sizeMax = config.size?.max ?? 10;
  const lifeMin = config.life?.min ?? 300;
  const lifeMax = config.life?.max ?? 600;
  const shapes = config.shapes ?? ['circle'];
  const initialVx = config.initialVelocity?.x ?? 0;
  const initialVy = config.initialVelocity?.y ?? 0;

  for (let i = 0; i < count; i++) {
    const p = getInactiveParticle(pool);
    if (!p) break;

    p.active = true;
    p.x = config.x + (Math.random() - 0.5) * spread;
    p.y = config.y + (Math.random() - 0.5) * spread;

    const angle = Math.random() * Math.PI * 2;
    const speed = speedMin + Math.random() * (speedMax - speedMin);
    p.vx = Math.cos(angle) * speed + initialVx;
    p.vy = Math.sin(angle) * speed + initialVy;

    p.size = sizeMin + Math.random() * (sizeMax - sizeMin);
    p.rotation = Math.random() * Math.PI * 2;
    p.rotationSpeed = (Math.random() - 0.5) * 0.3;
    p.maxLife = lifeMin + Math.random() * (lifeMax - lifeMin);
    p.life = p.maxLife;
    p.color = config.color;
    p.shape = shapes[Math.floor(Math.random() * shapes.length)] ?? 'circle';
  }
}

export function updateParticles(pool: ParticlePool, dt: number): void {
  const dtScale = dt / FIXED_TIMESTEP;

  for (const p of pool.particles) {
    if (!p.active) continue;

    p.x += p.vx * dtScale;
    p.y += p.vy * dtScale;
    p.vy += pool.gravity * dtScale;
    p.vx *= pool.friction;
    p.rotation += p.rotationSpeed * dtScale;
    p.life -= dt;

    if (p.life <= 0) {
      p.active = false;
    }
  }
}

export function renderParticles(ctx: CanvasRenderingContext2D, pool: ParticlePool): void {
  for (const p of pool.particles) {
    if (!p.active) continue;

    const lifeRatio = p.life / p.maxLife;
    const alpha = easeOutQuart(lifeRatio);
    const shrink = 0.5 + lifeRatio * 0.5;
    const size = p.size * shrink;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.fillStyle = p.color;

    switch (p.shape) {
      case 'circle':
        ctx.beginPath();
        ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'square':
        ctx.fillRect(-size / 2, -size / 2, size, size);
        break;
      case 'diamond':
        ctx.beginPath();
        ctx.moveTo(0, -size / 2);
        ctx.lineTo(size / 2, 0);
        ctx.lineTo(0, size / 2);
        ctx.lineTo(-size / 2, 0);
        ctx.closePath();
        ctx.fill();
        break;
      case 'drop':
        ctx.beginPath();
        ctx.ellipse(0, 0, size / 2, size, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
    }

    ctx.restore();
  }
}

export function resetParticles(pool: ParticlePool): void {
  for (const p of pool.particles) {
    p.active = false;
  }
}

export function getActiveParticleCount(pool: ParticlePool): number {
  let count = 0;
  for (const p of pool.particles) {
    if (p.active) count++;
  }
  return count;
}

export const ParticlePresets = {
  explosion: (x: number, y: number, color: string, reduceMotion = false): EmitConfig => ({
    x,
    y,
    count: 15,
    color,
    spread: 30,
    speed: { min: 4, max: 8 },
    size: { min: 6, max: 12 },
    life: { min: 400, max: 700 },
    shapes: ['circle', 'diamond'],
    reduceMotion,
  }),

  sparkle: (x: number, y: number, color: string, reduceMotion = false): EmitConfig => ({
    x,
    y,
    count: 8,
    color,
    spread: 20,
    speed: { min: 2, max: 5 },
    size: { min: 2, max: 6 },
    life: { min: 200, max: 400 },
    shapes: ['circle'],
    reduceMotion,
  }),

  trail: (x: number, y: number, color: string, reduceMotion = false): EmitConfig => ({
    x,
    y,
    count: 3,
    color,
    spread: 5,
    speed: { min: 0.5, max: 2 },
    size: { min: 3, max: 5 },
    life: { min: 150, max: 300 },
    shapes: ['circle'],
    reduceMotion,
  }),

  impact: (
    x: number,
    y: number,
    color: string,
    vx: number,
    vy: number,
    reduceMotion = false
  ): EmitConfig => ({
    x,
    y,
    count: 10,
    color,
    spread: 10,
    speed: { min: 2, max: 4 },
    size: { min: 4, max: 8 },
    life: { min: 300, max: 500 },
    shapes: ['circle', 'square'],
    initialVelocity: { x: vx * 0.3, y: vy * 0.3 },
    reduceMotion,
  }),

  slice: (x: number, y: number, color: string, reduceMotion = false): EmitConfig => ({
    x,
    y,
    count: 20,
    color,
    spread: 40,
    speed: { min: 3, max: 6 },
    size: { min: 6, max: 12 },
    life: { min: 400, max: 600 },
    shapes: ['circle', 'drop'],
    initialVelocity: { x: 0, y: -4 },
    reduceMotion,
  }),
};
