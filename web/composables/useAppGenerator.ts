/**
 * App Generator Composable
 *
 * Orchestrates the full app generation lifecycle:
 * 1. Opens a placeholder window while the LLM generates
 * 2. Streams NDJSON from /api/v1/generate-app
 * 3. Validates HTML, injects theme colors, registers app, opens window
 * 4. Captures thumbnail after render
 *
 * Also manages edit mode state for iterative refinement.
 */

import { ref, type Ref } from 'vue';
import { useWindowManager } from '@web/composables/useWindowManager';
import { createAppRegistry } from '@web/services/apps/appRegistry';
import { validateAppCode } from '@web/services/apps/validator';
import { captureAppThumbnail } from '@web/services/apps/thumbnailCapture';
import { useNotifs } from '@web/composables/useNotifs';
import { useSessionGate } from '@web/composables/useSessionGate';
import { pickProvider, pickApiKey, pickModel } from '@web/stores/chat/provider.js';
import { getBaseConnectors, getKeyGatedConnectors } from '@/contracts/sdk-surface.js';
import { apiResolve, withApiHeaders } from '@web/stores/chat/transport.js';
import { debugLog, debugWarn, logError } from '@web/utils/debugLog.js';
import type { AppDefinition, ThemeColors } from '@web/types/apps';
import { LOADING_SPRITE_B64 } from '@web/assets/loadingSprite';
import { LOADING_SPRITE_CHICKEN_B64 } from '@web/assets/loadingSpriteChicken';
import { LOADING_SPRITE_CREATURE_B64 } from '@web/assets/loadingSpriteCreature';
import { LOADING_SPRITE_SONGBIRD_B64 } from '@web/assets/loadingSpriteSongbird';
import { LOADING_SPRITE_PARROT_B64 } from '@web/assets/loadingSpriteParrot';
import { LOADING_SPRITE_LOVEBIRD_B64 } from '@web/assets/loadingSpriteLovebird';
import { LOADING_SPRITE_BIRDIE_B64 } from '@web/assets/loadingSpriteBirdie';
import { LOADING_SPRITE_RUNNER_B64 } from '@web/assets/loadingSpriteRunner';
import { storage } from '@web/storage/storage.js';
import { STORAGE_KEYS } from '@web/constants/storageKeys.js';

// ==================== TYPES ====================

export interface EditChatMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly timestamp: number;
  readonly versionIndex?: number;
}

export interface EditModeState {
  readonly appId: string;
  readonly versions: readonly AppDefinition[];
  readonly currentVersionIndex: number;
  readonly messages: readonly EditChatMessage[];
  readonly status: 'idle' | 'generating';
  readonly streamingText: string;
}

interface GeneratedDefinition {
  readonly id: string;
  readonly name: string;
  readonly type: 'html';
  readonly html: string;
  readonly description?: string;
  readonly permissions: readonly string[];
  readonly source: 'generated';
  readonly window?: { readonly width: number; readonly height: number };
}

interface NdjsonDelta {
  readonly type: 'delta';
  readonly content: string;
}

interface NdjsonAppGenerated {
  readonly type: 'app_generated';
  readonly definition: GeneratedDefinition;
}

interface NdjsonError {
  readonly type: 'error';
  readonly message: string;
}

interface NdjsonDone {
  readonly type: 'done';
}

interface NdjsonStatus {
  readonly type: 'status';
  readonly step: string;
}

type NdjsonChunk = NdjsonDelta | NdjsonAppGenerated | NdjsonError | NdjsonDone | NdjsonStatus;

// ==================== CONSTANTS ====================

/** Return only connectors the user can actually use right now */
function getAvailableConnectors(): string[] {
  const keys = (storage.mirror.getJSON('apiKeys', {}) || {}) as Record<string, string>;
  const available = [...getBaseConnectors()] as string[];
  for (const { connector, key } of getKeyGatedConnectors()) {
    if (keys[key]) available.push(connector);
  }
  return available;
}

const THUMBNAIL_DELAY_MS = 2000;

const STATUS_LABELS: Readonly<Record<string, string>> = {
  generating: 'Generating...',
  assembling: 'Assembling...',
  reviewing: 'Reviewing...',
  refining: 'Refining...',
};

// ==================== LOADING PLACEHOLDER ====================

