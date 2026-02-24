export type GameState = 'title' | 'playing' | 'paused' | 'scored' | 'gameover' | 'round_complete';

export type InputSource = 'hand' | 'touch' | 'mouse' | 'keyboard' | 'gamepad';

export interface Paddle {
  x: number;
  y: number;
  width: number;
  height: number;
  targetY: number;
  velocity: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  speed: number;
  trail: { x: number; y: number; alpha: number }[];
}

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface ScorePopup {
  x: number;
  y: number;
  text: string;
  alpha: number;
  scale: number;
  startTime: number;
}

export interface ScreenShake {
  offsetX: number;
  offsetY: number;
  velocityX: number;
  velocityY: number;
  intensity: number;
}

export interface InputState {
  paddleY: number;
  inputSource: InputSource;
  keyboardVelocity: number;
  isPaused: boolean;
}

export interface GameCallbacks {
  onScoreChange: (playerScore: number, aiScore: number) => void;
  onGameOver: (winner: 'player' | 'ai') => void;
  onStateChange: (state: GameState) => void;
  onPointScored: (scorer: 'player' | 'ai') => void;
  onMatchWon?: () => void;
}

export interface ThemeColors {
  primary: string;
  primaryRgb: string;
  text: string;
  textRgb: string;
  background: string;
}

export interface EngineOptions {
  reduceMotion: boolean;
  callbacks: GameCallbacks;
  themeColors?: ThemeColors;
  round?: number;
  hapticIntensity?: number;
}

function parseColorToRgb(color: string, fallback: string): string {
  const hexMatch = color.match(/^#([0-9a-f]{6})$/i);
  if (hexMatch && hexMatch[1]) {
    const hex = hexMatch[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `${r}, ${g}, ${b}`;
  }
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch && rgbMatch[1] && rgbMatch[2] && rgbMatch[3]) {
    return `${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}`;
  }
  return fallback;
}

export function getThemeColors(): ThemeColors {
  const style = getComputedStyle(document.body);

  const primary = style.getPropertyValue('--skill-power-color').trim() || '#2880f0';
  const primaryRgb = parseColorToRgb(primary, '40, 128, 240');

  const text = style.getPropertyValue('--color-text').trim() || '#ffffff';
  const textRgb = parseColorToRgb(text, '255, 255, 255');

  const background = style.getPropertyValue('--bar-background').trim() || 'rgba(0, 0, 0, 0.5)';

  return { primary, primaryRgb, text, textRgb, background };
}

export const AI_NAMES = [
  'Buddy',
  'Sparky',
  'Coach',
  'Chip',
  'Ziggy',
  'Pixel',
  'Bounce',
  'Rally',
  'Ace',
  'Dash',
  'Pongo',
  'Zippy',
  'Turbo',
  'Blip',
  'Scout',
  'Widget',
  'Rookie',
  'Champ',
  'Paddle Pal',
  'Ping',
  'Servo',
  'Beeps',
  'Clicko',
  'Wally',
  'Spinner',
  'Smash',
  'Volley',
  'Neon',
  'Gizmo',
  'Bongo',
];

export function getRandomAIName(): string {
  return AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)] ?? 'Ace';
}

export interface AIDifficulty {
  reactionDelay: number;
  errorRange: number;
  speedBase: number;
}

export function getAIDifficultyForRound(round: number): AIDifficulty {
  const baseDelay = 150;
  const baseError = 0.2;
  const baseSpeed = 0.012;

  const delayDecrease = 12;
  const errorDecrease = 0.018;
  const speedIncrease = 0.001;

  return {
    reactionDelay: Math.max(40, baseDelay - (round - 1) * delayDecrease),
    errorRange: Math.max(0.04, baseError - (round - 1) * errorDecrease),
    speedBase: Math.min(0.022, baseSpeed + (round - 1) * speedIncrease),
  };
}

export function getAINameForRound(round: number, usedNames: string[]): string {
  const available = AI_NAMES.filter((name) => !usedNames.includes(name));
  if (available.length === 0) {
    return AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)] ?? 'Ace';
  }
  return available[Math.floor(Math.random() * available.length)] ?? 'Ace';
}
