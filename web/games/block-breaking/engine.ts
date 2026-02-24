import type {
  GameState,
  Ball,
  Brick,
  Paddle,
  PowerUp,
  Particle,
  ImpactRing,
  ScorePopup,
  ComboDisplay,
  ScreenShake,
  EngineOptions,
  ThemeColors,
} from './types';
import { getThemeColors, POWERUP_TYPES } from './types';

function parseRgbString(rgbStr: string): { r: number; g: number; b: number } {
  const parts = rgbStr.split(',').map((s) => parseInt(s.trim(), 10));
  const r = parts[0];
  const g = parts[1];
  const b = parts[2];
  // Use ?? instead of || to handle 0 values correctly (0 is valid for black)
  return {
    r: r === undefined || Number.isNaN(r) ? 255 : r,
    g: g === undefined || Number.isNaN(g) ? 255 : g,
    b: b === undefined || Number.isNaN(b) ? 255 : b,
  };
}

function darkenRgb(
  rgb: { r: number; g: number; b: number },
  factor: number
): { r: number; g: number; b: number } {
  return {
    r: Math.floor(rgb.r * factor),
    g: Math.floor(rgb.g * factor),
    b: Math.floor(rgb.b * factor),
  };
}
import { triggerHaptic } from '../shared/haptics';

const FIXED_TIMESTEP = 1000 / 60;
const PARTICLE_POOL_SIZE = 200;
const PARTICLE_GRAVITY = 0.15;

const BALL_RADIUS = 12;
const BALL_SPAWN_DURATION = 400;
const BALL_TRAIL_LENGTH = 8;
const BALL_TRAIL_ENABLED = false;

const BRICK_ROW_COUNT = 4;
const BRICK_COLUMN_COUNT = 10;

const PADDLE_SPEED = 8;

const SHAKE_STIFFNESS = 0.25;
const SHAKE_DAMPING = 0.7;

const COMBO_SCALE_PUNCH = 1.4;
const COMBO_SCALE_SPRING = 0.15;

const POWERUP_DROP_CHANCE = 0.35;
const POWERUP_SIZE = 20;
const POWERUP_SPEED = 2;
const POWERUP_FLOAT_AMPLITUDE = 3;
const POWERUP_FLOAT_SPEED = 0.005;

const MAX_SPEED_MULTIPLIER = 2.0;

