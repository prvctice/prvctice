<template>
  <div
    class="base-input"
    :class="{ 'base-input--error': hasError, 'base-input--disabled': disabled }"
  >
    <label v-if="label" :id="labelId" class="base-input__label">
      {{ label }}
      <span v-if="required" class="base-input__required" aria-hidden="true">*</span>
    </label>
    <div class="base-input__wrapper">
      <span v-if="$slots.prefix" class="base-input__prefix">
        <slot name="prefix" />
      </span>
      <input
        ref="inputRef"
        v-model="modelValue"
        :type="type"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :required="required"
        :autocomplete="autocomplete"
        :aria-label="ariaLabel"
        :aria-labelledby="label ? labelId : ariaLabelledby"
        :aria-describedby="computedDescribedBy"
        :aria-invalid="hasError ? 'true' : undefined"
        class="base-input__field"
        @focus="$emit('focus', $event)"
        @blur="$emit('blur', $event)"
      />
      <span v-if="$slots.suffix" class="base-input__suffix">
        <slot name="suffix" />
      </span>
    </div>
    <p v-if="hint && !hasError" :id="hintId" class="base-input__hint">
      {{ hint }}
    </p>
    <p v-if="hasError" :id="errorId" class="base-input__error" role="alert">
      {{ error }}
    </p>
    <p v-if="description" :id="descId" class="sr-only">
      {{ description }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, useId } from 'vue';

interface Props {
  modelValue?: string | number;
  type?: string;
  label?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  description?: string;
  disabled?: boolean;
  readonly?: boolean;
  required?: boolean;
  autocomplete?: string;
  ariaLabel?: string;
  ariaLabelledby?: string;
  ariaDescribedby?: string;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  type: 'text',
  label: '',
  placeholder: '',
  hint: '',
  error: '',
  description: '',
  disabled: false,
  readonly: false,
  required: false,
  autocomplete: 'off',
  ariaLabel: undefined,
  ariaLabelledby: undefined,
  ariaDescribedby: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: string | number];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
}>();

const inputRef = ref<HTMLInputElement | null>(null);

// Generate unique IDs for accessibility
const uid = useId();
const labelId = `input-label-${uid}`;
const hintId = `input-hint-${uid}`;
const errorId = `input-error-${uid}`;
const descId = `input-desc-${uid}`;

const modelValue = computed({
  get: () => props.modelValue,
  set: (value: string | number) => emit('update:modelValue', value),
});

const hasError = computed(() => Boolean(props.error));

const computedDescribedBy = computed(() => {
  const ids: string[] = [];
  if (props.ariaDescribedby) ids.push(props.ariaDescribedby);
  if (props.description) ids.push(descId);
  if (props.hint && !hasError.value) ids.push(hintId);
  if (hasError.value) ids.push(errorId);
  return ids.length ? ids.join(' ') : undefined;
});

function focus(): void {
  inputRef.value?.focus();
}

function blur(): void {
  inputRef.value?.blur();
}

defineExpose({ focus, blur, inputRef });
</script>

<style scoped>
.base-input {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.base-input__label {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--color-input-label);
}

.base-input__required {
  color: var(--color-input-border-error);
  margin-left: 2px;
}

.base-input__wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--color-input-bg);
  border: 1px solid var(--color-input-border);
  border-radius: var(--radius-lg);
  padding: 0 12px;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    box-shadow 0.15s ease;
}

.base-input__wrapper:focus-within {
  border-color: var(--color-input-border-focus);
  background: var(--color-input-bg-focus);
  box-shadow: 0 0 0 3px rgba(84, 114, 255, 0.15);
}

.base-input--error .base-input__wrapper {
  border-color: var(--color-input-border-error);
}

.base-input--error .base-input__wrapper:focus-within {
  box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.15);
}

.base-input--disabled .base-input__wrapper {
  opacity: 0.5;
  cursor: not-allowed;
}

.base-input__prefix,
.base-input__suffix {
  display: inline-flex;
  align-items: center;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.base-input__field {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--color-input-text);
  font-size: var(--font-size-sm);
  padding: 12px 0;
  width: 100%;
}

.base-input__field::placeholder {
  color: var(--color-input-placeholder);
}

.base-input__field:disabled {
  cursor: not-allowed;
}

.base-input__hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  margin: 0;
}

.base-input__error {
  font-size: var(--font-size-xs);
  color: var(--color-input-border-error);
  margin: 0;
}
</style>
