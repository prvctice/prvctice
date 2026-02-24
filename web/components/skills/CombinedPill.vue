<template>
  <div
    class="combined-pill"
    :style="pillStyle"
    tabindex="0"
    role="button"
    :aria-label="`Combined skill: ${skill.title}`"
    :aria-expanded="isExpanded"
    @click="handleClick"
    @keydown.enter="handleClick"
    @keydown.space.prevent="handleClick"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- Arrow-separated format: Skill A → Skill B -->
    <div class="combined-pill__content">
      <template v-for="(step, index) in allSteps" :key="step.id">
        <span class="combined-pill__item-title">{{ step.title }}</span>
        <span v-if="index < allSteps.length - 1" class="combined-pill__arrow">→</span>
      </template>
    </div>

    <!-- Expanded view: shows all steps with details -->
    <Transition name="expand">
      <div v-if="isExpanded" class="combined-pill__steps">
        <div v-for="(step, index) in allSteps" :key="step.id" class="combined-pill__step">
          <span class="combined-pill__step-number">{{ index + 1 }}</span>
          <span class="combined-pill__step-dot" :style="{ backgroundColor: step.dotColor }" />
          <iconify-icon v-if="step.icon" :icon="step.icon" class="combined-pill__step-icon" />
          <span class="combined-pill__step-title">{{ step.title }}</span>
          <span class="combined-pill__step-type">{{ step.type }}</span>
        </div>
      </div>
    </Transition>

    <!-- Uncombine button (visible on hover) -->
    <Transition name="fade">
      <button
        v-if="isHovered && canUncombine"
        class="combined-pill__uncombine"
        @click.stop="handleUncombine"
        title="Uncombine"
      >
        <iconify-icon icon="ph:arrows-out-simple" />
      </button>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSkillCoordinator } from '@web/composables/useSkillCoordinator';
import type { SkillV2 } from '@web/types/skills';

interface Props {
  /** The combined skill to display */
  skill: SkillV2;
  /** Whether the pill is interactive (can expand/uncombine) */
  interactive?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  interactive: true,
});

const emit = defineEmits<{
  (e: 'click', skill: SkillV2): void;
  (e: 'uncombine', components: SkillV2[]): void;
}>();

const coordinator = useSkillCoordinator();

const isHovered = ref(false);
const isExpanded = ref(false);

// Color dot palette (12 distinct colors)
const DOT_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#d946ef', // Magenta
  '#ec4899', // Pink
  '#78716c', // Stone
  '#64748b', // Slate
];

/**
 * Generate a consistent color index from a skill ID
 */
function getColorIndex(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % DOT_COLORS.length;
}

/**
 * Get the dot color for a skill
 */
function getDotColor(id: string, existingColor?: string): string {
  if (existingColor) return existingColor;
  return DOT_COLORS[getColorIndex(id)] ?? '#64748b';
}

/**
 * Blend two hex colors together
 */
