import { z } from 'zod';
import { getAppSettings } from '@web/config/appSettings.js';
import { storage } from '@web/storage/storage.js';
import { useEventBus } from '@web/services/eventBus';
import { logError } from '@web/utils/debugLog.js';
import DOMPurify from 'dompurify';

// Zod schema for workspace import validation
const CleanMessageSchema = z.object({
  id: z.string(),
  sender: z.string(),
  text: z.string(),
  createdAt: z.number(),
});

const ConversationExportSchema = z.object({
  id: z.string(),
  title: z.string(),
  provider: z.string(),
  model: z.string(),
  createdAt: z.number(),
  messages: z.array(CleanMessageSchema),
});

const TabMetaSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
});

const NotesDataSchema = z.object({
  tabsMeta: z.array(TabMetaSchema),
  activeTabId: z.string(),
  tabContents: z.record(z.string(), z.string()),
  paneSize: z.unknown(),
});

const PreferencesSchema = z.object({
  llmProvider: z.string(),
  chatReasoningEffort: z.string(),
  'model:openai': z.string(),
  'model:anthropic': z.string(),
  'model:gemini': z.string(),
  'model:openrouter': z.string(),
  'model:lmstudio': z.string(),
  showRulerPreference: z.string(),
  weatherWidgetPrefs: z.unknown(),
  'lmstudio:baseUrl': z.string(),
});

// Main workspace schema - all fields optional for backwards compatibility
const WorkspacePayloadSchema = z.object({
  version: z.number().optional(),
  saved: z.number().optional(),
  theme: z.string().optional(),
  chatHTML: z.string().optional(),
  notesHTML: z.string().optional(),
  notesHistory: z.array(z.unknown()).optional(),
  notes: NotesDataSchema.optional(),
  preferences: PreferencesSchema.partial().optional(),
  conversations: z.array(ConversationExportSchema).optional(),
});

// Types for workspace data
interface TabMeta {
  id: string;
  name?: string;
}

interface NotesData {
  tabsMeta: TabMeta[];
  activeTabId: string;
  tabContents: Record<string, string>;
  paneSize: unknown;
}

interface Preferences {
  llmProvider: string;
  chatReasoningEffort: string;
  'model:openai': string;
  'model:anthropic': string;
  'model:gemini': string;
  'model:openrouter': string;
  'model:lmstudio': string;
  showRulerPreference: string;
  weatherWidgetPrefs: unknown;
  'lmstudio:baseUrl': string;
}

interface CleanMessage {
  id: string;
  sender: string;
  text: string;
  createdAt: number;
}

interface StoredMessage {
  id?: string;
  sender?: string;
  text?: string;
  createdAt?: number;
  [key: string]: unknown;
}

interface ConversationExport {
  id: string;
  title: string;
  provider: string;
  model: string;
  createdAt: number;
  messages: CleanMessage[];
}

interface WorkspaceSnapshot {
  version: number;
  saved: number;
  theme: string;
  notes: NotesData;
  preferences: Preferences;
  chatHTML: string;
  notesHTML: string;
  notesHistory: unknown[];
  conversations?: ConversationExport[];
}

export interface WorkspacePayload {
  version?: number;
  theme?: string;
  chatHTML?: string;
  notesHTML?: string;
  notesHistory?: unknown[];
  notes?: NotesData;
  preferences?: Preferences;
  conversations?: ConversationExport[];
}

