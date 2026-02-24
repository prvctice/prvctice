<template>
  <div ref="root" class="message" :class="[sender ?? 'assistant', { editing: isEditing }]">
    <div class="message-content">
      <!-- Edit mode -->
      <div v-if="isEditing" class="message-edit-container">
        <textarea
          ref="editTextarea"
          v-model="editText"
          class="message-edit-textarea"
          @keydown.enter.ctrl="saveEdit"
          @keydown.escape="cancelEdit"
          aria-label="Edit message"
        />
        <div class="message-edit-actions">
          <button class="message-edit-save" @click="saveEdit" aria-label="Save edit">Save</button>
          <button class="message-edit-cancel" @click="cancelEdit" aria-label="Cancel edit">
            Cancel
          </button>
        </div>
      </div>
      <!-- Normal view -->
      <template v-else>
        <slot />
      </template>
      <!-- Message toolbar for assistant messages -->
      <!-- Guard on `root` so we don't pass null before ref mounts -->
      <TtsToolbar
        v-if="(sender ?? 'assistant') === 'assistant' && root && !isEditing"
        :bubble-el="root"
      />
    </div>
    <!-- Edit button for user messages -->
    <button
      v-if="(sender ?? 'assistant') === 'user' && canEdit && !isEditing"
      class="message-edit-btn"
      @click="startEdit"
      aria-label="Edit message"
      title="Edit message"
    >
      <iconify-icon icon="mdi:pencil" width="16" height="16" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, computed } from 'vue';
import TtsToolbar from './TtsToolbar.vue';

interface EditEvent {
  messageId: string;
  newText: string;
}

const props = defineProps<{
  sender?: string;
  messageId?: string | null;
  messageText?: string;
  isStreaming?: boolean;
}>();

const emit = defineEmits<{
  edit: [payload: EditEvent];
}>();

const root = ref<HTMLElement | null>(null);
const editTextarea = ref<HTMLTextAreaElement | null>(null);
const isEditing = ref(false);
const editText = ref('');

const canEdit = computed(
  () => (props.sender ?? 'assistant') === 'user' && !props.isStreaming && props.messageId
);

function startEdit(): void {
  editText.value = props.messageText || '';
  isEditing.value = true;
  nextTick(() => {
    if (editTextarea.value) {
      editTextarea.value.focus();
      editTextarea.value.select();
    }
  });
}

function cancelEdit(): void {
  isEditing.value = false;
  editText.value = '';
}

function saveEdit(): void {
  if (!editText.value.trim()) {
    cancelEdit();
    return;
  }
  emit('edit', { messageId: props.messageId!, newText: editText.value.trim() });
  isEditing.value = false;
  editText.value = '';
}
</script>

<style scoped>
.message {
  position: relative;
}

.message-edit-btn {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  background: transparent;
  border: none;
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--duration-short) var(--motion-ease-standard);
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  color: inherit;
}

.message:hover .message-edit-btn,
.message:focus-within .message-edit-btn {
  opacity: 0.6;
}

.message-edit-btn:hover {
  opacity: 1;
  background: var(--color-edit-btn-bg-hover);
}

.message-edit-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: 100%;
}

.message-edit-textarea {
  width: 100%;
  min-height: 80px;
  padding: var(--space-4) var(--space-5);
  font-size: inherit;
  font-family: inherit;
  border: 1px solid var(--color-edit-textarea-border);
  border-radius: var(--radius-md);
  background: var(--color-edit-textarea-bg);
  color: inherit;
  resize: vertical;
}

.message-edit-textarea:focus {
  outline: none;
  border-color: var(--color-edit-textarea-focus);
}

.message-edit-actions {
  display: flex;
  gap: var(--space-4);
  justify-content: flex-end;
}

.message-edit-save,
.message-edit-cancel {
  padding: var(--space-3) var(--space-5);
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--font-size-sm);
  font-weight: 500;
  transition: background var(--duration-short) var(--motion-ease-standard);
}

.message-edit-save {
  background: var(--color-edit-save-bg);
  color: var(--color-toggle-thumb);
}

.message-edit-save:hover {
  background: var(--color-edit-save-bg-hover);
}

.message-edit-cancel {
  background: var(--color-edit-cancel-bg);
  color: inherit;
}

.message-edit-cancel:hover {
  background: var(--color-edit-cancel-bg-hover);
}
</style>
