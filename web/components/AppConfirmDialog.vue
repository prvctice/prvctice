<template>
  <Teleport to="body">
    <Transition v-for="dialog in activeDialogs" :key="dialog.dialogId" name="dialog" appear>
      <div class="app-dialog-backdrop" @click.self="onBackdropClick(dialog)">
        <div class="app-dialog-card">
          <div class="app-dialog-title">{{ dialog.title }}</div>
          <div class="app-dialog-message">{{ dialog.message }}</div>
          <div class="app-dialog-buttons">
            <button
              v-for="(btn, idx) in dialog.buttons"
              :key="btn"
              class="app-dialog-btn"
              :class="{ primary: idx === dialog.buttons.length - 1 }"
              @click="onButtonClick(dialog.dialogId, btn)"
            >
              {{ btn }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { createAppDialogManager } from '@web/services/apps/appDialogManager';
import type { DialogEntry } from '@web/services/apps/appDialogManager';

const dialogManager = createAppDialogManager();
const activeDialogs = dialogManager.activeDialogs;

function onButtonClick(dialogId: string, buttonText: string): void {
  dialogManager.resolve(dialogId, buttonText);
}

function onBackdropClick(dialog: DialogEntry): void {
  // Alert dialogs can be dismissed by clicking outside
  if (dialog.type === 'alert') {
    dialogManager.resolve(dialog.dialogId, 'OK');
  }
  // Confirm dialogs require an explicit button choice
}
</script>

<style scoped>
.app-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-dialog-card {
  background: var(--color-surface-elevated, #1a1a2e);
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: var(--radius-xl);
  padding: 24px;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
}

.app-dialog-title {
  font-size: 1rem;
  font-weight: 600;
  color: rgb(255 255 255 / 90%);
  margin-bottom: 8px;
}

.app-dialog-message {
  font-size: 0.875rem;
  color: rgb(255 255 255 / 60%);
  margin-bottom: 20px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.app-dialog-buttons {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.app-dialog-btn {
  padding: 8px 20px;
  border-radius: var(--radius-pill);
  font-size: 0.875rem;
  cursor: pointer;
  border: 1px solid rgb(255 255 255 / 12%);
  background: transparent;
  color: rgb(255 255 255 / 80%);
  transition:
    opacity 0.15s ease,
    background 0.15s ease;
}

.app-dialog-btn:hover {
  background: rgb(255 255 255 / 8%);
}

.app-dialog-btn.primary {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

/* Transition animations */
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.2s ease;
}

.dialog-enter-active .app-dialog-card,
.dialog-leave-active .app-dialog-card {
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-from .app-dialog-card {
  transform: scale(0.95);
  opacity: 0;
}

.dialog-leave-to .app-dialog-card {
  transform: scale(0.95);
  opacity: 0;
}
</style>
