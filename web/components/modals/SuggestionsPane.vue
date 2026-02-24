<template>
  <div class="sgp-pane-content">
    <!-- Empty state -->
    <div v-if="proposals.length === 0" class="sgp-empty-state">
      <p>No suggestions yet. Keep using the app and suggestions will appear as patterns emerge.</p>
    </div>

    <!-- Proposals list -->
    <div v-else class="sgp-proposal-list">
      <div
        v-for="proposal in sortedProposals"
        :key="proposal.id"
        class="sgp-proposal-item"
        :class="{
          'sgp-proposal-item--dismissed': proposal.status === 'dismissed',
          'sgp-proposal-item--snoozed': proposal.status === 'snoozed',
          'sgp-proposal-item--approved': proposal.status === 'approved',
        }"
      >
        <div class="sgp-proposal-row">
          <div class="sgp-proposal-info">
            <div class="sgp-proposal-header">
              <iconify-icon :icon="statusIcon(proposal.status)"></iconify-icon>
              <span class="sgp-proposal-name">{{ proposal.name }}</span>
              <span class="sgp-badge" :class="badgeClass(proposal.status)">{{
                formatStatus(proposal.status)
              }}</span>
            </div>
            <span class="sgp-proposal-summary">{{ proposal.summary }}</span>
            <span v-if="proposal.reasoning" class="sgp-proposal-reasoning">{{
              proposal.reasoning
            }}</span>
            <span v-if="proposal.impact" class="sgp-proposal-impact">{{ proposal.impact }}</span>
          </div>
          <div class="sgp-actions">
            <template v-if="proposal.status === 'pending' || proposal.status === 'shown'">
              <button type="button" title="Approve" @click="onApprove(proposal.id)">
                <iconify-icon icon="ph:check" />
              </button>
              <button type="button" title="Edit" @click="startEdit(proposal)">
                <iconify-icon icon="ph:pencil-simple" />
              </button>
              <button type="button" title="Snooze" @click="onSnooze(proposal.id)">
                <iconify-icon icon="ph:clock" />
              </button>
              <button type="button" title="Dismiss" @click="onDismiss(proposal.id)">
                <iconify-icon icon="ph:x" />
              </button>
            </template>
            <template v-else-if="proposal.status === 'dismissed'">
              <button type="button" title="Reconsider" @click="onApprove(proposal.id)">
                <iconify-icon icon="ph:arrow-counter-clockwise" />
              </button>
            </template>
            <template v-else-if="proposal.status === 'snoozed'">
              <button type="button" title="Approve Now" @click="onApprove(proposal.id)">
                <iconify-icon icon="ph:check" />
              </button>
            </template>
            <template v-else-if="proposal.status === 'approved'">
              <span class="sgp-approved-label">Active</span>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Inline edit form -->
    <div v-if="editingProposal" class="sgp-edit-form">
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
      <div class="sgp-edit-actions">
        <button type="button" class="sgp-edit-approve" @click="confirmEdit">
          Approve with Changes
        </button>
        <button type="button" class="sgp-edit-cancel" @click="cancelEdit">Cancel</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSuggestions } from '@web/composables/useSuggestions';
import type { SkillProposal, ProposalStatus } from '@web/types/suggestions';

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

function badgeClass(status: ProposalStatus): string {
  switch (status) {
    case 'approved':
      return 'sgp-badge--approved';
    case 'dismissed':
      return 'sgp-badge--dismissed';
    case 'snoozed':
      return 'sgp-badge--snoozed';
    default:
      return 'sgp-badge--pending';
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

  const updatedSkillMd = updateSkillMdFields(proposal.skillMd, {
    name: trimmedName,
    description: trimmedSummary,
  });

  patchProposal(proposal.id, {
    name: trimmedName,
    summary: trimmedSummary,
    impact: trimmedImpact,
    skillMd: updatedSkillMd,
  });

  await approve(proposal.id);
  cancelEdit();
}

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

// ─── Settings pane interface ─────────────────────────────────────────────────

defineExpose({});
</script>

<style scoped>
.sgp-pane-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sgp-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 16px;
  text-align: center;
}

.sgp-empty-state p {
  margin: 0;
  font-size: var(--font-size-sm);
  color: rgb(255 255 255 / 50%);
  max-width: 360px;
  line-height: 1.5;
}

