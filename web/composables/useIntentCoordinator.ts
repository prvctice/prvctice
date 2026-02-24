import { ref, shallowRef, computed, type Ref, type ShallowRef, type ComputedRef } from 'vue';
import { debugLog, logError } from '@web/utils/debugLog.js';

interface ZoneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type ZoneDefinition = ZoneRect | string | (() => ZoneRect | null) | null;

interface Position {
  x: number;
  y: number;
}

interface Intent {
  source: string;
  action: string;
  target?: string;
  position?: Position;
  value?: unknown;
  timestamp?: number;
}

interface IntentWithTimestamp extends Intent {
  timestamp: number;
  resolvedTarget?: string | null;
}

interface Target {
  id: string;
  zone: ZoneDefinition;
  actions: string[];
  priority: number;
  enabled: boolean;
  handler: (intent: IntentWithTimestamp) => void;
}

interface RegisterTargetOptions {
  zone?: ZoneDefinition;
  actions?: string[];
  priority?: number;
  handler: (intent: IntentWithTimestamp) => void;
}

interface ScoredCandidate {
  id: string;
  target: Target;
  inside: boolean;
  distance: number;
  score: number;
}

interface ZoneRectInfo {
  id: string;
  rect: ZoneRect;
  actions: string[];
}

type BeforeEmitCallback = (intent: Intent) => Intent | null;
type AfterEmitCallback = (intent: IntentWithTimestamp, target: Target | null) => void;

interface IntentState {
  activeTarget: string | null;
  lastIntent: IntentWithTimestamp | null;
  isDragging: boolean;
  dragSource: string | null;
}

type StateCallback = (state: IntentState) => void;

interface IntentCoordinator {
  targets: ShallowRef<Map<string, Target>>;
  history: Ref<IntentWithTimestamp[]>;
  debugVisible: Ref<boolean>;
  activeTargetId: ComputedRef<string | null>;
  state: Ref<IntentState>;
  registerTarget: (id: string, options: RegisterTargetOptions) => void;
  unregisterTarget: (id: string) => void;
  enableTarget: (id: string) => void;
  disableTarget: (id: string) => void;
  emit: (intent: Intent) => { intent: IntentWithTimestamp; target: Target | null } | null;
  showDebug: (show?: boolean) => void;
  toggleDebug: () => void;
  getHistory: () => IntentWithTimestamp[];
  getTargets: () => Map<string, Target>;
  getActiveTarget: (position: Position | null) => Target | null;
  getAllZoneRects: () => ZoneRectInfo[];
  isInsideZone: (px: number, py: number, zone: ZoneDefinition) => boolean;
  distanceToZone: (px: number, py: number, zone: ZoneDefinition) => number;
  getZoneRect: (zone: ZoneDefinition) => ZoneRect | null;
  onBeforeEmit: (cb: BeforeEmitCallback) => () => void;
  onAfterEmit: (cb: AfterEmitCallback) => () => void;
  subscribe: (cb: StateCallback) => () => void;
}

// Runtime subset exposed on window in all modes
interface IntentCoordinatorRuntime {
  registerTarget: (id: string, options: RegisterTargetOptions) => void;
  unregisterTarget: (id: string) => void;
  enableTarget: (id: string) => void;
  disableTarget: (id: string) => void;
  emit: (intent: Intent) => { intent: IntentWithTimestamp; target: Target | null } | null;
}

const targets: ShallowRef<Map<string, Target>> = shallowRef(new Map());
const history: Ref<IntentWithTimestamp[]> = ref([]);
const debugVisible: Ref<boolean> = ref(false);
const MAX_HISTORY = 50;
const beforeEmitCallbacks: Set<BeforeEmitCallback> = new Set();
const afterEmitCallbacks: Set<AfterEmitCallback> = new Set();
const state: Ref<IntentState> = ref({
  activeTarget: null,
  lastIntent: null,
  isDragging: false,
  dragSource: null,
});
const stateCallbacks: Set<StateCallback> = new Set();
const activeTargetId: ComputedRef<string | null> = computed(() => state.value.activeTarget);

function onBeforeEmit(cb: BeforeEmitCallback): () => void {
  beforeEmitCallbacks.add(cb);
  return () => beforeEmitCallbacks.delete(cb);
}

function onAfterEmit(cb: AfterEmitCallback): () => void {
  afterEmitCallbacks.add(cb);
  return () => afterEmitCallbacks.delete(cb);
}

function subscribe(cb: StateCallback): () => void {
  stateCallbacks.add(cb);
  return () => stateCallbacks.delete(cb);
}

function updateState(updates: Partial<IntentState>): void {
  state.value = { ...state.value, ...updates };
  for (const cb of stateCallbacks) {
    try {
      cb(state.value);
    } catch (err) {
      logError('skills', 'intent:stateCallback', err as Error);
    }
  }
}

