import type {
  GameState,
  Paddle,
  Ball,
  Particle,
  ScorePopup,
  EngineOptions,
  ThemeColors,
  AIDifficulty,
} from './types';
import { getThemeColors, getAIDifficultyForRound } from './types';
import {
  type ShakeState,
  createShakeState,
  triggerShake as sharedTriggerShake,
  updateShake as sharedUpdateShake,
} from '../shared/shake';
import { easeOutQuart } from '../shared/easing';
import { triggerHaptic as sharedTriggerHaptic } from '../shared/haptics';

const FIXED_TIMESTEP = 1000 / 60;
const PARTICLE_POOL_SIZE = 100;
const TRAIL_LENGTH = 5;
const WINNING_SCORE = 5;

const PADDLE_WIDTH = 15;
const PADDLE_HEIGHT_RATIO = 0.25;
const PADDLE_MARGIN = 30;

const BALL_RADIUS = 16;
const BALL_BASE_SPEED = 0.008;
const BALL_SPEED_INCREMENT = 0.0005;
const BALL_MAX_SPEED = 0.02;

export interface GameEngine {
  state: GameState;
  playerPaddle: Paddle;
  aiPaddle: Paddle;
  ball: Ball;
  particles: Particle[];
  scorePopups: ScorePopup[];
  playerScore: number;
  aiScore: number;
  screenShake: ShakeState;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  reduceMotion: boolean;
  callbacks: EngineOptions['callbacks'];
  running: boolean;
  animationId: number | null;
  lastBallHitTime: number;
  aiTargetY: number;
  aiErrorOffset: number;
  rallyCount: number;
  scoredTimer: number;
  scorer: 'player' | 'ai' | null;
  themeColors: ThemeColors;
  aiDifficulty: AIDifficulty;
  hapticIntensity: number;
}

export function createEngine(canvas: HTMLCanvasElement, options: EngineOptions): GameEngine {
  const ctx = canvas.getContext('2d')!;
  const paddleHeight = canvas.height * PADDLE_HEIGHT_RATIO;
  const themeColors = options.themeColors || getThemeColors();
  const round = options.round || 1;

  const engine: GameEngine = {
    state: 'title',
    playerPaddle: createPaddle(PADDLE_MARGIN, canvas.height / 2, paddleHeight),
    aiPaddle: createPaddle(
      canvas.width - PADDLE_MARGIN - PADDLE_WIDTH,
      canvas.height / 2,
      paddleHeight
    ),
    ball: createBall(canvas.width / 2, canvas.height / 2, canvas.width),
    particles: createParticlePool(),
    scorePopups: [],
    playerScore: 0,
    aiScore: 0,
    screenShake: createShakeState(),
    canvas,
    ctx,
    reduceMotion: options.reduceMotion,
    callbacks: options.callbacks,
    running: false,
    animationId: null,
    lastBallHitTime: 0,
    aiTargetY: canvas.height / 2,
    aiErrorOffset: 0,
    rallyCount: 0,
    scoredTimer: 0,
    scorer: null,
    themeColors,
    aiDifficulty: getAIDifficultyForRound(round),
    hapticIntensity: options.hapticIntensity ?? 1,
  };

  return engine;
}

function triggerHaptic(engine: GameEngine, duration: number): void {
  if (engine.hapticIntensity <= 0) return;
  sharedTriggerHaptic(engine.canvas, duration, engine.hapticIntensity);
}

export function setAIDifficulty(engine: GameEngine, round: number): void {
  engine.aiDifficulty = getAIDifficultyForRound(round);
}

export function setHapticIntensity(engine: GameEngine, intensity: number): void {
  engine.hapticIntensity = Math.max(0, Math.min(2, intensity));
}

export function updateThemeColors(engine: GameEngine, colors?: ThemeColors): void {
  engine.themeColors = colors || getThemeColors();
}

function createPaddle(x: number, centerY: number, height: number): Paddle {
  return {
    x,
    y: centerY - height / 2,
    width: PADDLE_WIDTH,
    height,
    targetY: centerY - height / 2,
    velocity: 0,
  };
}

