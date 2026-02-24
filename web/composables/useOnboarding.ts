/**
 * Onboarding State Coordinator
 * Central source of truth for all onboarding-related state and tracking.
 *
 * Tracks:
 * - Message and conversation counts
 * - First load timestamp
 * - Seen states for pulses, toasts, and tips
 * - Onboarding completion status
 */

import { reactive, computed, type ComputedRef } from 'vue';
import { storage } from '@web/storage/storage.js';

// ==================== STORAGE KEYS ====================

export const ONBOARDING_KEYS = {
  // Stats
  FIRST_LOAD: 'onboarding:firstLoad',
  MESSAGE_COUNT: 'onboarding:stats:messageCount',
  CONVERSATION_COUNT: 'onboarding:stats:conversationCount',

  // Pulse hints seen
  SEEN_HELP_PULSE: 'onboarding:seen:help-pulse',
  SEEN_MIC_PULSE: 'onboarding:seen:mic-pulse',
  SEEN_SKILLS_PULSE: 'onboarding:seen:skills-pulse',
  SEEN_THEME_PULSE: 'onboarding:seen:theme-pulse',

  // Toasts seen
  SEEN_TOAST_VOICE: 'onboarding:seen:toast-voice',
  SEEN_TOAST_IMAGE: 'onboarding:seen:toast-image',
  SEEN_TOAST_SKILL: 'onboarding:seen:toast-skill',
  SEEN_TOAST_NOTES: 'onboarding:seen:toast-notes',
  SEEN_TOAST_DOUBLETAP: 'onboarding:seen:toast-doubletap',
  SEEN_TOAST_PROVIDER: 'onboarding:seen:toast-provider',
  SEEN_TOAST_SKILL_DISCOVERY: 'onboarding:seen:toast-skill-discovery',

  // Feature interactions
  SEEN_HELP_PANE: 'onboarding:seen:help-pane',
  DISMISSED_GET_STARTED: 'onboarding:dismissed:get-started',

  // Session tracking
  TOAST_COUNT_SESSION: 'onboarding:session:toastCount',
  LAST_TOAST_TIME: 'onboarding:session:lastToastTime',
} as const;

// ==================== TIMING CONSTANTS ====================

export const ONBOARDING_TIMING = {
  // Pulse delays
  HELP_PULSE_DELAY_MS: 5000, // 5 seconds after load
  MIC_PULSE_DELAY_MS: 2000, // 2 seconds after first message
  PULSE_COOLDOWN_MS: 30000, // 30 seconds between pulses

  // Toast limits
  MAX_TOASTS_PER_SESSION: 3,
  MIN_TOAST_INTERVAL_MS: 60000, // 1 minute
  QUIET_AFTER_DISMISS_MS: 300000, // 5 minutes

  // Auto-dismiss
  TOAST_DURATION_MS: 5000,
  TOAST_WITH_CTA_DURATION_MS: 8000,

  // Completion thresholds
  COMPLETE_MESSAGE_COUNT: 3,
  COMPLETE_DAYS_ELAPSED: 7,
} as const;

// ==================== TYPES ====================

interface OnboardingStats {
  messageCount: number;
  conversationCount: number;
  firstLoad: number;
}

interface OnboardingSeen {
  helpPulse: boolean;
  micPulse: boolean;
  skillsPulse: boolean;
  themePulse: boolean;
  helpPane: boolean;
  toastVoice: boolean;
  toastImage: boolean;
  toastSkill: boolean;
  toastNotes: boolean;
  toastDoubletap: boolean;
  toastProvider: boolean;
  toastSkillDiscovery: boolean;
  dismissedGetStarted: boolean;
}

interface OnboardingSession {
  toastCount: number;
  lastToastTime: number;
}

interface ApiKeysAggregate {
  openai?: string;
  anthropic?: string;
  google?: string;
  openrouter?: string;
}

// ==================== HELPERS ====================

function getNumber(key: string, fallback: number = 0): number {
  const val = storage.mirror.get(key);
  if (!val) return fallback;
  const num = parseInt(val, 10);
  return isNaN(num) ? fallback : num;
}

function getBool(key: string): boolean {
  return storage.mirror.get(key) === 'true';
}

function setNumber(key: string, value: number): void {
  storage.mirror.set(key, String(value));
}

function setBool(key: string, value: boolean): void {
  storage.mirror.set(key, value ? 'true' : '');
}

