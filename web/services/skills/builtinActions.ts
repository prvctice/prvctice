/**
 * Built-in Action Definitions
 * These are the default actions shipped with the Skill Coordinator.
 * Based on docs/SKILLS_EVOLUTION.md specification
 */

import type {
  ActionDefinition,
  ExecutionPayload,
  ExecutionResult,
  SkillV2,
  CombinationRules,
  ModifierConfig,
} from '@web/types/skills';
import { createSuccessResult, createErrorResult } from '@web/types/skills';
import { STORAGE_KEYS } from '@web/constants/storageKeys.js';
import { useEventBus } from '@web/services/eventBus';

/**
 * Parse a duration string like "1h", "30m", "2d" into milliseconds
 */
export function parseDuration(durationStr: string): number {
  const match = durationStr.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)$/i);
  if (!match) {
    // Default to parsing as minutes if no unit
    const num = parseFloat(durationStr);
    return isNaN(num) ? 3600000 : num * 60000; // default 1 hour
  }

  const valueStr = match[1];
  const unitStr = match[2];
  if (!valueStr || !unitStr) return 3600000;
  const value = parseFloat(valueStr);
  const unit = unitStr.toLowerCase();

  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000,
    w: 604800000,
  };

  return value * (multipliers[unit] || 60000);
}

/**
 * send-to-ai - Send text to the AI chat
 */
export const sendToAiAction: ActionDefinition = {
  id: 'send-to-ai',
  label: 'Send to AI',
  description: 'Send text content to the active AI conversation',
  icon: 'ph:paper-plane',
  accepts: ['text', 'markdown'],
  produces: 'text',
  handler: async (payload: ExecutionPayload): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      // Emit event for chat system to handle
      const bus = useEventBus();
      bus.emit('skill:send-to-ai', { text: String(payload.data), source: payload.source });
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to send to AI',
        Date.now() - startTime
      );
    }
  },
};

/**
 * save-to-notes - Save content to the notes panel
 */
export const saveToNotesAction: ActionDefinition = {
  id: 'save-to-notes',
  label: 'Save to Notes',
  description: 'Append content to the current note',
  icon: 'ph:note',
  accepts: ['text', 'markdown'],
  produces: 'void',
  handler: async (payload: ExecutionPayload): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      const bus = useEventBus();
      bus.emit('skill:save-to-notes', { text: String(payload.data), source: payload.source });
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to save to notes',
        Date.now() - startTime
      );
    }
  },
};

/**
 * copy-to-clipboard - Copy content to system clipboard
 */
export const copyToClipboardAction: ActionDefinition = {
  id: 'copy-to-clipboard',
  label: 'Copy',
  description: 'Copy content to the clipboard',
  icon: 'ph:clipboard',
  accepts: ['text', 'markdown', 'json'],
  produces: 'void',
  handler: async (payload: ExecutionPayload): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      const text =
        typeof payload.data === 'string' ? payload.data : JSON.stringify(payload.data, null, 2);
      await navigator.clipboard.writeText(text);
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to copy to clipboard',
        Date.now() - startTime
      );
    }
  },
};

/**
 * speak-aloud - Use Web Speech API to read content
 */
export const speakAloudAction: ActionDefinition = {
  id: 'speak-aloud',
  label: 'Speak',
  description: 'Read text aloud using speech synthesis',
  icon: 'ph:speaker-high',
  accepts: ['text'],
  produces: 'void',
  parameters: [
    {
      id: 'rate',
      label: 'Speed',
      type: 'number',
      default: 1,
    },
    {
      id: 'voice',
      label: 'Voice',
      type: 'select',
      options: [], // populated dynamically
    },
  ],
  handler: async (
    payload: ExecutionPayload,
    params: Record<string, unknown>
  ): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      if (!('speechSynthesis' in window)) {
        return createErrorResult('Speech synthesis not supported', Date.now() - startTime);
      }

      const utterance = new SpeechSynthesisUtterance(String(payload.data));
      utterance.rate = typeof params.rate === 'number' ? params.rate : 1;

      if (params.voice && typeof params.voice === 'string') {
        const voices = speechSynthesis.getVoices();
        const selectedVoice = voices.find((v) => v.name === params.voice);
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }
      }

      speechSynthesis.speak(utterance);
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to speak',
        Date.now() - startTime
      );
    }
  },
  onRegister: () => {
    // Pre-load voices (they may not be immediately available)
    if ('speechSynthesis' in window) {
      speechSynthesis.getVoices();
    }
  },
};

/**
 * open-panel - Open a specific UI panel
 */
