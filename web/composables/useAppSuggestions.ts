/**
 * App Suggestion Composable -- Orchestrator for app proposal pipeline.
 *
 * Parallel to useSuggestions.ts but for app proposals:
 * - Detects app-usage patterns (sequences + frequency)
 * - Scores conviction (reuses suggestionEngine)
 * - Generates proposals via POST /api/v1/suggest-app
 * - Presents via sileo notification system
 * - Approves: register + launch (instant gratification)
 * - Dismisses: conviction penalty
 *
 * Debug channel: 'app-suggestions'
 */

import { ref, readonly, toRaw, type Ref } from 'vue';
import { storage } from '@web/storage/storage.js';
import { STORAGE_KEYS } from '@web/constants/storageKeys.js';
import { scoreConviction } from '@web/services/suggestionEngine.js';
import { getActionObserver } from '@web/services/actionObserver.js';
import { createAppRegistry } from '@web/services/apps/appRegistry';
import { useWindowManager } from '@web/composables/useWindowManager';
import { useSuggestions } from '@web/composables/useSuggestions';
import { useNotifs } from '@web/composables/useNotifs';
import { pickProvider, pickApiKey, pickModel } from '@web/stores/chat/provider.js';
import { apiResolve, withApiHeaders } from '@web/stores/chat/transport.js';
import { debugLog, logError } from '@web/utils/debugLog.js';
import type { AppProposal, DismissalRecord, ProposalStatus } from '@web/types/suggestions.js';
import type { AppDefinition } from '@web/types/apps.js';

// =============================================================================
// Constants
// =============================================================================

const MIN_TOAST_INTERVAL_MS = 30_000;
const PERSIST_DEBOUNCE_MS = 5_000;
const WEEKLY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// =============================================================================
// Singleton State
// =============================================================================

const proposals: Ref<ReadonlyArray<AppProposal>> = ref([]);
const dismissals: Ref<ReadonlyArray<DismissalRecord>> = ref([]);
const activeAppSuggestion: Ref<AppProposal | null> = ref(null);

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

// Infrastructure connectors that are implementation details, not behavioral signals
const INFRASTRUCTURE_CONNECTORS = new Set(['storage', 'time', 'clipboard']);

function classifyPattern(actions: ReadonlyArray<string>): 'sequence' | 'frequency' | null {
  const appEvents = actions.filter((a) => {
    if (a.startsWith('app:')) return true;
    if (a.startsWith('connector:')) {
      const connectorName = a.split(':')[1];
      return connectorName !== undefined && !INFRASTRUCTURE_CONNECTORS.has(connectorName);
    }
    return false;
  });
  const skillEvents = actions.filter((a) => a.startsWith('skill:'));

  // Not an app pattern or mixed pattern -- skip
  if (appEvents.length === 0) return null;
  if (skillEvents.length > 0) return null;

  return actions.length > 1 ? 'sequence' : 'frequency';
}

/**
 * Enforce a 7-day cooldown between app suggestions.
 * Returns true if we should NOT suggest (cooldown is active).
 */
function isWeeklyCooldownActive(): boolean {
  const shownProposals = proposals.value.filter((p) => p.status !== 'pending');
  if (shownProposals.length === 0) return false;

  const mostRecentShownAt = Math.max(...shownProposals.map((p) => p.createdAt));
  return Date.now() - mostRecentShownAt < WEEKLY_COOLDOWN_MS;
}

function updateProposal(id: string, updates: Partial<AppProposal>): void {
  proposals.value = proposals.value.map((p) => (p.id === id ? { ...p, ...updates } : p));
}

function findProposal(id: string): AppProposal | undefined {
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
  const rawProposals = JSON.parse(JSON.stringify(toRaw(proposals.value))) as AppProposal[];
  storage.kv.set(STORAGE_KEYS.APP_PROPOSALS, rawProposals).catch((err: unknown) => {
    logError(
      'app-suggestions',
      'persist-proposals',
      err instanceof Error ? err : new Error(String(err))
    );
  });
  const rawDismissals = JSON.parse(JSON.stringify(toRaw(dismissals.value))) as DismissalRecord[];
  storage.kv.set(STORAGE_KEYS.APP_DISMISSALS, rawDismissals).catch((err: unknown) => {
    logError(
      'app-suggestions',
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
        storage.kv.get<AppProposal[]>(STORAGE_KEYS.APP_PROPOSALS),
        storage.kv.get<DismissalRecord[]>(STORAGE_KEYS.APP_DISMISSALS),
      ]);

      if (Array.isArray(storedProposals)) {
        proposals.value = storedProposals;
      }
      if (Array.isArray(storedDismissals)) {
        dismissals.value = storedDismissals;
      }

      initialized = true;
      debugLog(
        'app-suggestions',
        'init',
        `Loaded ${proposals.value.length} proposals, ${dismissals.value.length} dismissals`
      );
    } catch (err: unknown) {
      logError('app-suggestions', 'init', err instanceof Error ? err : new Error(String(err)));
      initialized = true;
    }
  })();

  await initPromise;
  initPromise = null;
}

