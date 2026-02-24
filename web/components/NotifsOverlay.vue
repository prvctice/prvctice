<template>
  <div role="status" aria-live="polite" aria-atomic="false" class="notifications-region">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      style="position: absolute; width: 0; height: 0; overflow: hidden"
      aria-hidden="true"
    >
      <defs>
        <filter id="sileo-gooey" x="-10%" y="-50%" width="120%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
            result="gooey"
          />
          <feFlood flood-color="#121216" result="fill" />
          <feComposite in="fill" in2="gooey" operator="in" result="gooey-bg" />
          <feComposite in="SourceGraphic" in2="gooey-bg" operator="over" />
        </filter>
      </defs>
    </svg>

    <div
      v-for="n in items"
      :key="n.id"
      class="sileo-toast"
      :class="{
        'is-ready': readyIds.includes(n.id),
        'is-fading': n.fading,
      }"
      :style="{
        '--swipe-x': n.swipeX + 'px',
        transform: n.swiping ? `translateX(${n.swipeX}px)` : undefined,
      }"
      :role="n.resolvedKind === 'error' ? 'alert' : undefined"
      :aria-live="n.resolvedKind === 'error' ? 'assertive' : undefined"
      @pointerenter="pauseTimer(n.id)"
      @pointerleave="resumeTimer(n.id)"
      @pointerdown="onSwipeStart($event, n.id)"
    >
      <div class="sileo-toast__gooey-wrap">
        <div class="sileo-toast__pill">
          <span class="sileo-toast__badge" :class="'sileo-toast__badge--' + n.resolvedKind">
            <svg
              v-if="n.resolvedKind === 'success'"
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="6 13 10 17 18 7" />
            </svg>
            <svg
              v-else-if="n.resolvedKind === 'error'"
              viewBox="0 0 24 24"
              width="11"
              height="11"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
            >
              <line x1="7" y1="7" x2="17" y2="17" />
              <line x1="17" y1="7" x2="7" y2="17" />
            </svg>
            <svg
              v-else-if="n.resolvedKind === 'warning'"
              viewBox="0 0 24 24"
              width="11"
              height="11"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
            >
              <line x1="12" y1="8" x2="12" y2="15" />
              <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              width="11"
              height="11"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          </span>
          <span
            class="sileo-toast__title"
            :class="'sileo-toast__title--' + n.resolvedKind"
            v-html="render(n.text)"
          ></span>
        </div>
        <div v-if="n.description || n.action" class="sileo-toast__body">
          <p v-if="n.description" class="sileo-toast__desc" v-html="render(n.description)"></p>
          <div v-if="n.action" class="sileo-toast__actions" @click.stop @pointerdown.stop>
            <button type="button" class="sileo-toast__action-btn" @click="handleAction(n)">
              {{ n.action.label }}
            </button>
            <button
              type="button"
              class="sileo-toast__dismiss-btn"
              aria-label="Dismiss"
              @click="remove(n.id, 'dismiss')"
            >
              &times;
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, inject } from 'vue';
import { useNotifs, type NotifItem } from '@web/composables/useNotifs.js';
import { PRVCTICE_MARKDOWN_RENDERER, PRVCTICE_SANITIZE_HTML } from '@web/plugin/keys.js';

type RenderFunction = (html: string) => string;
type SanitizeFunction = (html: string) => string;

interface Props {
  renderHtml?: RenderFunction | null;
  sanitizeHtml?: SanitizeFunction | null;
}

declare global {
  interface Window {
    marked?: { parse: (md: string) => string };
    DOMPurify?: { sanitize: (html: string) => string };
  }
}

const props = withDefaults(defineProps<Props>(), {
  renderHtml: null,
  sanitizeHtml: null,
});

const { items, remove, pauseTimer, resumeTimer, updateSwipe, commitSwipe } = useNotifs();

const injectedRender = inject<RenderFunction | undefined>(PRVCTICE_MARKDOWN_RENDERER, undefined);
const injectedSanitize = inject<SanitizeFunction | undefined>(PRVCTICE_SANITIZE_HTML, undefined);

/* ---- enter animation: mark items ready after paint ------------ */
const readyIds = ref<string[]>([]);
const knownIds = new Set<string>();

watch(
  items,
  (list) => {
    for (const n of list) {
      if (knownIds.has(n.id)) continue;
      knownIds.add(n.id);
      const id = n.id;
      nextTick(() => {
        requestAnimationFrame(() => {
          readyIds.value = [...readyIds.value, id];
        });
      });
    }
  },
  { deep: true }
);

/* ---- render helpers ------------------------------------------- */

function escapeHtml(str: string): string {
  return String(str).replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c] || c
  );
}

function render(md: string): string {
  try {
    let html = String(md || '');
    const r = props.renderHtml || injectedRender;
    const s = props.sanitizeHtml || injectedSanitize;
    if (typeof r === 'function') html = r(html);
    else if (
      typeof window !== 'undefined' &&
      window.marked &&
      typeof window.marked.parse === 'function'
    )
      html = window.marked.parse(html);
    if (typeof s === 'function') return s(html);
    if (typeof window !== 'undefined' && window.DOMPurify && window.DOMPurify.sanitize)
      return window.DOMPurify.sanitize(html);
    return escapeHtml(html);
  } catch {
    return escapeHtml(String(md || ''));
  }
}

function handleAction(item: NotifItem): void {
  if (item.action?.handler) item.action.handler();
  remove(item.id, 'action');
}

/* ---- swipe-to-dismiss ----------------------------------------- */

let swipeId: string | null = null;
let swipeStartX = 0;

function onSwipeStart(e: PointerEvent, id: string): void {
  swipeId = id;
  swipeStartX = e.clientX;
  const target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);
  target.addEventListener('pointermove', onSwipeMove);
  target.addEventListener('pointerup', onSwipeEnd);
  target.addEventListener('pointercancel', onSwipeEnd);
}

function onSwipeMove(e: PointerEvent): void {
  if (!swipeId) return;
  updateSwipe(swipeId, e.clientX - swipeStartX);
}

function onSwipeEnd(e: PointerEvent): void {
  if (!swipeId) return;
  const target = e.currentTarget as HTMLElement;
  target.releasePointerCapture(e.pointerId);
  target.removeEventListener('pointermove', onSwipeMove);
  target.removeEventListener('pointerup', onSwipeEnd);
  target.removeEventListener('pointercancel', onSwipeEnd);
  commitSwipe(swipeId);
  swipeId = null;
}
</script>
