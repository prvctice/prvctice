import { computed, ref, type Ref, type ComputedRef } from 'vue';
import { storage, isStorageInitialized } from '@web/storage/storage.js';
import { STORAGE_KEYS } from '@web/constants/storageKeys.js';
import { useEventBus } from '@web/services/eventBus';

// API key storage keys to check
export const USER_API_KEY_STORAGE_KEYS = [
  STORAGE_KEYS.API_KEYS,
  STORAGE_KEYS.ANTHROPIC_API_KEY,
  STORAGE_KEYS.GEMINI_API_KEY,
  'googleApiKey',
  'openrouterApiKey',
];

// Message-count trial constants
const MAX_MESSAGES_PER_CYCLE = 15;
const COOLDOWN_DURATION_MS = 5 * 60 * 60 * 1000; // 5 hours
const MAX_CYCLES = 3;

type SessionState = 'unlocked' | 'trial_active' | 'trial_expired' | 'first_launch';

interface ApiKeysAggregate {
  anthropic?: string;
  google?: string;
  openrouter?: string;
}

// Detect if user has any API key configured
function detectUserKey(): boolean {
  try {
    const aggregate = (storage.mirror.getJSON('apiKeys', {}) as ApiKeysAggregate) || {};
    const candidates = [
      aggregate.anthropic,
      aggregate.google,
      aggregate.openrouter,
      storage.mirror.get('anthropicApiKey'),
      storage.mirror.get('geminiApiKey'),
      storage.mirror.get('googleApiKey'),
      storage.mirror.get('openrouterApiKey'),
    ];
    // Also check if LM Studio is configured
    const lmstudioUrl = storage.mirror.get(STORAGE_KEYS.LMSTUDIO_BASE_URL);
    if (lmstudioUrl && lmstudioUrl.trim()) {
      return true;
    }
    return candidates.some((value) => typeof value === 'string' && value.trim().length > 0);
  } catch (_) {
    return false;
  }
}

// Read messages remaining from localStorage
function readMessagesRemaining(): number {
  try {
    const raw = storage.mirror.get(STORAGE_KEYS.TRIAL_MESSAGES_REMAINING);
    if (raw === null || raw === undefined || raw === '') return MAX_MESSAGES_PER_CYCLE;
    const val = Number(raw);
    if (!Number.isFinite(val) || val < 0) return MAX_MESSAGES_PER_CYCLE;
    return Math.min(val, MAX_MESSAGES_PER_CYCLE);
  } catch (_) {
    return MAX_MESSAGES_PER_CYCLE;
  }
}

// Read cooldown start timestamp from localStorage
function readCooldownStart(): number {
  try {
    const raw = storage.mirror.get(STORAGE_KEYS.TRIAL_COOLDOWN_START);
    if (raw === null || raw === undefined || raw === '') return 0;
    const val = Number(raw);
    if (!Number.isFinite(val) || val < 0) return 0;
    return val;
  } catch (_) {
    return 0;
  }
}

// Read cycle number from localStorage
function readCycle(): number {
  try {
    const raw = storage.mirror.get(STORAGE_KEYS.TRIAL_CYCLE);
    if (raw === null || raw === undefined || raw === '') return 1;
    const val = Number(raw);
    if (!Number.isFinite(val) || val < 1) return 1;
    return Math.max(1, Math.min(val, MAX_CYCLES + 1));
  } catch (_) {
    return 1;
  }
}

// Check if welcome has been completed
function readWelcomeComplete(): boolean {
  const val = storage.mirror.get(STORAGE_KEYS.ONBOARDING_COMPLETE);
  return val === 'true';
}