async function checkAndGenerate(): Promise<void> {
  if (generatingInProgress) {
    debugLog('app-suggestions', 'checkAndGenerate', 'Generation already in progress, skipping');
    return;
  }

  // Cross-proposal guard: skip if a skill suggestion is already active
  const { activeSuggestion } = useSuggestions();
  if (activeSuggestion.value !== null) {
    debugLog('app-suggestions', 'checkAndGenerate', 'Skill suggestion active, skipping');
    return;
  }

  // Max 1 app proposal per session
  if (activeAppSuggestion.value !== null) {
    debugLog('app-suggestions', 'checkAndGenerate', 'Active proposal exists, skipping');
    return;
  }

  if (Date.now() - lastToastShownAt < MIN_TOAST_INTERVAL_MS) {
    debugLog('app-suggestions', 'checkAndGenerate', 'Toast interval not elapsed, skipping');
    return;
  }

  await initialize();

  if (isWeeklyCooldownActive()) {
    debugLog('app-suggestions', 'checkAndGenerate', 'Weekly cooldown active, skipping');
    return;
  }

  const observer = getActionObserver();
  const allPatterns = await observer.detectPatterns();

  // Filter to app-only patterns (sequences and frequency)
  const appPatterns = allPatterns.filter((p) => classifyPattern(p.actions) !== null);

  if (appPatterns.length === 0) {
    debugLog('app-suggestions', 'checkAndGenerate', 'No app patterns detected');
    return;
  }

  // Namespace pattern keys with 'app:' prefix to avoid collision with skill keys
  const existingApprovedKeys = new Set(
    proposals.value.filter((p) => p.status === 'approved').map((p) => p.patternKey)
  );

  // Score conviction using the shared engine
  // We prefix keys with 'app:' for namespace separation
  const appDismissals = dismissals.value;
  const scores = scoreConviction(
    [...appPatterns],
    [...appDismissals],
    [...existingApprovedKeys],
    undefined
  );

  if (scores.length === 0) {
    debugLog('app-suggestions', 'checkAndGenerate', 'No patterns above threshold');
    return;
  }

  // Filter out patterns that already have pending/shown proposals
  const existingPendingKeys = new Set(
    proposals.value
      .filter((p) => p.status === 'pending' || p.status === 'shown')
      .map((p) => p.patternKey)
  );

  const newScores = scores.filter((s) => !existingPendingKeys.has(s.patternKey));

  if (newScores.length === 0) {
    debugLog(
      'app-suggestions',
      'checkAndGenerate',
      'All high-conviction app patterns already have proposals'
    );
    return;
  }

  // Pick highest conviction pattern
  const topScore = newScores[0];
  if (!topScore) return;

  debugLog(
    'app-suggestions',
    'checkAndGenerate',
    `Generating app proposal for: ${topScore.patternKey} (conviction: ${topScore.conviction.toFixed(2)})`
  );

  // Extract used connectors from pattern actions
  const usedConnectors = [
    ...new Set(
      topScore.pattern.actions
        .filter((a) => a.startsWith('connector:'))
        .map((a) => {
          // connector:weather:used -> weather
          const parts = a.split(':');
          return parts[1] ?? '';
        })
        .filter(Boolean)
    ),
  ];

  const provider = pickProvider();
  const apiKey = pickApiKey(provider as 'anthropic' | 'gemini' | 'openrouter');
  const model = pickModel(provider);

  if (!apiKey) {
    debugLog('app-suggestions', 'checkAndGenerate', 'No API key configured, skipping generation');
    return;
  }

  // Get existing app names to avoid duplicates
  const registry = createAppRegistry();
  const existingApps = await registry.getAll();
  const existingAppNames = existingApps.map((a) => a.name);

  generatingInProgress = true;
  try {
    const response = await fetch(
      apiResolve('/api/v1/suggest-app'),
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
          usedConnectors,
          existingAppNames,
          provider,
          apiKey,
          model,
        }),
      })
    );

    if (!response.ok) {
      debugLog('app-suggestions', 'checkAndGenerate', `API error: ${response.status}`);
      return;
    }

    const data = (await response.json()) as {
      ok: boolean;
      proposal?: {
        name: string;
        description: string;
        html: string;
        permissions: string[];
        window: { width: number; height: number };
        reasoning: string;
        impact: string;
      };
      error?: string;
    };

    if (!data.ok || !data.proposal) {
      debugLog(
        'app-suggestions',
        'checkAndGenerate',
        `Generation failed: ${data.error ?? 'unknown'}`
      );
      return;
    }

    // Determine action: 'pin' if the app name matches an existing registered app,
    // 'launch' if it's a new app the user hasn't seen before
    const proposalNameLower = data.proposal.name.toLowerCase();
    const matchesExisting = existingAppNames.some(
      (name) => name.toLowerCase() === proposalNameLower
    );
    const action: 'launch' | 'pin' = matchesExisting ? 'pin' : 'launch';

    const proposal: AppProposal = {
      id: generateId(),
      type: 'app',
      name: data.proposal.name,
      description: data.proposal.description,
      summary: data.proposal.description,
      reasoning: data.proposal.reasoning,
      html: data.proposal.html,
      permissions: data.proposal.permissions,
      window: data.proposal.window,
      action,
      patternKey: topScore.patternKey,
      status: 'pending',
      createdAt: Date.now(),
    };

    proposals.value = [...proposals.value, proposal];

    // Show toast immediately via sileo
    updateProposal(proposal.id, { status: 'shown' as ProposalStatus });
    activeAppSuggestion.value = { ...proposal, status: 'shown' };
    lastToastShownAt = Date.now();
    schedulePersist();

    const proposalId = proposal.id;
    const actionLabel = action === 'pin' ? 'Pin to Home' : 'Launch App';
    const notifs = useNotifs();
    notifs.push('suggestion', proposal.name, {
      description: proposal.description,
      action: {
        label: actionLabel,
        handler: () => {
          approve(proposalId).catch(() => {});
        },
      },
      autoExpireMs: 10_000,
      onRemove: (reason) => {
        if (reason === 'dismiss') {
          dismiss(proposalId);
        } else if (reason === 'expire') {
          // Move back to pending, no penalty
          updateProposal(proposalId, { status: 'pending' as ProposalStatus });
          activeAppSuggestion.value = null;
        }
        if (reason === 'action') {
          activeAppSuggestion.value = null;
        }
      },
    });

    debugLog(
      'app-suggestions',
      'checkAndGenerate',
      `Created app proposal: ${proposal.name} (${proposal.id})`
    );
  } catch (err: unknown) {
    logError(
      'app-suggestions',
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

  const registry = createAppRegistry();
  const action = proposal.action ?? 'launch';

  const definition: AppDefinition = {
    id: crypto.randomUUID(),
    name: proposal.name,
    description: proposal.description,
    type: 'html',
    html: proposal.html,
    permissions: proposal.permissions as AppDefinition['permissions'],
    source: 'discovered',
    icon: action === 'pin' ? 'ph:push-pin' : 'ph:lightbulb',
    defaultSize: { w: proposal.window.width, h: proposal.window.height },
    observationContext: proposal.reasoning,
    chromeless: true,
    pinned: action === 'pin' ? true : undefined,
  };

  try {
    await registry.register(definition);
  } catch (err: unknown) {
    logError(
      'app-suggestions',
      'approve:register',
      err instanceof Error ? err : new Error(String(err))
    );
    // Don't mark as approved if registration failed
    activeAppSuggestion.value = null;
    return;
  }

  let instanceId: string | undefined;
  if (action === 'launch') {
    const windowManager = useWindowManager();
    instanceId = windowManager.openWindow(definition);
  }
  // pin action: app is registered with pinned: true, no window opened

  // Update proposal status
  updateProposal(proposalId, {
    status: 'approved' as ProposalStatus,
    approvedAt: Date.now(),
  });

  // Block pattern from re-triggering (large count prevents re-triggering)
  const existingDismissal = dismissals.value.find((d) => d.patternKey === proposal.patternKey);
  if (existingDismissal) {
    dismissals.value = dismissals.value.map((d) =>
      d.patternKey === proposal.patternKey ? { ...d, count: d.count + 100 } : d
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

  activeAppSuggestion.value = null;
  persistImmediate();

  const notifs = useNotifs();
  notifs.push('success', action === 'pin' ? 'App pinned!' : 'App launched!');

  debugLog('app-suggestions', 'approve', `Approved (${action}): ${proposal.name}`, { instanceId });
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

  activeAppSuggestion.value = null;
  persistImmediate();

  debugLog('app-suggestions', 'dismiss', `Dismissed: ${proposal.name}`);
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
// Composable Export
// =============================================================================

export interface UseAppSuggestionsReturn {
  readonly activeAppSuggestion: Readonly<Ref<AppProposal | null>>;
  checkAndGenerate: () => Promise<void>;
  approve: (proposalId: string) => Promise<void>;
  dismiss: (proposalId: string) => void;
  destroy: () => void;
}

export function useAppSuggestions(): UseAppSuggestionsReturn {
  return {
    activeAppSuggestion: readonly(activeAppSuggestion) as Readonly<Ref<AppProposal | null>>,
    checkAndGenerate,
    approve,
    dismiss,
    destroy,
  };
}

export default useAppSuggestions;
