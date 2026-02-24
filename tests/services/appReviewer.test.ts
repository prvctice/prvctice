import test from 'node:test';
import assert from 'node:assert/strict';

import { reviewApp, scoreCompliance } from '../../src/services/appReviewer.js';
import type { ComplianceScore, ReviewResult } from '../../src/services/appReviewer.js';

// ---------------------------------------------------------------------------
// Helpers: HTML builders
// ---------------------------------------------------------------------------

/** Builds a valid widget HTML string with all best practices. */
function perfectWidget(
  overrides: {
    heroValue?: string;
    heroLabel?: string;
    dataRows?: string;
    scriptBody?: string;
    styleBlock?: string;
    bodyAttrs?: string;
    bodyContent?: string;
  } = {}
): string {
  const heroValue = overrides.heroValue ?? '72&deg;';
  const heroLabel = overrides.heroLabel ?? 'TEMPERATURE';
  const dataRows =
    overrides.dataRows ??
    `
    <div class="p-split"><span class="p-label-tech">WIND</span><span class="font-mono">12 mph</span></div>
    <div class="p-split"><span class="p-label-tech">HUMIDITY</span><span class="font-mono">45%</span></div>`;
  const scriptBody =
    overrides.scriptBody ??
    `
    prvctice.onReady(function() {
      var temp = document.getElementById('heroValue');
      prvctice.weather.current().then(function(data) {
        temp.textContent = Math.round(data.current.temperature_2m) + '\\u00B0';
      }).catch(function(err) {
        document.getElementById('errorState').style.display = 'flex';
        document.getElementById('mainContent').style.display = 'none';
      });
    });`;
  const styleBlock = overrides.styleBlock ?? '';
  const bodyAttrs = overrides.bodyAttrs ?? 'class="p-stack pad-4 full gap-3"';
  const bodyContent = overrides.bodyContent;

  const body =
    bodyContent ??
    `
    <div id="mainContent">
      <div class="p-stat p-stat-left" style="padding:0">
        <div class="p-stat-value font-mono font-bold" id="heroValue"
             style="color:var(--p-primary);font-size:var(--p-text-3xl)">${heroValue}</div>
        <div class="p-stat-label p-label-tech" id="heroLabel">${heroLabel}</div>
      </div>
      <div class="p-divider"></div>
      <div class="p-stack gap-2">
        ${dataRows}
      </div>
    </div>
    <div id="errorState" class="p-center full-height" style="display:none">
      <div class="p-empty"><div class="p-empty-message" id="errorMsg">NO SIGNAL</div></div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8">${styleBlock ? `<style>${styleBlock}</style>` : ''}</head>
<body ${bodyAttrs}>
  ${body}
  <script>${scriptBody}</script>
</body>
</html>`;
}

/** Builds minimal valid widget HTML (no data rows, no hero, but structurally sound). */
function minimalWidget(scriptBody?: string): string {
  return `<!DOCTYPE html>
<html><head></head>
<body class="p-stack pad-4 full">
  <div id="mainContent"><p>Hello</p></div>
  <div id="errorState" style="display:none"><div class="p-empty"><div class="p-empty-message">Error</div></div></div>
  <script>${scriptBody ?? 'prvctice.onReady(function() { var x = 1; });'}</script>
</body>
</html>`;
}

// ===========================================================================
// scoreCompliance() tests
// ===========================================================================

test('scoreCompliance: perfect widget scores 100', function () {
  const result = scoreCompliance(perfectWidget());
  assert.equal(result.score, 100);
  assert.equal(result.pass, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.breakdown.tokenCompliance, 40);
  assert.equal(result.breakdown.structureAdherence, 35);
  assert.equal(result.breakdown.contentDensity, 25);
});

// ---------------------------------------------------------------------------
// Hard fail: hardcoded hex colors in CSS contexts
// ---------------------------------------------------------------------------

test('scoreCompliance: hardcoded hex in inline style -> hard fail (score 0)', function () {
  const html = perfectWidget({
    bodyContent: `
      <div id="mainContent">
        <div style="color:#ff0000">Bad color</div>
      </div>
      <div id="errorState" style="display:none"><div class="p-empty"><div class="p-empty-message">Error</div></div></div>`,
  });
  const result = scoreCompliance(html);
  assert.equal(result.score, 0);
  assert.equal(result.pass, false);
  assert.ok(
    result.errors.some(function (e) {
      return /hardcoded hex/i.test(e);
    })
  );
});

test('scoreCompliance: hardcoded hex in style block -> hard fail (score 0)', function () {
  const html = perfectWidget({ styleBlock: '.foo { background: #333; }' });
  const result = scoreCompliance(html);
  assert.equal(result.score, 0);
  assert.equal(result.pass, false);
  assert.ok(
    result.errors.some(function (e) {
      return /hardcoded hex/i.test(e);
    })
  );
});