const ease = {
  outBack: (t: number): number => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  outElastic: (t: number): number =>
    t === 0
      ? 0
      : t === 1
        ? 1
        : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  outQuart: (t: number): number => 1 - Math.pow(1 - t, 4),
  inOutQuad: (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};

export interface GameEngine {
  state: GameState;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  balls: Ball[];
  bricks: Brick[][];
  paddle: Paddle;
  powerUps: PowerUp[];
  activePowerUps: Record<string, number>;
  particles: Particle[];
  impactRings: ImpactRing[];
  scorePopups: ScorePopup[];
  comboDisplay: ComboDisplay;
  screenShake: ScreenShake;
  score: number;
  highScore: number;
  lives: number;
  level: number;
  combo: number;
  initialBallSpeed: number;
  basePaddleWidth: number;
  brickWidth: number;
  brickHeight: number;
  brickPadding: number;
  brickOffsetTop: number;
  brickOffsetLeft: number;
  mobilePaddleOffset: number;
  isTouchDevice: boolean;
  reduceMotion: boolean;
  callbacks: EngineOptions['callbacks'];
  running: boolean;
  animationId: number | null;
  themeColors: ThemeColors;
  startingLives: number;
}

export function createEngine(canvas: HTMLCanvasElement, options: EngineOptions): GameEngine {
  const ctx = canvas.getContext('2d')!;
  const themeColors = options.themeColors || getThemeColors();
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  // Always add offset for footer HUD (60px) + extra space for touch devices
  const mobilePaddleOffset = isTouchDevice ? 120 : 60;
  const startingLives = options.startingLives ?? 5;

  const basePaddleWidth = isTouchDevice ? canvas.width * 0.55 : canvas.width * 0.25;
  const paddleHeight = canvas.height * 0.04;

  const brickPadding = canvas.width * 0.005;
  const brickOffsetTop = canvas.height * 0.05;
  const initialMargin = canvas.width * 0.05;
  const totalPadding = (BRICK_COLUMN_COUNT - 1) * brickPadding;
  const computedBrickWidth = (canvas.width - 2 * initialMargin - totalPadding) / BRICK_COLUMN_COUNT;
  const brickWidth = Math.min(computedBrickWidth, canvas.height * 0.2);
  const brickHeight = brickWidth * 0.4;
  const totalBricksWidth =
    BRICK_COLUMN_COUNT * brickWidth + (BRICK_COLUMN_COUNT - 1) * brickPadding;
  const brickOffsetLeft = (canvas.width - totalBricksWidth) / 2;

  const engine: GameEngine = {
    state: 'title',
    canvas,
    ctx,
    balls: [],
    bricks: [],
    paddle: {
      x: (canvas.width - basePaddleWidth) / 2,
      width: basePaddleWidth,
      height: paddleHeight,
      squash: { scaleX: 1, scaleY: 1, startTime: 0 },
    },
    powerUps: [],
    activePowerUps: {},
    particles: createParticlePool(),
    impactRings: [],
    scorePopups: [],
    comboDisplay: { text: '', alpha: 0, y: 0, scale: 1, targetScale: 1, hue: 0, startTime: 0 },
    screenShake: { offsetX: 0, offsetY: 0, velocityX: 0, velocityY: 0, intensity: 0 },
    score: 0,
    highScore: 0,
    lives: startingLives,
    level: 1,
    combo: 0,
    initialBallSpeed: 0,
    basePaddleWidth,
    brickWidth,
    brickHeight,
    brickPadding,
    brickOffsetTop,
    brickOffsetLeft,
    mobilePaddleOffset,
    isTouchDevice,
    reduceMotion: options.reduceMotion,
    callbacks: options.callbacks,
    running: false,
    animationId: null,
    themeColors,
    startingLives,
  };

  return engine;
}

function createParticlePool(): Particle[] {
  const pool: Particle[] = [];
  for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
    pool.push({
      active: false,
      x: 0,
      y: 0,
      dx: 0,
      dy: 0,
      size: 0,
      rotation: 0,
      rotationSpeed: 0,
      life: 0,
      maxLife: 0,
      rgb: { r: 255, g: 255, b: 255 },
      shape: 'square',
      trail: [],
    });
  }
  return pool;
}

function createBall(canvas: HTMLCanvasElement, level: number, isTouchDevice: boolean): Ball {
  const ballSpeedFactor = isTouchDevice ? 0.016 : 0.008;
  const speedMultiplier = 1 + (level - 1) * 0.05;
  const speed = Math.min(speedMultiplier, MAX_SPEED_MULTIPLIER);

  return {
    x: canvas.width / 2,
    y: canvas.height - canvas.height * 0.04 - (isTouchDevice ? 100 : 0) - 20,
    dx: canvas.width * ballSpeedFactor * speed,
    dy: -canvas.height * ballSpeedFactor * speed,
    scale: 0,
    isAnimating: true,
    animationStart: performance.now(),
    trail: [],
  };
}

function getBrickHealth(row: number): number {
  return row === 0 ? 2 : 1;
}

function initBricks(engine: GameEngine): void {
  engine.bricks = [];
  for (let c = 0; c < BRICK_COLUMN_COUNT; c++) {
    const col: Brick[] = [];
    engine.bricks[c] = col;
    for (let r = 0; r < BRICK_ROW_COUNT; r++) {
      const maxHealth = getBrickHealth(r);
      col[r] = {
        x: 0,
        y: 0,
        status: 1,
        health: maxHealth,
        maxHealth: maxHealth,
        flashTime: 0,
      };
    }
  }
}

function resetBallAndPaddle(engine: GameEngine): void {
  const { canvas, activePowerUps, basePaddleWidth, isTouchDevice, level } = engine;

  engine.balls = [createBall(canvas, level, isTouchDevice)];
  const firstBall = engine.balls[0];
  engine.paddle.width = activePowerUps.WIDE ? basePaddleWidth * 1.5 : basePaddleWidth;
  engine.paddle.x = (canvas.width - engine.paddle.width) / 2;

  engine.initialBallSpeed = firstBall
    ? Math.sqrt(firstBall.dx * firstBall.dx + firstBall.dy * firstBall.dy)
    : 5;

  engine.screenShake = { offsetX: 0, offsetY: 0, velocityX: 0, velocityY: 0, intensity: 0 };
}

function resetParticles(particles: Particle[]): void {
  for (const p of particles) {
    p.active = false;
  }
}

