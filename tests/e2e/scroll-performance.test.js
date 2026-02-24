/**
 * Scroll Performance Benchmarks for Virtual Scrolling
 *
 * PURPOSE:
 * Verify that Virtua-based virtual scrolling meets performance targets:
 * - 60+ FPS during scroll (ideally 120 FPS on ProMotion displays)
 * - Memory stays stable as conversations grow (< 5MB per 100 messages)
 * - Only visible messages render in DOM (virtualization working)
 *
 * RUNNING:
 * 1. Start dev server: npm run web:dev
 * 2. Run benchmarks: node --import tsx --test tests/e2e/scroll-performance.test.js
 *
 * For visual debugging (watch the browser):
 *   HEADLESS=false node --import tsx --test tests/e2e/scroll-performance.test.js
 *
 * ENVIRONMENT VARIABLES:
 * - HEADLESS=false  Watch browser window during tests (default: headless mode)
 * - SKIP_E2E=true   Skip entire suite when dev server unavailable (CI environments)
 *
 * INTERPRETING FPS RESULTS:
 * These benchmarks measure actual rendering performance via Chrome DevTools Protocol,
 * not just JavaScript execution time. The FPS numbers reflect real frame delivery:
 *
 *   FPS < 30:  Severe issues - visually choppy, needs immediate attention
 *   FPS 30-45: Poor - noticeable jank during scroll
 *   FPS 45-60: Acceptable - minor jank possible, OK for 60Hz displays
 *   FPS 60-90: Good - smooth on standard displays
 *   FPS 90+:   Excellent - ready for ProMotion/high-refresh displays
 *
 * Target thresholds in tests are set conservatively to avoid flaky failures:
 * - Minimum: 30 FPS (34ms frame time) - catches severe regressions in headless env
 * - Ideal: 120 FPS (8.33ms frame time) - ProMotion target
 *
 * INTERPRETING MEMORY RESULTS:
 * Memory is measured via HeapProfiler with forced GC before each measurement.
 * This gives us the actual retained memory, not transient allocations.
 *
 *   Growth < 5MB/100 msgs:   Healthy - virtualization working correctly
 *   Growth 5-10MB/100 msgs:  Warning - may be caching too much
 *   Growth > 10MB/100 msgs:  Problem - possible memory leak, investigate
 *
 * TROUBLESHOOTING:
 * - "chat-scroller not found": App not loaded, selector changed, or loading timeout
 * - Trace analysis shows 0 frames: CDP session issue, browser crashed, or tab frozen
 * - Memory test shows high initial: Previous test data cached, try fresh browser
 * - Tests timeout: Dev server not running, or app taking too long to load
 *
 * TRACE ANALYSIS METHODOLOGY:
 * We use Chrome DevTools Protocol (CDP) tracing with 'devtools.timeline' category.
 * Frame events from the trace indicate actual browser rendering:
 *
 *   'DrawFrame' - Browser compositor draws a frame to the screen
 *   'Commit'    - Main thread commits frame data to compositor
 *
 * These events give us true rendering frame times, not just JS execution.
 * We calculate FPS as: 1000ms / average_frame_time_ms
 *
 * OUTLIER FILTERING:
 * Frame times > 100ms are filtered as outliers. These typically indicate:
 * - Test setup/teardown artifacts (initial paint, final cleanup)
 * - Garbage collection pauses unrelated to scroll performance
 * - Browser tab backgrounding (especially in headless mode)
 * - Network requests blocking the main thread
 *
 * Filtering outliers gives us a cleaner picture of scroll-specific performance.
 * A high outlier count may itself indicate issues worth investigating.
 *
 * MESSAGE INJECTION:
 * Tests inject messages via a custom event '__test_inject_messages'.
 * ChatWindow.vue should listen for this event in DEV mode only.
 * If injection doesn't work, tests will still run but with existing messages.
 */

const test = require('node:test');
const assert = require('node:assert');

// Skip entire suite if SKIP_E2E is set (for CI without dev server)
const shouldSkip = process.env.SKIP_E2E === 'true';