test('scoreCompliance: hardcoded rgb/rgba in CSS -> hard fail (score 0)', function () {
  const html = perfectWidget({ styleBlock: '.bar { color: rgb(255, 0, 0); }' });
  const result = scoreCompliance(html);
  assert.equal(result.score, 0);
  assert.equal(result.pass, false);
  assert.ok(
    result.errors.some(function (e) {
      return /hardcoded rgb/i.test(e);
    })
  );
});

// ---------------------------------------------------------------------------
// Hard fail: missing prvctice.onReady
// ---------------------------------------------------------------------------

test('scoreCompliance: missing prvctice.onReady -> hard fail (score 0)', function () {
  const html = perfectWidget({
    scriptBody: 'var x = document.getElementById("heroValue"); x.textContent = "test";',
  });
  const result = scoreCompliance(html);
  assert.equal(result.score, 0);
  assert.equal(result.pass, false);
  assert.ok(
    result.errors.some(function (e) {
      return /onReady/i.test(e);
    })
  );
});

// ---------------------------------------------------------------------------
// Hard fail: ES5 violations
// ---------------------------------------------------------------------------

test('scoreCompliance: const/let (ES5 violation) -> hard fail (score 0)', function () {
  const html = perfectWidget({
    scriptBody: `prvctice.onReady(function() {
      const temp = document.getElementById('heroValue');
      temp.textContent = 'test';
    });`,
  });
  const result = scoreCompliance(html);
  assert.equal(result.score, 0);
  assert.equal(result.pass, false);
  assert.ok(
    result.errors.some(function (e) {
      return /ES5/i.test(e);
    })
  );
});

// ---------------------------------------------------------------------------
// Hard fail: security violations
// ---------------------------------------------------------------------------

test('scoreCompliance: eval() -> hard fail (score 0)', function () {
  const html = perfectWidget({
    scriptBody: 'prvctice.onReady(function() { eval("1+1"); });',
  });
  const result = scoreCompliance(html);
  assert.equal(result.score, 0);
  assert.equal(result.pass, false);
  assert.ok(
    result.errors.some(function (e) {
      return /security/i.test(e) || /eval/i.test(e);
    })
  );
});

// ---------------------------------------------------------------------------
// Hard fail: no HTML content
// ---------------------------------------------------------------------------

test('scoreCompliance: empty body (no HTML content) -> hard fail (score 0)', function () {
  const html = `<!DOCTYPE html><html><head></head><body>
    <script>prvctice.onReady(function() { var x = 1; });</script>
  </body></html>`;
  const result = scoreCompliance(html);
  assert.equal(result.score, 0);
  assert.equal(result.pass, false);
  assert.ok(
    result.errors.some(function (e) {
      return /no html content/i.test(e) || /body/i.test(e);
    })
  );
});

// ---------------------------------------------------------------------------
// Structure deductions (non-hard-fail)
// ---------------------------------------------------------------------------

test('scoreCompliance: missing error state container -> ~90, warning', function () {
  const html = perfectWidget({
    bodyContent: `
      <div id="mainContent">
        <div class="p-stat p-stat-left" style="padding:0">
          <div class="p-stat-value font-mono font-bold" id="heroValue"
               style="color:var(--p-primary);font-size:var(--p-text-3xl)">72&deg;</div>
          <div class="p-stat-label p-label-tech" id="heroLabel">TEMPERATURE</div>
        </div>
        <div class="p-divider"></div>
        <div class="p-stack gap-2">
          <div class="p-split"><span class="p-label-tech">WIND</span><span class="font-mono">12 mph</span></div>
        </div>
      </div>`,
  });
  const result = scoreCompliance(html);
  // Structure loses 10 for missing errorState -> 35-10 = 25 -> total 40+25+25 = 90
  assert.equal(result.breakdown.structureAdherence, 25);
  assert.equal(result.score, 90);
  assert.equal(result.pass, true);
  assert.ok(
    result.warnings.some(function (w) {
      return /error state/i.test(w);
    })
  );
});

test('scoreCompliance: starts with <h1> -> structure deduction, warning', function () {
  const html = perfectWidget({
    bodyContent: `
      <h1>Weather</h1>
      <div id="mainContent">
        <div class="p-stat p-stat-left">
          <div class="p-stat-value font-mono font-bold" id="heroValue"
               style="color:var(--p-primary);font-size:var(--p-text-3xl)">72&deg;</div>
          <div class="p-stat-label p-label-tech">TEMP</div>
        </div>
      </div>
      <div id="errorState" style="display:none"><div class="p-empty"><div class="p-empty-message">Error</div></div></div>`,
  });
  const result = scoreCompliance(html);
  // Structure loses 10 for header -> 35-10 = 25 -> total 40+25+25 = 90
  assert.equal(result.breakdown.structureAdherence, 25);
  assert.equal(result.score, 90);
  assert.ok(
    result.warnings.some(function (w) {
      return /header/i.test(w) || /h[1-6]/i.test(w);
    })
  );
});