function createBall(x: number, y: number, canvasWidth: number): Ball {
  const speed = canvasWidth * BALL_BASE_SPEED;
  const angle = ((Math.random() - 0.5) * Math.PI) / 3;
  const direction = Math.random() > 0.5 ? 1 : -1;

  return {
    x,
    y,
    vx: Math.cos(angle) * speed * direction,
    vy: Math.sin(angle) * speed,
    radius: BALL_RADIUS,
    speed,
    trail: [],
  };
}

function createParticlePool(): Particle[] {
  const pool: Particle[] = [];
  for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
    pool.push({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 0,
      life: 0,
      maxLife: 0,
      color: '#fff',
    });
  }
  return pool;
}

export function startEngine(engine: GameEngine): void {
  engine.state = 'playing';
  engine.running = true;
  engine.playerScore = 0;
  engine.aiScore = 0;
  engine.rallyCount = 0;
  engine.scoredTimer = 0;
  engine.scorer = null;

  resetBall(engine);
  resetPaddles(engine);
  resetParticles(engine.particles);

  engine.callbacks.onStateChange('playing');
  engine.callbacks.onScoreChange(0, 0);

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

export function setPlayerPaddlePosition(engine: GameEngine, normalizedY: number): void {
  const { canvas, playerPaddle } = engine;
  const minY = 0;
  const maxY = canvas.height - playerPaddle.height;
  const targetY = normalizedY * canvas.height - playerPaddle.height / 2;
  playerPaddle.targetY = Math.max(minY, Math.min(maxY, targetY));
}

function resetBall(engine: GameEngine): void {
  const { canvas } = engine;
  engine.ball = createBall(canvas.width / 2, canvas.height / 2, canvas.width);
  engine.rallyCount = 0;
}

function resetPaddles(engine: GameEngine): void {
  const { canvas, playerPaddle, aiPaddle } = engine;
  const paddleHeight = canvas.height * PADDLE_HEIGHT_RATIO;

  playerPaddle.y = canvas.height / 2 - paddleHeight / 2;
  playerPaddle.targetY = playerPaddle.y;
  playerPaddle.height = paddleHeight;

  aiPaddle.y = canvas.height / 2 - paddleHeight / 2;
  aiPaddle.targetY = aiPaddle.y;
  aiPaddle.height = paddleHeight;
  aiPaddle.x = canvas.width - PADDLE_MARGIN - PADDLE_WIDTH;
}

function resetParticles(particles: Particle[]): void {
  for (const p of particles) {
    p.active = false;
  }
}

function updateEngine(engine: GameEngine, dt: number): void {
  if (engine.state === 'paused') return;

  if (engine.state === 'scored') {
    engine.scoredTimer -= dt;
    updateVisuals(engine, dt);
    updateScreenShake(engine, dt);
    if (engine.scoredTimer <= 0) {
      if (engine.playerScore >= WINNING_SCORE) {
        engine.state = 'round_complete';
        engine.callbacks.onStateChange('round_complete');
        engine.callbacks.onMatchWon?.();
      } else if (engine.aiScore >= WINNING_SCORE) {
        engine.state = 'gameover';
        engine.callbacks.onStateChange('gameover');
        engine.callbacks.onGameOver('ai');
      } else {
        engine.state = 'playing';
        resetBall(engine);
      }
    }
    return;
  }

  if (engine.state !== 'playing') return;

  updatePaddles(engine, dt);
  updateAI(engine, dt);
  updateBall(engine, dt);
  checkCollisions(engine);
  updateScreenShake(engine, dt);
  updateVisuals(engine, dt);
}

function updatePaddles(engine: GameEngine, dt: number): void {
  const dtScale = dt / FIXED_TIMESTEP;
  const smoothing = 0.25;

  const { playerPaddle, aiPaddle, canvas } = engine;

  playerPaddle.y += (playerPaddle.targetY - playerPaddle.y) * smoothing * dtScale;
  playerPaddle.y = Math.max(0, Math.min(canvas.height - playerPaddle.height, playerPaddle.y));

  aiPaddle.y += (aiPaddle.targetY - aiPaddle.y) * smoothing * dtScale;
  aiPaddle.y = Math.max(0, Math.min(canvas.height - aiPaddle.height, aiPaddle.y));
}

function updateAI(engine: GameEngine, dt: number): void {
  const { aiPaddle, canvas, aiDifficulty } = engine;
  const now = performance.now();

  if (now - engine.lastBallHitTime > aiDifficulty.reactionDelay) {
    const predictedY = predictBallY(engine);
    engine.aiTargetY = predictedY + engine.aiErrorOffset;
  }

  const aiCenter = aiPaddle.y + aiPaddle.height / 2;
  const diff = engine.aiTargetY - aiCenter;
  const aiSpeed = canvas.height * aiDifficulty.speedBase * (1 + engine.rallyCount * 0.02);
  const dtScale = dt / FIXED_TIMESTEP;

  if (Math.abs(diff) > 5) {
    const move = Math.sign(diff) * Math.min(Math.abs(diff), aiSpeed) * dtScale;
    aiPaddle.targetY = aiPaddle.y + move;
    aiPaddle.targetY = Math.max(0, Math.min(canvas.height - aiPaddle.height, aiPaddle.targetY));
  }
}

function predictBallY(engine: GameEngine): number {
  const { ball, aiPaddle, canvas } = engine;

  if (ball.vx <= 0) {
    return canvas.height / 2;
  }

  const timeToReach = (aiPaddle.x - ball.x) / ball.vx;
  let predictedY = ball.y + ball.vy * timeToReach;

  while (predictedY < 0 || predictedY > canvas.height) {
    if (predictedY < 0) {
      predictedY = -predictedY;
    } else if (predictedY > canvas.height) {
      predictedY = 2 * canvas.height - predictedY;
    }
  }

  return predictedY;
}

function updateBall(engine: GameEngine, dt: number): void {
  const { ball, canvas } = engine;
  const dtScale = dt / FIXED_TIMESTEP;

  ball.trail.unshift({ x: ball.x, y: ball.y, alpha: 1 });
  if (ball.trail.length > TRAIL_LENGTH) {
    ball.trail.pop();
  }

  for (let i = 0; i < ball.trail.length; i++) {
    const trailPoint = ball.trail[i];
    if (trailPoint) trailPoint.alpha = 1 - i / ball.trail.length;
  }

  ball.x += ball.vx * dtScale;
  ball.y += ball.vy * dtScale;

  if (ball.y - ball.radius <= 0) {
    ball.y = ball.radius;
    ball.vy = Math.abs(ball.vy);
    spawnParticles(engine, ball.x, ball.y, engine.themeColors.text, 5);
    triggerShake(engine, 2);
    triggerHaptic(engine, 10);
  } else if (ball.y + ball.radius >= canvas.height) {
    ball.y = canvas.height - ball.radius;
    ball.vy = -Math.abs(ball.vy);
    spawnParticles(engine, ball.x, ball.y, engine.themeColors.text, 5);
    triggerShake(engine, 2);
    triggerHaptic(engine, 10);
  }

  if (ball.x < -ball.radius * 2) {
    scorePoint(engine, 'ai');
  } else if (ball.x > canvas.width + ball.radius * 2) {
    scorePoint(engine, 'player');
  }
}

function checkCollisions(engine: GameEngine): void {
  const { ball, playerPaddle, aiPaddle } = engine;

  if (checkPaddleCollision(ball, playerPaddle)) {
    handlePaddleHit(engine, playerPaddle, 1);
  }

  if (checkPaddleCollision(ball, aiPaddle)) {
    handlePaddleHit(engine, aiPaddle, -1);
  }
}

function checkPaddleCollision(ball: Ball, paddle: Paddle): boolean {
  return (
    ball.x - ball.radius < paddle.x + paddle.width &&
    ball.x + ball.radius > paddle.x &&
    ball.y > paddle.y &&
    ball.y < paddle.y + paddle.height
  );
}

function handlePaddleHit(engine: GameEngine, paddle: Paddle, direction: number): void {
  const { ball, canvas } = engine;

  const hitPoint = (ball.y - (paddle.y + paddle.height / 2)) / (paddle.height / 2);
  const clampedHit = Math.max(-1, Math.min(1, hitPoint));
  const angle = clampedHit * (Math.PI / 4);

  ball.speed = Math.min(
    ball.speed + canvas.width * BALL_SPEED_INCREMENT,
    canvas.width * BALL_MAX_SPEED
  );

  ball.vx = Math.cos(angle) * ball.speed * direction;
  ball.vy = Math.sin(angle) * ball.speed;

  if (direction > 0) {
    ball.x = paddle.x + paddle.width + ball.radius;
  } else {
    ball.x = paddle.x - ball.radius;
  }

  engine.rallyCount++;
  engine.lastBallHitTime = performance.now();
  engine.aiErrorOffset = (Math.random() - 0.5) * canvas.height * engine.aiDifficulty.errorRange;

  spawnParticles(engine, ball.x, ball.y, engine.themeColors.text, 10);
  triggerShake(engine, 4);
  triggerHaptic(engine, 20);
}

function scorePoint(engine: GameEngine, scorer: 'player' | 'ai'): void {
  if (scorer === 'player') {
    engine.playerScore++;
    spawnScorePopup(engine, engine.canvas.width * 0.75, engine.canvas.height / 2, '+1');
  } else {
    engine.aiScore++;
    spawnScorePopup(engine, engine.canvas.width * 0.25, engine.canvas.height / 2, '+1');
  }

  engine.callbacks.onScoreChange(engine.playerScore, engine.aiScore);
  engine.callbacks.onPointScored(scorer);

  engine.state = 'scored';
  engine.scoredTimer = 1500;
  engine.scorer = scorer;

  triggerShake(engine, 10);
  triggerHaptic(engine, 50);
}

function updateScreenShake(engine: GameEngine, dt: number): void {
  if (engine.reduceMotion) return;
  sharedUpdateShake(engine.screenShake, dt);
}

function triggerShake(engine: GameEngine, intensity: number): void {
  if (engine.reduceMotion) return;
  sharedTriggerShake(engine.screenShake, intensity);
}

function updateVisuals(engine: GameEngine, dt: number): void {
  const dtScale = dt / FIXED_TIMESTEP;

  for (const p of engine.particles) {
    if (!p.active) continue;
    p.x += p.vx * dtScale;
    p.y += p.vy * dtScale;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.life -= dt;
    if (p.life <= 0) p.active = false;
  }

  const now = performance.now();
  for (let i = engine.scorePopups.length - 1; i >= 0; i--) {
    const popup = engine.scorePopups[i];
    if (!popup) continue;
    const elapsed = now - popup.startTime;
    if (elapsed > 800) {
      engine.scorePopups.splice(i, 1);
      continue;
    }
    popup.alpha = 1 - elapsed / 800;
    popup.scale = 1 + elapsed / 1600;
  }
}

function spawnParticles(
  engine: GameEngine,
  x: number,
  y: number,
  color: string,
  count: number
): void {
  if (engine.reduceMotion) count = Math.floor(count / 3);

  for (let i = 0; i < count; i++) {
    const p = engine.particles.find((p) => !p.active);
    if (!p) break;

    p.active = true;
    p.x = x;
    p.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 4;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.size = 4 + Math.random() * 6;
    p.maxLife = 300 + Math.random() * 200;
    p.life = p.maxLife;
    p.color = color;
  }
}

function spawnScorePopup(engine: GameEngine, x: number, y: number, text: string): void {
  engine.scorePopups.push({
    x,
    y,
    text,
    alpha: 1,
    scale: 1,
    startTime: performance.now(),
  });
}

function renderEngine(engine: GameEngine): void {
  const { ctx, canvas } = engine;

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!engine.reduceMotion) {
    ctx.translate(engine.screenShake.offsetX, engine.screenShake.offsetY);
  }

  renderCourt(engine);
  renderPaddles(engine);
  renderBall(engine);
  renderParticles(engine);
  renderScorePopups(engine);

  ctx.restore();
}