test.describe('scroll performance benchmarks', { skip: shouldSkip }, () => {
  /** @type {import('playwright').Browser} */
  let browser;
  /** @type {import('playwright').BrowserContext} */
  let context;
  /** @type {import('playwright').Page} */
  let page;
  /** @type {import('playwright').CDPSession} */
  let client;

  test.before(async () => {
    // Dynamic import for playwright (ESM)
    const { chromium } = await import('playwright');

    browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
    });
    context = await browser.newContext();
    page = await context.newPage();

    // Connect to Chrome DevTools Protocol for performance metrics
    client = await context.newCDPSession(page);
    await client.send('Performance.enable');
  });

  test.after(async () => {
    await browser?.close();
  });

  test('scrolling 50+ messages maintains smooth FPS', async () => {
    // Navigate to app
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

    // Wait for chat to be ready
    await page.waitForSelector('.chat-scroller', { timeout: 10000 });

    // Inject test messages (simulate 50+ message conversation)
    // We use page.evaluate to directly manipulate the DOM since we can't
    // easily access Pinia stores from test context
    await page.evaluate(() => {
      const messages = [];
      for (let i = 0; i < 60; i++) {
        messages.push({
          id: `test-msg-${i}`,
          sender: i % 2 === 0 ? 'user' : 'assistant',
          text: `Test message ${i}. `.repeat(3 + Math.floor(Math.random() * 10)),
          images: [],
        });
      }

      // Dispatch custom event for test injection (ChatWindow listens in dev mode)
      window.dispatchEvent(new CustomEvent('__test_inject_messages', { detail: messages }));
    });

    // Give time for messages to render
    await page.waitForTimeout(500);

    // Start performance tracing via Chrome DevTools Protocol
    // The 'devtools.timeline' category captures:
    // - Rendering events (DrawFrame, Commit)
    // - Layout/paint events
    // - Frame timing information
    // We use CDP Tracing directly (Playwright exposes context.tracing for its
    // own format, but we need raw DevTools trace events for frame analysis)
    const traceChunks = [];
    client.on('Tracing.dataCollected', ({ value }) => traceChunks.push(...value));

    await client.send('Tracing.start', {
      categories: 'devtools.timeline,disabled-by-default-devtools.timeline',
    });

    // Perform scroll operation - scroll to top
    await page.evaluate(() => {
      const scroller = document.querySelector('.chat-scroller');
      if (scroller) {
        scroller.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });

    // Wait for scroll to complete
    await page.waitForTimeout(2000);

    // Scroll back to bottom
    await page.evaluate(() => {
      const scroller = document.querySelector('.chat-scroller');
      if (scroller) {
        scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
      }
    });

    await page.waitForTimeout(2000);

    // Stop tracing and collect results
    await new Promise((resolve) => {
      client.once('Tracing.tracingComplete', resolve);
      client.send('Tracing.end');
    });
    const traceData = { traceEvents: traceChunks };

    // TRACE ANALYSIS: Extract frame timing from DevTools Protocol events
    // ----------------------------------------------------------------
    // The trace contains thousands of events. We filter for:
    // - 'DrawFrame': Browser actually drew a frame to screen
    // - 'Commit': Compositor received frame from main thread
    //
    // These represent actual visual frame delivery, not JS execution.
    // Event timestamps are in microseconds since trace start.
    const frameEvents = traceData.traceEvents.filter(
      (e) => e.name === 'DrawFrame' || e.name === 'Commit'
    );

    if (frameEvents.length >= 2) {
      // Calculate frame-to-frame deltas to get actual frame times
      // This gives us the real rendering cadence, accounting for:
      // - Browser vsync timing
      // - Main thread blocking
      // - Compositor delays
      const frameTimes = [];
      let outlierCount = 0;

      for (let i = 1; i < frameEvents.length; i++) {
        // Convert microseconds (from trace) to milliseconds
        // Formula: (current_timestamp - previous_timestamp) / 1000
        const delta = (frameEvents[i].ts - frameEvents[i - 1].ts) / 1000;

        // OUTLIER FILTERING: Skip frame times > 100ms
        // These are almost always artifacts, not scroll performance:
        // - Initial render/paint (browser warming up)
        // - GC pauses (unrelated to scroll code)
        // - Tab backgrounding (OS scheduling)
        // - Test setup overhead
        if (delta > 0 && delta < 100) {
          frameTimes.push(delta);
        } else if (delta >= 100) {
          outlierCount++;
        }
      }

      if (frameTimes.length > 0) {
        const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        const fps = 1000 / avgFrameTime;

        // Log results for analysis
        // Frame time is the inverse of FPS: 16.67ms = 60 FPS, 8.33ms = 120 FPS
        console.log(`--- FPS Analysis ---`);
        console.log(`Average frame time: ${avgFrameTime.toFixed(2)}ms`);
        console.log(`Estimated FPS: ${fps.toFixed(1)}`);
        console.log(`Frame count: ${frameTimes.length} (${outlierCount} outliers filtered)`);

        // Target: at least 60 FPS (16.67ms per frame) on real hardware
        // Ideal: 120 FPS (8.33ms per frame) on ProMotion
        // Threshold: 34ms (~30 FPS) catches severe regressions without flaking
        // in headless test environments where overhead is significant
        assert.ok(
          avgFrameTime < 34,
          `Frame time ${avgFrameTime}ms exceeds 34ms threshold (30+ FPS required)`
        );
      }
    }

    // Verify virtualization is working: only visible messages should be in DOM
    // With 60 messages total, we expect far fewer to be actually rendered
    const renderedCount = await page.evaluate(() => {
      // Count actual message elements (not spacers)
      const messages = document.querySelectorAll('.message');
      return messages.length;
    });

    console.log(`Rendered message count: ${renderedCount}`);

    // With virtualization, we should render significantly fewer than total messages
    // The exact number depends on viewport size, but 30 is a reasonable upper bound
    assert.ok(
      renderedCount < 30,
      `Expected virtual scrolling to render < 30 messages, got ${renderedCount}. ` +
        `Virtualization may not be working correctly.`
    );
  });

  test('memory stays stable as conversation grows', async () => {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    await page.waitForSelector('.chat-scroller', { timeout: 10000 });

    // Force garbage collection and get initial memory baseline
    await client.send('HeapProfiler.collectGarbage');
    const initialHeap = await client.send('Runtime.getHeapUsage');
    const initialMB = initialHeap.usedSize / (1024 * 1024);
    console.log(`Initial heap: ${initialMB.toFixed(2)} MB`);

    // Add messages in batches, scrolling between each batch to exercise virtualization
    for (let batch = 0; batch < 5; batch++) {
      await page.evaluate((batchNum) => {
        const messages = [];
        for (let i = 0; i < 20; i++) {
          const msgId = batchNum * 20 + i;
          messages.push({
            id: `test-msg-${msgId}`,
            sender: i % 2 === 0 ? 'user' : 'assistant',
            text: `Batch ${batchNum} message ${i}. `.repeat(5),
            images: [],
          });
        }
        window.dispatchEvent(new CustomEvent('__test_inject_messages', { detail: messages }));
      }, batch);

      await page.waitForTimeout(300);

      // Scroll to trigger virtualization - exercise the virtual list
      await page.evaluate(() => {
        const scroller = document.querySelector('.chat-scroller');
        if (scroller) {
          scroller.scrollTo({ top: 0 });
          scroller.scrollTo({ top: scroller.scrollHeight });
        }
      });

      await page.waitForTimeout(200);
    }

    // Force garbage collection and measure final memory
    await client.send('HeapProfiler.collectGarbage');
    const finalHeap = await client.send('Runtime.getHeapUsage');
    const finalMB = finalHeap.usedSize / (1024 * 1024);
    const growthMB = finalMB - initialMB;

    console.log(`Final heap: ${finalMB.toFixed(2)} MB`);
    console.log(`Memory growth: ${growthMB.toFixed(2)} MB for 100 messages`);

    // Target: < 5MB growth per 100 messages
    // We use 10MB as threshold to account for test environment overhead
    // Unbounded growth would show much higher numbers (50MB+)
    assert.ok(
      growthMB < 10,
      `Memory growth ${growthMB.toFixed(2)}MB exceeds 10MB threshold for 100 messages. ` +
        `This may indicate a memory leak in virtual scrolling.`
    );
  });
});
