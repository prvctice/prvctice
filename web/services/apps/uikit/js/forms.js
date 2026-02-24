/**
 * prvctice UI Kit — Forms
 * Declarative form rendering with field-level validation.
 * prvctice.ui.form(container, { fields, onSubmit, submitLabel })
 * Supports: text, number, select, toggle, slider, checkbox, radio.
 * Validates on blur with built-in validators: required, minLength, maxLength, min, max, pattern, email.
 * ES5-compatible — no modules, no arrow functions, no const/let.
 */
(function () {
  'use strict';

  // ==================== VALIDATORS ====================

  var VALIDATORS = {
    required: function (value, _opts) {
      if (value === undefined || value === null || value === '' || value === false) {
        return 'This field is required';
      }
      return null;
    },
    minLength: function (value, opts) {
      if (typeof value === 'string' && value.length < opts.minLength) {
        return 'Must be at least ' + opts.minLength + ' characters';
      }
      return null;
    },
    maxLength: function (value, opts) {
      if (typeof value === 'string' && value.length > opts.maxLength) {
        return 'Must be at most ' + opts.maxLength + ' characters';
      }
      return null;
    },
    min: function (value, opts) {
      if (typeof value === 'number' && value < opts.min) {
        return 'Must be at least ' + opts.min;
      }
      return null;
    },
    max: function (value, opts) {
      if (typeof value === 'number' && value > opts.max) {
        return 'Must be at most ' + opts.max;
      }
      return null;
    },
    pattern: function (value, opts) {
      if (typeof value === 'string' && opts.pattern) {
        var re = opts.pattern instanceof RegExp ? opts.pattern : new RegExp(opts.pattern);
        if (!re.test(value)) {
          return opts.patternMessage || 'Invalid format';
        }
      }
      return null;
    },
    email: function (value, _opts) {
      if (typeof value === 'string' && value.length > 0) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          return 'Invalid email address';
        }
      }
      return null;
    },
  };

  var VALIDATOR_KEYS = ['required', 'minLength', 'maxLength', 'min', 'max', 'pattern', 'email'];

  function validateField(value, fieldDef) {
    for (var i = 0; i < VALIDATOR_KEYS.length; i++) {
      var key = VALIDATOR_KEYS[i];
      if (fieldDef[key] !== undefined && fieldDef[key] !== false) {
        var error = VALIDATORS[key](value, fieldDef);
        if (error) return error;
      }
    }
    return null;
  }

  // ==================== FIELD RENDERERS ====================

  function renderText(field) {
    var group = document.createElement('div');
    group.className = 'p-form-group';

    var label = document.createElement('label');
    label.className = 'p-label';
    label.textContent = field.label || field.name;
    group.appendChild(label);

    var input = document.createElement('input');
    input.className = 'p-input';
    input.type = field.email ? 'email' : 'text';
    input.name = field.name;
    if (field.placeholder) input.placeholder = field.placeholder;
    if (field.value !== undefined) input.value = field.value;
    group.appendChild(input);

    var errorEl = document.createElement('div');
    errorEl.className = 'p-field-error';
    group.appendChild(errorEl);

    return {
      el: group,
      getInputEl: function () {
        return input;
      },
      getValue: function () {
        return input.value;
      },
      setValue: function (v) {
        input.value = v == null ? '' : v;
      },
      errorEl: errorEl,
    };
  }

  function renderNumber(field) {
    var group = document.createElement('div');
    group.className = 'p-form-group';

    var label = document.createElement('label');
    label.className = 'p-label';
    label.textContent = field.label || field.name;
    group.appendChild(label);

    var input = document.createElement('input');
    input.className = 'p-input';
    input.type = 'number';
    input.name = field.name;
    if (field.min !== undefined) input.min = String(field.min);
    if (field.max !== undefined) input.max = String(field.max);
    if (field.step !== undefined) input.step = String(field.step);
    if (field.placeholder) input.placeholder = field.placeholder;
    if (field.value !== undefined) input.value = String(field.value);
    group.appendChild(input);

    var errorEl = document.createElement('div');
    errorEl.className = 'p-field-error';
    group.appendChild(errorEl);

    return {
      el: group,
      getInputEl: function () {
        return input;
      },
      getValue: function () {
        var v = parseFloat(input.value);
        return isNaN(v) ? undefined : v;
      },
      setValue: function (v) {
        input.value = v == null ? '' : String(v);
      },
      errorEl: errorEl,
    };
  }

  function renderSelect(field) {
    var group = document.createElement('div');
    group.className = 'p-form-group';

    var label = document.createElement('label');
    label.className = 'p-label';
    label.textContent = field.label || field.name;
    group.appendChild(label);

    var select = document.createElement('select');
    select.className = 'p-select';
    select.name = field.name;

    // Blank placeholder option
    if (!field.required) {
      var blank = document.createElement('option');
      blank.value = '';
      blank.textContent = field.placeholder || '— Select —';
      select.appendChild(blank);
    }

    var options = field.options || [];
    for (var i = 0; i < options.length; i++) {
      var opt = document.createElement('option');
      opt.value = options[i].value;
      opt.textContent = options[i].label;
      select.appendChild(opt);
    }

    if (field.value !== undefined) select.value = field.value;
    group.appendChild(select);

    var errorEl = document.createElement('div');
    errorEl.className = 'p-field-error';
    group.appendChild(errorEl);

    return {
      el: group,
      getInputEl: function () {
        return select;
      },
      getValue: function () {
        return select.value;
      },
      setValue: function (v) {
        select.value = v == null ? '' : v;
      },
      errorEl: errorEl,
    };
  }

  function renderToggle(field) {
    var group = document.createElement('div');
    group.className = 'p-form-group';

    var toggleLabel = document.createElement('label');
    toggleLabel.className = 'p-toggle';

    var input = document.createElement('input');
    input.type = 'checkbox';
    input.name = field.name;
    if (field.value) input.checked = true;
    toggleLabel.appendChild(input);

    var track = document.createElement('span');
    track.className = 'p-toggle-track';
    toggleLabel.appendChild(track);

    var labelText = document.createElement('span');
    labelText.textContent = field.label || field.name;
    toggleLabel.appendChild(labelText);

    group.appendChild(toggleLabel);

    var errorEl = document.createElement('div');
    errorEl.className = 'p-field-error';
    group.appendChild(errorEl);

    return {
      el: group,
      getInputEl: function () {
        return input;
      },
      getValue: function () {
        return input.checked;
      },
      setValue: function (v) {
        input.checked = !!v;
      },
      errorEl: errorEl,
    };
  }

  function renderSlider(field) {
    var group = document.createElement('div');
    group.className = 'p-form-group';

    var labelRow = document.createElement('div');
    labelRow.style.display = 'flex';
    labelRow.style.justifyContent = 'space-between';
    labelRow.style.alignItems = 'baseline';

    var label = document.createElement('label');
    label.className = 'p-label';
    label.textContent = field.label || field.name;
    labelRow.appendChild(label);

    var valueSpan = document.createElement('span');
    valueSpan.className = 'p-label';
    var initialVal =
      field.value !== undefined ? field.value : field.min !== undefined ? field.min : 0;
    valueSpan.textContent = String(initialVal);
    labelRow.appendChild(valueSpan);

    group.appendChild(labelRow);

    var input = document.createElement('input');
    input.className = 'p-slider';
    input.type = 'range';
    input.name = field.name;
    if (field.min !== undefined) input.min = String(field.min);
    if (field.max !== undefined) input.max = String(field.max);
    if (field.step !== undefined) input.step = String(field.step);
    input.value = String(initialVal);
    group.appendChild(input);

    // Update value display on input
    var inputHandler = function () {
      valueSpan.textContent = input.value;
    };
    input.addEventListener('input', inputHandler);

    var errorEl = document.createElement('div');
    errorEl.className = 'p-field-error';
    group.appendChild(errorEl);

    return {
      el: group,
      getInputEl: function () {
        return input;
      },
      getValue: function () {
        return parseFloat(input.value);
      },
      setValue: function (v) {
        input.value = v == null ? '0' : String(v);
        valueSpan.textContent = input.value;
      },
      errorEl: errorEl,
      _extraListeners: [{ el: input, event: 'input', handler: inputHandler }],
    };
  }

  function renderCheckbox(field) {
    var group = document.createElement('div');
    group.className = 'p-form-group';

    var checkLabel = document.createElement('label');
    checkLabel.className = 'p-checkbox';

    var input = document.createElement('input');
    input.type = 'checkbox';
    input.name = field.name;
    if (field.value) input.checked = true;
    checkLabel.appendChild(input);

    var labelText = document.createElement('span');
    labelText.textContent = field.label || field.name;
    checkLabel.appendChild(labelText);

    group.appendChild(checkLabel);

    var errorEl = document.createElement('div');
    errorEl.className = 'p-field-error';
    group.appendChild(errorEl);

    return {
      el: group,
      getInputEl: function () {
        return input;
      },
      getValue: function () {
        return input.checked;
      },
      setValue: function (v) {
        input.checked = !!v;
      },
      errorEl: errorEl,
    };
  }

  function renderRadio(field) {
    var group = document.createElement('div');
    group.className = 'p-form-group';

    var label = document.createElement('label');
    label.className = 'p-label';
    label.textContent = field.label || field.name;
    group.appendChild(label);

    var options = field.options || [];
    var radios = [];
    for (var i = 0; i < options.length; i++) {
      var radioLabel = document.createElement('label');
      radioLabel.className = 'p-radio';
      radioLabel.style.display = 'flex';
      radioLabel.style.marginBottom = 'var(--p-1)';

      var input = document.createElement('input');
      input.type = 'radio';
      input.name = field.name;
      input.value = options[i].value;
      if (field.value === options[i].value) input.checked = true;
      radioLabel.appendChild(input);

      var optText = document.createElement('span');
      optText.textContent = options[i].label;
      radioLabel.appendChild(optText);

      group.appendChild(radioLabel);
      radios.push(input);
    }

    var errorEl = document.createElement('div');
    errorEl.className = 'p-field-error';
    group.appendChild(errorEl);

    return {
      el: group,
      getInputEl: function () {
        return radios[0] || null;
      },
      getValue: function () {
        for (var j = 0; j < radios.length; j++) {
          if (radios[j].checked) return radios[j].value;
        }
        return undefined;
      },
      setValue: function (v) {
        for (var j = 0; j < radios.length; j++) {
          radios[j].checked = radios[j].value === v;
        }
      },
      errorEl: errorEl,
      _radioInputs: radios,
    };
  }

  var RENDERERS = {
    text: renderText,
    number: renderNumber,
    select: renderSelect,
    toggle: renderToggle,
    slider: renderSlider,
    checkbox: renderCheckbox,
    radio: renderRadio,
  };

  // ==================== FORM BUILDER ====================

  function buildForm(container, opts) {
    opts = opts || {};
    var fields = opts.fields || [];
    var onSubmit = opts.onSubmit || function () {};
    var submitLabel = opts.submitLabel || 'Submit';

    // Clear container
    container.innerHTML = '';

    var formEl = document.createElement('form');
    formEl.addEventListener('submit', function (e) {
      e.preventDefault();
    });
    container.appendChild(formEl);

    var fieldStates = [];
    var listeners = [];

    function addListener(el, event, handler) {
      el.addEventListener(event, handler);
      listeners.push({ el: el, event: event, handler: handler });
    }

    // Build fields
    for (var i = 0; i < fields.length; i++) {
      var fieldDef = fields[i];
      var renderer = RENDERERS[fieldDef.type];
      if (!renderer) continue;

      var rendered = renderer(fieldDef);
      formEl.appendChild(rendered.el);

      var state = {
        name: fieldDef.name,
        fieldDef: fieldDef,
        getValue: rendered.getValue,
        setValue: rendered.setValue,
        getInputEl: rendered.getInputEl,
        errorEl: rendered.errorEl,
        initialValue: fieldDef.value,
      };
      fieldStates.push(state);

      // Register extra listeners (e.g. slider input handler)
      if (rendered._extraListeners) {
        for (var k = 0; k < rendered._extraListeners.length; k++) {
          var extra = rendered._extraListeners[k];
          listeners.push({ el: extra.el, event: extra.event, handler: extra.handler });
        }
      }

      // Attach blur validation
      if (fieldDef.type === 'radio' && rendered._radioInputs) {
        // For radio groups, validate on change of any radio
        (function (st, radioInputs) {
          var changeHandler = function () {
            var val = st.getValue();
            var error = validateField(val, st.fieldDef);
            st.errorEl.textContent = error || '';
          };
          for (var r = 0; r < radioInputs.length; r++) {
            addListener(radioInputs[r], 'change', changeHandler);
          }
        })(state, rendered._radioInputs);
      } else {
        (function (st) {
          var inputEl = st.getInputEl();
          if (!inputEl) return;

          var blurEvent =
            st.fieldDef.type === 'toggle' || st.fieldDef.type === 'checkbox' ? 'change' : 'blur';

          var blurHandler = function () {
            var val = st.getValue();
            var error = validateField(val, st.fieldDef);
            st.errorEl.textContent = error || '';
            if (inputEl.classList) {
              if (error) {
                inputEl.classList.add('p-input-error');
              } else {
                inputEl.classList.remove('p-input-error');
              }
            }
          };
          addListener(inputEl, blurEvent, blurHandler);
        })(state);
      }
    }

    // Submit button
    var submitGroup = document.createElement('div');
    submitGroup.className = 'p-form-group';
    var submitBtn = document.createElement('button');
    submitBtn.className = 'p-btn p-btn-primary p-btn-block';
    submitBtn.type = 'submit';
    submitBtn.textContent = submitLabel;
    submitGroup.appendChild(submitBtn);
    formEl.appendChild(submitGroup);

    // Submit handler
    var submitHandler = function (e) {
      e.preventDefault();
      // Validate all fields
      var hasErrors = false;
      var errors = {};
      var data = {};
      for (var j = 0; j < fieldStates.length; j++) {
        var st = fieldStates[j];
        var val = st.getValue();
        var error = validateField(val, st.fieldDef);
        st.errorEl.textContent = error || '';

        var inputEl = st.getInputEl();
        if (inputEl && inputEl.classList) {
          if (error) {
            inputEl.classList.add('p-input-error');
          } else {
            inputEl.classList.remove('p-input-error');
          }
        }

        if (error) {
          hasErrors = true;
          errors[st.name] = error;
        }
        data[st.name] = val;
      }
      if (!hasErrors) {
        onSubmit(data);
      }
    };
    addListener(formEl, 'submit', submitHandler);

    // ==================== CONTROL HANDLE ====================

    function findField(name) {
      for (var j = 0; j < fieldStates.length; j++) {
        if (fieldStates[j].name === name) return fieldStates[j];
      }
      return null;
    }

    return {
      getValue: function (name) {
        var f = findField(name);
        return f ? f.getValue() : undefined;
      },
      setValue: function (name, value) {
        var f = findField(name);
        if (f) f.setValue(value);
      },
      validate: function () {
        var valid = true;
        var errors = {};
        for (var j = 0; j < fieldStates.length; j++) {
          var st = fieldStates[j];
          var val = st.getValue();
          var error = validateField(val, st.fieldDef);
          st.errorEl.textContent = error || '';

          var inputEl = st.getInputEl();
          if (inputEl && inputEl.classList) {
            if (error) {
              inputEl.classList.add('p-input-error');
            } else {
              inputEl.classList.remove('p-input-error');
            }
          }

          if (error) {
            valid = false;
            errors[st.name] = error;
          }
        }
        return { valid: valid, errors: errors };
      },
      reset: function () {
        for (var j = 0; j < fieldStates.length; j++) {
          var st = fieldStates[j];
          st.setValue(
            st.initialValue !== undefined
              ? st.initialValue
              : st.fieldDef.type === 'toggle' || st.fieldDef.type === 'checkbox'
                ? false
                : ''
          );
          st.errorEl.textContent = '';
          var inputEl = st.getInputEl();
          if (inputEl && inputEl.classList) {
            inputEl.classList.remove('p-input-error');
          }
        }
      },
      dispose: function () {
        for (var j = 0; j < listeners.length; j++) {
          var l = listeners[j];
          l.el.removeEventListener(l.event, l.handler);
        }
        listeners = [];
        fieldStates = [];
        container.innerHTML = '';
      },
    };
  }

  // ==================== ATTACH ====================

  function attach() {
    if (!window.prvctice) {
      setTimeout(attach, 10);
      return;
    }

    // Extend ui namespace (don't replace — runtime.js and notifications.js already populate it)
    window.prvctice.ui = window.prvctice.ui || {};

    /**
     * Create a declarative form from a schema.
     * @param {HTMLElement} container - DOM element to render the form into.
     * @param {Object} opts - { fields: Array, onSubmit: function, submitLabel: string }
     * @returns {{ getValue, setValue, validate, reset, dispose }}
     */
    window.prvctice.ui.form = function (container, opts) {
      return buildForm(container, opts);
    };
  }

  attach();
})();