export function updateThemeColors(engine: GameEngine, colors?: ThemeColors): void {
  engine.themeColors = colors || getThemeColors();
}

export function setHighScore(engine: GameEngine, highScore: number): void {
  engine.highScore = highScore;
}

export function startEngine(engine: GameEngine): void {
  engine.state = 'playing';
  engine.running = true;
  engine.score = 0;
  engine.lives = engine.startingLives;
  engine.level = 1;
  engine.combo = 0;
  engine.comboDisplay = {
    text: '',
    alpha: 0,
    y: 0,
    scale: 1,
    targetScale: 1,
    hue: 0,
    startTime: 0,
  };
  engine.powerUps = [];
  engine.activePowerUps = {};
  engine.impactRings = [];
  engine.scorePopups = [];

  initBricks(engine);
  resetBallAndPaddle(engine);
  resetParticles(engine.particles);

  engine.callbacks.onStateChange('playing');
  engine.callbacks.onScoreChange(engine.score, engine.highScore, engine.level);
  engine.callbacks.onLivesChange(engine.lives);

  let lastTime = 0;
  let accumulator = 0;

  function gameLoop(currentTime: number): void {
    if (!engine.running) return;

    if (lastTime === 0) lastTime = currentTime;
    const delta = Math.min(currentTime - lastTime, FIXED_TIMESTEP * 3);
    lastTime = currentTime;

    accumulator += delta;

    while (accumulator >= FIXED_TIMESTEP) {
      updateEngine(engine, FIXED_TIMESTEP);
      accumulator -= FIXED_TIMESTEP;
    }

    renderEngine(engine);

    if (engine.state !== 'gameover') {
      engine.animationId = requestAnimationFrame(gameLoop);
    }
  }

  engine.animationId = requestAnimationFrame(gameLoop);
}

export function pauseEngine(engine: GameEngine): void {
  if (engine.state !== 'playing') return;
  engine.state = 'paused';
  engine.callbacks.onStateChange('paused');
}

export function resumeEngine(engine: GameEngine): void {
  if (engine.state !== 'paused') return;
  engine.state = 'playing';
  engine.callbacks.onStateChange('playing');
}

export function stopEngine(engine: GameEngine): void {
  engine.running = false;
  if (engine.animationId !== null) {
    cancelAnimationFrame(engine.animationId);
    engine.animationId = null;
  }
}

export function setPaddlePosition(engine: GameEngine, x: number): void {
  const maxX = engine.canvas.width - engine.paddle.width;
  engine.paddle.x = Math.max(0, Math.min(x, maxX));
}

export function movePaddleByDelta(engine: GameEngine, delta: number, dt: number): void {
  const dtScale = dt / FIXED_TIMESTEP;
  const newX = engine.paddle.x + delta * PADDLE_SPEED * dtScale;
  setPaddlePosition(engine, newX);
}

function updateEngine(engine: GameEngine, dt: number): void {
  if (engine.state === 'paused') return;
  if (engine.state !== 'playing') return;

  updatePowerUps(engine);
  updateBalls(engine, dt);
  updateScreenShake(engine, dt);
  updateVisuals(engine, dt);
}

function updatePowerUps(engine: GameEngine): void {
  const { canvas, paddle, powerUps, activePowerUps, basePaddleWidth, mobilePaddleOffset } = engine;
  const paddleY = canvas.height - paddle.height - mobilePaddleOffset;

  for (let i = powerUps.length - 1; i >= 0; i--) {
    const p = powerUps[i];
    if (!p) continue;
    p.y += p.dy;

    if (
      p.y + POWERUP_SIZE > paddleY &&
      p.y < paddleY + paddle.height &&
      p.x + POWERUP_SIZE > paddle.x &&
      p.x < paddle.x + paddle.width
    ) {
      activatePowerUp(engine, p.type);
      powerUps.splice(i, 1);
      continue;
    }

    if (p.y > canvas.height) {
      powerUps.splice(i, 1);
    }
  }

  const now = Date.now();
  if (activePowerUps.WIDE && now > activePowerUps.WIDE) {
    delete activePowerUps.WIDE;
    engine.paddle.width = basePaddleWidth;
  }
}