export const openPanelAction: ActionDefinition = {
  id: 'open-panel',
  label: 'Open Panel',
  description: 'Open a specific application panel',
  icon: 'ph:sidebar',
  accepts: ['void'],
  produces: 'void',
  parameters: [
    {
      id: 'panel',
      label: 'Panel',
      type: 'select',
      required: true,
      options: [
        { value: 'notes', label: 'Notes' },
        { value: 'settings', label: 'Settings' },
        { value: 'help', label: 'Help' },
      ],
    },
  ],
  handler: async (
    _payload: ExecutionPayload,
    params: Record<string, unknown>
  ): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      const bus = useEventBus();
      bus.emit('panel:open', {
        panel: params.panel as 'notes' | 'settings' | 'help' | 'chathistory',
      });
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to open panel',
        Date.now() - startTime
      );
    }
  },
};

/**
 * change-theme - Switch the application theme
 */
export const changeThemeAction: ActionDefinition = {
  id: 'change-theme',
  label: 'Change Theme',
  description: 'Switch to a different visual theme',
  icon: 'ph:palette',
  accepts: ['void'],
  produces: 'void',
  parameters: [
    {
      id: 'theme',
      label: 'Theme',
      type: 'select',
      options: [], // populated from appSettings at runtime
    },
  ],
  handler: async (
    _payload: ExecutionPayload,
    params: Record<string, unknown>
  ): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      const theme = params.theme as string;
      if (theme && window.AppSettings && typeof window.AppSettings.setTheme === 'function') {
        (window.AppSettings as { setTheme: (t: string) => void }).setTheme(theme);
      } else {
        // Fallback: emit event
        const bus = useEventBus();
        bus.emit('theme:change', { theme });
      }
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to change theme',
        Date.now() - startTime
      );
    }
  },
};

/**
 * Maximum number of reminders to store in localStorage
 */
const MAX_REMINDERS = 100;

/**
 * schedule-reminder - Schedule a future reminder
 */
export const scheduleReminderAction: ActionDefinition = {
  id: 'schedule-reminder',
  label: 'Remind Me',
  description: 'Set a reminder for later',
  icon: 'ph:alarm',
  accepts: ['text'],
  produces: 'void',
  parameters: [
    {
      id: 'delay',
      label: 'In',
      type: 'duration',
      default: '1h',
    },
  ],
  handler: async (
    payload: ExecutionPayload,
    params: Record<string, unknown>
  ): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      const delayStr = typeof params.delay === 'string' ? params.delay : '1h';
      const delayMs = parseDuration(delayStr);

      // Load existing reminders from localStorage
      let reminders = JSON.parse(localStorage.getItem(STORAGE_KEYS.REMINDERS) || '[]') as Array<{
        id: string;
        text: string;
        triggerAt: number;
        createdAt: number;
      }>;

      // Filter out expired reminders
      const now = Date.now();
      reminders = reminders.filter((r) => r.triggerAt > now);

      // Enforce size limit - keep most recent reminders if over limit
      if (reminders.length >= MAX_REMINDERS) {
        reminders = reminders.sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_REMINDERS - 1);
      }

      // Add the new reminder
      reminders.push({
        id: crypto.randomUUID(),
        text: String(payload.data),
        triggerAt: now + delayMs,
        createdAt: now,
      });

      localStorage.setItem(STORAGE_KEYS.REMINDERS, JSON.stringify(reminders));

      // Emit event for UI feedback
      const bus = useEventBus();
      bus.emit('reminder:scheduled', {
        text: String(payload.data),
        triggerAt: now + delayMs,
        delay: delayStr,
      });

      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to schedule reminder',
        Date.now() - startTime
      );
    }
  },
};

/**
 * bind-to-gesture - Bind a skill to a hand gesture
 */
export const bindToGestureAction: ActionDefinition = {
  id: 'bind-to-gesture',
  label: 'Bind to Gesture',
  description: 'Associate this skill with a hand gesture',
  icon: 'ph:hand',
  accepts: ['void'],
  produces: 'void',
  parameters: [
    {
      id: 'gesture',
      label: 'Gesture',
      type: 'select',
      options: [
        { value: 'swipe-left', label: 'Swipe Left' },
        { value: 'swipe-right', label: 'Swipe Right' },
        { value: 'pinch', label: 'Pinch' },
        { value: 'spread', label: 'Spread' },
        { value: 'fist', label: 'Fist' },
      ],
    },
  ],
  handler: async (
    payload: ExecutionPayload,
    params: Record<string, unknown>
  ): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      const bus = useEventBus();
      bus.emit('gesture:bind', {
        gesture: params.gesture as string,
        skillId: payload.source,
      });
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to bind gesture',
        Date.now() - startTime
      );
    }
  },
};