.sgp-proposal-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sgp-proposal-item {
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}

.sgp-proposal-item:hover {
  background: rgb(255 255 255 / 3%);
}

.sgp-proposal-item--dismissed {
  opacity: 0.5;
}

.sgp-proposal-item--snoozed {
  opacity: 0.7;
}

.sgp-proposal-item--approved {
  background: rgb(34 197 94 / 4%);
}

.sgp-proposal-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
}

.sgp-proposal-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.sgp-proposal-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sgp-proposal-header iconify-icon {
  font-size: 16px;
  color: rgb(255 255 255 / 50%);
  flex-shrink: 0;
}

.sgp-proposal-name {
  font-weight: 500;
  color: #fff;
  font-size: var(--font-size-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sgp-badge {
  font-size: 0.7em;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  flex-shrink: 0;
}

.sgp-badge--pending {
  background: rgb(234 179 8 / 15%);
  color: rgb(234 179 8);
}

.sgp-badge--approved {
  background: rgb(34 197 94 / 15%);
  color: rgb(34 197 94);
}

.sgp-badge--dismissed {
  background: rgb(239 68 68 / 15%);
  color: rgb(239 68 68);
}

.sgp-badge--snoozed {
  background: rgb(96 165 250 / 15%);
  color: rgb(96 165 250);
}

.sgp-proposal-summary {
  font-size: 0.85em;
  color: rgb(255 255 255 / 70%);
  line-height: 1.4;
}

.sgp-proposal-reasoning {
  font-size: 0.8em;
  color: rgb(255 255 255 / 40%);
  font-style: italic;
  line-height: 1.4;
}

.sgp-proposal-impact {
  font-size: 0.8em;
  color: rgb(255 255 255 / 50%);
  line-height: 1.4;
}

.sgp-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  padding-top: 2px;
}

.sgp-actions button {
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

.sgp-actions button:hover {
  background: rgb(255 255 255 / 8%);
  color: rgb(255 255 255 / 85%);
}

.sgp-actions button[title='Dismiss']:hover {
  color: rgb(220 53 69 / 90%);
  background: rgb(220 53 69 / 15%);
}

.sgp-actions button[title='Approve']:hover,
.sgp-actions button[title='Approve Now']:hover {
  color: rgb(34 197 94 / 90%);
  background: rgb(34 197 94 / 10%);
}

.sgp-approved-label {
  font-size: 0.75em;
  font-weight: 500;
  color: rgb(34 197 94 / 70%);
  padding: 6px 0;
}

/* Edit form */
.sgp-edit-form {
  padding: 16px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: var(--radius-sm);
  background: rgb(255 255 255 / 4%);
}

.sgp-edit-form h3 {
  margin: 0 0 12px;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: #fff;
}

.sgp-edit-form label {
  display: block;
  font-size: 0.84rem;
  margin-bottom: 10px;
  color: rgb(255 255 255 / 65%);
}

.sgp-edit-form input,
.sgp-edit-form textarea {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid rgb(255 255 255 / 14%);
  background: rgb(255 255 255 / 6%);
  color: rgb(255 255 255 / 95%);
  font-size: var(--font-size-sm);
  font-family: inherit;
  resize: vertical;
  box-sizing: border-box;
}

.sgp-edit-form input:focus,
.sgp-edit-form textarea:focus {
  outline: none;
  border-color: rgb(255 255 255 / 40%);
}

.sgp-edit-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.sgp-edit-approve {
  padding: 8px 16px;
  border-radius: var(--radius-pill);
  border: none;
  font-size: var(--font-size-sm);
  font-weight: 600;
  cursor: pointer;
  background: var(--color-btn-primary-bg);
  color: var(--color-text-on-accent);
  transition:
    background 0.2s ease,
    transform 0.2s ease;
}

.sgp-edit-approve:hover {
  background: var(--color-btn-primary-bg-hover);
  transform: translateY(-1px);
}

.sgp-edit-cancel {
  padding: 8px 16px;
  border-radius: var(--radius-pill);
  border: 1px solid rgb(255 255 255 / 30%);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  background: transparent;
  color: rgb(255 255 255 / 80%);
  transition:
    border-color 0.2s ease,
    transform 0.2s ease;
}

.sgp-edit-cancel:hover {
  border-color: rgb(255 255 255 / 60%);
  transform: translateY(-1px);
}
</style>