function activatePowerUp(engine: GameEngine, type: string): void {
  triggerHaptic(engine.canvas, 40);

  const config = POWERUP_TYPES[type];
  if (!config) return;
  const now = Date.now();

  switch (type) {
    case 'WIDE':
      engine.activePowerUps.WIDE = now + config.duration;
      engine.paddle.width = engine.basePaddleWidth * 1.5;
      break;

    case 'MULTI': {
      const newBalls: Ball[] = [];
      engine.balls.forEach((ball) => {
        const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
        for (let angle = -30; angle <= 30; angle += 30) {
          const rad = (angle * Math.PI) / 180;
          const currentAngle = Math.atan2(ball.dy, ball.dx);
          newBalls.push({
            x: ball.x,
            y: ball.y,
            dx: speed * Math.cos(currentAngle + rad),
            dy: speed * Math.sin(currentAngle + rad),
            scale: 1,
            isAnimating: false,
            trail: [],
          });
        }
      });
      engine.balls = newBalls;
      break;
    }

    case 'LIFE':
      engine.lives++;
      engine.callbacks.onLivesChange(engine.lives);
      break;
  }
}

function spawnPowerUp(engine: GameEngine, x: number, y: number): void {
  if (Math.random() > POWERUP_DROP_CHANCE) return;

  const types = Object.keys(POWERUP_TYPES);
  const type = types[Math.floor(Math.random() * types.length)];
  if (!type) return;

  engine.powerUps.push({
    type,
    x,
    y,
    dy: POWERUP_SPEED,
  });
}

function updateBalls(engine: GameEngine, dt: number): void {
  const { canvas, balls, paddle, mobilePaddleOffset, initialBallSpeed } = engine;
  const dtScale = dt / FIXED_TIMESTEP;

  for (let i = balls.length - 1; i >= 0; i--) {
    const ball = balls[i];
    if (!ball) continue;

    updateBallTrail(ball);
    collisionDetection(engine, ball);

    if (
      ball.x + ball.dx * dtScale > canvas.width - BALL_RADIUS ||
      ball.x + ball.dx * dtScale < BALL_RADIUS
    ) {
      ball.dx = -ball.dx;
      spawnImpactRing(engine, ball.x, ball.y);
      triggerShake(engine, 2, ball.dx, 0);
      triggerHaptic(engine.canvas, 15);
    }

    if (ball.y + ball.dy * dtScale < BALL_RADIUS) {
      ball.dy = -ball.dy;
      spawnImpactRing(engine, ball.x, ball.y);
      triggerShake(engine, 1.5, 0, 1);
    } else if (ball.y + ball.dy * dtScale > canvas.height - BALL_RADIUS - mobilePaddleOffset) {
      if (ball.x > paddle.x && ball.x < paddle.x + paddle.width) {
        engine.combo = 0;

        let hitPoint = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
        hitPoint = Math.max(-1, Math.min(1, hitPoint));
        const angle = hitPoint * (Math.PI / 3);
        let speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);

        const maxSpeed = initialBallSpeed * MAX_SPEED_MULTIPLIER;
        speed = Math.min(speed, maxSpeed);

        ball.dx = speed * Math.sin(angle);
        ball.dy = -speed * Math.cos(angle);

        triggerPaddleSquash(engine);
        spawnImpactRing(engine, ball.x, ball.y);
        triggerShake(engine, 1.5, 0, 1);
        triggerHaptic(engine.canvas, 15);
      } else {
        balls.splice(i, 1);

        if (balls.length === 0) {
          engine.lives--;
          engine.combo = 0;
          engine.callbacks.onLivesChange(engine.lives);
          triggerShake(engine, 20, 0, -1);
          triggerHaptic(engine.canvas, 100);

          if (engine.lives > 0) {
            resetBallAndPaddle(engine);
          } else {
            const isNewHighScore = engine.score > engine.highScore;
            if (isNewHighScore) {
              engine.highScore = engine.score;
            }
            engine.state = 'gameover';
            engine.callbacks.onGameOver(engine.score, engine.level, isNewHighScore);
            engine.callbacks.onStateChange('gameover');
          }
        }
        continue;
      }
    }

    ball.x += ball.dx * dtScale;
    ball.y += ball.dy * dtScale;
  }
}

function updateBallTrail(ball: Ball): void {
  if (ball.trail.length >= BALL_TRAIL_LENGTH) {
    ball.trail.shift();
  }
  ball.trail.push({ x: ball.x, y: ball.y });
}