const LOADING_MESSAGES = [
  'Planting the seed',
  'Watching it grow',
  'Shaping the leaves',
  'Adding some magic',
  'Almost blooming',
] as const;

interface LoadingGradient {
  readonly stops: readonly string[];
  readonly angle: string;
  readonly speed: string;
  readonly textColor: string;
  readonly spriteGlow: string;
}

/** Per-theme gradient definitions for the building-phase loading screen. */
const THEME_GRADIENTS: Readonly<Record<string, LoadingGradient>> = {
  'night-theme': {
    angle: '135deg',
    stops: ['#3d4a28', '#2a3a20', '#1c3030', '#4a5a38'],
    speed: '8s',
    textColor: 'rgba(200,210,170,0.7)',
    spriteGlow: 'rgba(195,255,0,0.3)',
  },
  'eva-theme': {
    angle: '135deg',
    stops: ['#6fafd2', '#9a8abe', '#7ab8d8', '#b0a1d0'],
    speed: '10s',
    textColor: 'rgba(50,47,44,0.65)',
    spriteGlow: 'rgba(0,0,0,0.15)',
  },
  'purple-theme': {
    angle: '135deg',
    stops: ['#8a7fbc', '#5ab8a8', '#6e67a0', '#04e4c8'],
    speed: '10s',
    textColor: 'rgba(240,230,246,0.7)',
    spriteGlow: 'rgba(219,142,255,0.3)',
  },
  'light-theme': {
    angle: '135deg',
    stops: ['#a0d8f0', '#90ccdd', '#7bbfc8', '#85d0d8'],
    speed: '10s',
    textColor: 'rgba(50,47,44,0.6)',
    spriteGlow: 'rgba(0,0,0,0.12)',
  },
  'fragile-theme': {
    angle: '135deg',
    stops: ['#a0b8c8', '#8eaab8', '#96b5c5', '#88a0b0'],
    speed: '10s',
    textColor: 'rgba(0,0,0,0.5)',
    spriteGlow: 'rgba(0,0,0,0.12)',
  },
  'vitti-theme': {
    angle: '135deg',
    stops: ['#a8b8aa', '#8eb09e', '#98ad9a', '#a0b5a0'],
    speed: '10s',
    textColor: 'rgba(18,18,18,0.55)',
    spriteGlow: 'rgba(0,0,0,0.12)',
  },
  'share-bear-theme': {
    angle: '135deg',
    stops: ['#c0b5dc', '#a8a0cc', '#cac0e0', '#b0a5d0'],
    speed: '10s',
    textColor: 'rgba(18,18,18,0.55)',
    spriteGlow: 'rgba(0,0,0,0.12)',
  },
  'vera-baxter-theme': {
    angle: '135deg',
    stops: ['#1a2880', '#2040a0', '#142068', '#2a4ab8'],
    speed: '8s',
    textColor: 'rgba(129,214,255,0.7)',
    spriteGlow: 'rgba(129,214,255,0.3)',
  },
  'high-contrast-theme': {
    angle: '135deg',
    stops: ['#e0e0e0', '#d0d0d0', '#f0f0f0', '#c8c8c8'],
    speed: '10s',
    textColor: 'rgba(0,0,0,0.55)',
    spriteGlow: 'rgba(0,0,0,0.1)',
  },
  'custom-theme': {
    angle: '135deg',
    stops: ['#3a5a6a', '#2a4a5a', '#4a6a7a', '#385868'],
    speed: '8s',
    textColor: 'rgba(200,200,200,0.65)',
    spriteGlow: 'rgba(255,255,255,0.15)',
  },
};

const DEFAULT_GRADIENT: LoadingGradient = {
  angle: '135deg',
  stops: ['#3a5a6a', '#2a4a5a', '#4a6a7a', '#385868'],
  speed: '8s',
  textColor: 'rgba(200,200,200,0.65)',
  spriteGlow: 'rgba(255,255,255,0.15)',
};

/** Detect current theme from body class and return appropriate loading gradient. */
function getLoadingGradient(): LoadingGradient {
  const themeClass = [...document.body.classList].find((c) => c.endsWith('-theme'));
  if (themeClass && THEME_GRADIENTS[themeClass]) return THEME_GRADIENTS[themeClass]!;
  return DEFAULT_GRADIENT;
}