// ==================== NEW SYSTEM ACTIONS ====================

/**
 * toggle-grid - Toggle grid overlay
 */
export const toggleGridAction: ActionDefinition = {
  id: 'toggle-grid',
  label: 'Toggle Grid',
  description: 'Show or hide the grid overlay',
  icon: 'ph:grid-four',
  accepts: ['void'],
  produces: 'void',
  handler: async (): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      const gridOverlay = document.getElementById('grid-overlay');
      if (gridOverlay) {
        gridOverlay.classList.toggle('hidden');
        const isVisible = !gridOverlay.classList.contains('hidden');
        useEventBus().emit('grid:toggled', { visible: isVisible });
      }
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to toggle grid',
        Date.now() - startTime
      );
    }
  },
};

/**
 * save-chat-pdf - Export chat as PDF
 */
export const saveChatPdfAction: ActionDefinition = {
  id: 'save-chat-pdf',
  label: 'Save Chat as PDF',
  description: 'Export the current conversation as a PDF file',
  icon: 'ph:file-pdf',
  accepts: ['void'],
  produces: 'void',
  handler: async (): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      useEventBus().emit('chat:save-pdf');
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to save PDF',
        Date.now() - startTime
      );
    }
  },
};

/**
 * email-chat - Email chat transcript
 */
export const emailChatAction: ActionDefinition = {
  id: 'email-chat',
  label: 'Email Chat',
  description: 'Email the current conversation transcript',
  icon: 'ph:envelope',
  accepts: ['void'],
  produces: 'void',
  handler: async (): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      useEventBus().emit('chat:email');
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to email chat',
        Date.now() - startTime
      );
    }
  },
};

/**
 * toggle-gamepad - Enable/disable gamepad input
 */
export const toggleGamepadAction: ActionDefinition = {
  id: 'toggle-gamepad',
  label: 'Toggle Gamepad',
  description: 'Enable or disable gamepad controller input',
  icon: 'ph:game-controller',
  accepts: ['void'],
  produces: 'void',
  handler: async (): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      useEventBus().emit('gamepad:toggle');
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to toggle gamepad',
        Date.now() - startTime
      );
    }
  },
};

/**
 * toggle-side-menu - Open/close side menu
 */
export const toggleSideMenuAction: ActionDefinition = {
  id: 'toggle-side-menu',
  label: 'Toggle Menu',
  description: 'Open or close the side menu',
  icon: 'ph:list',
  accepts: ['void'],
  produces: 'void',
  handler: async (): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      useEventBus().emit('panel:toggle', { panel: 'sidemenu' });
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to toggle menu',
        Date.now() - startTime
      );
    }
  },
};

/**
 * open-settings - Open settings modal
 */
export const openSettingsAction: ActionDefinition = {
  id: 'open-settings',
  label: 'Open Settings',
  description: 'Open the settings panel',
  icon: 'ph:gear',
  accepts: ['void'],
  produces: 'void',
  handler: async (): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      useEventBus().emit('panel:open', { panel: 'settings' });
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to open settings',
        Date.now() - startTime
      );
    }
  },
};

/**
 * open-chat-history - Open chat history modal
 */
export const openChatHistoryAction: ActionDefinition = {
  id: 'open-chat-history',
  label: 'Chat History',
  description: 'Open the chat history panel',
  icon: 'ph:clock-counter-clockwise',
  accepts: ['void'],
  produces: 'void',
  handler: async (): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      useEventBus().emit('panel:open', { panel: 'chathistory' });
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to open chat history',
        Date.now() - startTime
      );
    }
  },
};

/**
 * toggle-voice-input - Toggle microphone
 */
export const toggleVoiceInputAction: ActionDefinition = {
  id: 'toggle-voice-input',
  label: 'Toggle Voice',
  description: 'Toggle voice input microphone',
  icon: 'ph:microphone',
  accepts: ['void'],
  produces: 'void',
  handler: async (): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      useEventBus().emit('voice:toggle');
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to toggle voice input',
        Date.now() - startTime
      );
    }
  },
};

/**
 * attach-image - Open image picker
 */
export const attachImageAction: ActionDefinition = {
  id: 'attach-image',
  label: 'Attach Image',
  description: 'Open file picker to attach an image',
  icon: 'ph:image',
  accepts: ['void'],
  produces: 'void',
  handler: async (): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      useEventBus().emit('attachment:image');
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to open image picker',
        Date.now() - startTime
      );
    }
  },
};