function getZoneRect(zone: ZoneDefinition): ZoneRect | null {
  if (!zone) return null;
  if (typeof zone === 'function') return zone();
  if (typeof zone === 'string') {
    const el = document.querySelector(zone);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  }
  return zone;
}

function isInsideRect(px: number, py: number, rect: ZoneRect): boolean {
  return px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height;
}

function distanceToRect(px: number, py: number, rect: ZoneRect): number {
  if (isInsideRect(px, py, rect)) return 0;
  const cx = Math.max(rect.x, Math.min(px, rect.x + rect.width));
  const cy = Math.max(rect.y, Math.min(py, rect.y + rect.height));
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
}

function isInsideZone(px: number, py: number, zone: ZoneDefinition): boolean {
  const rect = getZoneRect(zone);
  if (!rect) return false;
  return isInsideRect(px, py, rect);
}

function distanceToZone(px: number, py: number, zone: ZoneDefinition): number {
  const rect = getZoneRect(zone);
  if (!rect) return Infinity;
  return distanceToRect(px, py, rect);
}

// Inside targets get a large bonus to always rank above outside targets
const INSIDE_BONUS = 1000;
// Maximum grace distance for considering outside-zone targets
const MAX_GRACE = 150;
// Each priority level is worth this many points
const PRIORITY_WEIGHT = 100;

function scoreSpatialCandidate(candidate: {
  inside: boolean;
  distance: number;
  target: Target;
}): number {
  const insideScore = candidate.inside ? INSIDE_BONUS : 0;
  const distanceScore = Math.max(0, MAX_GRACE - candidate.distance);
  const priorityScore = candidate.target.priority * PRIORITY_WEIGHT;
  return insideScore + distanceScore + priorityScore;
}

let lastLogTime = 0;

function resolveExplicitTarget(intent: Intent, map: Map<string, Target>): Target | null {
  if (!intent.target) return null;
  const t = map.get(intent.target);
  if (t && t.enabled && t.actions.includes(intent.action)) return t;
  return null;
}

function resolveTargetSpatial(
  x: number,
  y: number,
  action: string,
  map: Map<string, Target>
): { target: Target | null; candidates: ScoredCandidate[] } {
  const rectCache = new Map<string, ZoneRect | null>();

  const resolveCachedRect = (id: string, zone: ZoneDefinition): ZoneRect | null => {
    if (rectCache.has(id)) return rectCache.get(id)!;
    const rect = getZoneRect(zone);
    rectCache.set(id, rect);
    return rect;
  };

  const candidates: ScoredCandidate[] = [];

  for (const [id, t] of map.entries()) {
    if (!t.enabled || !t.zone || !t.actions.includes(action)) continue;

    const rect = resolveCachedRect(id, t.zone);
    if (!rect) continue;

    const inside = isInsideRect(x, y, rect);
    const distance = inside ? 0 : distanceToRect(x, y, rect);

    if (!inside && distance >= MAX_GRACE) continue;

    const score = scoreSpatialCandidate({ inside, distance, target: t });
    candidates.push({ id, target: t, inside, distance, score });
  }

  candidates.sort((a, b) => b.score - a.score);

  const now = Date.now();
  if (!lastLogTime || now - lastLogTime > 500) {
    lastLogTime = now;

    const debugZones: Array<{ id: string; rect: string }> = [];
    for (const [id, t] of map.entries()) {
      if (t.enabled && t.zone && t.actions.includes(action)) {
        const rect = resolveCachedRect(id, t.zone);
        debugZones.push({
          id,
          rect: rect
            ? `${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)}`
            : 'null',
        });
      }
    }

    debugLog('skills', 'intent:resolve', {
      position: { x: Math.round(x), y: Math.round(y) },
      zones: debugZones,
      candidates: candidates.map((c) => ({
        id: c.id,
        inside: c.inside,
        dist: Math.round(c.distance),
        score: Math.round(c.score),
      })),
      winner: candidates[0]?.id || '(none)',
    });
  }

  return { target: candidates[0]?.target || null, candidates };
}

function resolveTarget(intent: Intent): Target | null {
  const map = targets.value;

  const explicitMatch = resolveExplicitTarget(intent, map);
  if (explicitMatch) return explicitMatch;

  if (intent.position) {
    const { target } = resolveTargetSpatial(
      intent.position.x,
      intent.position.y,
      intent.action,
      map
    );
    return target;
  }

  return null;
}

function registerTarget(
  id: string,
  { zone = null, actions = [], priority = 0, handler }: RegisterTargetOptions
): void {
  const map = new Map(targets.value);
  map.set(id, { id, zone, actions, priority, enabled: true, handler });
  targets.value = map;

  debugLog('skills', 'intent:registerTarget', { id, actions, priority, hasZone: !!zone });
}

function unregisterTarget(id: string): void {
  const map = new Map(targets.value);
  map.delete(id);
  targets.value = map;

  debugLog('skills', 'intent:unregisterTarget', { id });
}