function collisionDetection(engine: GameEngine, ball: Ball): void {
  if (ball.isAnimating) return;

  const { bricks, brickWidth, brickHeight } = engine;

  for (let c = 0; c < BRICK_COLUMN_COUNT; c++) {
    const col = bricks[c];
    if (!col) continue;
    for (let r = 0; r < BRICK_ROW_COUNT; r++) {
      const b = col[r];
      if (!b || b.status !== 1) continue;

      const closestX = Math.max(b.x, Math.min(ball.x, b.x + brickWidth));
      const closestY = Math.max(b.y, Math.min(ball.y, b.y + brickHeight));
      const distanceX = ball.x - closestX;
      const distanceY = ball.y - closestY;
      const distanceSquared = distanceX * distanceX + distanceY * distanceY;

      if (distanceSquared < BALL_RADIUS * BALL_RADIUS) {
        const overlapX = brickWidth / 2 + BALL_RADIUS - Math.abs(ball.x - (b.x + brickWidth / 2));
        const overlapY = brickHeight / 2 + BALL_RADIUS - Math.abs(ball.y - (b.y + brickHeight / 2));

        if (overlapX < overlapY) {
          ball.dx = -ball.dx;
        } else {
          ball.dy = -ball.dy;
        }

        b.health--;
        engine.combo++;
        showCombo(engine);

        spawnImpactRing(engine, ball.x, ball.y);

        if (b.health <= 0) {
          b.status = 0;
          spawnParticles(engine, b.x, b.y, brickWidth, brickHeight, 1.2, ball.dx, ball.dy);
          spawnPowerUp(engine, b.x + brickWidth / 2, b.y + brickHeight / 2);
          triggerShake(engine, 3, ball.dx, ball.dy);
        } else {
          b.flashTime = performance.now();
          spawnParticles(engine, b.x, b.y, brickWidth, brickHeight, 0.3, ball.dx, ball.dy);
          triggerShake(engine, 1, ball.dx, ball.dy);
        }

        const points = Math.floor(10 * getComboMultiplier(engine.combo));
        engine.score += points;
        spawnScorePopup(engine, b.x + brickWidth / 2, b.y + brickHeight / 2, points);
        engine.callbacks.onScoreChange(engine.score, engine.highScore, engine.level);

        triggerHaptic(engine.canvas, 30);

        if (allBricksCleared(engine)) {
          nextLevel(engine);
        }

        return;
      }
    }
  }
}

function allBricksCleared(engine: GameEngine): boolean {
  for (let c = 0; c < BRICK_COLUMN_COUNT; c++) {
    const col = engine.bricks[c];
    if (!col) continue;
    for (let r = 0; r < BRICK_ROW_COUNT; r++) {
      const brick = col[r];
      if (brick?.status === 1) return false;
    }
  }
  return true;
}

function nextLevel(engine: GameEngine): void {
  engine.level++;
  initBricks(engine);
  resetBallAndPaddle(engine);
  triggerShake(engine, 8, 0, 0);
  engine.callbacks.onLevelComplete(engine.level - 1);
  engine.callbacks.onScoreChange(engine.score, engine.highScore, engine.level);
}

function getComboMultiplier(combo: number): number {
  return Math.min(1 + combo * 0.5, 5);
}

function showCombo(engine: GameEngine): void {
  if (engine.combo >= 2) {
    engine.comboDisplay = {
      text: `${engine.combo}x COMBO!`,
      alpha: 1,
      y: engine.canvas.height / 2,
      scale: COMBO_SCALE_PUNCH,
      targetScale: 1,
      hue: (engine.combo * 30) % 360,
      startTime: performance.now(),
    };
  }
}

function triggerPaddleSquash(engine: GameEngine): void {
  engine.paddle.squash = {
    scaleX: 1.15,
    scaleY: 0.8,
    startTime: performance.now(),
  };
}

function spawnImpactRing(engine: GameEngine, x: number, y: number, color = '#fff'): void {
  engine.impactRings.push({
    x,
    y,
    color,
    radius: BALL_RADIUS,
    maxRadius: BALL_RADIUS * 2,
    alpha: 0.4,
    startTime: performance.now(),
  });
}

function spawnScorePopup(engine: GameEngine, x: number, y: number, points: number): void {
  engine.scorePopups.push({
    x,
    y,
    points,
    startTime: performance.now(),
    velocity: -2.5,
  });
}