/**
 * new-chat - Start fresh conversation
 */
export const newChatAction: ActionDefinition = {
  id: 'new-chat',
  label: 'New Chat',
  description: 'Start a fresh conversation',
  icon: 'ph:plus-circle',
  accepts: ['void'],
  produces: 'void',
  handler: async (): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      useEventBus().emit('chat:new');
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to start new chat',
        Date.now() - startTime
      );
    }
  },
};

/**
 * save-workspace - Save current workspace state
 */
export const saveWorkspaceAction: ActionDefinition = {
  id: 'save-workspace',
  label: 'Save Workspace',
  description: 'Save the current workspace state',
  icon: 'ph:floppy-disk',
  accepts: ['void'],
  produces: 'void',
  handler: async (): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      useEventBus().emit('workspace:save');
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to save workspace',
        Date.now() - startTime
      );
    }
  },
};

/**
 * load-workspace - Load saved workspace
 */
export const loadWorkspaceAction: ActionDefinition = {
  id: 'load-workspace',
  label: 'Load Workspace',
  description: 'Load a saved workspace',
  icon: 'ph:folder-open',
  accepts: ['void'],
  produces: 'void',
  handler: async (): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      useEventBus().emit('workspace:load');
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to load workspace',
        Date.now() - startTime
      );
    }
  },
};

/**
 * email-notes - Email notes content
 */
export const emailNotesAction: ActionDefinition = {
  id: 'email-notes',
  label: 'Email Notes',
  description: 'Email the current notes content',
  icon: 'ph:envelope-simple',
  accepts: ['void'],
  produces: 'void',
  handler: async (): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      useEventBus().emit('notes:email');
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to email notes',
        Date.now() - startTime
      );
    }
  },
};

/**
 * cycle-theme-forward - Next theme
 */
export const cycleThemeForwardAction: ActionDefinition = {
  id: 'cycle-theme-forward',
  label: 'Next Theme',
  description: 'Switch to the next theme',
  icon: 'ph:arrow-right',
  accepts: ['void'],
  produces: 'void',
  handler: async (): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      useEventBus().emit('theme:cycle', { direction: 'forward' });
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to cycle theme',
        Date.now() - startTime
      );
    }
  },
};

/**
 * cycle-theme-backward - Previous theme
 */
export const cycleThemeBackwardAction: ActionDefinition = {
  id: 'cycle-theme-backward',
  label: 'Previous Theme',
  description: 'Switch to the previous theme',
  icon: 'ph:arrow-left',
  accepts: ['void'],
  produces: 'void',
  handler: async (): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      useEventBus().emit('theme:cycle', { direction: 'backward' });
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to cycle theme',
        Date.now() - startTime
      );
    }
  },
};

/**
 * toggle-model-viewer - Show/hide 3D bird
 */
export const toggleModelViewerAction: ActionDefinition = {
  id: 'toggle-model-viewer',
  label: 'Toggle 3D Model',
  description: 'Show or hide the 3D model viewer',
  icon: 'ph:cube',
  accepts: ['void'],
  produces: 'void',
  handler: async (): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      useEventBus().emit('modelviewer:toggle');
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to toggle model viewer',
        Date.now() - startTime
      );
    }
  },
};

/**
 * toggle-weather-widget - Show/hide time widget
 */
export const toggleWeatherWidgetAction: ActionDefinition = {
  id: 'toggle-weather-widget',
  label: 'Toggle Time Widget',
  description: 'Show or hide the time/weather widget',
  icon: 'ph:clock',
  accepts: ['void'],
  produces: 'void',
  handler: async (): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      useEventBus().emit('timewidget:toggle');
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to toggle time widget',
        Date.now() - startTime
      );
    }
  },
};

/**
 * send-notes-to-chat - Send note content to AI
 */
export const sendNotesToChatAction: ActionDefinition = {
  id: 'send-notes-to-chat',
  label: 'Send Notes to Chat',
  description: 'Send the current notes content to the AI',
  icon: 'ph:paper-plane-right',
  accepts: ['void'],
  produces: 'void',
  handler: async (): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      useEventBus().emit('notes:send-to-chat');
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to send notes to chat',
        Date.now() - startTime
      );
    }
  },
};

/**
 * center-input-bar - Reset input bar position
 */
export const centerInputBarAction: ActionDefinition = {
  id: 'center-input-bar',
  label: 'Center Input Bar',
  description: 'Reset the input bar to center position',
  icon: 'ph:align-center-horizontal',
  accepts: ['void'],
  produces: 'void',
  handler: async (): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      useEventBus().emit('inputbar:center');
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to center input bar',
        Date.now() - startTime
      );
    }
  },
};

