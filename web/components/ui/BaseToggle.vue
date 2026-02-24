<template>
  <label class="base-toggle" :class="{ 'base-toggle--disabled': disabled }">
    <span v-if="label && labelPosition === 'left'" class="base-toggle__label">
      {{ label }}
    </span>
    <button
      type="button"
      role="switch"
      :aria-checked="modelValue"
      :aria-label="ariaLabel || label"
      :disabled="disabled"
      class="base-toggle__switch"
      :class="{ 'base-toggle__switch--on': modelValue }"
      @click="toggle"
    >
      <span class="base-toggle__thumb" aria-hidden="true"></span>
    </button>
    <span v-if="label && labelPosition === 'right'" class="base-toggle__label">
      {{ label }}
    </span>
  </label>
</template>

<script setup lang="ts">
type LabelPosition = 'left' | 'right';

interface Props {
  modelValue?: boolean;
  label?: string;
  labelPosition?: LabelPosition;
  disabled?: boolean;
  ariaLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  label: '',
  labelPosition: 'left',
  disabled: false,
  ariaLabel: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

function toggle(): void {
  if (props.disabled) return;
  emit('update:modelValue', !props.modelValue);
}
</script>

<style scoped>
.base-toggle {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.base-toggle--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.base-toggle__label {
  font-size: var(--font-size-sm);
  color: var(--color-input-label);
  user-select: none;
}

.base-toggle__switch {
  position: relative;
  width: 44px;
  height: 24px;
  background: var(--color-toggle-bg-off);
  border: none;
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: background 0.2s ease;
  padding: 0;
  flex-shrink: 0;
}

.base-toggle__switch:focus-visible {
  outline: 2px solid var(--color-input-border-focus);
  outline-offset: 2px;
}

.base-toggle__switch--on {
  background: var(--color-toggle-bg-on);
}

.base-toggle__switch:disabled {
  cursor: not-allowed;
}

.base-toggle__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background: var(--color-toggle-thumb);
  border-radius: 50%;
  transition: transform 0.2s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.base-toggle__switch--on .base-toggle__thumb {
  transform: translateX(20px);
}
</style>
