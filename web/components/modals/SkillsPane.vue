<template>
  <div class="sp-pane-content">
    <!-- Search bar -->
    <div class="sp-search-bar">
      <input v-model="searchQuery" type="text" placeholder="Search skills..." autocomplete="off" />
    </div>

    <!-- Category tabs -->
    <div class="sp-category-tabs">
      <button
        type="button"
        class="sp-category-tab"
        :class="{ active: !activeCategory }"
        @click="activeCategory = null"
      >
        All
      </button>
      <button
        v-for="cat in DEFAULT_SKILL_CATEGORIES"
        :key="cat.name"
        type="button"
        class="sp-category-tab"
        :class="{ active: activeCategory === cat.name }"
        @click="activeCategory = activeCategory === cat.name ? null : cat.name"
      >
        {{ cat.name }}
      </button>
    </div>

    <!-- Unified skill list -->
    <div class="sp-skill-list">
      <div v-if="!filteredSkills.length" class="sp-empty-state">
        <p>No skills match your search</p>
      </div>
      <div v-for="skill in filteredSkills" :key="skill.id" class="sp-skill-item">
        <!-- Header row (always visible) -->
        <div
          class="sp-skill-header"
          role="button"
          tabindex="0"
          @click="toggleExpand(skill.id)"
          @keydown.enter="toggleExpand(skill.id)"
          @keydown.space.prevent="toggleExpand(skill.id)"
        >
          <span class="sp-skill-label">{{ skill.title }}</span>
          <span class="sp-badge">{{ skill.category }}</span>
          <button
            type="button"
            class="sp-toggle-btn"
            :class="{ 'sp-toggle-disabled': !skill.enabled }"
            @click.stop="handleToggleEnabled(skill.id)"
          >
            {{ skill.enabled ? 'Enabled' : 'Disabled' }}
          </button>
          <button type="button" class="sp-star-btn" @click.stop="handleToggleFavorited(skill.id)">
            <iconify-icon
              :icon="skill.favorited ? 'ph:star-fill' : 'ph:star'"
              :class="{ 'sp-star-active': skill.favorited }"
            />
          </button>
        </div>

        <!-- Expanded detail/edit -->
        <div v-if="expandedSkillId === skill.id" ref="detailRefs" class="sp-skill-detail">
          <!-- Detail view (not editing) -->
          <template v-if="editingId !== skill.id">
            <div class="sp-detail-field">
              <span class="sp-detail-label">Description</span>
              <span class="sp-detail-value">{{ skill.description || 'No description' }}</span>
            </div>
            <div class="sp-detail-field">
              <span class="sp-detail-label">Category</span>
              <span class="sp-badge">{{ skill.category }}</span>
            </div>
            <div v-if="skill.triggers.length" class="sp-detail-field">
              <span class="sp-detail-label">Triggers</span>
              <span class="sp-detail-value">{{ skill.triggers.join(', ') }}</span>
            </div>
            <div class="sp-detail-field">
              <span class="sp-detail-label">Usage</span>
              <span class="sp-detail-value">
                {{ skill.usageCount }} {{ skill.usageCount === 1 ? 'use' : 'uses'
                }}{{ skill.lastUsed ? `, last ${formatDate(skill.lastUsed)}` : '' }}
              </span>
            </div>
            <div class="sp-detail-actions">
              <button
                v-if="skill.source === 'custom' || skill.source === 'generated'"
                type="button"
                class="sp-secondary"
                @click="startInlineEdit(skill)"
              >
                Edit
              </button>
              <button
                v-if="
                  skill.source === 'custom' ||
                  skill.source === 'combined' ||
                  skill.source === 'generated'
                "
                type="button"
                class="sp-secondary sp-delete"
                @click="handleDelete(skill)"
              >
                Delete
              </button>
            </div>
          </template>

          <!-- Inline edit form -->
          <template v-else>
            <form class="sp-inline-form" @submit.prevent="handleInlineSave">
              <div class="sp-field">
                <label>Title</label>
                <input v-model="editForm.title" placeholder="Skill title" required />
              </div>
              <div class="sp-field">
                <label>Type</label>
                <select v-model="editForm.type">
                  <option value="prompt">Prompt</option>
                  <option value="action">Action</option>
                </select>
              </div>
              <div class="sp-field">
                <label>Category</label>
                <select v-model="editForm.category">
                  <option v-for="cat in DEFAULT_SKILL_CATEGORIES" :key="cat.name" :value="cat.name">
                    {{ cat.name }}
                  </option>
                </select>
              </div>
              <div class="sp-field">
                <label>Description</label>
                <textarea
                  v-model="editForm.description"
                  placeholder="Brief description..."
                  rows="2"
                ></textarea>
              </div>
              <div class="sp-field">
                <label>{{ editForm.type === 'prompt' ? 'Prompt Text' : 'Action' }}</label>
                <textarea
                  v-if="editForm.type === 'prompt'"
                  v-model="editForm.value"
                  placeholder="Enter prompt text..."
                  rows="3"
                ></textarea>
                <select v-else v-model="editForm.value">
                  <option v-for="action in AVAILABLE_ACTIONS" :key="action.id" :value="action.id">
                    {{ action.label }}
                  </option>
                </select>
              </div>
              <div class="sp-form-actions">
                <button type="submit" class="sp-primary">Save</button>
                <button type="button" class="sp-secondary" @click="cancelInlineEdit">Cancel</button>
              </div>
            </form>
          </template>
        </div>
      </div>
    </div>

    <!-- Create new skill section -->
    <article class="sp-card">
      <button
        v-if="!showCreateForm"
        type="button"
        class="sp-create-btn"
        @click="showCreateForm = true"
      >
        + Create Skill
      </button>
      <template v-else>
        <div class="sp-card-header">
          <h4>New Skill</h4>
        </div>
        <form class="sp-skill-form" @submit.prevent="handleCreate">
          <div class="sp-field">
            <label>Title</label>
            <input
              ref="createTitleRef"
              v-model="createForm.title"
              placeholder="Skill title"
              required
              autocomplete="off"
            />
          </div>
          <div class="sp-field">
            <label>Type</label>
            <select v-model="createForm.type">
              <option value="prompt">Prompt</option>
              <option value="action">Action</option>
            </select>
          </div>
          <div class="sp-field">
            <label>Category</label>
            <select v-model="createForm.category">
              <option v-for="cat in DEFAULT_SKILL_CATEGORIES" :key="cat.name" :value="cat.name">
                {{ cat.name }}
              </option>
            </select>
          </div>
          <div class="sp-field">
            <label>Description</label>
            <textarea
              v-model="createForm.description"
              placeholder="Brief description..."
              rows="2"
            ></textarea>
          </div>
          <div class="sp-field">
            <label>{{ createForm.type === 'prompt' ? 'Prompt Text' : 'Action' }}</label>
            <textarea
              v-if="createForm.type === 'prompt'"
              v-model="createForm.value"
              placeholder="Enter prompt text..."
              rows="3"
            ></textarea>
            <select v-else v-model="createForm.value">
              <option v-for="action in AVAILABLE_ACTIONS" :key="action.id" :value="action.id">
                {{ action.label }}
              </option>
            </select>
          </div>
          <div class="sp-form-actions">
            <button type="submit" class="sp-primary">Add Skill</button>
            <button type="button" class="sp-secondary" @click="showCreateForm = false">
              Cancel
            </button>
          </div>
        </form>
      </template>
    </article>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, nextTick } from 'vue';