// Window extension
declare global {
  interface Window {
    restoreWorkspace?: (payload: WorkspacePayload) => Promise<void>;
    saveWorkflow?: () => Promise<void>;
    loadWorkflow?: () => void;
    setTheme?: (theme: string) => void;
    lowerBarToBottom?: () => void;
    stopDotMatrix?: () => void;
  }
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Gather notes data from the tab system
 */
function gatherNotesData(): NotesData {
  const tabsMeta = storage.mirror.getJSON('notesTabsMeta', []) as TabMeta[];
  const activeTabId = storage.mirror.get('notesActiveTabId') || '';
  const paneSize = storage.mirror.getJSON('notesPaneSize', null);

  // Gather content for each tab
  const tabContents: Record<string, string> = {};
  if (Array.isArray(tabsMeta)) {
    for (const tab of tabsMeta) {
      if (tab && tab.id) {
        const html = storage.mirror.get(`tab:${tab.id}:html`) || '';
        tabContents[tab.id] = html;
      }
    }
  }

  return { tabsMeta, activeTabId, tabContents, paneSize };
}

/**
 * Gather user preferences (excluding sensitive API keys)
 */
function gatherPreferences(): Preferences {
  return {
    llmProvider: storage.mirror.get('llmProvider') || '',
    chatReasoningEffort: storage.mirror.get('chatReasoningEffort') || '',
    'model:openai': storage.mirror.get('model:openai') || '',
    'model:anthropic': storage.mirror.get('model:anthropic') || '',
    'model:gemini': storage.mirror.get('model:gemini') || '',
    'model:openrouter': storage.mirror.get('model:openrouter') || '',
    'model:lmstudio': storage.mirror.get('model:lmstudio') || '',
    showRulerPreference: storage.mirror.get('showRulerPreference') || '',
    weatherWidgetPrefs: storage.mirror.getJSON('weatherWidgetPrefs', null),
    'lmstudio:baseUrl': storage.mirror.get('lmstudio:baseUrl') || '',
  };
}

/**
 * Gather recent conversations from IndexedDB
 * Returns conversations with their messages (excluding image blobs for file size)
 */
async function gatherConversations(limit = 20): Promise<ConversationExport[]> {
  try {
    const conversations = await storage.conversations.list({ index: 'updatedAt', limit });
    if (!Array.isArray(conversations) || !conversations.length) return [];

    const result: ConversationExport[] = [];
    for (const convo of conversations) {
      if (!convo || !convo.id) continue;
      try {
        const messages = (await storage.messages.list({
          index: { conversationId: convo.id },
          limit: 500,
        })) as unknown as StoredMessage[];
        const ordered = Array.isArray(messages)
          ? [...messages].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
          : [];

        // Strip image refs to reduce file size (can't export blob data reliably)
        const cleanMessages: CleanMessage[] = ordered.map((msg) => ({
          id: msg.id || '',
          sender: msg.sender || '',
          text: msg.text || '',
          createdAt: msg.createdAt || 0,
        }));

        result.push({
          id: convo.id as string,
          title: convo.title as string,
          provider: convo.provider as string,
          model: convo.model as string,
          createdAt: convo.createdAt as number,
          messages: cleanMessages,
        });
      } catch (err) {
        logError('storage', 'workspace:loadMessages', err as Error);
      }
    }
    return result;
  } catch (err) {
    logError('storage', 'workspace:gatherConversations', err as Error);
    return [];
  }
}

export function gatherWorkspaceSnapshot(): Omit<WorkspaceSnapshot, 'conversations'> {
  const settings = getAppSettings();
  const theme = storage.mirror.get('theme') || (settings && settings.defaultTheme) || 'light';

  // Legacy fields for backwards compatibility
  const chat = document.getElementById('chat-window');
  const notes = document.getElementById('notes-editor');
  const notesHistory = storage.mirror.getJSON('prvcticeNotesHistory', []) as unknown[];

  return {
    version: 2,
    saved: Date.now(),
    theme,
    // New structured data
    notes: gatherNotesData(),
    preferences: gatherPreferences(),
    // Legacy fields (kept for backwards compatibility)
    chatHTML: chat ? chat.innerHTML : '',
    notesHTML: notes ? notes.innerHTML : '',
    notesHistory,
  };
}

/**
 * Async version that includes conversations
 */
export async function gatherWorkspaceSnapshotAsync(): Promise<WorkspaceSnapshot> {
  const snapshot = gatherWorkspaceSnapshot() as WorkspaceSnapshot;
  snapshot.conversations = await gatherConversations();
  return snapshot;
}

/**
 * Restore notes from workspace payload
 */
function restoreNotes(notesData: NotesData | undefined): void {
  if (!notesData || typeof notesData !== 'object') return;

  const { tabsMeta, activeTabId, tabContents, paneSize } = notesData;

  // Restore tabs metadata
  if (Array.isArray(tabsMeta) && tabsMeta.length) {
    storage.mirror.setJSON('notesTabsMeta', tabsMeta);
  }

  // Restore active tab
  if (activeTabId) {
    storage.mirror.set('notesActiveTabId', activeTabId);
  }

  // Restore tab contents
  if (tabContents && typeof tabContents === 'object') {
    for (const [tabId, html] of Object.entries(tabContents)) {
      if (typeof html === 'string') {
        storage.mirror.set(`tab:${tabId}:html`, html);
      }
    }
  }

  // Restore pane size
  if (paneSize) {
    storage.mirror.setJSON('notesPaneSize', paneSize);
  }
}

/**
 * Restore user preferences from workspace payload
 */
function restorePreferences(prefs: Preferences | undefined): void {
  if (!prefs || typeof prefs !== 'object') return;

  const stringKeys: (keyof Preferences)[] = [
    'llmProvider',
    'chatReasoningEffort',
    'model:openai',
    'model:anthropic',
    'model:gemini',
    'model:openrouter',
    'model:lmstudio',
    'showRulerPreference',
    'lmstudio:baseUrl',
  ];

  for (const key of stringKeys) {
    const value = prefs[key];
    if (typeof value === 'string' && value) {
      storage.mirror.set(key, value);
    }
  }

  // Weather prefs is JSON
  if (prefs.weatherWidgetPrefs) {
    storage.mirror.setJSON('weatherWidgetPrefs', prefs.weatherWidgetPrefs);
  }
}

/**
 * Restore conversations from workspace payload
 */
async function restoreConversations(
  conversations: ConversationExport[] | undefined
): Promise<void> {
  if (!Array.isArray(conversations) || !conversations.length) return;

  for (const convo of conversations) {
    if (!convo || !convo.id) continue;
    try {
      // Check if conversation already exists
      const existing = await storage.conversations.get(convo.id);
      if (existing) continue; // Don't overwrite existing conversations

      // Save conversation
      await storage.conversations.put({
        id: convo.id,
        title: convo.title || 'Imported',
        provider: convo.provider,
        model: convo.model,
        createdAt: convo.createdAt || Date.now(),
      });

      // Save messages
      if (Array.isArray(convo.messages)) {
        for (const msg of convo.messages) {
          if (!msg || !msg.id) continue;
          await storage.messages.put({
            id: msg.id,
            conversationId: convo.id,
            sender: msg.sender || 'user',
            text: msg.text || '',
            createdAt: msg.createdAt || Date.now(),
          });
        }
      }
    } catch (err) {
      logError('storage', 'workspace:restoreConversation', err as Error);
    }
  }
}

export async function restoreWorkspace(payload: WorkspacePayload): Promise<void> {
  if (!payload || typeof payload !== 'object') return;

  const { chatHTML, notesHTML, theme, notesHistory, notes, preferences, conversations } = payload;

  // Version 2+ format: restore structured data
  if (payload.version && payload.version >= 2) {
    // Restore notes tabs
    restoreNotes(notes);

    // Restore preferences
    restorePreferences(preferences);

    // Restore conversations (async)
    if (conversations) {
      await restoreConversations(conversations);
    }
  }

  // Legacy format support (version 1 or missing version)
  if (!payload.version || payload.version < 2) {
    // Legacy chat HTML - sanitize to prevent XSS
    const chat = document.getElementById('chat-window');
    if (chat && typeof chatHTML === 'string') {
      chat.innerHTML = DOMPurify.sanitize(chatHTML);
    }

    // Legacy notes HTML - set to default tab, sanitize to prevent XSS
    const notesEl = document.getElementById('notes-editor');
    if (notesEl && typeof notesHTML === 'string') {
      notesEl.innerHTML = DOMPurify.sanitize(notesHTML);
      try {
        notesEl.dispatchEvent(new Event('input'));
      } catch (_) {}
      // Also save to tab storage for persistence
      storage.mirror.set('tab:t_default:html', notesHTML);
    }

    // Legacy notes history
    if (Array.isArray(notesHistory)) {
      storage.mirror.setJSON('prvcticeNotesHistory', notesHistory);
    }
  }

  // Theme applies to all versions
  if (typeof theme === 'string') {
    if (typeof window.setTheme === 'function') {
      window.setTheme(theme);
    } else {
      storage.mirror.set('theme', theme);
    }
  }

  if (typeof window.lowerBarToBottom === 'function') {
    window.lowerBarToBottom();
  }
  if (typeof window.stopDotMatrix === 'function') {
    window.stopDotMatrix();
  }

  try {
    window.dispatchEvent(new Event('firstPromptSent'));
  } catch (_) {}

  // Dispatch event for components to refresh
  try {
    useEventBus().emit('workspace:restored');
  } catch (_) {}
}

export async function saveWorkspaceToFile(): Promise<void> {
  const data = await gatherWorkspaceSnapshotAsync();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  triggerDownload(blob, `prvctice-workspace-${ts}.json`);
}

export function promptWorkspaceImport(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', () => {
    const [file] = input.files || [];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const raw = JSON.parse(e.target?.result as string);
        const parsed = WorkspacePayloadSchema.safeParse(raw);
        if (!parsed.success) {
          const errorDetails = parsed.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join(', ');
          logError('storage', 'workspace:validationFailed', errorDetails);
          alert('Invalid workspace file format. Please check the file structure.');
          return;
        }
        await restoreWorkspace(parsed.data as WorkspacePayload);
      } catch (err) {
        logError('storage', 'workspace:invalidFile', err as Error);
        alert('Invalid workspace file');
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

export async function handleElectronWorkspaceLoad(payload: WorkspacePayload | null): Promise<void> {
  if (payload && typeof payload === 'object') {
    const parsed = WorkspacePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      logError(
        'storage',
        'workspace:electronValidationFailed',
        JSON.stringify(parsed.error.issues)
      );
      alert('Invalid workspace file format.');
      return;
    }
    await restoreWorkspace(parsed.data as WorkspacePayload);
  } else {
    promptWorkspaceImport();
  }
}

if (typeof window !== 'undefined') {
  window.restoreWorkspace = restoreWorkspace;
  window.saveWorkflow = async () => {
    try {
      await saveWorkspaceToFile();
    } catch (err) {
      logError('storage', 'workspace:saveFailed', err as Error);
    }
  };
  window.loadWorkflow = () => {
    try {
      promptWorkspaceImport();
    } catch (err) {
      logError('storage', 'workspace:loadFailed', err as Error);
    }
  };
}

export default {
  gatherWorkspaceSnapshot,
  gatherWorkspaceSnapshotAsync,
  restoreWorkspace,
  saveWorkspaceToFile,
  promptWorkspaceImport,
  handleElectronWorkspaceLoad,
};