function spawnParticles(
  engine: GameEngine,
  x: number,
  y: number,
  width: number,
  height: number,
  intensity = 1,
  ballDx = 0,
  ballDy = 0
): void {
  if (engine.reduceMotion) intensity = intensity / 3;

  const numParticles = Math.floor(8 * intensity);
  const rgb = parseRgbString(engine.themeColors.primaryRgb);

  const centerX = x + width / 2;
  const centerY = y + height / 2;

  for (let i = 0; i < numParticles; i++) {
    const p = engine.particles.find((p) => !p.active);
    if (!p) break;

    p.active = true;
    p.x = centerX + (Math.random() - 0.5) * width * 0.5;
    p.y = centerY + (Math.random() - 0.5) * height * 0.5;

    const burstAngle = Math.random() * Math.PI * 2;
    const burstSpeed = (2 + Math.random() * 3) * intensity;
    p.dx = Math.cos(burstAngle) * burstSpeed + ballDx * 0.3;
    p.dy = Math.sin(burstAngle) * burstSpeed + ballDy * 0.3;

    p.size = 4 + Math.random() * 6;
    p.rotation = Math.random() * Math.PI * 2;
    p.rotationSpeed = (Math.random() - 0.5) * 0.3;
    p.maxLife = 600 + Math.random() * 400;
    p.life = p.maxLife;
    p.rgb = { ...rgb };
    const shapes = ['circle', 'square', 'diamond'] as const;
    p.shape = shapes[Math.floor(Math.random() * 3)] ?? 'circle';
    p.trail = [];
  }
}

function triggerShake(engine: GameEngine, intensity: number, directionX = 0, directionY = 0): void {
  if (engine.reduceMotion) return;

  const shake = engine.screenShake;

  if (directionX === 0 && directionY === 0) {
    const angle = Math.random() * Math.PI * 2;
    shake.velocityX += Math.cos(angle) * intensity;
    shake.velocityY += Math.sin(angle) * intensity;
  } else {
    const mag = Math.sqrt(directionX * directionX + directionY * directionY) || 1;
    shake.velocityX += (directionX / mag) * intensity;
    shake.velocityY += (directionY / mag) * intensity;
  }
  shake.intensity = Math.max(shake.intensity, intensity);
}

function updateScreenShake(engine: GameEngine, dt: number): void {
  if (engine.reduceMotion) return;

  const shake = engine.screenShake;
  const dtScale = dt / FIXED_TIMESTEP;

  const springForceX = -shake.offsetX * SHAKE_STIFFNESS;
  const springForceY = -shake.offsetY * SHAKE_STIFFNESS;

  shake.velocityX += springForceX * dtScale;
  shake.velocityY += springForceY * dtScale;

  shake.velocityX *= SHAKE_DAMPING;
  shake.velocityY *= SHAKE_DAMPING;

  shake.offsetX += shake.velocityX * dtScale;
  shake.offsetY += shake.velocityY * dtScale;

  shake.intensity *= 0.95;
  if (shake.intensity < 0.1) shake.intensity = 0;
}

function updateVisuals(engine: GameEngine, dt: number): void {
  const dtScale = dt / FIXED_TIMESTEP;
  const now = performance.now();

  for (const p of engine.particles) {
    if (!p.active) continue;

    if (p.trail.length > 3) p.trail.shift();
    p.trail.push({ x: p.x, y: p.y, alpha: p.life / p.maxLife });

    p.x += p.dx * dtScale;
    p.y += p.dy * dtScale;
    p.dy += PARTICLE_GRAVITY * dtScale;
    p.dx *= 0.98;
    p.rotation += p.rotationSpeed * dtScale;
    p.life -= dt;

    if (p.life <= 0) {
      p.active = false;
    }
  }

  for (let i = engine.impactRings.length - 1; i >= 0; i--) {
    const ring = engine.impactRings[i];
    if (!ring) continue;
    const progress = (now - ring.startTime) / 200;
    if (progress >= 1) {
      engine.impactRings.splice(i, 1);
    }
  }

  for (let i = engine.scorePopups.length - 1; i >= 0; i--) {
    const popup = engine.scorePopups[i];
    if (!popup) continue;
    const age = now - popup.startTime;
    if (age > 600) {
      engine.scorePopups.splice(i, 1);
      continue;
    }
    popup.y += popup.velocity * dtScale;
  }

  if (engine.comboDisplay.alpha > 0) {
    engine.comboDisplay.scale +=
      (engine.comboDisplay.targetScale - engine.comboDisplay.scale) * COMBO_SCALE_SPRING * dtScale;
    engine.comboDisplay.alpha -= 0.015 * dtScale;
    engine.comboDisplay.y -= 0.8 * dtScale;

    if (engine.combo >= 5) {
      engine.comboDisplay.hue = (engine.comboDisplay.hue + 0.5 * dtScale) % 360;
    }
  }
}