interface SpriteConfig {
  readonly b64: string;
  readonly frameW: number;
  readonly frameH: number;
  readonly cols: number;
  readonly rows: number;
  readonly sheetW: number;
  readonly sheetH: number;
  readonly rowDuration: string;
  readonly sheetDuration: string;
  readonly colorful?: boolean;
}

const SPRITE_CONFIGS: Readonly<Record<string, SpriteConfig>> = {
  duck: {
    b64: LOADING_SPRITE_B64,
    frameW: 56,
    frameH: 50,
    cols: 11,
    rows: 5,
    sheetW: 616,
    sheetH: 250,
    rowDuration: '2.2s',
    sheetDuration: '11s',
  },
  chicken: {
    b64: LOADING_SPRITE_CHICKEN_B64,
    frameW: 88,
    frameH: 84,
    cols: 9,
    rows: 4,
    sheetW: 792,
    sheetH: 336,
    rowDuration: '0.75s',
    sheetDuration: '3s',
  },
  creature: {
    b64: LOADING_SPRITE_CREATURE_B64,
    frameW: 80,
    frameH: 80,
    cols: 5,
    rows: 3,
    sheetW: 400,
    sheetH: 240,
    rowDuration: '0.417s',
    sheetDuration: '1.25s',
  },
  songbird: {
    b64: LOADING_SPRITE_SONGBIRD_B64,
    frameW: 70,
    frameH: 70,
    cols: 10,
    rows: 5,
    sheetW: 700,
    sheetH: 350,
    rowDuration: '0.833s',
    sheetDuration: '4.167s',
  },
  parrot: {
    b64: LOADING_SPRITE_PARROT_B64,
    frameW: 70,
    frameH: 70,
    cols: 10,
    rows: 6,
    sheetW: 700,
    sheetH: 420,
    rowDuration: '0.833s',
    sheetDuration: '5s',
    colorful: true,
  },
  lovebird: {
    b64: LOADING_SPRITE_LOVEBIRD_B64,
    frameW: 80,
    frameH: 80,
    cols: 10,
    rows: 3,
    sheetW: 800,
    sheetH: 240,
    rowDuration: '0.833s',
    sheetDuration: '2.5s',
  },
  birdie: {
    b64: LOADING_SPRITE_BIRDIE_B64,
    frameW: 80,
    frameH: 80,
    cols: 9,
    rows: 4,
    sheetW: 720,
    sheetH: 320,
    rowDuration: '0.75s',
    sheetDuration: '3s',
  },
  runner: {
    b64: LOADING_SPRITE_RUNNER_B64,
    frameW: 50,
    frameH: 60,
    cols: 17,
    rows: 6,
    sheetW: 850,
    sheetH: 360,
    rowDuration: '1s',
    sheetDuration: '6s',
  },
};

function getSelectedSprite(): SpriteConfig {
  const pref = storage.mirror.get(STORAGE_KEYS.LOADING_ANIMATION);
  return SPRITE_CONFIGS[pref as string] ?? SPRITE_CONFIGS.duck!;
}

