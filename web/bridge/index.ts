/**
 * Vue-to-Legacy Bridge Module
 *
 * This module documents and centralizes all window.* globals that are exposed
 * by Vue components for use by legacy scripts in /public/scripts/.
 *
 * ARCHITECTURE NOTE:
 * The app runs in "dual mode" where Vue components and legacy vanilla JS scripts
 * coexist. Legacy scripts use window.* globals to interact with Vue. This bridge
 * module documents these integration points and provides helper functions.
 *
 * LEGACY SCRIPTS STILL LOADED (see index.html):
 * - /scripts/ui/dotmatrix.js         - 3D particle animation
 * - /scripts/ui/dotmatrix-handtrack.js - Hand tracking for dotmatrix
 * - /scripts/ui/gamepad.js           - Gamepad/controller input
 * - /scripts/ui/file-upload.js       - File upload (guarded by __VUE_FILE_UPLOAD_ENABLED)
 * - /scripts/ui/bar-gestures.js      - Double-tap to move input bar
 * - /scripts/ui/ios-viewport-fixes.js - iOS viewport fixes
 * - /scripts/ui/speech.js            - Speech recognition (loaded via main.ts)
 *
 * =============================================================================
 * FEATURE FLAGS (window.__flags)
 * =============================================================================
 * Used to coordinate behavior between Vue and legacy scripts.
 *
 * - __VUE_CHAT_ACTIVE: Vue chat is active (disables legacy chat bootstrap)
 * - __VUE_THEME_ENABLED: Vue handles theme switching
 * - __VUE_WEATHER_ENABLED: Vue handles weather widget
 * - __VUE_BAR_HANDLES: Vue handles input bar
 * - __VUE_FILE_UPLOAD_ENABLED: Vue handles file attachments
 *
 * =============================================================================
 * DEBUG FLAGS
 * =============================================================================
 * Set these in browser console to enable debug logging.
 *
 * - window.__debugChat: Chat store logging
 * - window.__debugSpeech: Speech recognition logging
 * - window.__debugStream: Streaming response logging
 * - window.__debugPointer: Pointer/cursor logging
 * - window.__debugThinking: Thinking state logging
 * - window.__debugAll: Enable all categories
 * - window.__DOTMATRIX_DEBUG: Dotmatrix animation logging
 *
 * =============================================================================
 * WINDOW EXPORTS BY CATEGORY
 * =============================================================================
 *
 * CHAT & MESSAGING (AppShell.vue)
 * - window.sendMessage(options)              - Send a chat message
 * - window.appendMessage(sender, text, url)  - Append message to chat
 * - window.startNewChat()                    - Start new conversation
 * - window.appendNotifs(kind, text)          - Show notification toast
 *
 * THEME (AppShell.vue, useTheme.ts)
 * - window.setTheme(theme)                   - Switch theme
 * - window.cycleTheme()                      - Cycle to next theme
 * - window.currentTheme                      - Current theme name (read/write)
 * - window.baseCircleColor                   - Theme accent color (hex string)
 * - window.baseCircleRGB                     - Theme accent color ({r,g,b})
 *
 * INPUT BAR (InputBar.vue)
 * - window.lowerBarToBottom()                - Move input bar to bottom
 * - window.setHasMovedBarToBottom(bool)      - Track bar movement state
 *
 * SETTINGS MODALS (UnifiedSettingsModal.vue)
 * - window.openModelModal()                  - Open AI model selector
 * - window.openApiKeysModal()                - Open API keys pane
 * - window.openThemeModal()                  - Open themes pane
 * - window.openSettingsModal()               - Open settings modal
 * - window.closeSettingsModal()              - Close settings modal
 *
 * SIDE MENU (useSideMenu.ts)
 * - window.handleMenuAction(action)          - Handle menu action
 *
 * YOUTUBE (AppShell.vue)
 * - window.openYouTubeViaVue(id)             - Open YouTube player
 * - window.minimizeYouTubeViaVue()           - Minimize player
 * - window.closeYouTubeViaVue()              - Close player
 *
 * NOTES (NotesPane.vue)
 * - window.appendAssistantBubbleToNotes()    - Append AI message to notes
 * - window.appendLastAssistantMessageToNotesFull() - Append full message
 *
 * SKILLS (SkillsDock.vue)
 * - window.handleSkillAction(action)      - Execute skill action
 * - window.attachDraggableWhenReady(el)      - Make element draggable
 * - window.refreshPinnedHelpTips()           - Refresh help tips
 *
 * GAMES (GameCanvas.vue, PongCanvas.vue)
 * - window.startBlockBreakingGame()          - Start brick breaker
 * - window.startPongGame()                   - Start pong
 * - window.isGameActive                      - Whether a game is running
 *
 * WEATHER (useWeatherTime.ts)
 * - window.toggleWeatherTimeWidget()         - Toggle weather widget
 * - window._duskSunrise                      - Sunrise time (ISO string)
 * - window._duskSunset                       - Sunset time (ISO string)
 *
 * IMAGE CAROUSEL (ImageCarouselModal.vue)
 * - window.openCarouselModal(images, index)  - Open image carousel
 * - window.closeCarouselModal()              - Close carousel
 * - window.attachImageToolbar()              - Attach toolbar (no-op)
 *
 * INTENT COORDINATOR (useIntentCoordinator.ts)
 * - window.intentCoordinator                 - Intent routing system
 *   .emit(intent)                            - Emit an intent
 *   .on(handler)                             - Listen for intents
 *   .off(handler)                            - Remove listener
 *
 * PDF EXPORT (pdf.ts)
 * - window.saveChatWithFormattedText()       - Export chat to PDF
 *
 * WORKSPACE (workspace.ts)
 * - window.restoreWorkspace(json)            - Restore workspace from JSON
 * - window.saveWorkflow()                    - Save current workflow
 * - window.loadWorkflow()                    - Load saved workflow
 *
 * STORAGE (facade.ts, index.html)
 * - window.prvStorage                        - Storage abstraction
 *   .get(key), .set(key, value), .remove(key), .keys(), .dump()
 *
 * =============================================================================
 * DOTMATRIX EXPORTS (dotmatrix.js, dotmatrix-handtrack.js)
 * =============================================================================
 * These are set by legacy scripts, consumed by Vue components.
 *
 * LIFECYCLE
 * - window.startDotMatrix(force)             - Start animation
 * - window.stopDotMatrix()                   - Stop animation
 * - window.dotmatrixTick()                   - Manual tick
 *
 * DISPLAY
 * - window.setDotMatrixOverlaySuppressed(b)  - Hide/show overlay
 * - window.setDotMatrixInteractive(b)        - Enable/disable interaction
 * - window.setDotMatrixSpheresVisible(b)     - Show/hide spheres
 * - window.setDotMatrixReadingOpen(b)        - Reading mode
 * - window.setDotMatrixGameModeOpacity(n)    - Game mode opacity
 * - window.getDotMatrixSpheresVisible()      - Get visibility state
 * - window.getDotMatrixGameModeOpacity()     - Get game opacity
 *
 * SIZE & MOTION
 * - window.setDotMatrixSpacing(v)            - Set spacing
 * - window.setDotMatrixMotionRange(v)        - Set motion range
 * - window.setDotMatrixIntensityPreset(p)    - Set intensity preset
 * - window.setDotMatrixBloomRate(n)          - Set bloom rate
 * - window.setDotMatrixBloomBlend(mode)      - Set bloom blend mode
 *
 * ATMOSPHERE
 * - window.setDotMatrixAtmosphereStrength(v) - Set atmosphere
 * - window.clearDotMatrixAtmosphereStrength()- Clear atmosphere
 * - window.setDotMatrixRipplesEnabled(b)     - Enable ripples
 * - window.getDotMatrixRipplesEnabled()      - Get ripple state
 * - window.spawnDotMatrixRipple(x, y)        - Spawn ripple at position
 * - window.addDotMatrixEnergy(magnitude)     - Add energy burst
 *
 * AWARENESS (AI response state)
 * - window.setDotMatrixAwarenessState(s)     - Set awareness state
 * - window.getDotMatrixAwarenessState()      - Get awareness state
 * - window.onDotMatrixUserSubmit()           - User submitted prompt
 * - window.onDotMatrixAIResponseStart()      - AI response started
 * - window.onDotMatrixAIResponseEnd()        - AI response ended
 * - window.onDotMatrixKeystroke()            - User typing
 *
 * HAND TRACKING
 * - window.setDotMatrixHandTracking(b)       - Enable hand tracking
 * - window.getDotMatrixHandTracking()        - Get hand tracking state
 * - window.toggleDotMatrixHandTracking()     - Toggle hand tracking
 * - window.setDotMatrixTrackingButtonVisible(b) - Show/hide button
 * - window.getDotMatrixTrackingButtonVisible()  - Get button visibility
 * - window.getHandTrackingPosition()         - Get hand position
 * - window.setDotMatrixHandLandmarks(lm)     - Set hand landmarks
 * - window.getDotMatrixHandLandmarks()       - Get hand landmarks
 * - window.getDotMatrixHandLandmarksActive() - Get active state
 * - window.onDotMatrixHandPresent()          - Hand detected
 * - window.onDotMatrixHandLost()             - Hand lost
 * - window.getDotMatrixHandPresent()         - Check hand present
 *
 * HEAD/FACE TRACKING
 * - window.setDotMatrixHeadPosition(x, y)    - Set head position
 * - window.setDotMatrixDepth(d)              - Set depth
 * - window.getDotMatrixDepth()               - Get depth
 * - window.setDotMatrixRotation(r)           - Set rotation
 * - window.getDotMatrixRotation()            - Get rotation
 * - window.setDotMatrixCursorActive(b)       - Set cursor active
 * - window.getDotMatrixCursorActive()        - Get cursor state
 * - window.getDotMatrixFocusPosition()       - Get focus position
 * - window.setDotMatrixFaceLandmarks(lm)     - Set face landmarks
 * - window.getDotMatrixFaceLandmarks()       - Get face landmarks
 * - window.getDotMatrixFaceLandmarksActive() - Get active state
 *
 * =============================================================================
 * FILE ATTACHMENT STATE (file-upload.js, chat.ts)
 * =============================================================================
 * - window.attachedFileId                    - Current file ID
 * - window.attachedFileIds[]                 - Array of file IDs
 * - window.localPreviewUrl                   - Current preview URL
 * - window.localPreviewBlob                  - Current preview Blob
 * - window.localPreviewUrls[]                - Array of preview URLs
 * - window.localPreviewBlobs[]               - Array of preview Blobs
 * - window.lastAssistantImageBase64          - Last AI image (base64)
 * - window.lastAssistantImageMime            - Last AI image MIME
 * - window.lastAssistantImageUrl             - Last AI image URL
 * - window.lastSourceImageBase64             - Last user image (base64)
 * - window.lastSourceImageMime               - Last user image MIME
 * - window.lastSourceImageUrl                - Last user image URL
 *
 * =============================================================================
 * CONFIGURATION
 * =============================================================================
 * - window.AppSettings                       - UI settings object
 * - window.AppDefaults                       - Default model config
 * - window.getDefaultModel(provider)         - Get default model
 * - window.getDefaultReasoning()             - Get reasoning setting
 * - window.getDefaultProvider()              - Get default provider
 * - window.API_BASE_URL                      - Backend URL override
 *
 * =============================================================================
 * VENDOR LIBRARIES (vendor-libs.js)
 * =============================================================================
 * - window.THREE                             - Three.js library
 * - window.marked                            - Markdown parser
 * - window.DOMPurify                         - HTML sanitizer
 * - window.__threePromise                    - Three.js load promise
 * - window.__threeGltfLoaderPromise          - GLTF loader promise
 * - window.__threeOrbitControlsPromise       - OrbitControls promise
 * - window.__threePostprocessingPromise      - Postprocessing promise
 * - window.__vendorReadyPromise              - All vendors ready promise
 *
 * =============================================================================
 * INTERNAL FLAGS (should not be used by external code)
 * =============================================================================
 * - window.__prvChatStarted                  - Chat has started
 * - window.__dotmatrixThinkingActive         - Thinking animation active
 * - window.__dotmatrixSuppressAutoStart      - Suppress auto-start
 * - window.__disableDotmatrix                - Dotmatrix disabled
 * - window.__disableGlobalDoubleTap          - Double-tap disabled
 * - window.__barAnywhereMoveAttached         - Bar gestures attached
 * - window.__gamepadInputAttached            - Gamepad attached
 * - window.__fileUploadEnhanced              - File upload enhanced
 * - window.__nudgeClickInstalled             - Nudge click handler
 * - window.__nudge_accept                    - Nudge accepted
 * - window.__holdAttachmentsForNudge         - Hold attachments
 * - window.__lastTextNonOpenAI               - Last non-OpenAI text
 * - window.__chatStoreResubmit               - Resubmit function
 * - window.__eventBus                        - Event bus instance (debug)
 * - window.__pointerDebugHudInstalled        - Debug HUD installed
 */