/**
 * toggle-hand-tracking - Enable/disable hand gestures
 */
export const toggleHandTrackingAction: ActionDefinition = {
  id: 'toggle-hand-tracking',
  label: 'Toggle Hand Tracking',
  description: 'Enable or disable hand gesture tracking',
  icon: 'ph:hand',
  accepts: ['void'],
  produces: 'void',
  handler: async (): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      useEventBus().emit('handtracking:toggle');
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to toggle hand tracking',
        Date.now() - startTime
      );
    }
  },
};

/**
 * open-help-pane - Open the help pane with optional tip highlight
 */
export const openHelpPaneAction: ActionDefinition = {
  id: 'open-help-pane',
  label: 'Open Help',
  description: 'Open the help pane to see tips and guidance',
  icon: 'ph:question',
  accepts: ['void'],
  produces: 'void',
  parameters: [
    {
      id: 'highlight',
      label: 'Tip to highlight',
      type: 'string',
    },
  ],
  handler: async (
    _payload: ExecutionPayload,
    params: Record<string, unknown>
  ): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      // Open help pane
      const win = window as unknown as {
        openHelpPane?: () => void;
        showHelpTip?: (id: string) => void;
      };
      if (typeof win.openHelpPane === 'function') {
        win.openHelpPane();
      } else {
        useEventBus().emit('panel:open', { panel: 'help' });
      }

      // Highlight specific tip after delay
      if (params.highlight && typeof params.highlight === 'string') {
        setTimeout(() => {
          if (typeof win.showHelpTip === 'function') {
            win.showHelpTip(params.highlight as string);
          }
        }, 300);
      }

      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to open help pane',
        Date.now() - startTime
      );
    }
  },
};

// ==================== APP CONTROL ACTIONS ====================

/**
 * open-app - Launch an app window by appId
 */
export const openAppAction: ActionDefinition = {
  id: 'open-app',
  label: 'Open App',
  description: 'Launch an app window',
  icon: 'ph:app-window',
  accepts: ['void'],
  produces: 'void',
  parameters: [
    {
      id: 'appId',
      label: 'App',
      type: 'select',
      required: true,
      options: [], // populated dynamically by UI at skill creation time
    },
  ],
  handler: async (
    _payload: ExecutionPayload,
    params: Record<string, unknown>
  ): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      const { useWindowManager } = await import(
        /* @vite-ignore */ '@web/composables/useWindowManager'
      );
      const { createAppRegistry } = await import(
        /* @vite-ignore */ '@web/services/apps/appRegistry'
      );

      const appRegistry = createAppRegistry();
      const windowManager = useWindowManager();

      const appId = params.appId as string;
      if (!appId) {
        return createErrorResult('App ID is required', Date.now() - startTime);
      }

      const definition = await appRegistry.get(appId);
      if (!definition) {
        return createErrorResult(`App not found: ${appId}`, Date.now() - startTime);
      }

      windowManager.openWindow(definition);

      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to open app',
        Date.now() - startTime
      );
    }
  },
};

/**
 * close-app - Close a running app instance
 */
export const closeAppAction: ActionDefinition = {
  id: 'close-app',
  label: 'Close App',
  description: 'Close a running app window',
  icon: 'ph:x-square',
  accepts: ['void'],
  produces: 'void',
  parameters: [
    {
      id: 'instanceId',
      label: 'Instance',
      type: 'select',
      required: true,
      options: [], // populated from windowManager.windowList
    },
  ],
  handler: async (
    _payload: ExecutionPayload,
    params: Record<string, unknown>
  ): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      const { useWindowManager } = await import(
        /* @vite-ignore */ '@web/composables/useWindowManager'
      );
      const windowManager = useWindowManager();

      const instanceId = params.instanceId as string;
      if (!instanceId) {
        return createErrorResult('Instance ID is required', Date.now() - startTime);
      }

      if (!windowManager.getWindow(instanceId)) {
        return createErrorResult(`App instance not found: ${instanceId}`, Date.now() - startTime);
      }

      windowManager.closeApp(instanceId);
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to close app',
        Date.now() - startTime
      );
    }
  },
};

/**
 * focus-app - Bring an app window to the front
 */