import { useSkillCoordinator } from '@web/composables/useSkillCoordinator';
import { useSkillPreferences, type UnifiedSkill } from '@web/composables/useSkillPreferences';
import { useNotifs } from '@web/composables/useNotifs.js';
import { DEFAULT_SKILL_CATEGORIES } from '@web/services/skills/skillCategories';
import { AVAILABLE_ACTIONS_LIST } from '@web/services/skills/builtinActions';

interface EditFormState {
  title: string;
  type: 'prompt' | 'action';
  value: string;
  category: string;
  description: string;
}

interface CreateFormState {
  title: string;
  type: 'prompt' | 'action';
  value: string;
  category: string;
  description: string;
}

const coordinator = useSkillCoordinator();
const prefs = useSkillPreferences();
const notifs = useNotifs();

const AVAILABLE_ACTIONS = AVAILABLE_ACTIONS_LIST;

// UI state
const searchQuery = ref('');
const activeCategory = ref<string | null>(null);
const expandedSkillId = ref<string | null>(null);
const editingId = ref<string | null>(null);
const showCreateForm = ref(false);
const detailRefs = ref<HTMLElement[]>([]);
const createTitleRef = ref<HTMLInputElement | null>(null);

// Edit form (inline)
const editForm = reactive<EditFormState>({
  title: '',
  type: 'prompt',
  value: '',
  category: 'workflow',
  description: '',
});

