<template>
  <Teleport to="body">
    <div v-if="open" class="suggestions-view-overlay" @click.self="$emit('close')">
      <div class="suggestions-view" role="dialog" aria-modal="true" aria-label="Skill Suggestions">
        <!-- Header -->
        <header class="suggestions-view__header">
          <h2>Suggestions</h2>
          <button class="suggestions-view__close" @click="$emit('close')" aria-label="Close">
            <iconify-icon icon="ph:x"></iconify-icon>
          </button>
        </header>

        <!-- Empty state -->
        <div v-if="proposals.length === 0" class="suggestions-view__empty">
          <p>
            No suggestions yet. Keep using the app and suggestions will appear as patterns emerge.
          </p>
        </div>

        <!-- Proposals list -->
        <ul v-else class="suggestions-view__list" role="list">
          <li
            v-for="proposal in sortedProposals"
            :key="proposal.id"
            class="suggestions-view__item"
            :class="{
              'suggestions-view__item--dismissed': proposal.status === 'dismissed',
              'suggestions-view__item--snoozed': proposal.status === 'snoozed',
              'suggestions-view__item--approved': proposal.status === 'approved',
            }"
          >
            <div class="suggestions-view__item-header">
              <iconify-icon :icon="statusIcon(proposal.status)"></iconify-icon>
              <span class="suggestions-view__item-name">{{ proposal.name }}</span>
              <span class="suggestions-view__item-status">{{ formatStatus(proposal.status) }}</span>
            </div>
            <p class="suggestions-view__item-summary">{{ proposal.summary }}</p>
            <p class="suggestions-view__item-reasoning">{{ proposal.reasoning }}</p>
            <p v-if="proposal.impact" class="suggestions-view__item-impact">
              {{ proposal.impact }}
            </p>

            <!-- Actions based on status -->
            <div class="suggestions-view__item-actions">
              <template v-if="proposal.status === 'pending' || proposal.status === 'shown'">
                <button @click="onApprove(proposal.id)">Approve</button>
                <button @click="startEdit(proposal)">Edit</button>
                <button @click="onDismiss(proposal.id)">Dismiss</button>
                <button @click="onSnooze(proposal.id)">Snooze</button>
              </template>
              <template v-else-if="proposal.status === 'dismissed'">
                <button @click="onApprove(proposal.id)">Reconsider</button>
              </template>
              <template v-else-if="proposal.status === 'snoozed'">
                <button @click="onApprove(proposal.id)">Approve Now</button>
              </template>
              <template v-else-if="proposal.status === 'approved'">
                <span class="suggestions-view__approved-label">Active in Skills Dock</span>
              </template>
            </div>
          </li>
        </ul>

        <!-- Inline edit form (shown when editing) -->
        <div v-if="editingProposal" class="suggestions-view__edit-form">
          <h3>Edit Suggestion</h3>
          <label>
            Name
            <input v-model="editName" type="text" />
          </label>
          <label>
            Summary
            <textarea v-model="editSummary" rows="2"></textarea>
          </label>
          <label>
            Impact
            <textarea v-model="editImpact" rows="2"></textarea>
          </label>
          <div class="suggestions-view__edit-actions">
            <button @click="confirmEdit">Approve with Changes</button>
            <button @click="cancelEdit">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSuggestions } from '@web/composables/useSuggestions';
import type { SkillProposal, ProposalStatus } from '@web/types/suggestions';

defineProps<{ open: boolean }>();
defineEmits<{ close: [] }>();

const { proposals, approve, dismiss, snooze, patchProposal } = useSuggestions();

// ─── Sorting ─────────────────────────────────────────────────────────────────

const STATUS_ORDER: Record<ProposalStatus, number> = {
  pending: 0,
  shown: 0,
  snoozed: 1,
  approved: 2,
  dismissed: 3,
};

const sortedProposals = computed(() =>
  [...proposals.value].sort((a, b) => {
    const orderDiff = (STATUS_ORDER[a.status] ?? 4) - (STATUS_ORDER[b.status] ?? 4);
    if (orderDiff !== 0) return orderDiff;
    return b.createdAt - a.createdAt;
  })
);