// ---------------------------------------------------------------------------
// Missing .catch() -> structure deduction (warning)
// ---------------------------------------------------------------------------

test('scoreCompliance: missing .catch() on connector call -> deduction, warning', function () {
  const html = perfectWidget({
    scriptBody: `prvctice.onReady(function() {
      var temp = document.getElementById('heroValue');
      prvctice.weather.current().then(function(data) {
        temp.textContent = Math.round(data.current.temperature_2m) + '\\u00B0';
      });
    });`,
  });
  const result = scoreCompliance(html);
  // Missing .catch: -5 from structure -> 35-5 = 30 -> total 40+30+25 = 95
  assert.equal(result.breakdown.structureAdherence, 30);
  assert.equal(result.score, 95);
  assert.ok(
    result.warnings.some(function (w) {
      return /\.catch/i.test(w);
    })
  );
});

// ---------------------------------------------------------------------------
// Hex color exception: color-accent archetype
// ---------------------------------------------------------------------------

test('scoreCompliance: #fff on color-accent archetype is NOT penalized', function () {
  const html = perfectWidget({
    styleBlock: '.accent { background: #fff; }',
  });
  const result = scoreCompliance(html, 'color-accent');
  assert.ok(result.score > 0, 'Should not hard-fail for #fff on color-accent');
  assert.ok(
    !result.errors.some(function (e) {
      return /hardcoded hex/i.test(e);
    })
  );
});

// ---------------------------------------------------------------------------
// Hex in script content (not CSS) should NOT be penalized
// ---------------------------------------------------------------------------

test('scoreCompliance: hex in script context is NOT penalized', function () {
  const html = perfectWidget({
    scriptBody: `prvctice.onReady(function() {
      var color = '#ff6600';
      var el = document.getElementById('heroValue');
      el.textContent = 'test';
    });`,
  });
  const result = scoreCompliance(html);
  // Hex is in JS string, not in CSS context -- should not cause hard fail
  assert.ok(result.score > 0, 'Hex in script should not cause hard fail');
  assert.ok(
    !result.errors.some(function (e) {
      return /hardcoded hex/i.test(e);
    })
  );
});

// ---------------------------------------------------------------------------
// Threshold parameter
// ---------------------------------------------------------------------------

test('scoreCompliance: custom threshold - score 90 with threshold 95 -> fail', function () {
  // missing errorState -> score 90
  const html = perfectWidget({
    bodyContent: `
      <div id="mainContent">
        <div class="p-stat p-stat-left" style="padding:0">
          <div class="p-stat-value font-mono font-bold" id="heroValue"
               style="color:var(--p-primary);font-size:var(--p-text-3xl)">72&deg;</div>
          <div class="p-stat-label p-label-tech">TEMP</div>
        </div>
        <div class="p-divider"></div>
        <div class="p-stack gap-2">
          <div class="p-split"><span class="p-label-tech">WIND</span><span class="font-mono">12</span></div>
        </div>
      </div>`,
  });
  const result = scoreCompliance(html, undefined, 95);
  assert.equal(result.score, 90);
  assert.equal(result.pass, false);
});

test('scoreCompliance: custom threshold - score 90 with threshold 80 -> pass', function () {
  // missing errorState -> score 90
  const html = perfectWidget({
    bodyContent: `
      <div id="mainContent">
        <div class="p-stat p-stat-left" style="padding:0">
          <div class="p-stat-value font-mono font-bold" id="heroValue"
               style="color:var(--p-primary);font-size:var(--p-text-3xl)">72&deg;</div>
          <div class="p-stat-label p-label-tech">TEMP</div>
        </div>
        <div class="p-divider"></div>
        <div class="p-stack gap-2">
          <div class="p-split"><span class="p-label-tech">WIND</span><span class="font-mono">12</span></div>
        </div>
      </div>`,
  });
  const result = scoreCompliance(html, undefined, 80);
  assert.equal(result.score, 90);
  assert.equal(result.pass, true);
});

// ---------------------------------------------------------------------------
// Backward compatibility: reviewApp() still works
// ---------------------------------------------------------------------------

test('reviewApp: still returns {pass, errors, warnings}', function () {
  const html = perfectWidget();
  const result: ReviewResult = reviewApp(html);
  assert.equal(typeof result.pass, 'boolean');
  assert.ok(Array.isArray(result.errors));
  assert.ok(Array.isArray(result.warnings));
  assert.equal(result.pass, true);
  assert.equal(result.errors.length, 0);
});

