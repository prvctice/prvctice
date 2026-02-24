<template>
  <Teleport to="body">
    <div
      v-for="highlight in activeHighlights"
      :key="highlight.zone.id"
      class="zone-highlight"
      :class="[
        highlight.zone.highlightClass,
        {
          'zone-highlight--active': highlight.isActive,
          'zone-highlight--near': highlight.isNear && !highlight.isActive,
          'zone-highlight--incompatible': !highlight.accepts,
        },
      ]"
      :style="highlight.style"
    >
      <div class="zone-highlight__label">
        <iconify-icon v-if="highlight.icon" :icon="highlight.icon" class="zone-highlight__icon" />
        <span class="zone-highlight__text">{{ highlight.zone.label }}</span>
      </div>
      <div class="zone-highlight__ring" :style="{ '--attraction': highlight.attraction }" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, watch, onMounted, onBeforeUnmount, ref } from 'vue';
import { useSkillPhysics, type ZoneProximity, type Rect } from '@web/composables/useSkillPhysics';
import type { ZoneDefinition } from '@web/types/skills';

// Zone icon mapping (can be extended)
const ZONE_ICONS: Record<string, string> = {
  'input-bar': 'ph:paper-plane-tilt',
  'notes-pane': 'ph:note',
  'notes-panel': 'ph:note',
  'time-widget': 'ph:clock',
  dotmatrix: 'ph:hand',
  'side-menu': 'ph:list',
  trash: 'ph:trash',
};

interface HighlightData {
  zone: ZoneDefinition;
  isActive: boolean;
  isNear: boolean;
  accepts: boolean;
  attraction: number;
  icon: string;
  style: Record<string, string>;
}

const physics = useSkillPhysics();

// Track animation frame for position updates
let rafId: number | null = null;
const highlightData = ref<HighlightData[]>([]);

/**
 * Get rect for a zone element
 */
function getZoneRect(zone: ZoneDefinition): Rect | null {
  return physics.getZoneRect(zone);
}

/**
 * Calculate highlight data for all relevant zones
 */
function updateHighlights(): void {
  if (!physics.isDragging.value || !physics.currentProximity.value) {
    highlightData.value = [];
    return;
  }

  const proximity = physics.currentProximity.value;
  const activeZone = physics.getActiveZone();

  const highlights: HighlightData[] = [];

  for (const prox of proximity.zones) {
    // Only show zones that are near or accepting
    if (!prox.isNear && prox.accepts) continue;

    const rect = getZoneRect(prox.zone);
    if (!rect) continue;

    highlights.push({
      zone: prox.zone,
      isActive: activeZone?.id === prox.zone.id,
      isNear: prox.isNear,
      accepts: prox.accepts,
      attraction: prox.attraction,
      icon: ZONE_ICONS[prox.zone.id] || '',
      style: {
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      },
    });
  }

  highlightData.value = highlights;
}

/**
 * Animation loop for smooth updates during drag
 */
function animationLoop(): void {
  if (physics.isDragging.value) {
    updateHighlights();
    rafId = requestAnimationFrame(animationLoop);
  } else {
    highlightData.value = [];
    rafId = null;
  }
}

// Watch for drag state changes
watch(
  () => physics.isDragging.value,
  (isDragging) => {
    if (isDragging && rafId === null) {
      rafId = requestAnimationFrame(animationLoop);
    }
  },
  { immediate: true }
);

// Computed: Filter to only show relevant highlights
const activeHighlights = computed(() => {
  return highlightData.value.filter((h) => h.accepts || h.isNear);
});

onMounted(() => {
  // Start animation loop if already dragging
  if (physics.isDragging.value && rafId === null) {
    rafId = requestAnimationFrame(animationLoop);
  }
});

onBeforeUnmount(() => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
});
</script>

<style scoped>
/* Note: Using global styles to match existing components.css */

.zone-highlight {
  position: fixed;
  pointer-events: none;
  z-index: 1999;
  border: 2px dashed var(--color-zone-border);
  border-radius: var(--radius-lg);
  background: var(--color-zone-bg);
  transition:
    border-color var(--duration-short) var(--motion-ease-standard),
    background-color var(--duration-short) var(--motion-ease-standard),
    box-shadow var(--duration-short) var(--motion-ease-standard);
}

.zone-highlight--near {
  border-color: var(--color-zone-near-border);
  background: var(--color-zone-near-bg);
}

.zone-highlight--active {
  border-color: var(--color-zone-active-border);
  border-style: solid;
  background: var(--color-zone-active-bg);
  box-shadow: 0 0 20px var(--color-zone-active-glow);
}

.zone-highlight--incompatible {
  border-color: var(--color-zone-incompatible-border);
  background: var(--color-zone-incompatible-bg);
}

.zone-highlight__label {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-6);
  border-radius: var(--radius-pill);
  background: var(--color-zone-label-bg);
  color: var(--color-zone-label-text);
  font-size: var(--font-size-sm);
  font-weight: 500;
  white-space: nowrap;
  opacity: 0;
  transition: opacity var(--duration-short) var(--motion-ease-standard);
}

.zone-highlight--near .zone-highlight__label,
.zone-highlight--active .zone-highlight__label {
  opacity: 1;
}

.zone-highlight__icon {
  font-size: var(--font-size-md);
}

.zone-highlight__text {
  font-family: var(--font-family-sans);
}

.zone-highlight__ring {
  position: absolute;
  inset: -4px;
  border-radius: var(--radius-lg);
  border: 2px solid transparent;
  opacity: calc(var(--attraction, 0) * 0.6);
  background:
    linear-gradient(transparent, transparent) padding-box,
    linear-gradient(135deg, var(--color-zone-ring-start), var(--color-zone-ring-end)) border-box;
  transition: opacity 100ms var(--motion-ease-standard);
}

.zone-highlight--active .zone-highlight__ring {
  animation: zone-pulse 1.5s ease-in-out infinite;
}

@keyframes zone-pulse {
  0%,
  100% {
    opacity: 0.4;
    transform: scale(1);
  }

  50% {
    opacity: 0.7;
    transform: scale(1.02);
  }
}
</style>