function enableTarget(id: string): void {
  const t = targets.value.get(id);
  if (t && !t.enabled) {
    const map = new Map(targets.value);
    map.set(id, { ...t, enabled: true });
    targets.value = map;
  }
}

function disableTarget(id: string): void {
  const t = targets.value.get(id);
  if (t && t.enabled) {
    const map = new Map(targets.value);
    map.set(id, { ...t, enabled: false });
    targets.value = map;
  }
}

function emit(intent: Intent): { intent: IntentWithTimestamp; target: Target | null } | null {
  let processedIntent: Intent = intent;
  for (const cb of beforeEmitCallbacks) {
    try {
      const result = cb(processedIntent);
      if (result === null) {
        debugLog('skills', 'intent:cancelled', { source: intent.source, action: intent.action });
        return null;
      }
      processedIntent = result;
    } catch (err) {
      logError('skills', 'intent:beforeEmit', err as Error);
    }
  }

  const fullIntent: IntentWithTimestamp = {
    source: processedIntent.source,
    action: processedIntent.action,
    target: processedIntent.target,
    position: processedIntent.position,
    value: processedIntent.value,
    timestamp: processedIntent.timestamp || Date.now(),
  };

  const target = resolveTarget(fullIntent);

  debugLog('skills', `intent:emit:${fullIntent.source}:${fullIntent.action}`, {
    target: target?.id || fullIntent.target || '(none)',
    value: fullIntent.value,
    position: fullIntent.position,
    resolved: !!target,
  });

  history.value = [
    { ...fullIntent, resolvedTarget: target?.id || null },
    ...history.value.slice(0, MAX_HISTORY - 1),
  ];

  if (target && typeof target.handler === 'function') {
    try {
      target.handler(fullIntent);
    } catch (err) {
      logError('skills', `intent:handler:${target.id}`, err as Error);
    }
  }

  for (const cb of afterEmitCallbacks) {
    try {
      cb(fullIntent, target);
    } catch (err) {
      logError('skills', 'intent:afterEmit', err as Error);
    }
  }

  const isDragStart = ['drag', 'dragstart', 'grab'].includes(fullIntent.action);
  const isDragEnd = ['dragend', 'release'].includes(fullIntent.action);

  updateState({
    activeTarget: target?.id || null,
    lastIntent: fullIntent,
    isDragging: isDragEnd ? false : isDragStart ? true : state.value.isDragging,
    dragSource: isDragEnd ? null : isDragStart ? fullIntent.source : state.value.dragSource,
  });

  return { intent: fullIntent, target };
}

function showDebug(show: boolean = true): void {
  debugVisible.value = show;
}

function toggleDebug(): void {
  debugVisible.value = !debugVisible.value;
}

function getHistory(): IntentWithTimestamp[] {
  return history.value;
}

function getTargets(): Map<string, Target> {
  return targets.value;
}

function getActiveTarget(position: Position | null): Target | null {
  if (!position) return null;
  const fakeIntent: Intent = { source: 'debug', position, action: 'move' };
  const target = resolveTarget(fakeIntent);
  updateState({ ...state.value, activeTarget: target?.id || null });
  return target;
}

function getAllZoneRects(): ZoneRectInfo[] {
  const rects: ZoneRectInfo[] = [];
  for (const [id, t] of targets.value) {
    if (t.zone) {
      const rect = getZoneRect(t.zone);
      if (rect) {
        rects.push({ id, rect, actions: t.actions });
      }
    }
  }
  return rects;
}

if (typeof window !== 'undefined') {
  // Runtime methods needed by useSpeech and other modules at runtime
  const runtime: IntentCoordinatorRuntime = {
    registerTarget,
    unregisterTarget,
    enableTarget,
    disableTarget,
    emit,
  };

  if (import.meta.env.DEV) {
    // Expose full coordinator for console debugging in development
    (window as Window & { intentCoordinator?: IntentCoordinator }).intentCoordinator = {
      ...runtime,
      targets,
      history,
      debugVisible,
      activeTargetId,
      state,
      showDebug,
      toggleDebug,
      getHistory,
      getTargets,
      getActiveTarget,
      getAllZoneRects,
      isInsideZone,
      distanceToZone,
      getZoneRect,
      onBeforeEmit,
      onAfterEmit,
      subscribe,
    };
  } else {
    window.intentCoordinator = runtime;
  }
}

export function useIntentCoordinator(): IntentCoordinator {
  return {
    targets,
    history,
    debugVisible,
    activeTargetId,
    state,

    registerTarget,
    unregisterTarget,
    enableTarget,
    disableTarget,
    emit,
    showDebug,
    toggleDebug,
    getHistory,
    getTargets,
    getActiveTarget,
    getAllZoneRects,

    isInsideZone,
    distanceToZone,
    getZoneRect,

    onBeforeEmit,
    onAfterEmit,
    subscribe,
  };
}

export default useIntentCoordinator;