// Create form
const createForm = reactive<CreateFormState>({
  title: '',
  type: 'prompt',
  value: '',
  category: 'workflow',
  description: '',
});

// Filtered skill list
const filteredSkills = computed(() => {
  let list = prefs.allSkills.value;

  if (activeCategory.value) {
    const cat = activeCategory.value;
    list = list.filter((skill) => skill.category === cat);
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(
      (skill) =>
        skill.title.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q) ||
        skill.triggers.some((t) => t.toLowerCase().includes(q))
    );
  }

  return list;
});

// Accordion expand/collapse
function toggleExpand(skillId: string): void {
  if (expandedSkillId.value === skillId) {
    expandedSkillId.value = null;
    editingId.value = null;
  } else {
    expandedSkillId.value = skillId;
    editingId.value = null;
    nextTick(() => {
      const detail = detailRefs.value[0];
      detail?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
}

// Toggle handlers
function handleToggleEnabled(skillId: string): void {
  prefs.toggleEnabled(skillId);
}

function handleToggleFavorited(skillId: string): void {
  prefs.toggleFavorited(skillId);
}

// Inline edit
function startInlineEdit(skill: UnifiedSkill): void {
  editForm.title = skill.title;
  editForm.type = skill.type;
  editForm.value = skill.value;
  editForm.category = skill.category;
  editForm.description = skill.description;
  editingId.value = skill.id;
}

function cancelInlineEdit(): void {
  editingId.value = null;
}

function handleInlineSave(): void {
  if (!editingId.value) return;
  if (!editForm.title.trim() || !editForm.value.trim()) return;

  try {
    coordinator.updateSkill(editingId.value, {
      title: editForm.title,
      type: editForm.type,
      ...(editForm.type === 'prompt'
        ? { promptConfig: { text: editForm.value } }
        : { actionConfig: { actionId: editForm.value } }),
    });
    notifs.push('success', 'Skill Updated', { description: 'Your changes have been saved.' });
    editingId.value = null;
  } catch (err) {
    notifs.push('error', 'Save Failed', { description: (err as Error).message });
  }
}

// Delete
function handleDelete(skill: UnifiedSkill): void {
  try {
    if (skill.source === 'combined') {
      // Combined skills reference a chain ID in the value
      const coordinatorId = skill.value.replace('chain:', '');
      coordinator.deleteSkill(coordinatorId);
    } else {
      coordinator.deleteSkill(skill.id);
    }
    notifs.push('success', 'Skill Deleted', {
      description: 'The skill has been permanently removed.',
    });
    if (expandedSkillId.value === skill.id) {
      expandedSkillId.value = null;
      editingId.value = null;
    }
  } catch (err) {
    notifs.push('error', 'Delete Failed', { description: (err as Error).message });
  }
}

// Create
function handleCreate(): void {
  if (!createForm.title.trim()) {
    notifs.push('error', 'Missing Field', {
      description: 'A title is required to create a skill.',
    });
    return;
  }
  if (!createForm.value.trim() && createForm.type === 'prompt') {
    notifs.push('error', 'Missing Field', {
      description: 'Prompt text is required for prompt-type skills.',
    });
    return;
  }
  if (!createForm.value && createForm.type === 'action') {
    notifs.push('error', 'Missing Field', {
      description: 'An action is required for action-type skills.',
    });
    return;
  }

  try {
    coordinator.createSkill({
      title: createForm.title,
      type: createForm.type,
      source: 'custom',
      ...(createForm.type === 'prompt'
        ? { promptConfig: { text: createForm.value } }
        : { actionConfig: { actionId: createForm.value } }),
    });
    notifs.push('success', 'Skill Created', { description: 'Your new skill is ready to use.' });
    createForm.title = '';
    createForm.type = 'prompt';
    createForm.value = '';
    createForm.category = 'workflow';
    createForm.description = '';
    showCreateForm.value = false;
  } catch (err) {
    notifs.push('error', 'Create Failed', { description: (err as Error).message });
  }
}

// Helpers
function formatDate(timestamp: number): string {
  if (!timestamp) return 'never';
  const d = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

function loadValues(): void {
  // Reset UI state when pane becomes active
  searchQuery.value = '';
  activeCategory.value = null;
  expandedSkillId.value = null;
  editingId.value = null;
  showCreateForm.value = false;
}

defineExpose({ loadValues });
</script>

<style scoped>
.sp-pane-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Search bar */
.sp-search-bar input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-input-border);
  background: rgb(0 0 0 / 20%);
  color: #fff;
  font-size: var(--font-size-sm);
}

.sp-search-bar input::placeholder {
  color: rgb(255 255 255 / 40%);
}

.sp-search-bar input:focus {
  outline: none;
  border-color: var(--color-input-border-focus);
  box-shadow: 0 0 0 2px rgb(75 163 253 / 30%);
}

/* Category tabs */
.sp-category-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  padding-bottom: 2px;
}

.sp-category-tabs::-webkit-scrollbar {
  display: none;
}

.sp-category-tab {
  all: unset;
  cursor: pointer;
  padding: 5px 14px;
  border-radius: var(--radius-pill);
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: rgb(255 255 255 / 60%);
  background: rgb(255 255 255 / 5%);
  white-space: nowrap;
  transition:
    background 0.15s,
    color 0.15s;
  text-transform: capitalize;
}

.sp-category-tab:hover {
  background: rgb(255 255 255 / 10%);
  color: rgb(255 255 255 / 80%);
}

.sp-category-tab.active {
  background: var(--color-btn-primary-bg);
  color: var(--color-text-on-accent);
}

/* Skill list */
.sp-skill-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sp-skill-item {
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}

.sp-skill-item:hover {
  background: rgb(255 255 255 / 3%);
}

/* Skill header row */
.sp-skill-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  font-size: var(--font-size-sm);
}