function buildLoadingHtml(theme: ThemeColors, gradient: LoadingGradient): string {
  const msgs = LOADING_MESSAGES.map((m) => `'${m}'`).join(',');
  const sprite = getSelectedSprite();

  const g = gradient;
  const gradientCss = `linear-gradient(${g.angle}, ${g.stops.join(', ')})`;

  // Gradient lives on a full-screen backdrop div, not body.
  // The bridge SDK injects `html body{background:transparent!important}` on theme:update,
  // which would nuke a body-level gradient. A child div is immune to that override.
  return `<!DOCTYPE html>
<html><head><style>
*{margin:0;padding:0;box-sizing:border-box}
body{height:100vh;overflow:hidden;font-family:'Gothic A1',system-ui,sans-serif}
.backdrop{position:fixed;inset:0;z-index:0;
  background:${gradientCss};background-size:300% 300%;
  animation:gradientShift ${g.speed} ease infinite;
  transition:opacity 0.5s ease}
.backdrop.fade-out{opacity:0}
.dark-bg{position:fixed;inset:0;z-index:0;background:${theme.background};opacity:0;transition:opacity 0.5s ease}
.dark-bg.fade-in{opacity:1}
.wrap{position:relative;z-index:1;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
  opacity:0;animation:fadeIn .5s .1s ease both;text-align:center;transition:opacity .4s ease}
.wrap.fade-out{opacity:0}

.sprite{width:${sprite.frameW}px;height:${sprite.frameH}px;margin:0 auto 14px;
  background:url('data:image/png;base64,${sprite.b64}') 0 0 no-repeat;
  background-size:${sprite.sheetW}px ${sprite.sheetH}px;image-rendering:pixelated;image-rendering:crisp-edges;
  ${sprite.colorful ? '' : `filter:drop-shadow(0 0 1px ${g.spriteGlow});`}
  animation:row ${sprite.rowDuration} steps(${sprite.cols}) infinite,sheet ${sprite.sheetDuration} steps(${sprite.rows}) infinite}

.status{font-size:13px;font-weight:300;letter-spacing:.03em;color:${g.textColor}}
#msg{transition:opacity .3s ease;display:inline-block}
.dots{display:inline}.dots span{animation:blink 1.4s infinite both}
.dots span:nth-child(2){animation-delay:.2s}
.dots span:nth-child(3){animation-delay:.4s}
.game-link{margin-top:18px;font-size:12px;opacity:0;animation:fadeIn 1s 4s ease both}
.game-link a{color:${g.textColor};text-decoration:none;cursor:pointer;transition:opacity .2s}
.game-link a:hover{opacity:1;text-decoration:underline}

@keyframes fadeIn{to{opacity:1}}
@keyframes row{to{background-position-x:-${sprite.sheetW}px}}
@keyframes sheet{to{background-position-y:-${sprite.sheetH}px}}
@keyframes blink{0%,80%,100%{opacity:.15}40%{opacity:1}}
@keyframes gradientShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
</style></head><body>
<div class="backdrop" id="backdrop"></div>
<div class="dark-bg" id="darkBg"></div>
<div class="wrap" id="wrap">
  <div class="sprite"></div>
  <div class="status"><span id="msg"></span><span class="dots"><span>.</span><span>.</span><span>.</span></span></div>
  <div class="game-link"><a id="gameLink">Play a game while you wait?</a></div>
</div>
<script>
(function(){
  var msgs=[${msgs}];
  var el=document.getElementById('msg');
  var i=0;
  function next(){el.style.opacity='0';setTimeout(function(){
    el.textContent=msgs[i];el.style.opacity='1';i=(i+1)%msgs.length;
  },300);}
  next();setInterval(next,3200);
  document.getElementById('gameLink').addEventListener('click',function(){
    parent.postMessage({type:'loading:open-solitaire'},'*');
  });
  window.addEventListener('message',function(e){
    if(e.data&&e.data.type==='fade-to-dark'){
      document.getElementById('backdrop').classList.add('fade-out');
      document.getElementById('darkBg').classList.add('fade-in');
      document.getElementById('wrap').classList.add('fade-out');
    }
  });
})();
</script></body></html>`;
}

// ==================== HELPERS ====================

/** Open the builtin solitaire app via the window manager. */
async function openSolitaire(windowManager: ReturnType<typeof useWindowManager>): Promise<void> {
  const { createAppRegistry } = await import('@web/services/apps/appRegistry');
  const registry = createAppRegistry();
  const def = await registry.get('solitaire');
  if (def) {
    windowManager.openWindow(def);
  }
}

function extractThemeColors(): ThemeColors {
  // Widgets are ALWAYS dark (#1e1e1e) with light text, regardless of host theme.
  // No light variant — ever.
  return {
    background: '#1e1e1e',
    surface: '#2a2a2a',
    text: '#e0e0e0',
    textSecondary: '#888',
    primary: 'rgba(255,255,255,0.85)',
    secondary: 'rgba(255,255,255,0.6)',
    accent: 'rgba(255,255,255,0.5)',
    border: 'rgba(255,255,255,0.12)',
  };
}

function buildThemeStyleBlock(theme: ThemeColors): string {
  return [
    '<style>:root {',
    `  --prvctice-background: ${theme.background};`,
    `  --prvctice-surface: ${theme.surface};`,
    `  --prvctice-text: ${theme.text};`,
    `  --prvctice-text-secondary: ${theme.textSecondary};`,
    `  --prvctice-primary: ${theme.primary};`,
    `  --prvctice-secondary: ${theme.secondary};`,
    `  --prvctice-accent: ${theme.accent};`,
    `  --prvctice-border: ${theme.border};`,
    '}</style>',
  ].join('\n');
}