function hasAnyApiKey(): boolean {
  try {
    const aggregate = (storage.mirror.getJSON('apiKeys', {}) as ApiKeysAggregate) || {};
    const candidates = [
      aggregate.openai,
      aggregate.anthropic,
      aggregate.google,
      aggregate.openrouter,
      storage.mirror.get('openaiApiKey'),
      storage.mirror.get('anthropicApiKey'),
      storage.mirror.get('geminiApiKey'),
      storage.mirror.get('googleApiKey'),
      storage.mirror.get('openrouterApiKey'),
    ];
    // Also check if LM Studio is configured
    const lmstudioUrl = storage.mirror.get('lmstudio:baseUrl');
    if (lmstudioUrl && lmstudioUrl.trim()) {
      return true;
    }
    return candidates.some((value) => typeof value === 'string' && value.trim().length > 0);
  } catch (_) {
    return false;
  }
}

// ==================== STATE ====================

// Initialize first load time if not set
const storedFirstLoad = getNumber(ONBOARDING_KEYS.FIRST_LOAD);
if (!storedFirstLoad && typeof window !== 'undefined') {
  setNumber(ONBOARDING_KEYS.FIRST_LOAD, Date.now());
}

const stats = reactive<OnboardingStats>({
  messageCount: getNumber(ONBOARDING_KEYS.MESSAGE_COUNT),
  conversationCount: getNumber(ONBOARDING_KEYS.CONVERSATION_COUNT),
  firstLoad: storedFirstLoad || Date.now(),
});

const seen = reactive<OnboardingSeen>({
  helpPulse: getBool(ONBOARDING_KEYS.SEEN_HELP_PULSE),
  micPulse: getBool(ONBOARDING_KEYS.SEEN_MIC_PULSE),
  skillsPulse: getBool(ONBOARDING_KEYS.SEEN_SKILLS_PULSE),
  themePulse: getBool(ONBOARDING_KEYS.SEEN_THEME_PULSE),
  helpPane: getBool(ONBOARDING_KEYS.SEEN_HELP_PANE),
  toastVoice: getBool(ONBOARDING_KEYS.SEEN_TOAST_VOICE),
  toastImage: getBool(ONBOARDING_KEYS.SEEN_TOAST_IMAGE),
  toastSkill: getBool(ONBOARDING_KEYS.SEEN_TOAST_SKILL),
  toastNotes: getBool(ONBOARDING_KEYS.SEEN_TOAST_NOTES),
  toastDoubletap: getBool(ONBOARDING_KEYS.SEEN_TOAST_DOUBLETAP),
  toastProvider: getBool(ONBOARDING_KEYS.SEEN_TOAST_PROVIDER),
  toastSkillDiscovery: getBool(ONBOARDING_KEYS.SEEN_TOAST_SKILL_DISCOVERY),
  dismissedGetStarted: getBool(ONBOARDING_KEYS.DISMISSED_GET_STARTED),
});

const session = reactive<OnboardingSession>({
  toastCount: 0,
  lastToastTime: 0,
});

// ==================== COMPUTED ====================

/**
 * Whether onboarding is considered complete.
 * Complete when any of:
 * - User has sent 3+ messages
 * - Any API key is configured
 * - User explicitly dismissed get-started
 * - Help pane has been opened
 * - 7 days have elapsed since first load
 */
const isComplete: ComputedRef<boolean> = computed(() => {
  if (stats.messageCount >= ONBOARDING_TIMING.COMPLETE_MESSAGE_COUNT) return true;
  if (hasAnyApiKey()) return true;
  if (seen.dismissedGetStarted) return true;
  if (seen.helpPane) return true;

  const daysSinceFirstLoad = (Date.now() - stats.firstLoad) / (1000 * 60 * 60 * 24);
  if (daysSinceFirstLoad >= ONBOARDING_TIMING.COMPLETE_DAYS_ELAPSED) return true;

  return false;
});

/**
 * Whether we can show another toast this session
 */
const canShowToast: ComputedRef<boolean> = computed(() => {
  if (session.toastCount >= ONBOARDING_TIMING.MAX_TOASTS_PER_SESSION) return false;
  if (session.lastToastTime) {
    const elapsed = Date.now() - session.lastToastTime;
    if (elapsed < ONBOARDING_TIMING.MIN_TOAST_INTERVAL_MS) return false;
  }
  return true;
});

// ==================== ACTIONS ====================

function incrementMessageCount(): void {
  stats.messageCount++;
  setNumber(ONBOARDING_KEYS.MESSAGE_COUNT, stats.messageCount);

  // Emit milestone events for toast triggers
  if (typeof window !== 'undefined' && stats.messageCount === 5) {
    window.dispatchEvent(new Event('prv:message-count-milestone'));
  }
}

function incrementConversationCount(): void {
  stats.conversationCount++;
  setNumber(ONBOARDING_KEYS.CONVERSATION_COUNT, stats.conversationCount);
}