// ─── Status helpers ──────────────────────────────────────────────────────────

function statusIcon(status: ProposalStatus): string {
  switch (status) {
    case 'pending':
    case 'shown':
      return 'ph:clock';
    case 'approved':
      return 'ph:check-circle';
    case 'dismissed':
      return 'ph:x-circle';
    case 'snoozed':
      return 'ph:pause';
    default:
      return 'ph:circle';
  }
}

function formatStatus(status: ProposalStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'shown':
      return 'Showing';
    case 'approved':
      return 'Approved';
    case 'dismissed':
      return 'Dismissed';
    case 'snoozed':
      return 'Snoozed';
    default:
      return status;
  }
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function onApprove(id: string): Promise<void> {
  await approve(id);
}

function onDismiss(id: string): void {
  dismiss(id);
}

function onSnooze(id: string): void {
  snooze(id);
}

// ─── Inline editing ──────────────────────────────────────────────────────────

const editingProposal = ref<SkillProposal | null>(null);
const editName = ref('');
const editSummary = ref('');
const editImpact = ref('');

function startEdit(proposal: SkillProposal): void {
  editingProposal.value = proposal;
  editName.value = proposal.name;
  editSummary.value = proposal.summary;
  editImpact.value = proposal.impact;
}

function cancelEdit(): void {
  editingProposal.value = null;
  editName.value = '';
  editSummary.value = '';
  editImpact.value = '';
}

async function confirmEdit(): Promise<void> {
  const proposal = editingProposal.value;
  if (!proposal) return;

  const trimmedName = editName.value.trim() || proposal.name;
  const trimmedSummary = editSummary.value.trim() || proposal.summary;
  const trimmedImpact = editImpact.value.trim() || proposal.impact;

  // Update the skillMd frontmatter with edited values
  const updatedSkillMd = updateSkillMdFields(proposal.skillMd, {
    name: trimmedName,
    description: trimmedSummary,
  });

  // Patch the proposal in the singleton store so approve() picks up edits
  patchProposal(proposal.id, {
    name: trimmedName,
    summary: trimmedSummary,
    impact: trimmedImpact,
    skillMd: updatedSkillMd,
  });

  await approve(proposal.id);
  cancelEdit();
}

/**
 * Update YAML frontmatter fields in a SKILL.md string.
 */
function updateSkillMdFields(
  skillMd: string,
  fields: { name?: string; description?: string }
): string {
  let result = skillMd;
  if (fields.name) {
    result = result.replace(/^(name:\s*).+$/m, `$1${fields.name}`);
  }
  if (fields.description) {
    result = result.replace(/^(description:\s*).+$/m, `$1${fields.description}`);
  }
  return result;
}
</script>

<style scoped>
.suggestions-view-overlay {
  position: fixed;
  inset: 0;
  background: rgb(3 6 12 / 50%);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 4000;
}

.suggestions-view {
  position: relative;
  width: min(460px, calc(100% - 32px));
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow:
    0 22px 60px rgb(0 0 0 / 35%),
    0 4px 18px rgb(0 0 0 / 18%);
  background: rgb(10 14 26 / 74%);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  color: rgb(255 255 255 / 95%);
  max-height: 80vh;
}

.suggestions-view__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.suggestions-view__header h2 {
  margin: 0;
  font-size: 1.35rem;
  letter-spacing: 0.01em;
  font-weight: 700;
}

.suggestions-view__close {
  background: none;
  border: none;
  color: rgb(255 255 255 / 70%);
  cursor: pointer;
  font-size: 18px;
  padding: 4px;
  transition: color 0.15s ease;
}

.suggestions-view__close:hover {
  color: rgb(255 255 255 / 95%);
}

/* Empty state */
.suggestions-view__empty {
  padding: 32px 12px;
  text-align: center;
}

.suggestions-view__empty p {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.5;
  color: rgb(255 255 255 / 68%);
}

/* Proposals list */
.suggestions-view__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  max-height: min(360px, 60vh);
  padding-right: 6px;
}