// Migration from old time-based trial system.
// Reads legacy 'prv_trial_start_ms' key and marks onboarding complete.
// TODO: Remove after migration window closes (users have had time to visit once).
function migrateFromOldSystem(): void {
  const oldTrialStart = storage.mirror.get('prv_trial_start_ms');
  if (oldTrialStart) {
    storage.mirror.set(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true');
    storage.mirror.set(STORAGE_KEYS.TRIAL_START, oldTrialStart);
    // Clean up old keys
    try {
      localStorage.removeItem('prv_apiKeyOnboardingPos');
      localStorage.removeItem('prv_apiKeyOnboardingSnoozeUntil');
    } catch (_) {
      // Silent
    }
  }
}

// Run migration on load
migrateFromOldSystem();

// Reactive state (module-level singleton)
const hasApiKey: Ref<boolean> = ref(detectUserKey());
const welcomeComplete: Ref<boolean> = ref(readWelcomeComplete());
const messagesRemaining: Ref<number> = ref(readMessagesRemaining());
const cooldownStart: Ref<number> = ref(readCooldownStart());
const currentCycle: Ref<number> = ref(readCycle());
const showSuccessModal: Ref<boolean> = ref(false);

// Reset for next cycle when cooldown has expired
function resetForNextCycle(): void {
  const nextCycle = currentCycle.value + 1;
  if (nextCycle > MAX_CYCLES) {
    // Permanently exhausted
    currentCycle.value = nextCycle;
    storage.mirror.set(STORAGE_KEYS.TRIAL_CYCLE, String(nextCycle));
    return;
  }
  messagesRemaining.value = MAX_MESSAGES_PER_CYCLE;
  cooldownStart.value = 0;
  currentCycle.value = nextCycle;
  storage.mirror.set(STORAGE_KEYS.TRIAL_MESSAGES_REMAINING, String(MAX_MESSAGES_PER_CYCLE));
  storage.mirror.set(STORAGE_KEYS.TRIAL_COOLDOWN_START, '');
  storage.mirror.set(STORAGE_KEYS.TRIAL_CYCLE, String(nextCycle));
}

// Start cooldown when messages hit 0
function startCooldown(): void {
  const now = Date.now();
  cooldownStart.value = now;
  storage.mirror.set(STORAGE_KEYS.TRIAL_COOLDOWN_START, String(now));
}

// Consume one message after successful AI response
function consumeMessage(): void {
  if (hasApiKey.value) return; // unlocked users don't consume
  const next = Math.max(0, messagesRemaining.value - 1);
  messagesRemaining.value = next;
  storage.mirror.set(STORAGE_KEYS.TRIAL_MESSAGES_REMAINING, String(next));
  if (next === 0) {
    startCooldown();
  }
}

// Check and handle expired cooldown on initialization
function checkCooldownExpiry(): void {
  if (hasApiKey.value) return;
  if (cooldownStart.value > 0) {
    const elapsed = Date.now() - cooldownStart.value;
    if (elapsed >= COOLDOWN_DURATION_MS && currentCycle.value <= MAX_CYCLES) {
      resetForNextCycle();
    }
  }
}

// Refresh functions
function refreshApiKeys(): void {
  const next = detectUserKey();
  const prev = hasApiKey.value;
  if (next !== prev) {
    hasApiKey.value = next;
  }
}

// Auto-start trial on first visit (no blocking welcome screen)
function ensureTrialStarted(): void {
  if (!welcomeComplete.value) {
    welcomeComplete.value = true;
    storage.mirror.set(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true');
  }
  // Initialize trial if no messages remaining value exists yet
  const raw = storage.mirror.get(STORAGE_KEYS.TRIAL_MESSAGES_REMAINING);
  if (raw === null || raw === undefined || raw === '') {
    messagesRemaining.value = MAX_MESSAGES_PER_CYCLE;
    currentCycle.value = 1;
    cooldownStart.value = 0;
    storage.mirror.set(STORAGE_KEYS.TRIAL_MESSAGES_REMAINING, String(MAX_MESSAGES_PER_CYCLE));
    storage.mirror.set(STORAGE_KEYS.TRIAL_CYCLE, '1');
    storage.mirror.set(STORAGE_KEYS.TRIAL_COOLDOWN_START, '');
  }
}

// Storage event handler for cross-tab sync
function handleStorage(event: StorageEvent): void {
  if (!event || typeof event.key !== 'string') return;
  if (
    USER_API_KEY_STORAGE_KEYS.includes(event.key) ||
    event.key === STORAGE_KEYS.LMSTUDIO_BASE_URL
  ) {
    refreshApiKeys();
  } else if (
    event.key === STORAGE_KEYS.TRIAL_MESSAGES_REMAINING ||
    event.key === STORAGE_KEYS.TRIAL_COOLDOWN_START ||
    event.key === STORAGE_KEYS.TRIAL_CYCLE
  ) {
    messagesRemaining.value = readMessagesRemaining();
    cooldownStart.value = readCooldownStart();
    currentCycle.value = readCycle();
  } else if (event.key === STORAGE_KEYS.ONBOARDING_COMPLETE) {
    welcomeComplete.value = readWelcomeComplete();
  }
}

// Track if listeners are attached (HMR safety)
let listenersAttached = false;

// Set up event listeners
function attachListeners(): void {
  if (typeof window === 'undefined' || listenersAttached) return;
  listenersAttached = true;
  window.addEventListener('storage', handleStorage);
  // Show success modal only when user explicitly adds a key (not on page load detection)
  useEventBus().on('api-keys:updated', () => {
    const hadKey = hasApiKey.value;
    refreshApiKeys();
    if (!hadKey && hasApiKey.value && state.value !== 'first_launch') {
      showSuccessModal.value = true;
    }
  });

  // Handle storage initialization (fixes race condition where module loads before storage is ready)
  if (isStorageInitialized()) {
    // Storage already initialized - re-check keys now
    refreshApiKeys();
    if (!hasApiKey.value) {
      ensureTrialStarted();
      checkCooldownExpiry();
    }
  } else {
    // Wait for storage to be ready
    useEventBus().on('storage:initialized', () => {
      refreshApiKeys();
      if (!hasApiKey.value) {
        ensureTrialStarted();
        checkCooldownExpiry();
      }
    });
  }
}

// Cleanup function for tests and module unload
function cleanupSessionGate(): void {
  if (typeof window !== 'undefined' && listenersAttached) {
    window.removeEventListener('storage', handleStorage);
    useEventBus().off('api-keys:updated', refreshApiKeys);
    listenersAttached = false;
  }
}

// Attach listeners on module load
attachListeners();

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', cleanupSessionGate);
}

// Computed state machine
const state: ComputedRef<SessionState> = computed(() => {
  // If user has API key, they're unlocked
  if (hasApiKey.value) return 'unlocked';

  // Check if trial is permanently exhausted (all cycles done)
  if (currentCycle.value > MAX_CYCLES) return 'trial_expired';

  // Check if in cooldown
  if (cooldownStart.value > 0) {
    const elapsed = Date.now() - cooldownStart.value;
    if (elapsed < COOLDOWN_DURATION_MS) return 'trial_expired';
    // Cooldown expired but resetForNextCycle hasn't run yet (edge case)
    return 'trial_active';
  }

  // Auto-start trial if needed (shouldn't happen but safety check)
  if (messagesRemaining.value <= 0) return 'trial_expired';

  return 'trial_active';
});

// Convenience computed states
const isTrialActive: ComputedRef<boolean> = computed(() => state.value === 'trial_active');
const isExpired: ComputedRef<boolean> = computed(() => state.value === 'trial_expired');
const isUnlocked: ComputedRef<boolean> = computed(() => state.value === 'unlocked');
const canSendMessages: ComputedRef<boolean> = computed(
  () => isTrialActive.value || isUnlocked.value
);

// Remaining time in cooldown (for UI display)
const cooldownMs: ComputedRef<number> = computed(() => {
  if (cooldownStart.value <= 0) return 0;
  const elapsed = Date.now() - cooldownStart.value;
  return Math.max(0, COOLDOWN_DURATION_MS - elapsed);
});

// Actions
function dismissSuccessModal(): void {
  showSuccessModal.value = false;
}

// Gate interface
interface SessionGate {
  state: ComputedRef<SessionState>;
  cooldownMs: ComputedRef<number>;
  cooldownStart: Ref<number>;
  messagesRemaining: Ref<number>;
  currentCycle: Ref<number>;
  hasApiKey: Ref<boolean>;
  isTrialActive: ComputedRef<boolean>;
  isExpired: ComputedRef<boolean>;
  isUnlocked: ComputedRef<boolean>;
  canSendMessages: ComputedRef<boolean>;
  refreshApiKeys: () => void;
  consumeMessage: () => void;
  showSuccessModal: Ref<boolean>;
  dismissSuccessModal: () => void;
  cleanup: () => void;
}

// Export singleton gate object
const gate: SessionGate = {
  // State
  state,
  cooldownMs,
  cooldownStart,
  messagesRemaining,
  currentCycle,
  hasApiKey,

  // Computed
  isTrialActive,
  isExpired,
  isUnlocked,
  canSendMessages,

  // Actions
  refreshApiKeys,
  consumeMessage,

  // Success modal
  showSuccessModal,
  dismissSuccessModal,

  // Cleanup for tests
  cleanup: cleanupSessionGate,
};

export function useSessionGate(): SessionGate {
  return gate;
}

// Named export for direct cleanup access in tests
export { cleanupSessionGate };
