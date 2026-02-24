export type GameState = 'title' | 'playing' | 'paused' | 'gameover' | 'level_complete';

export type InputSource = 'hand' | 'touch' | 'mouse' | 'keyboard' | 'gamepad';

export interface Ball {
  x: number;
  y: number;
  dx: number;
  dy: number;
  scale: number;
  isAnimating: boolean;
  animationStart?: number;
  trail: Array<{ x: number; y: number }>;
}

export interface Brick {
  x: number;
  y: number;
  status: number;
  health: number;
  maxHealth: number;
  flashTime: number;
}

export interface Paddle {
  x: number;
  width: number;
  height: number;
  squash: { scaleX: number; scaleY: number; startTime: number };
}

export interface PowerUp {
  type: string;
  x: number;
  y: number;
  dy: number;
}

export interface PowerUpConfig {
  label: string;
  color: string;
  duration: number;
}

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  dx: number;
  dy: number;
  size: number;
  rotation: number;
  rotationSpeed: number;
  life: number;
  maxLife: number;
  rgb: { r: number; g: number; b: number };
  shape: 'square' | 'diamond' | 'circle';
  trail: Array<{ x: number; y: number; alpha: number }>;
}

export interface ImpactRing {
  x: number;
  y: number;
  color: string;
  radius: number;
  maxRadius: number;
  alpha: number;
  startTime: number;
}

export interface ScorePopup {
  x: number;
  y: number;
  points: number;
  startTime: number;
  velocity: number;
}

export interface ComboDisplay {
  text: string;
  alpha: number;
  y: number;
  scale: number;
  targetScale: number;
  hue: number;
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
  paddleX: number;
  inputSource: InputSource;
  leftPressed: boolean;
  rightPressed: boolean;
  targetPaddleX: number;
}

export interface GameCallbacks {
  onScoreChange: (score: number, highScore: number, level: number) => void;
  onLivesChange: (lives: number) => void;
  onGameOver: (score: number, level: number, isNewHighScore: boolean) => void;
  onLevelComplete: (level: number) => void;
  onStateChange: (state: GameState) => void;
}

export interface ThemeColors {
  /** Main element color (ball, paddle, bricks) - matches text color for theme */
  primary: string;
  /** RGB string for primary color (e.g., "40, 128, 240") */
  primaryRgb: string;
}

export interface EngineOptions {
  reduceMotion: boolean;
  callbacks: GameCallbacks;
  themeColors?: ThemeColors;
  startingLives?: number;
}

function parseColorToRgb(color: string, fallback: string): string {
  const trimmed = color.trim();

  // 6-digit hex (#000000)
  const hex6Match = trimmed.match(/^#([0-9a-f]{6})$/i);
  if (hex6Match && hex6Match[1]) {
    const hex = hex6Match[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `${r}, ${g}, ${b}`;
  }

  // 3-digit hex (#000)
  const hex3Match = trimmed.match(/^#([0-9a-f]{3})$/i);
  if (hex3Match && hex3Match[1]) {
    const hex = hex3Match[1];
    const r0 = hex[0] ?? '0';
    const g0 = hex[1] ?? '0';
    const b0 = hex[2] ?? '0';
    const r = parseInt(r0 + r0, 16);
    const g = parseInt(g0 + g0, 16);
    const b = parseInt(b0 + b0, 16);
    return `${r}, ${g}, ${b}`;
  }

  // rgb() or rgba() format
  const rgbMatch = trimmed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return `${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}`;
  }

  // Named colors
  const namedColors: Record<string, string> = {
    black: '0, 0, 0',
    white: '255, 255, 255',
  };
  const namedColor = namedColors[trimmed.toLowerCase()];
  if (namedColor) {
    return namedColor;
  }

  return fallback;
}

const LIGHT_THEMES = new Set([
  'high-contrast-theme',
  'vitti-theme',
  'light-theme',
  'eva-theme',
  'share-bear-theme',
  'fragile-theme',
]);

function isLightTheme(): boolean {
  const bodyClasses = document.body.classList;
  for (const theme of LIGHT_THEMES) {
    if (bodyClasses.contains(theme)) return true;
  }
  return false;
}

export function getThemeColors(): ThemeColors {
  const style = getComputedStyle(document.body);
  const isLight = isLightTheme();

  // Use --color-text for game elements - this is white on dark themes, dark on light themes
  // Fallback based on whether we're on a light or dark theme
  const fallbackColor = isLight ? '#000000' : '#ffffff';
  const fallbackRgb = isLight ? '0, 0, 0' : '255, 255, 255';

  const colorText = style.getPropertyValue('--color-text').trim();
  const primary = colorText || fallbackColor;
  const primaryRgb = parseColorToRgb(primary, fallbackRgb);

  return { primary, primaryRgb };
}

export const POWERUP_TYPES: Record<string, PowerUpConfig> = {
  WIDE: { label: 'W', color: '#4CAF50', duration: 10000 },
  MULTI: { label: 'M', color: '#2196F3', duration: 0 },
  LIFE: { label: '+', color: '#F44336', duration: 0 },
};