export const focusAppAction: ActionDefinition = {
  id: 'focus-app',
  label: 'Focus App',
  description: 'Bring an app window to the front',
  icon: 'ph:frame-corners',
  accepts: ['void'],
  produces: 'void',
  parameters: [
    {
      id: 'instanceId',
      label: 'Instance',
      type: 'select',
      required: true,
      options: [], // populated from windowManager.windowList
    },
  ],
  handler: async (
    _payload: ExecutionPayload,
    params: Record<string, unknown>
  ): Promise<ExecutionResult> => {
    const startTime = Date.now();
    try {
      const { useWindowManager } = await import(
        /* @vite-ignore */ '@web/composables/useWindowManager'
      );
      const windowManager = useWindowManager();

      const instanceId = params.instanceId as string;
      if (!instanceId) {
        return createErrorResult('Instance ID is required', Date.now() - startTime);
      }

      if (!windowManager.getWindow(instanceId)) {
        return createErrorResult(`App instance not found: ${instanceId}`, Date.now() - startTime);
      }

      windowManager.focusWindow(instanceId);
      return createSuccessResult(undefined, Date.now() - startTime);
    } catch (err) {
      return createErrorResult(
        err instanceof Error ? err.message : 'Failed to focus app',
        Date.now() - startTime
      );
    }
  },
};

/**
 * All built-in actions as an array for easy registration
 */
export const BUILTIN_ACTIONS: ActionDefinition[] = [
  // Original actions
  sendToAiAction,
  saveToNotesAction,
  copyToClipboardAction,
  speakAloudAction,
  openPanelAction,
  changeThemeAction,
  scheduleReminderAction,
  bindToGestureAction,
  // New system actions
  toggleGridAction,
  saveChatPdfAction,
  emailChatAction,
  toggleGamepadAction,
  toggleSideMenuAction,
  openSettingsAction,
  openChatHistoryAction,
  toggleVoiceInputAction,
  attachImageAction,
  newChatAction,
  saveWorkspaceAction,
  loadWorkspaceAction,
  emailNotesAction,
  cycleThemeForwardAction,
  cycleThemeBackwardAction,
  toggleModelViewerAction,
  toggleWeatherWidgetAction,
  sendNotesToChatAction,
  centerInputBarAction,
  toggleHandTrackingAction,
  // Onboarding actions
  openHelpPaneAction,
  // App control actions
  openAppAction,
  closeAppAction,
  focusAppAction,
];

/**
 * Map of action IDs to definitions for quick lookup
 */
export const BUILTIN_ACTIONS_MAP: Map<string, ActionDefinition> = new Map(
  BUILTIN_ACTIONS.map((action) => [action.id, action])
);

// ==================== BUILT-IN MODIFIER SKILLS ====================

/**
 * Create a modifier skill definition
 */
function createModifierSkill(
  id: string,
  title: string,
  icon: string,
  modifierConfig: ModifierConfig,
  combinable: CombinationRules
): Omit<SkillV2, 'usageCount' | 'lastUsed' | 'createdAt'> {
  return {
    id,
    title,
    type: 'modifier',
    icon,
    source: 'builtin',
    modifierConfig,
    combinable,
  };
}

/**
 * mod-voice-output - Speak the result aloud
 */
export const modVoiceOutput = createModifierSkill(
  'mod-voice-output',
  'Speak Result',
  'ph:speaker-high',
  {
    modifies: 'output',
    transformType: 'custom',
    transform: (payload: ExecutionPayload): ExecutionPayload => {
      // Trigger speech after execution (non-blocking)
      if ('speechSynthesis' in window && payload.data) {
        const text = typeof payload.data === 'string' ? payload.data : String(payload.data);
        const utterance = new SpeechSynthesisUtterance(text);
        speechSynthesis.speak(utterance);
      }
      return payload; // pass through unchanged
    },
  },
  {
    canCombineWith: ['prompt', 'template', 'action'],
    preferredMode: 'modify',
    position: 'after',
  }
);

/**
 * mod-save-result - Save the result to notes
 */
export const modSaveResult = createModifierSkill(
  'mod-save-result',
  'Save Result',
  'ph:floppy-disk',
  {
    modifies: 'output',
    transformType: 'custom',
    transform: (payload: ExecutionPayload): ExecutionPayload => {
      // Emit event to save to notes (non-blocking)
      if (payload.data) {
        useEventBus().emit('skill:save-to-notes', {
          text: typeof payload.data === 'string' ? payload.data : String(payload.data),
          source: payload.source,
        });
      }
      return payload; // pass through unchanged
    },
  },
  {
    canCombineWith: ['prompt', 'template'],
    preferredMode: 'modify',
    position: 'after',
  }
);

/**
 * mod-format-markdown - Wrap content in markdown code block
 */