// Types for chat store
interface ChatStore {
  appendMessage: (sender: string, text: string, imageUrl?: string) => void;
  resetConversationState: () => void;
}

// Types for theme composable
interface ThemeComposable {
  setTheme: (theme: string) => void;
}

// Types for YouTube player
interface YouTubePlayer {
  play?: (id: string) => void;
  minimize?: () => void;
  close?: () => void;
}

// Notification kind type
type NotifKind = string;

// Extend window for bridge functions
declare global {
  interface Window {
    __flags?: Record<string, boolean | undefined>;
    appendMessage?: (sender: string, text: string, imageUrl?: string) => void;
    startNewChat?: () => Promise<void>;
    setTheme?: (theme: string) => void;
    openYouTubeViaVue?: (id: string) => void;
    minimizeYouTubeViaVue?: () => void;
    closeYouTubeViaVue?: () => void;
    lowerBarToBottom?: () => void;
    stopDotMatrix?: () => void;
  }
}

/**
 * Initialize feature flags
 * Called early in app bootstrap to signal Vue modules are active
 */
export function initFeatureFlags(): void {
  if (typeof window === 'undefined') return;

  window.__flags = window.__flags || {};
  window.__flags.__VUE_CHAT_ACTIVE = true;
  window.__flags.__VUE_THEME_ENABLED = true;
  window.__flags.__VUE_WEATHER_ENABLED = true;
  window.__flags.__VUE_BAR_HANDLES = true;
}

