/**
 * Suggestion Composable -- Singleton orchestrator for the suggestion pipeline.
 *
 * Manages the full lifecycle: observe patterns -> score conviction ->
 * generate proposals via backend AI -> present as toasts -> handle
 * approve/dismiss/snooze decisions.
 *
 * Privacy: Only action codes are ever sent to the AI. No conversation content.
 * Debug channel: 'suggestions'
 */

import { ref, computed, readonly, toRaw, type Ref, type ComputedRef } from 'vue';
import { storage } from '@web/storage/storage.js';
import { STORAGE_KEYS } from '@web/constants/storageKeys.js';
import {
  scoreConviction,
  deduplicateOverlappingPatterns,
  patternsOverlap,
} from '@web/services/suggestionEngine.js';
import { getActionObserver } from '@web/services/actionObserver.js';
import { useSkillCoordinator } from '@web/composables/useSkillCoordinator';
import { useSkillPreferences } from '@web/composables/useSkillPreferences';
import { useNotifs } from '@web/composables/useNotifs';
import { pickProvider, pickApiKey, pickModel } from '@web/stores/chat/provider.js';
import { apiResolve, withApiHeaders } from '@web/stores/chat/transport.js';
import { useAppSuggestions } from '@web/composables/useAppSuggestions';
import { debugLog, logError } from '@web/utils/debugLog.js';
import type { SkillProposal, DismissalRecord, ProposalStatus } from '@web/types/suggestions.js';

// =============================================================================
// Constants
// =============================================================================

const AUTO_DISMISS_MS = 10_000;
const MIN_TOAST_INTERVAL_MS = 30_000;
const SNOOZE_DEFAULT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PERSIST_DEBOUNCE_MS = 5_000;
const MAX_PENDING_PROPOSALS = 3;

// =============================================================================
// Singleton State
// =============================================================================

const proposals: Ref<ReadonlyArray<SkillProposal>> = ref([]);
const dismissals: Ref<ReadonlyArray<DismissalRecord>> = ref([]);
const activeSuggestion: Ref<SkillProposal | null> = ref(null);

let initialized = false;
let initPromise: Promise<void> | null = null;
let lastToastShownAt = 0;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let generatingInProgress = false;

// =============================================================================
// Helpers
// =============================================================================

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function updateProposal(id: string, updates: Partial<SkillProposal>): void {
  proposals.value = proposals.value.map((p) => (p.id === id ? { ...p, ...updates } : p));
}

function findProposal(id: string): SkillProposal | undefined {
  return proposals.value.find((p) => p.id === id);
}

// =============================================================================
// Persistence (debounced)
// =============================================================================

function schedulePersist(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    flushPersist();
  }, PERSIST_DEBOUNCE_MS);
}

function flushPersist(): void {
  // JSON roundtrip strips Vue reactive proxies that cause DataCloneError in IDB
  const rawProposals = JSON.parse(JSON.stringify(toRaw(proposals.value))) as SkillProposal[];
  storage.kv.set(STORAGE_KEYS.SUGGESTION_PROPOSALS, rawProposals).catch((err: unknown) => {
    logError(
      'suggestions',
      'persist-proposals',
      err instanceof Error ? err : new Error(String(err))
    );
  });
  const rawDismissals = JSON.parse(JSON.stringify(toRaw(dismissals.value))) as DismissalRecord[];
  storage.kv.set(STORAGE_KEYS.SUGGESTION_DISMISSALS, rawDismissals).catch((err: unknown) => {
    logError(
      'suggestions',
      'persist-dismissals',
      err instanceof Error ? err : new Error(String(err))
    );
  });
}

function persistImmediate(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  flushPersist();
}

// =============================================================================
// Toast Guards
// =============================================================================

function isUserTyping(): boolean {
  if (typeof document === 'undefined') return false;
  const tag = document.activeElement?.tagName;
  return tag === 'TEXTAREA' || tag === 'INPUT';
}

function isAIStreaming(): boolean {
  try {
    // Access pinia store directly -- avoid circular imports by using
    // the global pinia store approach. Safe because the chat store
    // is always initialized before suggestions.
    const w = window as unknown as {
      __pinia?: { state?: { value?: { chat?: { streaming?: { active?: boolean } } } } };
    };
    if (w.__pinia) {
      const chatState = w.__pinia.state?.value?.chat;
      if (chatState && chatState.streaming) {
        return !!chatState.streaming.active;
      }
    }
  } catch {
    // Intentional: fallback to false if pinia not available
  }
  return false;
}

