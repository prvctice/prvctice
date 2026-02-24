import { STORAGE_KEYS } from '@web/constants/storageKeys.js';

const STATS_KEY = STORAGE_KEYS.PONG_STATS;
const HIGH_SCORE_KEY = STORAGE_KEYS.PONG_HIGH_SCORE;

export interface PongStats {
  wins: number;
  losses: number;
  highestRally: number;
}

export interface PongHighScore {
  highestRound: number;
  totalPoints: number;
}

export async function getStats(): Promise<PongStats> {
  try {
    const saved = localStorage.getItem(STATS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Storage failed
  }
  return { wins: 0, losses: 0, highestRally: 0 };
}

export async function saveStats(stats: PongStats): Promise<void> {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // Storage failed
  }
}

export async function recordWin(): Promise<void> {
  const stats = await getStats();
  stats.wins++;
  await saveStats(stats);
}

export async function recordLoss(): Promise<void> {
  const stats = await getStats();
  stats.losses++;
  await saveStats(stats);
}

export async function updateHighestRally(rally: number): Promise<void> {
  const stats = await getStats();
  if (rally > stats.highestRally) {
    stats.highestRally = rally;
    await saveStats(stats);
  }
}

export async function getHighScore(): Promise<PongHighScore> {
  try {
    const saved = localStorage.getItem(HIGH_SCORE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Storage failed
  }
  return { highestRound: 0, totalPoints: 0 };
}

export async function saveHighScore(highScore: PongHighScore): Promise<void> {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, JSON.stringify(highScore));
  } catch {
    // Storage failed
  }
}

export async function updateHighScore(round: number, points: number): Promise<boolean> {
  const current = await getHighScore();
  let isNewBest = false;

  if (round > current.highestRound) {
    current.highestRound = round;
    isNewBest = true;
  }
  if (points > current.totalPoints) {
    current.totalPoints = points;
    isNewBest = true;
  }

  if (isNewBest) {
    await saveHighScore(current);
  }
  return isNewBest;
}
