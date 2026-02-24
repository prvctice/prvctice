import { ref, type Ref } from 'vue';

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface NotifAction {
  label: string;
  handler: () => void;
}

export type NotifRemoveReason = 'action' | 'dismiss' | 'expire';

export interface NotifOptions {
  description?: string;
  action?: NotifAction;
  onRemove?: (reason: NotifRemoveReason) => void;
  autoExpireMs?: number;
}

export interface NotifItem {
  id: string;
  kind: string;
  resolvedKind: string;
  text: string;
  description?: string;
  fading: boolean;
  expanded: boolean;
  action?: NotifAction;
  onRemove?: (reason: NotifRemoveReason) => void;
  swipeX: number;
  swiping: boolean;
  createdAt: number;
  totalDelay: number;
}

/* ------------------------------------------------------------------ */
/*  Kind normalisation                                                 */
/* ------------------------------------------------------------------ */

const KIND_MAP: Record<string, string> = {
  success: 'success',
  error: 'error',
  warning: 'warning',
  info: 'info',
  theme: 'info',
  upload: 'info',
  workspace: 'info',
  suggestion: 'info',
  onboarding: 'info',
};

function resolveKind(kind: string): string {
  return KIND_MAP[kind] ?? 'info';
}

/* ------------------------------------------------------------------ */
/*  Singleton                                                          */
/* ------------------------------------------------------------------ */

interface NotifsSingleton {
  items: Ref<NotifItem[]>;
  push: (kind: string, text: string, actionOrOpts?: NotifAction | NotifOptions) => string;
  remove: (id: string, reason?: NotifRemoveReason) => void;
  expand: (id: string) => void;
  collapse: (id: string) => void;
  pauseTimer: (id: string) => void;
  resumeTimer: (id: string) => void;
  updateSwipe: (id: string, x: number) => void;
  commitSwipe: (id: string) => void;
}

let singleton: NotifsSingleton | null = null;

/* Active dismiss timers keyed by notif id */
const timers = new Map<string, ReturnType<typeof setTimeout>>();
/* Remaining delay when timer was paused */
const paused = new Map<string, number>();

const SWIPE_THRESHOLD = 30;

export function useNotifs(): NotifsSingleton {
  if (singleton) return singleton;
  const items: Ref<NotifItem[]> = ref([]);

  /* ---- helpers -------------------------------------------------- */

  function find(id: string): NotifItem | undefined {
    return items.value.find((n) => n.id === id);
  }

  function remove(id: string, reason?: NotifRemoveReason): void {
    clearTimer(id);
    paused.delete(id);
    const idx = items.value.findIndex((n) => n.id === id);
    if (idx >= 0) {
      const item = items.value[idx];
      if (item?.onRemove) {
        try {
          item.onRemove(reason ?? 'dismiss');
        } catch {
          /* swallow */
        }
      }
      items.value.splice(idx, 1);
    }
  }

  function clearTimer(id: string): void {
    const t = timers.get(id);
    if (t !== undefined) {
      clearTimeout(t);
      timers.delete(id);
    }
  }

  function startDismissTimer(id: string, delay: number): void {
    clearTimer(id);
    const item = find(id);
    if (item) {
      item.createdAt = Date.now();
      item.totalDelay = delay;
    }
    timers.set(
      id,
      setTimeout(() => {
        const i = find(id);
        if (!i) return remove(id, 'expire');
        i.fading = true;
        const exitDuration =
          (window.AppSettings && window.AppSettings.notifDismissAnimationMs) || 300;
        setTimeout(() => remove(id, 'expire'), exitDuration);
      }, delay)
    );
  }

  /* ---- push (backwards-compatible overload) --------------------- */

  function push(kind: string, text: string, actionOrOpts?: NotifAction | NotifOptions): string {
    const id =
      (crypto.randomUUID && crypto.randomUUID()) ||
      String(Date.now()) + Math.random().toString(16).slice(2);

    /* Detect legacy NotifAction vs new NotifOptions */
    let action: NotifAction | undefined;
    let description: string | undefined;
    let onRemoveCallback: ((reason: NotifRemoveReason) => void) | undefined;
    let autoExpireMs: number | undefined;

    if (actionOrOpts) {
      if ('handler' in actionOrOpts) {
        /* Legacy: { label, handler } */
        action = actionOrOpts as NotifAction;
      } else {
        /* New: { description?, action?, onRemove?, autoExpireMs? } */
        const opts = actionOrOpts as NotifOptions;
        description = opts.description;
        action = opts.action;
        onRemoveCallback = opts.onRemove;
        autoExpireMs = opts.autoExpireMs;
      }
    }

    const resolvedKind = resolveKind(kind);
    const defaultDelay = (window.AppSettings && window.AppSettings.notifDismissDelay) || 3000;
    const delay = autoExpireMs ?? defaultDelay;

    const item: NotifItem = {
      id,
      kind: kind || 'info',
      resolvedKind,
      text: text || '',
      description,
      fading: false,
      expanded: false,
      action,
      onRemove: onRemoveCallback,
      swipeX: 0,
      swiping: false,
      createdAt: Date.now(),
      totalDelay: delay,
    };

    items.value.push(item);

    /* Auto-expand body after 150 ms if there's a description or action */
    if (description || action) {
      setTimeout(() => {
        const i = find(id);
        if (i && !i.fading) i.expanded = true;
      }, 150);
    }

    /* Error + action: no auto-dismiss (user must act or dismiss) */
    if (kind === 'error' && action) return id;

    startDismissTimer(id, delay);
    return id;
  }

  /* ---- expand / collapse ---------------------------------------- */

  function expand(id: string): void {
    const item = find(id);
    if (item) item.expanded = true;
  }

  function collapse(id: string): void {
    const item = find(id);
    if (item) item.expanded = false;
  }

  /* ---- timer pause / resume (hover) ----------------------------- */

  function pauseTimer(id: string): void {
    const item = find(id);
    if (!item) return;
    const t = timers.get(id);
    if (t === undefined) return; /* already paused or no timer */
    const elapsed = Date.now() - item.createdAt;
    const remaining = Math.max(item.totalDelay - elapsed, 500);
    paused.set(id, remaining);
    clearTimer(id);
  }

  function resumeTimer(id: string): void {
    const remaining = paused.get(id);
    if (remaining === undefined) return;
    paused.delete(id);
    startDismissTimer(id, remaining);
  }

  /* ---- swipe-to-dismiss ----------------------------------------- */

  function updateSwipe(id: string, x: number): void {
    const item = find(id);
    if (!item) return;
    item.swiping = true;
    item.swipeX = x;
  }

  function commitSwipe(id: string): void {
    const item = find(id);
    if (!item) return;
    if (Math.abs(item.swipeX) > SWIPE_THRESHOLD) {
      item.fading = true;
      const exitDuration =
        (window.AppSettings && window.AppSettings.notifDismissAnimationMs) || 300;
      setTimeout(() => remove(id, 'dismiss'), exitDuration);
    } else {
      item.swipeX = 0;
      item.swiping = false;
    }
  }

  /* ---- singleton ------------------------------------------------ */

  singleton = {
    items,
    push,
    remove,
    expand,
    collapse,
    pauseTimer,
    resumeTimer,
    updateSwipe,
    commitSwipe,
  };

  return singleton;
}