function canShowToast(): boolean {
  if (activeSuggestion.value !== null) return false;
  // Cross-proposal guard: skip if an app suggestion is already active
  const { activeAppSuggestion } = useAppSuggestions();
  if (activeAppSuggestion.value !== null) return false;
  if (isUserTyping()) return false;
  if (isAIStreaming()) return false;
  if (Date.now() - lastToastShownAt < MIN_TOAST_INTERVAL_MS) return false;
  return true;
}

// =============================================================================
// Core Actions
// =============================================================================

async function initialize(): Promise<void> {
  if (initialized) return;
  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    try {
      const [storedProposals, storedDismissals] = await Promise.all([
        storage.kv.get<SkillProposal[]>(STORAGE_KEYS.SUGGESTION_PROPOSALS),
        storage.kv.get<DismissalRecord[]>(STORAGE_KEYS.SUGGESTION_DISMISSALS),
      ]);

      if (Array.isArray(storedProposals)) {
        // Unsnoozed: move expired snoozed proposals back to pending
        const now = Date.now();
        proposals.value = storedProposals.map((p) => {
          if (p.status === 'snoozed' && p.snoozedUntil !== undefined && p.snoozedUntil < now) {
            return { ...p, status: 'pending' as ProposalStatus, snoozedUntil: undefined };
          }
          return p;
        });
      }

      if (Array.isArray(storedDismissals)) {
        dismissals.value = storedDismissals;
      }

      initialized = true;
      debugLog(
        'suggestions',
        'init',
        `Loaded ${proposals.value.length} proposals, ${dismissals.value.length} dismissals`
      );
    } catch (err: unknown) {
      logError('suggestions', 'init', err instanceof Error ? err : new Error(String(err)));
      initialized = true;
    }
  })();

  await initPromise;
  initPromise = null;
}

async function checkAndGenerate(): Promise<void> {
  if (generatingInProgress) {
    debugLog('suggestions', 'checkAndGenerate', 'Generation already in progress, skipping');
    return;
  }

  // Cap: don't generate more if we already have enough pending
  const activePending = proposals.value.filter(
    (p) => p.status === 'pending' || p.status === 'shown'
  );
  if (activePending.length >= MAX_PENDING_PROPOSALS) {
    debugLog(
      'suggestions',
      'checkAndGenerate',
      `Already ${activePending.length} pending proposals (max ${MAX_PENDING_PROPOSALS}), skipping`
    );
    return;
  }

  const observer = getActionObserver();
  const patterns = await observer.detectPatterns();

  const coordinator = useSkillCoordinator();
  const existingSkillNames = Array.from(coordinator.skills.value.values()).map((s) => s.title);

  // Build existing skill keys from patterns that already have proposals
  const existingProposalKeys = new Set(
    proposals.value.filter((p) => p.status === 'approved').map((p) => p.patternKey)
  );

  const scores = scoreConviction(
    [...patterns],
    [...dismissals.value],
    [...existingProposalKeys],
    undefined
  );

  if (scores.length === 0) {
    debugLog('suggestions', 'checkAndGenerate', 'No patterns above threshold');
    return;
  }

  // Deduplicate overlapping n-gram patterns (e.g., A->B and A->B->C)
  const dedupedScores = deduplicateOverlappingPatterns(scores);

  // Filter out patterns that overlap with existing pending/shown/approved proposals
  const existingProposalActions = proposals.value
    .filter((p) => p.status === 'pending' || p.status === 'shown' || p.status === 'approved')
    .map((p) => p.patternKey.split(' -> '));

  const newScores = dedupedScores.filter(
    (s) => !existingProposalActions.some((existing) => patternsOverlap(s.pattern.actions, existing))
  );

  if (newScores.length === 0) {
    debugLog(
      'suggestions',
      'checkAndGenerate',
      'All high-conviction patterns already have proposals or overlap with existing'
    );
    return;
  }

  // Generate proposal for the highest conviction pattern
  const topScore = newScores[0];
  if (!topScore) return;

  debugLog(
    'suggestions',
    'checkAndGenerate',
    `Generating proposal for pattern: ${topScore.patternKey} (conviction: ${topScore.conviction.toFixed(2)})`
  );

  const provider = pickProvider();
  const apiKey = pickApiKey(provider as 'anthropic' | 'gemini' | 'openrouter');
  const model = pickModel(provider);

  if (!apiKey) {
    debugLog('suggestions', 'checkAndGenerate', 'No API key configured, skipping generation');
    return;
  }

  // Build dismissed approaches for this pattern
  const patternDismissal = dismissals.value.find((d) => d.patternKey === topScore.patternKey);
  const previouslyDismissed =
    patternDismissal?.previousApproaches?.map((name) => ({
      name,
      summary: `Previously dismissed approach for pattern ${topScore.patternKey}`,
    })) ?? [];

  generatingInProgress = true;
  try {
    const response = await fetch(
      apiResolve('/api/v1/suggest'),
      withApiHeaders({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patterns: [
            {
              actions: [...topScore.pattern.actions],
              count: topScore.pattern.count,
              reasoning: topScore.reasoning,
            },
          ],
          existingSkills: existingSkillNames,
          provider,
          apiKey,
          model,
          previouslyDismissed,
        }),
      })
    );

    if (!response.ok) {
      debugLog('suggestions', 'checkAndGenerate', `API error: ${response.status}`);
      return;
    }

    const result = (await response.json()) as {
      ok: boolean;
      proposal?: {
        skillMd: string;
        name: string;
        summary: string;
        reasoning: string;
        impact: string;
      };
      error?: string;
    };

    if (!result.ok || !result.proposal) {
      debugLog(
        'suggestions',
        'checkAndGenerate',
        `Generation failed: ${result.error ?? 'unknown'}`
      );
      return;
    }

    const proposal: SkillProposal = {
      id: generateId(),
      type: 'skill',
      name: result.proposal.name,
      summary: result.proposal.summary,
      reasoning: result.proposal.reasoning,
      impact: result.proposal.impact,
      skillMd: result.proposal.skillMd,
      patternKey: topScore.patternKey,
      createdAt: Date.now(),
      status: 'pending',
    };

    proposals.value = [...proposals.value, proposal];
    schedulePersist();

    debugLog(
      'suggestions',
      'checkAndGenerate',
      `Created proposal: ${proposal.name} (${proposal.id})`
    );

    // Show toast if conditions are right
    if (canShowToast()) {
      showNext();
    } else {
      debugLog('suggestions', 'checkAndGenerate', 'Toast deferred - user busy');
    }
  } catch (err: unknown) {
    logError(
      'suggestions',
      'checkAndGenerate',
      err instanceof Error ? err : new Error(String(err))
    );
  } finally {
    generatingInProgress = false;
  }
}