export const modFormatMarkdown = createModifierSkill(
  'mod-format-markdown',
  'As Markdown',
  'ph:markdown-logo',
  {
    modifies: 'input',
    transformType: 'wrap',
    transformArgs: { prefix: '```markdown\n', suffix: '\n```' },
    transform: (payload: ExecutionPayload): ExecutionPayload => ({
      ...payload,
      type: 'markdown',
      data: '```markdown\n' + String(payload.data) + '\n```',
    }),
  },
  {
    canCombineWith: ['prompt', 'template'],
    preferredMode: 'modify',
    position: 'before',
  }
);

/**
 * mod-formal-tone - Append formal tone instruction
 */
export const modFormalTone = createModifierSkill(
  'mod-formal-tone',
  'Formal Tone',
  'ph:tie',
  {
    modifies: 'input',
    transformType: 'append',
    transformArgs: { text: '\n\nUse a formal, professional tone.' },
    transform: (payload: ExecutionPayload): ExecutionPayload => ({
      ...payload,
      data: String(payload.data) + '\n\nUse a formal, professional tone.',
    }),
  },
  {
    canCombineWith: ['prompt', 'template'],
    preferredMode: 'modify',
    position: 'after',
  }
);

/**
 * mod-casual-tone - Append casual tone instruction
 */
export const modCasualTone = createModifierSkill(
  'mod-casual-tone',
  'Casual Tone',
  'ph:smiley',
  {
    modifies: 'input',
    transformType: 'append',
    transformArgs: { text: '\n\nUse a casual, friendly tone.' },
    transform: (payload: ExecutionPayload): ExecutionPayload => ({
      ...payload,
      data: String(payload.data) + '\n\nUse a casual, friendly tone.',
    }),
  },
  {
    canCombineWith: ['prompt', 'template'],
    preferredMode: 'modify',
    position: 'after',
  }
);

/**
 * mod-concise - Append concise instruction
 */
export const modConcise = createModifierSkill(
  'mod-concise',
  'Be Concise',
  'ph:arrows-in-simple',
  {
    modifies: 'input',
    transformType: 'append',
    transformArgs: { text: '\n\nBe concise and to the point.' },
    transform: (payload: ExecutionPayload): ExecutionPayload => ({
      ...payload,
      data: String(payload.data) + '\n\nBe concise and to the point.',
    }),
  },
  {
    canCombineWith: ['prompt', 'template'],
    preferredMode: 'modify',
    position: 'after',
  }
);

/**
 * mod-detailed - Append detailed instruction
 */
export const modDetailed = createModifierSkill(
  'mod-detailed',
  'Be Detailed',
  'ph:arrows-out-simple',
  {
    modifies: 'input',
    transformType: 'append',
    transformArgs: { text: '\n\nProvide a detailed, comprehensive response.' },
    transform: (payload: ExecutionPayload): ExecutionPayload => ({
      ...payload,
      data: String(payload.data) + '\n\nProvide a detailed, comprehensive response.',
    }),
  },
  {
    canCombineWith: ['prompt', 'template'],
    preferredMode: 'modify',
    position: 'after',
  }
);

/**
 * All built-in modifier skills
 */
export const BUILTIN_MODIFIERS: Array<Omit<SkillV2, 'usageCount' | 'lastUsed' | 'createdAt'>> = [
  modVoiceOutput,
  modSaveResult,
  modFormatMarkdown,
  modFormalTone,
  modCasualTone,
  modConcise,
  modDetailed,
];

// ==================== BUILT-IN PROMPT / ACTION SKILLS ====================

/**
 * Built-in prompt and action skills shown as pills in the dock.
 * These have stable IDs (builtin-0 through builtin-12) and are
 * registered in the coordinator at startup.
 */
