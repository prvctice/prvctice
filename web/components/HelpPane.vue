<template>
  <BaseSidePanel
    ref="panelRef"
    id="help"
    title="Help & Tips"
    subtitle="Discover the gestures, voice phrases, and pro moves that power Prvctice. Keep this guide close whenever you need a refresher."
    aria-label="Help and tips"
    show-close-button
    :hides-on-open="['notes', 'about', 'voice-commands']"
    keyboard-shortcut="h"
    toggle-button-id="help-toggle-button"
    global-name="Help"
    :extra-globals="{ showHelpTip }"
  >
    <template #toolbar>
      <div class="help-pane-toolbar">
        <nav class="help-filter-chips" aria-label="Filter help topics">
          <Motion
            v-for="option in filterOptions"
            :key="option.id"
            tag="button"
            class="help-chip"
            :class="{ 'is-active': activeFilter === option.id, 'is-disabled': option.disabled }"
            type="button"
            :disabled="option.disabled"
            :initial="chipInitial()"
            :animate="chipAnimate()"
            :transition="chipTransition(option.order)"
            @click="setFilter(option.id)"
          >
            <span>{{ option.label }}</span>
            <span v-if="option.count !== null" class="help-chip-count">{{ option.count }}</span>
          </Motion>
        </nav>
        <div class="help-hotkey">
          <span class="help-hotkey-key">&#x2318;&#x21E7;H</span>
          <span>Toggle Help</span>
        </div>
      </div>
    </template>

    <template v-if="filteredSections.length">
      <section
        v-for="section in filteredSections"
        :key="section.id"
        class="help-section"
        :aria-labelledby="`help-section-${section.id}`"
      >
        <div class="help-section-header">
          <div>
            <h3 :id="`help-section-${section.id}`">{{ section.label }}</h3>
            <p class="help-section-description">{{ section.description }}</p>
          </div>
        </div>
        <ul class="help-tip-list">
          <Motion
            v-for="(tip, idx) in section.tips"
            :key="tip.id"
            tag="li"
            class="help-tip"
            :class="{ 'is-highlighted': highlightTipId === tip.id }"
            :initial="cardInitial(idx)"
            :animate="cardAnimate()"
            :transition="cardTransition(idx)"
            :ref="registerCardRef(tip.id)"
            role="button"
            tabindex="0"
            @click="focusTip(tip.id)"
            @keydown.enter.prevent="focusTip(tip.id)"
            @keydown.space.prevent="focusTip(tip.id)"
          >
            <div class="help-tip-row">
              <span class="help-tip-icon">
                <iconify-icon :icon="tip.icon"></iconify-icon>
              </span>
              <div class="help-tip-content">
                <span class="help-tip-title">{{ tip.title }}</span>
                <span class="help-tip-summary">{{ tip.summary }}</span>
                <span v-if="tip.badges?.length" class="help-tip-badges">
                  <span v-for="badge in tip.badges" :key="badge" class="help-badge"
                    >#{{ badge }}</span
                  >
                </span>
              </div>
            </div>
          </Motion>
        </ul>
      </section>
    </template>
    <BaseEmptyState
      v-else
      icon="ph:magnifying-glass"
      title="No matching topics"
      description="Try adjusting your filter or browse all tips"
      size="md"
    />
  </BaseSidePanel>
</template>

<script setup lang="ts">
import {
  computed,
  ref,
  nextTick,
  onMounted,
  onBeforeUnmount,
  type ComponentPublicInstance,
} from 'vue';
import { Motion } from '@motionone/vue';
import type { AnimationOptionsWithOverrides } from '@motionone/dom';
import { useMotionPreferences } from '@web/composables/useMotion.js';
import { useIntentCoordinator } from '@web/composables/useIntentCoordinator.js';
import { helpSections, helpTipMap } from '@web/data/helpTips.js';
import BaseSidePanel from './BaseSidePanel.vue';
import BaseEmptyState from './ui/BaseEmptyState.vue';

interface HelpTip {
  id: string;
  title: string;
  summary: string;
  icon: string;
  badges?: string[];
  sectionId?: string;
}

interface HelpSection {
  id: string;
  label: string;
  description: string;
  tips: HelpTip[];
}

interface FilterOption {
  id: string;
  label: string;
  count: number | null;
  disabled: boolean;
  order: number;
}