function renderEngine(engine: GameEngine): void {
  const { ctx, canvas } = engine;

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!engine.reduceMotion) {
    ctx.translate(engine.screenShake.offsetX, engine.screenShake.offsetY);
  }

  renderBricks(engine);
  renderPaddle(engine);
  renderPowerUps(engine);
  renderBalls(engine);
  renderParticles(engine);
  renderImpactRings(engine);
  renderScorePopups(engine);
  renderComboDisplay(engine);

  ctx.restore();
}

function renderBricks(engine: GameEngine): void {
  const {
    ctx,
    bricks,
    brickWidth,
    brickHeight,
    brickPadding,
    brickOffsetTop,
    brickOffsetLeft,
    themeColors,
  } = engine;
  const baseRgb = parseRgbString(themeColors.primaryRgb);
  const now = performance.now();

  for (let c = 0; c < BRICK_COLUMN_COUNT; c++) {
    const col = bricks[c];
    if (!col) continue;
    for (let r = 0; r < BRICK_ROW_COUNT; r++) {
      const b = col[r];
      if (!b) continue;
      const brickX = c * (brickWidth + brickPadding) + brickOffsetLeft;
      const brickY = r * (brickHeight + brickPadding) + brickOffsetTop;
      b.x = brickX;
      b.y = brickY;

      if (b.status === 1) {
        const healthRatio = b.health / b.maxHealth;
        const darkenFactor = 0.4 + healthRatio * 0.6;
        const rgb = darkenRgb(baseRgb, darkenFactor);

        ctx.beginPath();
        ctx.rect(brickX, brickY, brickWidth, brickHeight);
        ctx.fillStyle = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
        ctx.fill();

        const flashProgress = Math.min(1, (now - b.flashTime) / 100);
        if (flashProgress < 1) {
          const flashIntensity = 1 - ease.outQuart(flashProgress);
          ctx.fillStyle = `rgba(255, 255, 255, ${flashIntensity * 0.7})`;
          ctx.fillRect(brickX, brickY, brickWidth, brickHeight);
        }

        if (b.maxHealth > 1) {
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.font = '10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(b.health.toString(), brickX + brickWidth / 2, brickY + brickHeight / 2 + 3);
        }

        ctx.closePath();
      }
    }
  }
}

function renderPaddle(engine: GameEngine): void {
  const { ctx, canvas, paddle, mobilePaddleOffset, themeColors } = engine;
  const paddleY = canvas.height - paddle.height - mobilePaddleOffset;
  const now = performance.now();

  const squashProgress = Math.min(1, (now - paddle.squash.startTime) / 150);
  const squashEased = ease.outElastic(squashProgress);
  const scaleX = 1 + (paddle.squash.scaleX - 1) * (1 - squashEased);
  const scaleY = 1 + (paddle.squash.scaleY - 1) * (1 - squashEased);

  ctx.save();
  ctx.translate(paddle.x + paddle.width / 2, paddleY + paddle.height / 2);
  ctx.scale(scaleX, scaleY);
  ctx.translate(-(paddle.x + paddle.width / 2), -(paddleY + paddle.height / 2));

  ctx.beginPath();
  ctx.roundRect(paddle.x, paddleY, paddle.width, paddle.height, 4);
  ctx.fillStyle = themeColors.primary;
  ctx.fill();

  ctx.restore();
}

function renderPowerUps(engine: GameEngine): void {
  const { ctx, powerUps } = engine;
  const now = performance.now();

  powerUps.forEach((p) => {
    const config = POWERUP_TYPES[p.type];
    if (!config) return;
    const floatOffset = Math.sin(now * POWERUP_FLOAT_SPEED + p.x) * POWERUP_FLOAT_AMPLITUDE;
    const drawY = p.y + floatOffset;
    const radius = POWERUP_SIZE / 2;

    ctx.beginPath();
    ctx.arc(p.x + POWERUP_SIZE / 2, drawY + POWERUP_SIZE / 2, radius, 0, Math.PI * 2);
    ctx.fillStyle = config.color;
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(config.label, p.x + POWERUP_SIZE / 2, drawY + POWERUP_SIZE / 2);
  });
}