function blendColors(color1: string, color2: string): string {
  const hex1 = color1.replace('#', '');
  const hex2 = color2.replace('#', '');

  const r1 = parseInt(hex1.slice(0, 2), 16);
  const g1 = parseInt(hex1.slice(2, 4), 16);
  const b1 = parseInt(hex1.slice(4, 6), 16);

  const r2 = parseInt(hex2.slice(0, 2), 16);
  const g2 = parseInt(hex2.slice(2, 4), 16);
  const b2 = parseInt(hex2.slice(4, 6), 16);

  // Average the colors
  const r = Math.round((r1 + r2) / 2);
  const g = Math.round((g1 + g2) / 2);
  const b = Math.round((b1 + b2) / 2);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Computed: get all step skills with their data
interface StepData {
  id: string;
  title: string;
  icon?: string;
  dotColor: string;
  type: string;
}

const allSteps = computed((): StepData[] => {
  const steps = props.skill.chainConfig?.steps ?? [];
  return steps.map((step): StepData => {
    const skill = coordinator.getSkill(step.skillId);
    if (!skill) {
      return {
        id: step.skillId,
        title: 'Unknown',
        dotColor: DOT_COLORS[0] ?? '#64748b',
        type: 'unknown',
      };
    }
    return {
      id: skill.id,
      title: skill.title,
      icon: skill.icon,
      dotColor: getDotColor(skill.id, skill.color),
      type: skill.type,
    };
  });
});

// Computed: blended background color from all steps' dot colors
const blendedBackground = computed(() => {
  const steps = allSteps.value;
  if (steps.length === 0) return '#1a1a24';

  const firstStep = steps[0];
  if (!firstStep) return '#1a1a24';
  if (steps.length === 1) return firstStep.dotColor;

  // Blend all step colors together
  let result = firstStep.dotColor;
  for (let i = 1; i < steps.length; i++) {
    const step = steps[i];
    if (step) {
      result = blendColors(result, step.dotColor);
    }
  }
  return result;
});

// Computed: pill style with blended background
const pillStyle = computed(() => ({
  backgroundColor: blendedBackground.value,
}));

// Computed: whether this can be uncombined
const canUncombine = computed(() => {
  return props.interactive && props.skill.source === 'combined' && props.skill.parentIds;
});

// Handlers
function handleClick(): void {
  if (props.interactive) {
    isExpanded.value = !isExpanded.value;
  }
  emit('click', props.skill);
}

function handleUncombine(): void {
  const components = coordinator.uncombine(props.skill);
  emit('uncombine', components);
}
</script>

<style scoped>
.combined-pill {
  position: relative;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  user-select: none;
  padding: var(--space-4) var(--space-6);
  border-radius: var(--radius-pill);
  border: 1px solid var(--color-pill-border);
  transition:
    transform var(--duration-short) var(--motion-ease-hover),
    filter var(--duration-short) var(--motion-ease-hover),
    box-shadow var(--duration-short) var(--motion-ease-hover);
}

.combined-pill__content {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.combined-pill__item-title {
  font-family: var(--font-family-sans);
  font-size: var(--font-size-sm);
  font-weight: 600;
  white-space: nowrap;
  color: var(--color-pill-title);
}

.combined-pill__arrow {
  font-size: 14px;
  color: var(--color-pill-title);
  opacity: 0.9;
  flex-shrink: 0;
  margin: 0 var(--space-3);
}

/* Hover state */
.combined-pill:hover {
  filter: brightness(1.08);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
  transform: translateY(-1px);
}

.combined-pill:active {
  transform: scale(0.98);
}

.combined-pill:focus-visible {
  outline: 2px solid var(--color-focus-ring, rgba(0, 125, 200, 0.6));
  outline-offset: 2px;
}

/* Expanded state */
.combined-pill--expanded {
  box-shadow: 0 0 20px color-mix(in srgb, var(--color-chain-accent) 30%, transparent);
}

/* Steps list (expanded view) */
.combined-pill__steps {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-4);
  padding: var(--space-4);
  background: var(--color-surface-elevated);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-pill-border);
}

.combined-pill__step {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--color-step-bg);
  border-radius: var(--radius-sm);
}

.combined-pill__step-number {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--color-step-number);
  min-width: 16px;
}

.combined-pill__step-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.combined-pill__step-icon {
  font-size: var(--font-size-sm);
  color: var(--color-step-icon);
}

.combined-pill__step-title {
  flex: 1;
  font-size: var(--font-size-xs);
  color: var(--color-step-title);
}

.combined-pill__step-type {
  font-size: var(--font-size-xs);
  color: var(--color-step-type);
  text-transform: lowercase;
}

/* Uncombine button */
.combined-pill__uncombine {
  position: absolute;
  top: -8px;
  right: -8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: var(--color-uncombine-bg);
  border: none;
  border-radius: 50%;
  color: var(--color-toggle-thumb);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition:
    background-color var(--duration-short) var(--motion-ease-standard),
    transform var(--duration-short) var(--motion-ease-standard);
}

.combined-pill__uncombine:hover {
  background: var(--color-uncombine-bg-hover);
  transform: scale(1.1);
}

.combined-pill__uncombine:focus-visible {
  outline: 2px solid var(--color-focus-ring, rgba(0, 125, 200, 0.6));
  outline-offset: 2px;
}

/* Transitions */
.expand-enter-active,
.expand-leave-active {
  transition:
    opacity var(--duration-medium) var(--motion-ease-standard),
    max-height var(--duration-medium) var(--motion-ease-standard);
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 200px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--duration-short) var(--motion-ease-standard);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .expand-enter-active,
  .expand-leave-active,
  .fade-enter-active,
  .fade-leave-active {
    transition: none;
  }

  .combined-pill:hover {
    transform: none;
  }
}
</style>