async function approve(proposalId: string): Promise<void> {
  const proposal = findProposal(proposalId);
  if (!proposal) return;

  const coordinator = useSkillCoordinator();

  // Extract category from SKILL.md frontmatter if possible
  let category = 'workflow';
  try {
    const categoryMatch = proposal.skillMd.match(/category:\s*(\S+)/);
    if (categoryMatch?.[1]) {
      category = categoryMatch[1];
    }
  } catch {
    // Intentional: fallback to 'workflow'
  }

  // Extract body content (after the second ---)
  let bodyText = proposal.summary;
  try {
    const parts = proposal.skillMd.split('---');
    if (parts.length >= 3) {
      bodyText = parts.slice(2).join('---').trim() || proposal.summary;
    }
  } catch {
    // Intentional: fallback to summary
  }

  const skill = coordinator.createSkill({
    title: proposal.name,
    type: 'prompt',
    source: 'generated',
    icon: 'ph:lightbulb',
    promptConfig: { text: bodyText, autoSubmit: false },
    tags: [category],
  });

  // Add to dock (favorites)
  const prefs = useSkillPreferences();
  prefs.toggleFavorited(skill.id);

  // Update proposal status
  updateProposal(proposalId, {
    status: 'approved' as ProposalStatus,
    approvedAt: Date.now(),
  });

  // Mark pattern as addressed in dismissals
  const existingDismissal = dismissals.value.find((d) => d.patternKey === proposal.patternKey);
  if (existingDismissal) {
    dismissals.value = dismissals.value.map((d) =>
      d.patternKey === proposal.patternKey
        ? { ...d, count: d.count + 100 } // Large count effectively prevents re-triggering
        : d
    );
  } else {
    dismissals.value = [
      ...dismissals.value,
      {
        patternKey: proposal.patternKey,
        dismissedAt: Date.now(),
        count: 100,
      },
    ];
  }

  persistImmediate();
  activeSuggestion.value = null;

  const notifs = useNotifs();
  notifs.push('success', 'Skill added!');

  debugLog(
    'suggestions',
    'approve',
    `Approved: ${proposal.name} -> skill ${skill.id}. Pattern key "${proposal.patternKey}" added to approved blocklist`
  );
}