.sp-skill-label {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #fff;
}

.sp-badge {
  display: inline-block;
  font-size: var(--font-size-xs);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: rgb(100 181 246 / 20%);
  color: rgb(255 255 255 / 60%);
  flex-shrink: 0;
  text-transform: capitalize;
}

.sp-toggle-btn {
  all: unset;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  color: #fff;
  background: var(--color-input-border);
  transition: background 0.15s;
  flex-shrink: 0;
}

.sp-toggle-btn:hover {
  background: var(--color-toggle-bg-off);
}

.sp-toggle-btn.sp-toggle-disabled {
  background: transparent;
  border: 1px solid rgb(255 255 255 / 20%);
  color: rgb(255 255 255 / 40%);
}

.sp-toggle-btn.sp-toggle-disabled:hover {
  border-color: var(--color-btn-primary-bg);
  color: var(--color-btn-primary-bg);
}

/* Star button */
.sp-star-btn {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  font-size: 16px;
  color: rgb(255 255 255 / 40%);
  transition:
    color 0.15s,
    background 0.15s;
  flex-shrink: 0;
}

.sp-star-btn:hover {
  background: rgb(255 255 255 / 5%);
  color: rgb(255 200 50 / 80%);
}

.sp-star-btn .sp-star-active {
  color: rgb(255 200 50);
}