function renderCourt(engine: GameEngine): void {
  const { ctx, canvas, themeColors } = engine;
  const rgb = themeColors.textRgb;

  // Scale court elements based on canvas size for consistent proportions
  const scale = Math.min(canvas.width, canvas.height) / 800;
  const lineWidth = Math.max(1, 1.5 * scale);
  const dashLength = Math.max(8, 12 * scale);
  const dashGap = Math.max(8, 12 * scale);

  // Center dividing line (dashed)
  ctx.strokeStyle = `rgba(${rgb}, 0.25)`;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([dashLength, dashGap]);
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);
}

function renderPaddles(engine: GameEngine): void {
  const { ctx, playerPaddle, aiPaddle, themeColors } = engine;

  // Scale corner radius proportionally to paddle width for consistent look
  const cornerRadius = Math.min(playerPaddle.width * 0.3, 6);

  ctx.fillStyle = themeColors.text;

  // Player paddle (left)
  ctx.beginPath();
  ctx.roundRect(
    playerPaddle.x,
    playerPaddle.y,
    playerPaddle.width,
    playerPaddle.height,
    cornerRadius
  );
  ctx.fill();

  // AI paddle (right)
  ctx.beginPath();
  ctx.roundRect(aiPaddle.x, aiPaddle.y, aiPaddle.width, aiPaddle.height, cornerRadius);
  ctx.fill();
}