function renderBalls(engine: GameEngine): void {
  const { ctx, balls, themeColors } = engine;
  const rgb = parseRgbString(themeColors.primaryRgb);

  for (const ball of balls) {
    if (ball.isAnimating && ball.animationStart !== undefined) {
      let progress = (performance.now() - ball.animationStart) / BALL_SPAWN_DURATION;
      if (progress >= 1) {
        progress = 1;
        ball.isAnimating = false;
      }
      ball.scale = ease.outBack(progress);
    } else {
      ball.scale = 1;
    }

    if (BALL_TRAIL_ENABLED && ball.trail.length > 1 && !ball.isAnimating && !engine.reduceMotion) {
      for (let i = 0; i < ball.trail.length; i++) {
        const t = ball.trail[i];
        if (!t) continue;
        const trailProgress = i / ball.trail.length;
        const trailAlpha = trailProgress * 0.4;
        const trailRadius = BALL_RADIUS * ball.scale * (0.3 + trailProgress * 0.5);

        ctx.beginPath();
        ctx.arc(t.x, t.y, trailRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${trailAlpha})`;
        ctx.fill();
      }
    }

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_RADIUS * ball.scale, 0, Math.PI * 2);
    ctx.fillStyle = themeColors.primary;
    ctx.fill();
  }
}

function renderParticles(engine: GameEngine): void {
  const { ctx, particles } = engine;

  for (const p of particles) {
    if (!p.active) continue;

    const lifeRatio = p.life / p.maxLife;
    const alpha = ease.outQuart(lifeRatio);
    const shrink = 0.5 + lifeRatio * 0.5;

    for (let t = 0; t < p.trail.length; t++) {
      const trail = p.trail[t];
      if (!trail) continue;
      const trailAlpha = alpha * (t / p.trail.length) * 0.3;
      ctx.fillStyle = `rgba(${p.rgb.r}, ${p.rgb.g}, ${p.rgb.b}, ${trailAlpha})`;
      ctx.beginPath();
      ctx.arc(trail.x, trail.y, p.size * shrink * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = `rgba(${p.rgb.r}, ${p.rgb.g}, ${p.rgb.b}, ${alpha})`;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);

    const size = p.size * shrink;
    if (p.shape === 'square') {
      ctx.fillRect(-size / 2, -size / 2, size, size);
    } else if (p.shape === 'diamond') {
      ctx.beginPath();
      ctx.moveTo(0, -size / 2);
      ctx.lineTo(size / 2, 0);
      ctx.lineTo(0, size / 2);
      ctx.lineTo(-size / 2, 0);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

function renderImpactRings(engine: GameEngine): void {
  const { ctx, impactRings } = engine;
  const now = performance.now();

  for (const ring of impactRings) {
    const progress = (now - ring.startTime) / 200;
    if (progress >= 1) continue;

    const eased = ease.outQuart(progress);
    const radius = BALL_RADIUS + (ring.maxRadius - BALL_RADIUS) * eased;
    const alpha = 0.6 * (1 - eased);

    ctx.beginPath();
    ctx.arc(ring.x, ring.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function renderScorePopups(engine: GameEngine): void {
  const { ctx, scorePopups } = engine;
  const now = performance.now();

  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';

  for (const popup of scorePopups) {
    const age = now - popup.startTime;
    if (age > 600) continue;

    const alpha = 1 - age / 600;
    const scale = 1 + (age / 600) * 0.3;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(popup.x, popup.y);
    ctx.scale(scale, scale);
    ctx.fillStyle = popup.points >= 20 ? '#FFD700' : '#fff';
    ctx.fillText(`+${popup.points}`, 0, 0);
    ctx.restore();
  }
}

function renderComboDisplay(engine: GameEngine): void {
  const { ctx, canvas, comboDisplay, combo } = engine;

  if (comboDisplay.alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = ease.outQuart(comboDisplay.alpha);

  ctx.translate(canvas.width / 2, comboDisplay.y);
  ctx.scale(comboDisplay.scale, comboDisplay.scale);

  let color: string;
  if (combo >= 10) {
    color = `hsl(${comboDisplay.hue}, 100%, 60%)`;
  } else if (combo >= 5) {
    color = '#FFD700';
  } else {
    color = '#fff';
  }

  ctx.fillStyle = color;
  ctx.font = 'bold 36px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(comboDisplay.text, 0, 0);

  ctx.restore();
}
