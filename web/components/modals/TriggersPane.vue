<template>
  <div class="tp-pane-content">
    <div class="tp-trigger-list">
      <div v-if="!triggers.length" class="tp-empty-state">
        <p>
          No triggers configured. Triggers automate app launches and skill execution on schedules,
          events, or conditions.
        </p>
      </div>
      <div v-for="trigger in triggers" :key="trigger.id" class="tp-trigger-item">
        <div class="tp-trigger-row">
          <div class="tp-trigger-info">
            <div class="tp-trigger-header">
              <span class="tp-trigger-name">{{ trigger.name }}</span>
              <span class="tp-badge" :class="badgeClass(trigger.id)">{{
                badgeLabel(trigger.id)
              }}</span>
            </div>
            <span v-if="trigger.description" class="tp-trigger-desc">{{
              trigger.description
            }}</span>
            <div class="tp-trigger-stats">
              <span class="tp-firing-count"> Fired {{ firingCount(trigger.id) }} times </span>
              <span v-if="lastFiredTime(trigger.id)" class="tp-last-fired">
                Last: {{ lastFiredTime(trigger.id) }}
              </span>
            </div>
          </div>
          <div class="tp-actions">
            <button
              type="button"
              :title="isEnabled(trigger.id) ? 'Disable' : 'Enable'"
              :class="{ 'tp-toggle-on': isEnabled(trigger.id) }"
              @click="handleToggle(trigger.id)"
            >
              <iconify-icon :icon="isEnabled(trigger.id) ? 'ph:toggle-right' : 'ph:toggle-left'" />
            </button>
            <button type="button" title="Delete" @click="handleDelete(trigger.id)">
              <iconify-icon icon="ph:trash" />
            </button>
          </div>
        </div>
        <!-- Recent firings -->
        <div v-if="recentFirings(trigger.id).length > 0" class="tp-firings">
          <div class="tp-firings-label">Recent activity</div>
          <div
            v-for="(firing, idx) in recentFirings(trigger.id)"
            :key="idx"
            class="tp-firing-entry"
          >
            <span class="tp-firing-status" :class="firing.success ? 'tp-success' : 'tp-blocked'">
              {{ firing.success ? 'fired' : (firing.reason ?? 'blocked') }}
            </span>
            <span class="tp-firing-time">{{ formatRelative(firing.timestamp) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useTriggerManager } from '@web/composables/useTriggerManager';
import { useNotifs } from '@web/composables/useNotifs.js';
import type { TriggerFiring } from '@web/types/triggers';

const manager = useTriggerManager();
const notifs = useNotifs();

const triggers = computed(() => [...manager.triggers.value]);

function firingCount(id: string): number {
  const state = manager.triggerStates.value.get(id);
  return state?.firingCount ?? 0;
}

function isEnabled(id: string): boolean {
  const state = manager.triggerStates.value.get(id);
  return state?.enabled ?? false;
}

function isExhausted(id: string): boolean {
  const trigger = manager.triggers.value.find((t) => t.id === id);
  if (!trigger?.maxFirings) return false;
  const state = manager.triggerStates.value.get(id);
  return (state?.firingCount ?? 0) >= trigger.maxFirings;
}

function badgeClass(id: string): string {
  if (isExhausted(id)) return 'tp-badge--exhausted';
  if (!isEnabled(id)) return 'tp-badge--paused';
  return 'tp-badge--active';
}

function badgeLabel(id: string): string {
  if (isExhausted(id)) return 'Exhausted';
  if (!isEnabled(id)) return 'Paused';
  return 'Active';
}

function lastFiredTime(id: string): string | null {
  const state = manager.triggerStates.value.get(id);
  if (!state || state.lastFired === 0) return null;
  return formatRelative(state.lastFired);
}

function recentFirings(id: string): ReadonlyArray<TriggerFiring> {
  const history = manager.firingHistories.value.get(id);
  if (!history || history.length === 0) return [];
  // Show last 5, most recent first
  return [...history].reverse().slice(0, 5);
}

function formatRelative(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;

  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

async function handleToggle(id: string): Promise<void> {
  try {
    await manager.toggleTrigger(id);
  } catch (err) {
    notifs.push('error', 'Toggle Failed', { description: (err as Error).message });
  }
}

async function handleDelete(id: string): Promise<void> {
  const confirmed = window.confirm('Delete this trigger? This cannot be undone.');
  if (!confirmed) return;

  try {
    await manager.removeTrigger(id);
    notifs.push('success', 'Trigger Deleted', {
      description: 'The trigger has been permanently removed.',
    });
  } catch (err) {
    notifs.push('error', 'Delete Failed', { description: (err as Error).message });
  }
}

function loadValues(): void {
  manager.refreshTriggers();
}

defineExpose({ loadValues });
</script>

<style scoped>
.tp-pane-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tp-trigger-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tp-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 16px;
  text-align: center;
}

.tp-empty-state p {
  margin: 0;
  font-size: var(--font-size-sm);
  color: rgb(255 255 255 / 50%);
  max-width: 360px;
  line-height: 1.5;
}

.tp-trigger-item {
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}

.tp-trigger-item:hover {
  background: rgb(255 255 255 / 3%);
}

.tp-trigger-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
}

.tp-trigger-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.tp-trigger-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tp-trigger-name {
  font-weight: 500;
  color: #fff;
  font-size: var(--font-size-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tp-badge {
  font-size: 0.7em;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  flex-shrink: 0;
}

.tp-badge--active {
  background: rgb(34 197 94 / 15%);
  color: rgb(34 197 94);
}

.tp-badge--paused {
  background: rgb(234 179 8 / 15%);
  color: rgb(234 179 8);
}

.tp-badge--exhausted {
  background: rgb(239 68 68 / 15%);
  color: rgb(239 68 68);
}

.tp-trigger-desc {
  font-size: 0.85em;
  color: rgb(255 255 255 / 50%);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tp-trigger-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.8em;
  color: rgb(255 255 255 / 40%);
}

.tp-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  padding-top: 2px;
}

.tp-actions button {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  font-size: 18px;
  color: rgb(255 255 255 / 50%);
  transition:
    color 0.15s,
    background 0.15s;
}

.tp-actions button:hover {
  background: rgb(255 255 255 / 8%);
  color: rgb(255 255 255 / 85%);
}

.tp-actions button.tp-toggle-on {
  color: rgb(34 197 94 / 80%);
}

.tp-actions button.tp-toggle-on:hover {
  color: rgb(34 197 94);
  background: rgb(34 197 94 / 10%);
}

/* Delete button hover */
.tp-actions button[title='Delete']:hover {
  color: rgb(220 53 69 / 90%);
  background: rgb(220 53 69 / 15%);
}

/* Recent firings */
.tp-firings {
  padding: 0 12px 12px;
}

.tp-firings-label {
  font-size: 0.75em;
  font-weight: 500;
  color: rgb(255 255 255 / 35%);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 6px;
}

.tp-firing-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 0.8em;
}

.tp-firing-status {
  font-weight: 500;
}

.tp-success {
  color: rgb(34 197 94 / 80%);
}

.tp-blocked {
  color: rgb(239 68 68 / 70%);
}

.tp-firing-time {
  color: rgb(255 255 255 / 35%);
}
</style>