test('reviewApp: detects errors like before', function () {
  const html = perfectWidget({
    scriptBody: 'var x = document.getElementById("heroValue"); x.textContent = "test";',
  });
  const result = reviewApp(html);
  assert.equal(result.pass, false);
  assert.ok(result.errors.length > 0);
});

// ---------------------------------------------------------------------------
// Content density deductions
// ---------------------------------------------------------------------------

test('scoreCompliance: no hero element on hero-stat archetype -> density deduction', function () {
  // Widget with no large text (no text-3xl/4xl, no p-stat-value)
  const html = `<!DOCTYPE html>
<html><head></head>
<body class="p-stack pad-4 full gap-3">
  <div id="mainContent">
    <div class="p-split"><span class="p-label-tech">TEMP</span><span class="font-mono">72</span></div>
    <div class="p-split"><span class="p-label-tech">WIND</span><span class="font-mono">12</span></div>
  </div>
  <div id="errorState" style="display:none"><div class="p-empty"><div class="p-empty-message">Error</div></div></div>
  <script>prvctice.onReady(function() {
    var el = document.getElementById('mainContent');
    prvctice.weather.current().then(function(data) {
      el.textContent = data.current.temperature_2m;
    }).catch(function() {});
  });</script>
</body></html>`;
  const result = scoreCompliance(html, 'hero-stat');
  // Missing hero element: -8 from density -> 25-8 = 17
  assert.equal(result.breakdown.contentDensity, 17);
  assert.ok(
    result.warnings.some(function (w) {
      return /hero/i.test(w);
    })
  );
});

test('scoreCompliance: same-size text (no hierarchy) -> density deduction', function () {
  // All text same size, no p-stat-value, no text-3xl, no font-bold
  const html = `<!DOCTYPE html>
<html><head></head>
<body class="p-stack pad-4 full gap-3">
  <div id="mainContent">
    <p>Temperature is 72 degrees</p>
    <p>Wind speed is 12 mph</p>
    <p>Humidity is 45 percent</p>
  </div>
  <div id="errorState" style="display:none"><div class="p-empty"><div class="p-empty-message">Error</div></div></div>
  <script>prvctice.onReady(function() { var x = 1; });</script>
</body></html>`;
  const result = scoreCompliance(html);
  // Same-size text: -8 from density -> 25-8 = 17
  assert.equal(result.breakdown.contentDensity, 17);
  assert.ok(
    result.warnings.some(function (w) {
      return /hierarchy/i.test(w) || /same.?size/i.test(w);
    })
  );
});

// ---------------------------------------------------------------------------
// ComplianceScore interface shape
// ---------------------------------------------------------------------------

test('scoreCompliance: returns correct interface shape', function () {
  const result = scoreCompliance(perfectWidget());
  // Check all required properties exist
  assert.equal(typeof result.score, 'number');
  assert.equal(typeof result.pass, 'boolean');
  assert.ok(Array.isArray(result.errors));
  assert.ok(Array.isArray(result.warnings));
  assert.equal(typeof result.breakdown, 'object');
  assert.equal(typeof result.breakdown.tokenCompliance, 'number');
  assert.equal(typeof result.breakdown.structureAdherence, 'number');
  assert.equal(typeof result.breakdown.contentDensity, 'number');
  // Score bounds
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.ok(result.breakdown.tokenCompliance >= 0 && result.breakdown.tokenCompliance <= 40);
  assert.ok(result.breakdown.structureAdherence >= 0 && result.breakdown.structureAdherence <= 35);
  assert.ok(result.breakdown.contentDensity >= 0 && result.breakdown.contentDensity <= 25);
});

// ---------------------------------------------------------------------------
// Multiple violations stack
// ---------------------------------------------------------------------------

test('scoreCompliance: multiple non-hard-fail deductions stack correctly', function () {
  // Missing errorState (-10 structure) + starts with h1 (-10 structure) + no hierarchy (-8 density)
  const html = `<!DOCTYPE html>
<html><head></head>
<body class="p-stack pad-4 full gap-3">
  <h1>Dashboard</h1>
  <div id="mainContent">
    <p>Some text here</p>
    <p>More text here</p>
  </div>
  <script>prvctice.onReady(function() { var x = 1; });</script>
</body></html>`;
  const result = scoreCompliance(html);
  // structure: 35 - 10 (no errorState) - 10 (header) = 15
  // density: 25 - 8 (no hierarchy) = 17
  // token: 40
  // total: 40 + 15 + 17 = 72
  assert.equal(result.breakdown.structureAdherence, 15);
  assert.equal(result.breakdown.contentDensity, 17);
  assert.equal(result.score, 72);
  assert.equal(result.pass, false); // below default threshold of 80
});