function injectThemeIntoHtml(html: string, theme: ThemeColors): string {
  const styleBlock = buildThemeStyleBlock(theme);
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch) {
    const insertPos = html.indexOf(headMatch[0]) + headMatch[0].length;
    return html.slice(0, insertPos) + '\n' + styleBlock + '\n' + html.slice(insertPos);
  }
  return styleBlock + '\n' + html;
}

/**
 * Parse NDJSON stream from a fetch Response body.
 */
async function* readNdjsonStream(response: Response): AsyncGenerator<NdjsonChunk> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last (possibly incomplete) line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          yield JSON.parse(trimmed) as NdjsonChunk;
        } catch {
          debugWarn('appGenerator', 'ndjson:parse', trimmed);
        }
      }
    }

    // Process any remaining content in buffer
    if (buffer.trim()) {
      try {
        yield JSON.parse(buffer.trim()) as NdjsonChunk;
      } catch {
        debugWarn('appGenerator', 'ndjson:finalParse', buffer);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ==================== SINGLETON STATE ====================

const isGenerating: Ref<boolean> = ref(false);
const editMode: Ref<EditModeState | null> = ref(null);
const lastExplanation: Ref<string> = ref('');

// ==================== COMPOSABLE ====================

export function useAppGenerator() {
  const notifs = useNotifs();

  /**
   * Generate a new app from a natural language prompt.
   * Opens a placeholder window, streams generation, then swaps to real app.
   * Accepts optional provider context from the caller (e.g., chat store)
   * to avoid re-resolving keys that may only exist server-side (trial mode).
   */
  async function generateApp(
    prompt: string,
    callerContext?: { provider?: string; apiKey?: string; model?: string }
  ): Promise<void> {
    const windowManager = useWindowManager();
    const registry = createAppRegistry();
    const gate = useSessionGate();

    // Trial users get 3 free app generations, then must add an API key
    const MAX_TRIAL_APPS = 3;
    if (!gate.hasApiKey.value) {
      const trialAppsGenerated = Number(
        storage.mirror.get(STORAGE_KEYS.TRIAL_APPS_GENERATED) || '0'
      );
      if (trialAppsGenerated >= MAX_TRIAL_APPS) {
        notifs.push('warning', 'API Key Required', {
          description: `You've used all ${MAX_TRIAL_APPS} free app builds. Add your own API key in Settings to keep building.`,
        });
        return;
      }
    }

    if (isGenerating.value) {
      notifs.push('warning', 'Already Running', {
        description: 'App generation is already in progress. Please wait.',
      });
      return;
    }

    isGenerating.value = true;
    lastExplanation.value = '';

    const theme = extractThemeColors();
    const gradient = getLoadingGradient();
    const existingApps = await registry.getAll();
    const existingAppNames = existingApps.map((a) => a.name);

    // Create placeholder window
    const placeholderId = crypto.randomUUID();
    const placeholderDef: AppDefinition = {
      id: placeholderId,
      name: 'Generating...',
      type: 'html',
      html: buildLoadingHtml(theme, gradient),
      permissions: [],
      source: 'generated',
      chromeless: true,
      defaultSize: { w: 300, h: 220 },
    };

    const placeholderInstanceId = windowManager.openWindow(placeholderDef);

    // Listen for "play solitaire" request from the loading screen iframe
    const onLoadingMessage = (e: MessageEvent): void => {
      if (e.data?.type === 'loading:open-solitaire') {
        void openSolitaire(windowManager);
      }
    };
    window.addEventListener('message', onLoadingMessage);

    try {
      const provider = callerContext?.provider || pickProvider();
      const apiKey =
        callerContext?.apiKey || pickApiKey(provider as Parameters<typeof pickApiKey>[0]).trim();

      const model = callerContext?.model || pickModel(provider as Parameters<typeof pickModel>[0]);

      const isTrial = !gate.hasApiKey.value;

      const response = await fetch(
        apiResolve('/api/v1/generate-app'),
        withApiHeaders({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            provider,
            apiKey,
            ...(model ? { model } : {}),
            ...(isTrial ? { trialActive: true } : {}),
            theme,
            existingAppNames,
            availableConnectors: getAvailableConnectors(),
          }),
        })
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Generation request failed');
        throw new Error(errorText);
      }

      let explanation = '';
      let generatedDef: GeneratedDefinition | null = null;
      let errorMessage = '';

      for await (const chunk of readNdjsonStream(response)) {
        switch (chunk.type) {
          case 'status':
            windowManager.updateWindowTitle(
              placeholderInstanceId,
              STATUS_LABELS[chunk.step] || 'Generating...'
            );
            break;
          case 'delta':
            explanation += chunk.content;
            break;
          case 'app_generated':
            generatedDef = chunk.definition;
            break;
          case 'error':
            errorMessage = chunk.message;
            break;
          case 'done':
            // Stream complete
            break;
        }
      }

      lastExplanation.value = explanation;

      if (errorMessage && !generatedDef) {
        throw new Error(errorMessage);
      }

      if (!generatedDef) {
        throw new Error('No app definition received from generation');
      }

      // Client-side validation (defense in depth -- backend already validated)
      const validation = validateAppCode(generatedDef.html);
      if (!validation.valid) {
        debugWarn('appGenerator', 'validation:warnings', validation.violations.join(', '));
      }

      // Inject theme colors into the generated HTML
      const themedHtml = injectThemeIntoHtml(generatedDef.html, theme);

      // Build final definition
      const finalDef: AppDefinition = {
        id: generatedDef.id,
        name: generatedDef.name,
        type: 'html',
        html: themedHtml,
        description: generatedDef.description,
        permissions: generatedDef.permissions as AppDefinition['permissions'],
        source: 'generated',
        chromeless: true,
      };

      // Fade loading screen to dark, then swap to real app
      windowManager.sendMessageToApp(placeholderInstanceId, { type: 'fade-to-dark' });
      await new Promise((r) => setTimeout(r, 500));
      windowManager.closeApp(placeholderInstanceId);
      await registry.register(finalDef);
      windowManager.openWindow(finalDef);

      // Increment trial app counter for trial users
      if (isTrial) {
        const prev = Number(storage.mirror.get(STORAGE_KEYS.TRIAL_APPS_GENERATED) || '0');
        storage.mirror.set(STORAGE_KEYS.TRIAL_APPS_GENERATED, String(prev + 1));
      }

      debugLog('appGenerator', 'generated', {
        appId: finalDef.id,
        name: finalDef.name,
      });

      // Capture thumbnail after delay (non-blocking)
      const captureWidth = generatedDef.window?.width ?? 400;
      const captureHeight = generatedDef.window?.height ?? 300;
      setTimeout(async () => {
        try {
          const thumb = await captureAppThumbnail(themedHtml, captureWidth, captureHeight);
          if (thumb) {
            await registry.update(finalDef.id, { icon: thumb });
          }
        } catch (err) {
          debugWarn('appGenerator', 'thumbnail:capture', err as Error);
        }
      }, THUMBNAIL_DELAY_MS);
    } catch (err) {
      windowManager.closeApp(placeholderInstanceId);
      const message = err instanceof Error ? err.message : 'App generation failed';
      notifs.push('error', 'Generation Failed', { description: message });
      logError('appGenerator', 'generate', err as Error);
    } finally {
      window.removeEventListener('message', onLoadingMessage);
      isGenerating.value = false;
    }
  }

  /**
   * Iterate on an existing app with an edit instruction.
   * Used by edit mode -- does NOT register or open a window.
   * Returns the new definition or null on failure.
   */
  async function iterateApp(
    appId: string,
    editInstruction: string
  ): Promise<{ html: string; definition: AppDefinition } | null> {
    const gate = useSessionGate();
    if (!gate.hasApiKey.value) {
      notifs.push('warning', 'API Key Required', {
        description: 'Add your own API key in Settings to use the app builder.',
      });
      return null;
    }

    const registry = createAppRegistry();
    const current = await registry.get(appId);
    if (!current || !current.html) {
      notifs.push('error', 'Not Found', {
        description: 'The app could not be located. It may have been deleted.',
      });
      return null;
    }

    try {
      const provider = pickProvider();
      const apiKey = pickApiKey(provider).trim();
      const theme = extractThemeColors();

      const response = await fetch(
        apiResolve('/api/v1/iterate-app'),
        withApiHeaders({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentCode: current.html,
            editInstruction,
            provider,
            apiKey,
            theme,
            availableConnectors: getAvailableConnectors(),
          }),
        })
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Iteration request failed');
        throw new Error(errorText);
      }

      let generatedDef: GeneratedDefinition | null = null;
      let errorMessage = '';

      for await (const chunk of readNdjsonStream(response)) {
        switch (chunk.type) {
          case 'app_generated':
            generatedDef = chunk.definition;
            break;
          case 'error':
            errorMessage = chunk.message;
            break;
          default:
            break;
        }
      }

      if (errorMessage && !generatedDef) {
        throw new Error(errorMessage);
      }

      if (!generatedDef) {
        throw new Error('No app definition received from iteration');
      }

      // Validate
      const validation = validateAppCode(generatedDef.html);
      if (!validation.valid) {
        debugWarn('appGenerator', 'iterate:validation', validation.violations.join(', '));
      }

      // Inject theme
      const themedHtml = injectThemeIntoHtml(generatedDef.html, theme);

      const newDef: AppDefinition = {
        ...current,
        html: themedHtml,
        name: generatedDef.name || current.name,
        description: generatedDef.description || current.description,
        permissions: generatedDef.permissions as AppDefinition['permissions'],
        defaultSize: generatedDef.window
          ? { w: generatedDef.window.width, h: generatedDef.window.height }
          : current.defaultSize,
      };

      return { html: themedHtml, definition: newDef };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Edit failed';
      notifs.push('error', 'Edit Failed', { description: message });
      logError('appGenerator', 'iterate', err as Error);
      return null;
    }
  }

  // ==================== EDIT MODE ====================

  function enterEditMode(appId: string): void {
    const registry = createAppRegistry();
    void registry.get(appId).then((def) => {
      if (!def) {
        notifs.push('error', 'Not Found', {
          description: 'The app could not be located. It may have been deleted.',
        });
        return;
      }
      editMode.value = {
        appId,
        versions: [def],
        currentVersionIndex: 0,
        messages: [],
        status: 'idle',
        streamingText: '',
      };
    });
  }

  function exitEditMode(): void {
    editMode.value = null;
  }

  function goToVersion(index: number): void {
    const state = editMode.value;
    if (!state) return;
    const clamped = Math.max(0, Math.min(index, state.versions.length - 1));
    editMode.value = { ...state, currentVersionIndex: clamped };
  }

  function renameEditApp(newName: string): void {
    const state = editMode.value;
    if (!state) return;
    const idx = state.currentVersionIndex;
    const version = state.versions[idx];
    if (!version) return;
    const updatedVersions = [...state.versions];
    updatedVersions[idx] = { ...version, name: newName };
    editMode.value = { ...state, versions: updatedVersions };
  }

  async function saveEdits(): Promise<void> {
    const state = editMode.value;
    if (!state) return;

    const registry = createAppRegistry();
    const currentVersion = state.versions[state.currentVersionIndex];
    if (!currentVersion) return;

    try {
      await registry.update(state.appId, {
        html: currentVersion.html,
        name: currentVersion.name,
        description: currentVersion.description,
        permissions: currentVersion.permissions,
        defaultSize: currentVersion.defaultSize,
      });

      // Capture new thumbnail
      const width = 400;
      const height = 300;
      if (currentVersion.html) {
        setTimeout(async () => {
          try {
            const thumb = await captureAppThumbnail(currentVersion.html!, width, height);
            if (thumb) {
              await registry.update(state.appId, { icon: thumb });
            }
          } catch {
            // Non-critical
          }
        }, THUMBNAIL_DELAY_MS);
      }

      // Reload any open windows showing this app so they pick up the new HTML
      const windowManager = useWindowManager();
      const openWindows = windowManager.windowList.value.filter((w) => w.appId === state.appId);
      for (const win of openWindows) {
        void windowManager.reopenApp(win.instanceId);
      }

      notifs.push('success', 'Changes Saved', {
        description: 'Your edits have been applied to the app.',
      });
    } catch (err) {
      notifs.push('error', 'Save Failed', {
        description: 'Failed to save changes. Please try again.',
      });
      logError('appGenerator', 'saveEdits', err as Error);
    }

    editMode.value = null;
  }

  /**
   * Send an edit instruction with full conversation history.
   * Streams NDJSON with real-time delta updates for the chat UI.
   */
  async function sendEdit(editInstruction: string): Promise<void> {
    const state = editMode.value;
    if (!state || state.status === 'generating') return;

    const appId = state.appId;
    const currentVersion = state.versions[state.currentVersionIndex];

    // Append user message immediately so it always appears in chat
    const userMsg: EditChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: editInstruction,
      timestamp: Date.now(),
    };

    editMode.value = {
      ...state,
      messages: [...state.messages, userMsg],
      status: 'generating',
      streamingText: '',
    };

    try {
      const gate = useSessionGate();
      if (!gate.hasApiKey.value) {
        throw new Error(
          'API key required. Add your own API key in Settings to use the app builder.'
        );
      }

      if (!currentVersion?.html) {
        throw new Error('This app cannot be edited — no HTML source available.');
      }

      const provider = pickProvider();
      const apiKey = pickApiKey(provider).trim();
      const theme = extractThemeColors();

      // Build conversation history from prior messages (last 20, user+assistant only)
      const conversationHistory = state.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await fetch(
        apiResolve('/api/v1/iterate-app'),
        withApiHeaders({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentCode: currentVersion.html,
            editInstruction,
            provider,
            apiKey,
            theme,
            availableConnectors: getAvailableConnectors(),
            conversationHistory,
          }),
        })
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Iteration request failed');
        throw new Error(errorText);
      }

      let generatedDef: GeneratedDefinition | null = null;
      let explanation = '';
      let errorMessage = '';

      for await (const chunk of readNdjsonStream(response)) {
        // Re-check: edit mode may have been exited while streaming
        const live: EditModeState | null = editMode.value;
        if (!live || live.appId !== appId) return;

        switch (chunk.type) {
          case 'delta':
            explanation += chunk.content;
            editMode.value = { ...live, streamingText: explanation };
            break;
          case 'app_generated':
            generatedDef = chunk.definition;
            break;
          case 'error':
            errorMessage = chunk.message;
            break;
          case 'done':
            break;
        }
      }

      // Re-check after stream completes
      const current = editMode.value;
      if (!current || current.appId !== appId) return;

      if (errorMessage && !generatedDef) {
        throw new Error(errorMessage);
      }

      if (!generatedDef) {
        throw new Error('No app definition received from iteration');
      }

      // Validate + theme
      const validation = validateAppCode(generatedDef.html);
      if (!validation.valid) {
        debugWarn('appGenerator', 'iterate:validation', validation.violations.join(', '));
      }

      const themedHtml = injectThemeIntoHtml(generatedDef.html, theme);

      const newDef: AppDefinition = {
        ...currentVersion,
        html: themedHtml,
        name: generatedDef.name || currentVersion.name,
        description: generatedDef.description || currentVersion.description,
        permissions: generatedDef.permissions as AppDefinition['permissions'],
        defaultSize: generatedDef.window
          ? { w: generatedDef.window.width, h: generatedDef.window.height }
          : currentVersion.defaultSize,
      };

      // Append new version and assistant message
      const newVersions = [...current.versions, newDef];
      const newVersionIndex = newVersions.length - 1;

      const assistantMsg: EditChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: explanation || 'Changes applied.',
        timestamp: Date.now(),
        versionIndex: newVersionIndex,
      };

      editMode.value = {
        ...current,
        versions: newVersions,
        currentVersionIndex: newVersionIndex,
        messages: [...current.messages, assistantMsg],
        status: 'idle',
        streamingText: '',
      };

      debugLog('appGenerator', 'sendEdit', { appId, name: newDef.name, version: newVersionIndex });
    } catch (err) {
      const live = editMode.value;
      if (live && live.appId === appId) {
        const errorContent = err instanceof Error ? err.message : 'Edit failed';
        const errorMsg: EditChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Error: ${errorContent}`,
          timestamp: Date.now(),
        };
        editMode.value = {
          ...live,
          messages: [...live.messages, errorMsg],
          status: 'idle',
          streamingText: '',
        };
      }
      const message = err instanceof Error ? err.message : 'Edit failed';
      notifs.push('error', 'Edit Failed', { description: message });
      logError('appGenerator', 'sendEdit', err as Error);
    }
  }

  return {
    isGenerating,
    editMode,
    lastExplanation,
    generateApp,
    iterateApp,
    enterEditMode,
    exitEditMode,
    goToVersion,
    renameEditApp,
    saveEdits,
    sendEdit,
  };
}