/* Expanded detail */
.sp-skill-detail {
  padding: 8px 12px 14px;
  border-top: 1px solid rgb(255 255 255 / 6%);
}

.sp-detail-field {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  font-size: var(--font-size-sm);
  align-items: baseline;
}

.sp-detail-label {
  color: rgb(255 255 255 / 50%);
  min-width: 80px;
  flex-shrink: 0;
}

.sp-detail-value {
  color: rgb(255 255 255 / 85%);
  word-break: break-word;
}

.sp-detail-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

/* Inline form */
.sp-inline-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 4px;
}

/* Empty state */
.sp-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px 16px;
  text-align: center;
}

.sp-empty-state p {
  margin: 0;
  font-size: var(--font-size-sm);
  color: rgb(255 255 255 / 50%);
}

/* Card */
.sp-card {
  background: var(--color-input-bg);
  border-radius: var(--radius-md);
  padding: 20px;
  border: 1px solid var(--glass-border-subtle);
}

.sp-card-header {
  margin-bottom: 16px;
}

.sp-card-header h4 {
  margin: 0 0 4px;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: #fff;
}

/* Create button */
.sp-create-btn {
  all: unset;
  cursor: pointer;
  display: block;
  width: 100%;
  box-sizing: border-box;
  text-align: center;
  padding: 12px 20px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: rgb(255 255 255 / 60%);
  border: 1px dashed rgb(255 255 255 / 15%);
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
}

.sp-create-btn:hover {
  background: rgb(255 255 255 / 5%);
  color: #fff;
  border-color: rgb(255 255 255 / 30%);
}

/* Form styles */
.sp-skill-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sp-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sp-field label {
  font-size: 0.85rem;
  font-weight: 500;
  color: rgb(255 255 255 / 60%);
}

.sp-field input,
.sp-field select,
.sp-field textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-input-border);
  background: rgb(0 0 0 / 20%);
  color: #fff;
  font-size: var(--font-size-sm);
  resize: none;
}

.sp-field input::placeholder,
.sp-field textarea::placeholder {
  color: rgb(255 255 255 / 40%);
}

.sp-field select option {
  background: var(--color-surface-overlay);
  color: #fff;
}

.sp-field input:focus,
.sp-field select:focus,
.sp-field textarea:focus {
  outline: none;
  border-color: var(--color-input-border-focus);
  box-shadow: 0 0 0 2px rgb(75 163 253 / 30%);
}

.sp-form-actions {
  display: flex;
  gap: 10px;
  padding-top: 4px;
}

.sp-primary {
  flex: 1;
  padding: 11px 20px;
  border-radius: var(--radius-sm);
  font-weight: 600;
  font-size: var(--font-size-sm);
  background: var(--color-btn-primary-bg);
  color: var(--color-text-on-accent);
  border: none;
  cursor: pointer;
  transition:
    background 0.15s,
    transform 0.1s;
}

.sp-primary:hover {
  background: var(--color-btn-primary-bg-hover);
}

.sp-primary:active {
  transform: scale(0.98);
}

.sp-secondary {
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  background: var(--color-input-border);
  border: none;
  color: #fff;
  cursor: pointer;
  transition: background 0.15s;
}

.sp-secondary:hover {
  background: var(--color-toggle-bg-off);
}

.sp-secondary.sp-delete:hover {
  background: rgb(220 53 69 / 30%);
}
</style>