.suggestions-view__item {
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: var(--radius-xl);
  background: rgb(255 255 255 / 10%);
  padding: 16px;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    opacity 0.2s ease;
}

.suggestions-view__item:hover {
  border-color: rgb(255 255 255 / 32%);
  background: rgb(255 255 255 / 16%);
}

.suggestions-view__item--dismissed {
  opacity: 0.5;
}

.suggestions-view__item--snoozed {
  opacity: 0.7;
}

.suggestions-view__item--approved {
  border-color: rgb(74 222 128 / 40%);
  background: rgb(74 222 128 / 8%);
}

.suggestions-view__item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.suggestions-view__item-name {
  font-weight: 600;
  font-size: 1rem;
  flex: 1;
  color: #f8f8fb;
}

.suggestions-view__item-status {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgb(255 255 255 / 50%);
}

.suggestions-view__item-summary {
  font-size: 0.9rem;
  line-height: 1.4;
  margin: 0 0 4px;
  color: rgb(255 255 255 / 88%);
}

.suggestions-view__item-reasoning {
  font-size: 0.84rem;
  line-height: 1.4;
  margin: 0 0 4px;
  color: rgb(255 255 255 / 55%);
  font-style: italic;
}

.suggestions-view__item-impact {
  font-size: 0.84rem;
  line-height: 1.4;
  margin: 0 0 8px;
  color: rgb(255 255 255 / 65%);
}

.suggestions-view__item-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.suggestions-view__item-actions button {
  padding: 6px 14px;
  border-radius: var(--radius-pill);
  border: 1px solid rgb(255 255 255 / 30%);
  font-size: 0.84rem;
  font-weight: 500;
  cursor: pointer;
  background: transparent;
  color: rgb(255 255 255 / 90%);
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    transform 0.2s ease;
}

.suggestions-view__item-actions button:hover {
  border-color: rgb(255 255 255 / 60%);
  background: rgb(255 255 255 / 10%);
  transform: translateY(-1px);
}

.suggestions-view__approved-label {
  font-size: 0.84rem;
  color: rgb(74 222 128 / 80%);
  font-style: italic;
}

/* Edit form */
.suggestions-view__edit-form {
  padding: 16px;
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: var(--radius-xl);
  background: rgb(255 255 255 / 6%);
}

.suggestions-view__edit-form h3 {
  margin: 0 0 12px;
  font-size: 0.95rem;
  font-weight: 600;
}

.suggestions-view__edit-form label {
  display: block;
  font-size: 0.84rem;
  margin-bottom: 10px;
  color: rgb(255 255 255 / 78%);
}

.suggestions-view__edit-form input,
.suggestions-view__edit-form textarea {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 8px 10px;
  border-radius: var(--radius-lg);
  border: 1px solid rgb(255 255 255 / 18%);
  background: rgb(255 255 255 / 8%);
  color: rgb(255 255 255 / 95%);
  font-size: 0.9rem;
  font-family: inherit;
  resize: vertical;
}

.suggestions-view__edit-form input:focus,
.suggestions-view__edit-form textarea:focus {
  outline: none;
  border-color: rgb(255 255 255 / 50%);
}

.suggestions-view__edit-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.suggestions-view__edit-actions button {
  padding: 8px 16px;
  border-radius: var(--radius-pill);
  border: none;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.suggestions-view__edit-actions button:first-child {
  background: #fff;
  color: #0a1020;
}

.suggestions-view__edit-actions button:first-child:hover {
  box-shadow: 0 8px 18px rgb(0 0 0 / 12%);
  transform: translateY(-1px);
}

.suggestions-view__edit-actions button:last-child {
  background: transparent;
  border: 1px solid rgb(255 255 255 / 60%);
  color: rgb(255 255 255 / 95%);
}

.suggestions-view__edit-actions button:last-child:hover {
  border-color: rgb(255 255 255 / 90%);
  transform: translateY(-1px);
}

@media (max-width: 640px) {
  .suggestions-view-overlay {
    padding: 12px;
  }

  .suggestions-view {
    padding: 22px 20px 18px;
  }
}
</style>