function renderBall(engine: GameEngine): void {
  const { ctx, ball, themeColors } = engine;
  const rgb = themeColors.textRgb;

  if (!engine.reduceMotion) {
    for (let i = 1; i < ball.trail.length; i++) {
      const t = ball.trail[i];
      if (!t) continue;
      const progress = i / ball.trail.length;
      const alpha = (1 - progress) * 0.2;
      const radius = ball.radius * (1 - progress * 0.5);

      ctx.beginPath();
      ctx.arc(t.x, t.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
      ctx.fill();
    }
  }

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fillStyle = themeColors.text;
  ctx.shadowColor = themeColors.text;
  ctx.shadowBlur = engine.reduceMotion ? 0 : 10;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function renderParticles(engine: GameEngine): void {
  const { ctx, particles } = engine;

  for (const p of particles) {
    if (!p.active) continue;

    const lifeRatio = p.life / p.maxLife;
    const alpha = easeOutQuart(lifeRatio);
    const shrink = 0.5 + lifeRatio * 0.5;

    ctx.beginPath();
    ctx.arc(p.x, p.y, (p.size * shrink) / 2, 0, Math.PI * 2);
    ctx.fillStyle = p.color.replace(')', `, ${alpha})`).replace('rgb', 'rgba').replace('#', '');

    if (p.color.startsWith('#')) {
      const r = parseInt(p.color.slice(1, 3), 16);
      const g = parseInt(p.color.slice(3, 5), 16);
      const b = parseInt(p.color.slice(5, 7), 16);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    ctx.fill();
  }
}

function renderScorePopups(engine: GameEngine): void {
  const { ctx, scorePopups, themeColors, canvas } = engine;

  // Scale font size based on canvas dimensions for consistent appearance
  const scale = Math.min(canvas.width, canvas.height) / 800;
  const fontSize = Math.max(18, Math.round(24 * scale));

  ctx.font = `400 ${fontSize}px "IBM Plex Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const popup of scorePopups) {
    ctx.save();
    ctx.globalAlpha = popup.alpha * 0.7;
    ctx.translate(popup.x, popup.y);
    ctx.scale(popup.scale, popup.scale);
    // Use theme text color to match other type elements
    ctx.fillStyle = themeColors.text;
    ctx.fillText(popup.text, 0, 0);
    ctx.restore();
  }
}
