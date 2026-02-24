/**
 * Game launcher detection
 * Detects game launch requests from user input and triggers game startup
 */

export interface GameLaunchResult {
  isGame: boolean;
  gameType?: 'blockBreaking';
}

/**
 * Detect if user wants to play block breaking game
 */
function detectBlockBreakingRequest(text: string): boolean {
  const t = text.toLowerCase();
  const directMatch = t === "let's play a game" || t === 'lets play a game';
  const genericMatch = /(play|start|open|launch)\s+(the\s+)?game\b/.test(t);
  const breakoutMatch =
    t.includes('breakout') || t.includes('block-breaking') || t.includes('block breaking');
  return directMatch || genericMatch || breakoutMatch;
}

/**
 * Check if user input is a game launch request and launch if so
 * @param text - User input text
 * @returns Result indicating if a game was launched
 */
export function checkGameLaunchRequest(text: string): GameLaunchResult {
  try {
    // Check block breaking game
    if (detectBlockBreakingRequest(text)) {
      try {
        if (typeof window.startBlockBreakingGame === 'function') {
          window.startBlockBreakingGame();
        }
      } catch (_) {
        // Intentional: game launcher function may not exist
      }
      return { isGame: true, gameType: 'blockBreaking' };
    }
  } catch (_) {
    // Intentional: game detection should never break chat
  }

  return { isGame: false };
}