function markSeen(key: keyof OnboardingSeen): void {
  seen[key] = true;
  const storageKey = getStorageKeyForSeen(key);
  if (storageKey) {
    setBool(storageKey, true);
  }
}

function getStorageKeyForSeen(key: keyof OnboardingSeen): string | null {
  const map: Record<keyof OnboardingSeen, string> = {
    helpPulse: ONBOARDING_KEYS.SEEN_HELP_PULSE,
    micPulse: ONBOARDING_KEYS.SEEN_MIC_PULSE,
    skillsPulse: ONBOARDING_KEYS.SEEN_SKILLS_PULSE,
    themePulse: ONBOARDING_KEYS.SEEN_THEME_PULSE,
    helpPane: ONBOARDING_KEYS.SEEN_HELP_PANE,
    toastVoice: ONBOARDING_KEYS.SEEN_TOAST_VOICE,
    toastImage: ONBOARDING_KEYS.SEEN_TOAST_IMAGE,
    toastSkill: ONBOARDING_KEYS.SEEN_TOAST_SKILL,
    toastNotes: ONBOARDING_KEYS.SEEN_TOAST_NOTES,
    toastDoubletap: ONBOARDING_KEYS.SEEN_TOAST_DOUBLETAP,
    toastProvider: ONBOARDING_KEYS.SEEN_TOAST_PROVIDER,
    toastSkillDiscovery: ONBOARDING_KEYS.SEEN_TOAST_SKILL_DISCOVERY,
    dismissedGetStarted: ONBOARDING_KEYS.DISMISSED_GET_STARTED,
  };
  return map[key] || null;
}

function recordToastShown(): void {
  session.toastCount++;
  session.lastToastTime = Date.now();
}

function recordToastDismissed(): void {
  // After user dismisses a toast, impose quiet period
  session.lastToastTime = Date.now() + ONBOARDING_TIMING.QUIET_AFTER_DISMISS_MS;
}

function refresh(): void {
  stats.messageCount = getNumber(ONBOARDING_KEYS.MESSAGE_COUNT);
  stats.conversationCount = getNumber(ONBOARDING_KEYS.CONVERSATION_COUNT);
  stats.firstLoad = getNumber(ONBOARDING_KEYS.FIRST_LOAD) || Date.now();

  seen.helpPulse = getBool(ONBOARDING_KEYS.SEEN_HELP_PULSE);
  seen.micPulse = getBool(ONBOARDING_KEYS.SEEN_MIC_PULSE);
  seen.skillsPulse = getBool(ONBOARDING_KEYS.SEEN_SKILLS_PULSE);
  seen.themePulse = getBool(ONBOARDING_KEYS.SEEN_THEME_PULSE);
  seen.helpPane = getBool(ONBOARDING_KEYS.SEEN_HELP_PANE);
  seen.toastVoice = getBool(ONBOARDING_KEYS.SEEN_TOAST_VOICE);
  seen.toastImage = getBool(ONBOARDING_KEYS.SEEN_TOAST_IMAGE);
  seen.toastSkill = getBool(ONBOARDING_KEYS.SEEN_TOAST_SKILL);
  seen.toastNotes = getBool(ONBOARDING_KEYS.SEEN_TOAST_NOTES);
  seen.toastDoubletap = getBool(ONBOARDING_KEYS.SEEN_TOAST_DOUBLETAP);
  seen.toastProvider = getBool(ONBOARDING_KEYS.SEEN_TOAST_PROVIDER);
  seen.toastSkillDiscovery = getBool(ONBOARDING_KEYS.SEEN_TOAST_SKILL_DISCOVERY);
  seen.dismissedGetStarted = getBool(ONBOARDING_KEYS.DISMISSED_GET_STARTED);
}

// ==================== INTERFACE ====================

interface OnboardingState {
  stats: OnboardingStats;
  seen: OnboardingSeen;
  session: OnboardingSession;
  isComplete: ComputedRef<boolean>;
  canShowToast: ComputedRef<boolean>;
  hasAnyApiKey: () => boolean;
  incrementMessageCount: () => void;
  incrementConversationCount: () => void;
  markSeen: (key: keyof OnboardingSeen) => void;
  recordToastShown: () => void;
  recordToastDismissed: () => void;
  refresh: () => void;
}

const onboardingState: OnboardingState = {
  stats,
  seen,
  session,
  isComplete,
  canShowToast,
  hasAnyApiKey,
  incrementMessageCount,
  incrementConversationCount,
  markSeen,
  recordToastShown,
  recordToastDismissed,
  refresh,
};

/**
 * Get the onboarding state coordinator singleton.
 */
export function useOnboarding(): OnboardingState {
  return onboardingState;
}

export default useOnboarding;
