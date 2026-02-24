/**
 * Calculator HTML Build
 *
 * ES5-compatible calculator app with keyboard support.
 * Loaded lazily by the calculator config via dynamic import.
 */

export const CALC_HTML =
  `<!DOCTYPE html>
<html>
<head>
<style>
.calc-display {
  background: var(--p-surface-sunken);
  border: 1px solid rgba(68, 136, 255, 0.08);
  border-radius: var(--p-radius-sm);
  padding: var(--p-3);
}
.calc-value {
  font-size: 32px;
  font-family: var(--p-font-mono);
  font-weight: 700;
  text-align: right;
  min-height: 48px;
  word-break: break-all;
  color: var(--p-text);
}
.calc-expr {
  font-size: 10px;
  font-family: var(--p-font-mono);
  text-align: right;
  min-height: 16px;
  color: var(--p-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.calc-btn {
  height: 48px;
  font-family: var(--p-font-mono);
  font-size: 15px;
  font-weight: 600;
}
.calc-btn-op {
  color: var(--p-text);
}
.calc-btn-zero {
  grid-column: span 2;
}
</style>
<meta charset="utf-8">
</head>
<body class="p-stack pad-2 full gap-1">
  <div id="mainContent" class="p-stack full gap-1">
    <div class="p-terminal-header">
      <span class="p-label-tech">CALCULATOR</span>
      <span id="calcMode" class="p-label-tech" style="color:var(--p-text-muted)">STANDARD</span>
    </div>
    <div class="p-stack gap-1" id="inputSection">
      <div class="calc-display">
        <div class="calc-value" id="display">0</div>
        <div class="calc-expr" id="expression"></div>
      </div>
    </div>
    <div class="p-row gap-1" id="actionButtons">
      <div class="p-grid gap-1" style="--cols:4">
        <button class="p-btn p-btn-ghost calc-btn" data-action="clear">C</button>
        <button class="p-btn p-btn-ghost calc-btn" data-action="backspace">\u232B</button>
        <button class="p-btn p-btn-ghost calc-btn calc-btn-op" data-action="percent">%</button>
        <button class="p-btn p-btn-ghost calc-btn calc-btn-op" data-action="divide">\u00F7</button>
        <button class="p-btn p-btn-ghost calc-btn" data-action="7">7</button>
        <button class="p-btn p-btn-ghost calc-btn" data-action="8">8</button>
        <button class="p-btn p-btn-ghost calc-btn" data-action="9">9</button>
        <button class="p-btn p-btn-ghost calc-btn calc-btn-op" data-action="multiply">\u00D7</button>
        <button class="p-btn p-btn-ghost calc-btn" data-action="4">4</button>
        <button class="p-btn p-btn-ghost calc-btn" data-action="5">5</button>
        <button class="p-btn p-btn-ghost calc-btn" data-action="6">6</button>
        <button class="p-btn p-btn-ghost calc-btn calc-btn-op" data-action="subtract">\u2212</button>
        <button class="p-btn p-btn-ghost calc-btn" data-action="1">1</button>
        <button class="p-btn p-btn-ghost calc-btn" data-action="2">2</button>
        <button class="p-btn p-btn-ghost calc-btn" data-action="3">3</button>
        <button class="p-btn p-btn-ghost calc-btn calc-btn-op" data-action="add">+</button>
        <button class="p-btn p-btn-ghost calc-btn calc-btn-zero" data-action="0">0</button>
        <button class="p-btn p-btn-ghost calc-btn" data-action="decimal">.</button>
        <button class="p-btn p-btn-primary calc-btn" data-action="equals">=</button>
      </div>
    </div>
  </div>
  <div id="errorState" class="p-center full-height" style="display:none">
    <div class="p-empty"><div class="p-empty-message" id="errorMsg">NO SIGNAL</div></div>
  </div>
</body>
<script>prvctice.onReady(function() {
  var displayEl = document.getElementById("display");
  var expressionEl = document.getElementById("expression");
  var currentValue = "0";
  var previousValue = "";
  var operation = null;
  var shouldResetDisplay = false;
  function updateDisplay() {
    displayEl.textContent = currentValue;
    if (operation && previousValue) {
      var opSymbol = operation === "add" ? "+" : operation === "subtract" ? "\\u2212" : operation === "multiply" ? "\\u00D7" : "\\u00F7";
      expressionEl.textContent = previousValue + " " + opSymbol;
    } else {
      expressionEl.textContent = "";
    }
  }
  function appendDigit(digit) {
    if (shouldResetDisplay) {
      currentValue = digit;
      shouldResetDisplay = false;
    } else {
      currentValue = currentValue === "0" ? digit : currentValue + digit;
    }
    updateDisplay();
  }
  function appendDecimal() {
    if (shouldResetDisplay) {
      currentValue = "0.";
      shouldResetDisplay = false;
    } else if (currentValue.indexOf(".") === -1) {
      currentValue += ".";
    }
    updateDisplay();
  }
  function handleOperation(op) {
    if (operation && !shouldResetDisplay) {
      calculate();
    }
    previousValue = currentValue;
    operation = op;
    shouldResetDisplay = true;
  }
  function calculate() {
    if (!operation || !previousValue) return;
    var prev = parseFloat(previousValue);
    var current = parseFloat(currentValue);
    var result = 0;
    if (operation === "add") result = prev + current;
    else if (operation === "subtract") result = prev - current;
    else if (operation === "multiply") result = prev * current;
    else if (operation === "divide") {
      if (current === 0) {
        currentValue = "Error";
        operation = null;
        previousValue = "";
        shouldResetDisplay = true;
        updateDisplay();
        return;
      }
      result = prev / current;
    }
    currentValue = String(Math.round(result * 1e8) / 1e8);
    operation = null;
    previousValue = "";
    shouldResetDisplay = true;
    updateDisplay();
  }
  function handlePercent() {
    var num = parseFloat(currentValue);
    currentValue = String(num / 100);
    updateDisplay();
  }
  function clearAll() {
    currentValue = "0";
    previousValue = "";
    operation = null;
    shouldResetDisplay = false;
    updateDisplay();
  }
  function backspace() {
    if (currentValue.length > 1) {
      currentValue = currentValue.slice(0, -1);
    } else {
      currentValue = "0";
    }
    updateDisplay();
  }
  var buttonsContainer = document.querySelector("[data-action]").parentElement;
  buttonsContainer.addEventListener("click", function(e) {
    var btn = e.target.closest("[data-action]");
    if (!btn) return;
    var action = btn.getAttribute("data-action");
    if (action >= "0" && action <= "9") {
      appendDigit(action);
    } else if (action === "decimal") {
      appendDecimal();
    } else if (action === "add" || action === "subtract" || action === "multiply" || action === "divide") {
      handleOperation(action);
    } else if (action === "equals") {
      calculate();
    } else if (action === "clear") {
      clearAll();
    } else if (action === "backspace") {
      backspace();
    } else if (action === "percent") {
      handlePercent();
    }
  });
  document.addEventListener("keydown", function(e) {
    if (e.key >= "0" && e.key <= "9") {
      appendDigit(e.key);
    } else if (e.key === ".") {
      appendDecimal();
    } else if (e.key === "+") {
      handleOperation("add");
    } else if (e.key === "-") {
      handleOperation("subtract");
    } else if (e.key === "*") {
      handleOperation("multiply");
    } else if (e.key === "/") {
      e.preventDefault();
      handleOperation("divide");
    } else if (e.key === "Enter" || e.key === "=") {
      e.preventDefault();
      calculate();
    } else if (e.key === "Escape" || e.key === "c" || e.key === "C") {
      clearAll();
    } else if (e.key === "Backspace") {
      backspace();
    } else if (e.key === "%") {
      handlePercent();
    }
  });
  updateDisplay();
});
<` +
  `/script>
</html>`;