const panelRef = ref<InstanceType<typeof BaseSidePanel> | null>(null);
const activeFilter = ref('all');
const highlightTipId = ref<string | null>(null);
const cardRefs = new Map<string, HTMLElement>();
const { reduceMotion } = useMotionPreferences();

// Filter options
const totalTips = computed(() =>
  (helpSections as HelpSection[]).reduce(
    (sum: number, section: HelpSection) => sum + section.tips.length,
    0
  )
);

const filterOptions = computed((): FilterOption[] => {
  const options = [
    { id: 'all', label: 'All tips', count: totalTips.value, disabled: false },
    ...(helpSections as HelpSection[]).map((section: HelpSection) => ({
      id: section.id,
      label: section.label,
      count: section.tips.length,
      disabled: false,
    })),
  ];
  return options.map((option, index) => ({ ...option, order: index }));
});

const filteredSections = computed((): HelpSection[] => {
  if (activeFilter.value === 'all') return helpSections as HelpSection[];
  const section = (helpSections as HelpSection[]).find(
    (s: HelpSection) => s.id === activeFilter.value
  );
  return section ? [section] : (helpSections as HelpSection[]);
});

// Animation helpers
function chipInitial(): { opacity: number; y: number } {
  return reduceMotion.value ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 };
}

function chipAnimate(): { opacity: number; y: number } {
  return { opacity: 1, y: 0 };
}

function chipTransition(order: number): AnimationOptionsWithOverrides {
  if (reduceMotion.value) return { duration: 0 };
  return {
    duration: 0.28,
    delay: order * 0.04,
    easing: 'ease-out',
  } as AnimationOptionsWithOverrides;
}

function cardInitial(_index: number): { opacity: number; y: number } {
  if (reduceMotion.value) return { opacity: 1, y: 0 };
  return { opacity: 0, y: 18 };
}

function cardAnimate(): { opacity: number; y: number } {
  return { opacity: 1, y: 0 };
}

function cardTransition(index: number): AnimationOptionsWithOverrides {
  if (reduceMotion.value) return { duration: 0 };
  return {
    duration: 0.42,
    delay: index * 0.05,
    easing: 'ease-out',
  } as AnimationOptionsWithOverrides;
}

function registerCardRef(tipId: string): (el: Element | ComponentPublicInstance | null) => void {
  return (el: Element | ComponentPublicInstance | null) => {
    if (el && el instanceof HTMLElement) cardRefs.set(tipId, el);
    else cardRefs.delete(tipId);
  };
}

function setFilter(id: string): void {
  if (id === activeFilter.value) return;
  activeFilter.value = id;
}

async function focusTip(tipId: string): Promise<void> {
  const tip = helpTipMap.get(tipId);
  if (!tip) return;
  if (activeFilter.value !== 'all' && activeFilter.value !== tip.sectionId) {
    activeFilter.value = tip.sectionId;
  }
  await nextTick();
  const node = cardRefs.get(tipId);
  if (node) {
    try {
      node.scrollIntoView({
        behavior: reduceMotion.value ? 'auto' : 'smooth',
        block: 'center',
      });
    } catch (_) {}
  }
  highlightTipId.value = tipId;
  setTimeout(() => {
    if (highlightTipId.value === tipId) highlightTipId.value = null;
  }, 1400);
}

// Global function for external access
function showHelpTip(id: string): void {
  panelRef.value?.open(true);
  focusTip(id);
}

// Intent coordinator registration for voice commands
const { registerTarget, unregisterTarget } = useIntentCoordinator();

onMounted(() => {
  registerTarget('help', {
    zone: null,
    actions: ['toggle', 'set'],
    handler: (intent) => {
      if (intent.action === 'toggle') {
        panelRef.value?.toggle();
      } else if (intent.action === 'set') {
        if (intent.value === true || intent.value === 'open') {
          panelRef.value?.open();
        } else {
          panelRef.value?.close();
        }
      }
    },
  });
});

onBeforeUnmount(() => {
  unregisterTarget('help');
});

// Expose panel controls
defineExpose({
  open: (force?: boolean, options?: { skipAnimation?: boolean }) =>
    panelRef.value?.open(force, options),
  close: (options?: { force?: boolean; skipAnimation?: boolean; keepSplitMode?: boolean }) =>
    panelRef.value?.close(options),
  toggle: (options?: { force?: boolean; skipAnimation?: boolean; keepSplitMode?: boolean }) =>
    panelRef.value?.toggle(options),
  get visible() {
    return panelRef.value?.visible;
  },
  showHelpTip,
});
</script>