export const BUILTIN_PROMPT_SKILLS: Array<Omit<SkillV2, 'usageCount' | 'lastUsed' | 'createdAt'>> =
  [
    {
      id: 'builtin-0',
      title: 'Recommend something',
      type: 'prompt',
      source: 'builtin',
      promptConfig: { text: 'Recommend something', autoSubmit: true },
    },
    {
      id: 'builtin-1',
      title: 'Open notes',
      type: 'action',
      source: 'builtin',
      actionConfig: { actionId: 'open-notes' },
    },
    {
      id: 'builtin-12',
      title: 'Make me an app',
      type: 'prompt',
      source: 'builtin',
      promptConfig: {
        text: 'Make me a clock app',
        autoSubmit: true,
      },
    },
    {
      id: 'builtin-13',
      title: 'Make me a moodboard',
      type: 'prompt',
      source: 'builtin',
      promptConfig: { text: 'Make me a moodboard of roman pottery designs', autoSubmit: true },
    },
    {
      id: 'builtin-2',
      title: 'Voice commands',
      type: 'action',
      source: 'builtin',
      actionConfig: { actionId: 'voice-commands' },
    },
    {
      id: 'builtin-3',
      title: 'Help me with my research',
      type: 'prompt',
      source: 'builtin',
      promptConfig: { text: 'Help me with my research', autoSubmit: true },
    },
    {
      id: 'builtin-4',
      title: 'Find scenes from Sans soleil',
      type: 'prompt',
      source: 'builtin',
      promptConfig: { text: 'Find scenes from Sans soleil', autoSubmit: true },
    },
    {
      id: 'builtin-5',
      title: 'Help & Tips',
      type: 'action',
      source: 'builtin',
      actionConfig: { actionId: 'toggle-help' },
    },
    {
      id: 'builtin-6',
      title: 'Create a playlist',
      type: 'prompt',
      source: 'builtin',
      promptConfig: { text: 'Create a playlist', autoSubmit: true },
    },
    {
      id: 'builtin-7',
      title: 'What colors are in this?',
      type: 'prompt',
      source: 'builtin',
      promptConfig: { text: 'What colors are in this?', autoSubmit: true },
    },
    {
      id: 'builtin-8',
      title: 'Find films that looks like this',
      type: 'prompt',
      source: 'builtin',
      promptConfig: { text: 'Find films that looks like this', autoSubmit: true },
    },
    {
      id: 'builtin-9',
      title: 'What else can I ask you?',
      type: 'prompt',
      source: 'builtin',
      promptConfig: { text: 'What else can I ask you?', autoSubmit: true },
    },
    {
      id: 'builtin-10',
      title: "Let's play a game",
      type: 'prompt',
      source: 'builtin',
      promptConfig: { text: "Let's play a game", autoSubmit: true },
    },
    {
      id: 'builtin-11',
      title: 'Who makes stuff like this?',
      type: 'prompt',
      source: 'builtin',
      promptConfig: { text: 'Who makes stuff like this?', autoSubmit: true },
    },
  ];

// ==================== AVAILABLE ACTIONS LIST ====================

/**
 * Available system actions for the skill editor dropdown.
 * Used by SkillsPane.vue when creating/editing action-type skills.
 */
export const AVAILABLE_ACTIONS_LIST: ReadonlyArray<{ id: string; label: string }> = [
  // Original actions
  { id: 'open-notes', label: 'Open notes' },
  { id: 'toggle-help', label: 'Toggle help pane' },
  { id: 'voice-commands', label: 'Show voice commands doc' },
  { id: 'change-theme', label: 'Switch theme' },
  { id: 'set-theme-custom', label: 'Switch to Custom theme' },
  { id: 'toggle-grid', label: 'Toggle grid' },
  // Navigation & panels
  { id: 'toggle-side-menu', label: 'Toggle side menu' },
  { id: 'open-settings', label: 'Open settings' },
  { id: 'open-chat-history', label: 'Open chat history' },
  // Chat actions
  { id: 'new-chat', label: 'New conversation' },
  { id: 'save-chat-pdf', label: 'Save chat as PDF' },
  { id: 'email-chat', label: 'Email chat' },
  // Notes actions
  { id: 'email-notes', label: 'Email notes' },
  { id: 'send-notes-to-chat', label: 'Send notes to chat' },
  // Input & voice
  { id: 'toggle-voice-input', label: 'Toggle voice input' },
  { id: 'attach-image', label: 'Attach image' },
  { id: 'center-input-bar', label: 'Center input bar' },
  // Workspace
  { id: 'save-workspace', label: 'Save workspace' },
  { id: 'load-workspace', label: 'Load workspace' },
  // Theme cycling
  { id: 'cycle-theme-forward', label: 'Next theme' },
  { id: 'cycle-theme-backward', label: 'Previous theme' },
  // Visual toggles
  { id: 'toggle-model-viewer', label: 'Toggle 3D model' },
  { id: 'toggle-weather-widget', label: 'Toggle time widget' },
  // Input modes
  { id: 'toggle-gamepad', label: 'Toggle gamepad' },
  { id: 'toggle-hand-tracking', label: 'Toggle hand tracking' },
  // App control
  { id: 'open-app', label: 'Open app' },
  { id: 'close-app', label: 'Close app' },
  { id: 'focus-app', label: 'Focus app' },
];
