/**
 * Centralized storage key constants
 * All localStorage/IndexedDB keys should be defined here to avoid magic strings
 */

export const STORAGE_KEYS = {
  // Theme & Appearance
  THEME: 'theme',
  CUSTOM_THEME_PHOTO: 'customThemePhoto',

  // LLM Provider Configuration
  LLM_PROVIDER: 'llmProvider',
  API_KEYS: 'apiKeys', // JSON object with provider keys

  // Legacy individual API keys (deprecated, prefer API_KEYS)
  OPENAI_API_KEY: 'openaiApiKey',
  ANTHROPIC_API_KEY: 'anthropicApiKey',
  GEMINI_API_KEY: 'geminiApiKey',

  // Model selection per provider
  MODEL_OPENAI: 'model:openai',
  MODEL_ANTHROPIC: 'model:anthropic',
  MODEL_GEMINI: 'model:gemini',
  MODEL_GOOGLE: 'model:google', // alias for gemini

  // Chat settings
  CHAT_REASONING_EFFORT: 'chatReasoningEffort',

  // Dotmatrix animation
  DOTMATRIX_SIZE: 'dotMatrixSizePreference',
  DOTMATRIX_REDUCE_EFFECTS: 'dotMatrixReduceEffects',
  DOTMATRIX_KEEP_GLOW: 'dotMatrixKeepAtmosphere',
  DOTMATRIX_PHYSICS_MODE: 'dotMatrixPhysicsMode',
  GRAPHICS_QUALITY_TIER: 'graphicsQualityTier',

  // UI Settings
  UI_FONT_SIZE: 'uiFontSize',
  UI_LINE_HEIGHT: 'uiLineHeight',
  UI_SPELL_CHECK: 'uiSpellCheck',
  SHOW_RULER: 'showRulerPreference',
  INPUT_BAR_START_POSITION: 'inputBarStartPosition',
  HIDDEN_SKILLS: 'hiddenSkills',

  // Weather widget
  WEATHER_PREFS: 'weatherWidgetPrefs',

  // Input devices
  GAMEPAD_ENABLED: 'gamepadEnabled',
  HAND_TRACKING_BUTTON: 'dotMatrixTrackingButtonEnabled',

  // Notes
  NOTES_CONTENT: 'notesContent',
  NOTES_TABS: 'notesTabs',
  ACTIVE_NOTE_TAB: 'activeNoteTab',

  // Session
  LAST_CONVERSATION_ID: 'lastConversationId',

  // Hardware
  HARDWARE_ACCELERATION: 'hardwareAccelerationEnabled',

  // Session & Onboarding
  ONBOARDING_COMPLETE: 'prv_onboarding_complete',
  TRIAL_START: 'prv_session_start_ms',
  TRIAL_MESSAGES_REMAINING: 'prv_trial_messages_remaining',
  TRIAL_COOLDOWN_START: 'prv_trial_cooldown_start_ms',
  TRIAL_CYCLE: 'prv_trial_cycle',
  TRIAL_APPS_GENERATED: 'prv_trial_apps_generated',
  LMSTUDIO_BASE_URL: 'lmstudio:baseUrl',

  // Reminders
  REMINDERS: 'prvctice_reminders',

  // Games
  PONG_STATS: 'pong_stats',
  PONG_HIGH_SCORE: 'pong_high_score',
  // Observation
  OBSERVATION_ACTIONS: 'observation/actions',
  OBSERVATION_PATTERNS: 'observation/patterns',

  // Suggestions
  SUGGESTION_PROPOSALS: 'suggestions/proposals',
  SUGGESTION_DISMISSALS: 'suggestions/dismissals',

  // App Suggestions
  APP_PROPOSALS: 'app-suggestions/proposals',
  APP_DISMISSALS: 'app-suggestions/dismissals',

  // Loading animation
  LOADING_ANIMATION: 'loadingAnimation',

  // Character model
  CHARACTER_MODEL: 'characterModel',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/**
 * Helper to get model key for a provider
 */
export function getModelKey(provider: string): string {
  const p = String(provider || '').toLowerCase();
  if (p === 'openai') return STORAGE_KEYS.MODEL_OPENAI;
  if (p === 'anthropic') return STORAGE_KEYS.MODEL_ANTHROPIC;
  if (p === 'gemini' || p === 'google') return STORAGE_KEYS.MODEL_GEMINI;
  return `model:${p}`;
}

/**
 * Helper to get API key storage key for a provider (legacy individual keys)
 */
export function getLegacyApiKeyKey(provider: string): string {
  const p = String(provider || '').toLowerCase();
  if (p === 'openai') return STORAGE_KEYS.OPENAI_API_KEY;
  if (p === 'anthropic') return STORAGE_KEYS.ANTHROPIC_API_KEY;
  if (p === 'gemini' || p === 'google') return STORAGE_KEYS.GEMINI_API_KEY;
  return `${p}ApiKey`;
}