/**
 * Install bridge functions for chat operations
 */
export function installChatBridge(chatStore: ChatStore): void {
  if (typeof window === 'undefined') return;

  window.appendMessage = (sender: string, text: string, imageUrl?: string) => {
    return chatStore.appendMessage(sender, text, imageUrl);
  };

  window.startNewChat = async () => {
    chatStore.resetConversationState();
    // Additional cleanup handled by AppShell
  };
}

/**
 * Install bridge functions for notifications
 */
export function installNotifsBridge(pushNotif: (kind: NotifKind, text: string) => void): void {
  if (typeof window === 'undefined') return;

  window.appendNotifs = (kind: NotifKind, text: string) => {
    pushNotif(kind, text);
  };
}

/**
 * Install bridge functions for theme switching
 */
export function installThemeBridge(themeComposable: ThemeComposable): void {
  if (typeof window === 'undefined') return;

  window.setTheme = (theme: string) => {
    return themeComposable.setTheme(theme);
  };
}

/**
 * Install bridge functions for YouTube player
 */
export function installYouTubeBridge(youTubePlayer: YouTubePlayer): void {
  if (typeof window === 'undefined') return;

  window.openYouTubeViaVue = (id: string) => {
    if (youTubePlayer && typeof youTubePlayer.play === 'function') {
      youTubePlayer.play(id);
    }
  };

  window.minimizeYouTubeViaVue = () => {
    if (youTubePlayer && typeof youTubePlayer.minimize === 'function') {
      youTubePlayer.minimize();
    }
  };

  window.closeYouTubeViaVue = () => {
    if (youTubePlayer && typeof youTubePlayer.close === 'function') {
      youTubePlayer.close();
    }
  };
}

/**
 * Clean up bridge functions on unmount
 */
export function cleanupBridge(): void {
  if (typeof window === 'undefined') return;

  // Don't remove these - they may be needed by other components
  // Just document that cleanup should be done carefully
}

/**
 * Check if a legacy function is available
 */
export function isLegacyFunctionAvailable(name: string): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof (window as unknown as Record<string, unknown>)[name] === 'function'
    );
  } catch (_) {
    return false;
  }
}

/**
 * Safely call a legacy function
 */
export function callLegacyFunction<T = unknown>(name: string, ...args: unknown[]): T | undefined {
  try {
    if (isLegacyFunctionAvailable(name)) {
      return ((window as unknown as Record<string, unknown>)[name] as (...a: unknown[]) => T)(
        ...args
      );
    }
  } catch (e) {
    console.warn(`[bridge] Failed to call ${name}:`, e);
  }
  return undefined;
}