function dismiss(proposalId: string): void {
  const proposal = findProposal(proposalId);
  if (!proposal) return;

  updateProposal(proposalId, {
    status: 'dismissed' as ProposalStatus,
    dismissedAt: Date.now(),
  });

  // Update or create dismissal record
  const existingDismissal = dismissals.value.find((d) => d.patternKey === proposal.patternKey);

  if (existingDismissal) {
    dismissals.value = dismissals.value.map((d) =>
      d.patternKey === proposal.patternKey
        ? {
            ...d,
            count: d.count + 1,
            dismissedAt: Date.now(),
            previousApproaches: [...(d.previousApproaches ?? []), proposal.name],
          }
        : d
    );
  } else {
    dismissals.value = [
      ...dismissals.value,
      {
        patternKey: proposal.patternKey,
        dismissedAt: Date.now(),
        count: 1,
        previousApproaches: [proposal.name],
      },
    ];
  }

  persistImmediate();
  activeSuggestion.value = null;

  debugLog('suggestions', 'dismiss', `Dismissed: ${proposal.name}`);
}

function snooze(proposalId: string, durationMs: number = SNOOZE_DEFAULT_MS): void {
  const proposal = findProposal(proposalId);
  if (!proposal) return;

  updateProposal(proposalId, {
    status: 'snoozed' as ProposalStatus,
    snoozedUntil: Date.now() + durationMs,
  });

  persistImmediate();
  activeSuggestion.value = null;

  debugLog('suggestions', 'snooze', `Snoozed: ${proposal.name} for ${durationMs}ms`);
}

function showNext(): void {
  if (!canShowToast()) return;

  const next = proposals.value.find((p) => p.status === 'pending');
  if (!next) return;

  updateProposal(next.id, { status: 'shown' as ProposalStatus });
  activeSuggestion.value = { ...next, status: 'shown' };
  lastToastShownAt = Date.now();

  const proposalId = next.id;
  const notifs = useNotifs();
  notifs.push('suggestion', next.name, {
    description: next.summary,
    action: {
      label: 'Add Skill',
      handler: () => {
        approve(proposalId).catch(() => {});
      },
    },
    autoExpireMs: AUTO_DISMISS_MS,
    onRemove: (reason) => {
      if (reason === 'expire') {
        // Move back to pending, no penalty
        updateProposal(proposalId, { status: 'pending' as ProposalStatus });
        activeSuggestion.value = null;
        debugLog('suggestions', 'autoDismiss', `Auto-dismissed: ${next.name}`);
      } else if (reason === 'dismiss') {
        dismiss(proposalId);
      }
      // 'action' -- approve handler already ran, just clear ref
      if (reason === 'action') {
        activeSuggestion.value = null;
      }
    },
  });

  debugLog('suggestions', 'showNext', `Showing: ${next.name}`);
}

function patchProposal(
  id: string,
  patches: Partial<Pick<SkillProposal, 'name' | 'summary' | 'impact' | 'skillMd'>>
): void {
  updateProposal(id, patches);
  schedulePersist();
}

function destroy(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
    flushPersist();
  }
  initialized = false;
  initPromise = null;
}

// =============================================================================
// Computed
// =============================================================================

const pendingCount: ComputedRef<number> = computed(
  () => proposals.value.filter((p) => p.status === 'pending').length
);

// =============================================================================
// Composable Export
// =============================================================================

export interface UseSuggestionsReturn {
  readonly proposals: Readonly<Ref<ReadonlyArray<SkillProposal>>>;
  readonly activeSuggestion: Readonly<Ref<SkillProposal | null>>;
  readonly pendingCount: Readonly<ComputedRef<number>>;
  initialize: () => Promise<void>;
  checkAndGenerate: () => Promise<void>;
  approve: (proposalId: string) => Promise<void>;
  dismiss: (proposalId: string) => void;
  snooze: (proposalId: string, durationMs?: number) => void;
  patchProposal: (
    id: string,
    patches: Partial<Pick<SkillProposal, 'name' | 'summary' | 'impact' | 'skillMd'>>
  ) => void;
  showNext: () => void;
  destroy: () => void;
}

export function useSuggestions(): UseSuggestionsReturn {
  return {
    proposals: readonly(proposals) as Readonly<Ref<ReadonlyArray<SkillProposal>>>,
    activeSuggestion: readonly(activeSuggestion) as Readonly<Ref<SkillProposal | null>>,
    pendingCount: readonly(pendingCount) as Readonly<ComputedRef<number>>,
    initialize,
    checkAndGenerate,
    approve,
    dismiss,
    snooze,
    patchProposal,
    showNext,
    destroy,
  };
}

export default useSuggestions;
