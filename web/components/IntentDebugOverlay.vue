<template>
  <teleport to="body">
    <div v-if="debugVisible" class="intent-debug-overlay">
      <!-- Zone rectangles -->
      <div
        v-for="zone in zoneRects"
        :key="zone.id"
        class="intent-zone"
        :class="{ active: zone.id === activeTargetId }"
        :style="zoneStyle(zone)"
      >
        <span class="zone-label">{{ zone.id }}</span>
        <span class="zone-actions">{{ zone.actions.join(', ') }}</span>
      </div>

      <!-- History panel -->
      <div class="intent-history">
        <div class="history-header">
          <span>Intent History ({{ history.length }})</span>
          <button @click="toggleDebug" class="close-btn">&times;</button>
        </div>
        <div class="history-list">
          <div
            v-for="(intent, i) in history.slice(0, 20)"
            :key="i"
            class="history-item"
            :class="{ resolved: intent.resolvedTarget }"
          >
            <span class="intent-source">{{ intent.source }}</span>
            <span class="intent-action">{{ intent.action }}</span>
            <span class="intent-target">→ {{ intent.resolvedTarget || '(none)' }}</span>
            <span v-if="intent.value" class="intent-value">{{ formatValue(intent.value) }}</span>
          </div>
          <div v-if="history.length === 0" class="history-empty">No intents yet</div>
        </div>
      </div>

      <!-- Cursor position indicator -->
      <div
        v-if="cursorPos"
        class="cursor-indicator"
        :style="{ left: cursorPos.x + 'px', top: cursorPos.y + 'px' }"
      ></div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useIntentCoordinator } from '@web/composables/useIntentCoordinator.js';

interface ZoneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ZoneRectInfo {
  id: string;
  rect: ZoneRect;
  actions: string[];
}

interface CursorPosition {
  x: number;
  y: number;
}

const { debugVisible, history, activeTargetId, toggleDebug, getAllZoneRects, getActiveTarget } =
  useIntentCoordinator();

const zoneRects = ref<ZoneRectInfo[]>([]);
const cursorPos = ref<CursorPosition | null>(null);
let rafId: number | null = null;

// Colors for zones
const ZONE_COLORS: Record<string, string> = {
  inputBar: 'rgb(25 240 10 / 30%)',
  timeWidget: 'rgb(255 165 0 / 30%)',
  dotmatrix: 'rgb(100 100 255 / 15%)',
  notes: 'rgb(255 100 100 / 30%)',
  default: 'rgb(200 200 200 / 30%)',
};

function zoneStyle(zone: ZoneRectInfo): Record<string, string> {
  const color = ZONE_COLORS[zone.id] ?? 'rgb(200 200 200 / 30%)';
  return {
    left: zone.rect.x + 'px',
    top: zone.rect.y + 'px',
    width: zone.rect.width + 'px',
    height: zone.rect.height + 'px',
    backgroundColor: color,
    borderColor: color.replace('0.3', '0.8'),
  };
}

function formatValue(value: unknown): string {
  if (typeof value === 'object') {
    return JSON.stringify(value).slice(0, 30);
  }
  return String(value).slice(0, 30);
}

function updateZones(): void {
  zoneRects.value = getAllZoneRects();
}

function onMouseMove(e: MouseEvent): void {
  if (!debugVisible.value) return;
  cursorPos.value = { x: e.clientX, y: e.clientY };
  getActiveTarget({ x: e.clientX, y: e.clientY });
}

function tick(): void {
  if (debugVisible.value) {
    updateZones();
  }
  rafId = requestAnimationFrame(tick);
}

onMounted(() => {
  window.addEventListener('mousemove', onMouseMove);
  rafId = requestAnimationFrame(tick);
});

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMouseMove);
  if (rafId) cancelAnimationFrame(rafId);
});
</script>

<style scoped>
.intent-debug-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 99999;
  font-family: monospace;
  font-size: 11px;
}

.intent-zone {
  position: fixed;
  border: 2px dashed;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 4px 6px;
  transition: background-color 0.15s ease;
}

.intent-zone.active {
  background-color: rgb(255 255 0 / 40%) !important;
}

.zone-label {
  font-weight: bold;
  color: #fff;
  text-shadow: 0 1px 2px rgb(0 0 0 / 80%);
}

.zone-actions {
  color: rgb(255 255 255 / 70%);
  font-size: 9px;
  text-shadow: 0 1px 2px rgb(0 0 0 / 80%);
}

.intent-history {
  position: fixed;
  top: 10px;
  right: 10px;
  width: 280px;
  max-height: 400px;
  background: rgb(0 0 0 / 85%);
  border: 1px solid rgb(255 255 255 / 20%);
  border-radius: 6px;
  overflow: hidden;
  pointer-events: auto;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  background: rgb(255 255 255 / 10%);
  color: #fff;
  font-weight: bold;
}

.close-btn {
  background: none;
  border: none;
  color: #fff;
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
}

.close-btn:hover {
  color: #f66;
}

.history-list {
  max-height: 350px;
  overflow-y: auto;
  padding: 4px;
}

.history-item {
  display: flex;
  gap: 6px;
  padding: 4px 6px;
  border-bottom: 1px solid rgb(255 255 255 / 10%);
  color: rgb(255 255 255 / 60%);
}

.history-item.resolved {
  color: rgb(25 240 10 / 90%);
}

.intent-source {
  color: #8af;
  min-width: 50px;
}

.intent-action {
  color: #fa8;
  min-width: 50px;
}

.intent-target {
  color: #8fa;
  flex: 1;
}

.intent-value {
  color: rgb(255 255 255 / 50%);
  font-size: 9px;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-empty {
  color: rgb(255 255 255 / 40%);
  text-align: center;
  padding: 20px;
}

.cursor-indicator {
  position: fixed;
  width: 12px;
  height: 12px;
  background: rgb(255 255 0 / 80%);
  border: 2px solid #fff;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
</style>
