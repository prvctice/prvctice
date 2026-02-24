export interface ShakeConfig {
  stiffness?: number;
  damping?: number;
}

export interface ShakeState {
  offsetX: number;
  offsetY: number;
  velocityX: number;
  velocityY: number;
  intensity: number;
  stiffness: number;
  damping: number;
}

const DEFAULT_STIFFNESS = 0.25;
const DEFAULT_DAMPING = 0.7;
const FIXED_TIMESTEP = 1000 / 60;

export function createShakeState(config: ShakeConfig = {}): ShakeState {
  return {
    offsetX: 0,
    offsetY: 0,
    velocityX: 0,
    velocityY: 0,
    intensity: 0,
    stiffness: config.stiffness ?? DEFAULT_STIFFNESS,
    damping: config.damping ?? DEFAULT_DAMPING,
  };
}

export function triggerShake(
  state: ShakeState,
  intensity: number,
  directionX = 0,
  directionY = 0
): void {
  if (directionX === 0 && directionY === 0) {
    const angle = Math.random() * Math.PI * 2;
    state.velocityX += Math.cos(angle) * intensity;
    state.velocityY += Math.sin(angle) * intensity;
  } else {
    const mag = Math.sqrt(directionX * directionX + directionY * directionY) || 1;
    state.velocityX += (directionX / mag) * intensity;
    state.velocityY += (directionY / mag) * intensity;
  }
  state.intensity = Math.max(state.intensity, intensity);
}

export function updateShake(state: ShakeState, dt: number): void {
  const dtScale = dt / FIXED_TIMESTEP;

  const springForceX = -state.offsetX * state.stiffness;
  const springForceY = -state.offsetY * state.stiffness;

  state.velocityX += springForceX * dtScale;
  state.velocityY += springForceY * dtScale;

  state.velocityX *= state.damping;
  state.velocityY *= state.damping;

  state.offsetX += state.velocityX * dtScale;
  state.offsetY += state.velocityY * dtScale;

  state.intensity *= 0.95;
  if (state.intensity < 0.1) state.intensity = 0;
}

export function applyShake(ctx: CanvasRenderingContext2D, state: ShakeState): void {
  if (Math.abs(state.offsetX) > 0.01 || Math.abs(state.offsetY) > 0.01) {
    ctx.translate(state.offsetX, state.offsetY);
  }
}

export function resetShake(state: ShakeState): void {
  state.offsetX = 0;
  state.offsetY = 0;
  state.velocityX = 0;
  state.velocityY = 0;
  state.intensity = 0;
}
