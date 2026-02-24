// Types
interface TipAction {
  id: string;
  label: string;
  kind: 'toggle' | 'cta' | 'link';
  target: string;
}

interface HelpTip {
  id: string;
  icon: string;
  title: string;
  summary: string;
  details: string[];
  badges: string[];
  actions?: TipAction[];
}

interface HelpSection {
  id: string;
  label: string;
  description: string;
  tips: HelpTip[];
}

interface HelpTipWithSection extends HelpTip {
  sectionId: string;
}

export const helpSections: HelpSection[] = [
  {
    id: 'gestures',
    label: 'Gestures & Layout',
    description: 'Move the workspace to wherever you are working.',
    tips: [
      {
        id: 'double-tap-move-bar',
        icon: 'ph:hand-tap-light',
        title: 'Double tap anywhere',
        summary: 'Double tap to have the input bar come to you.',
        details: [
          'Keeps the bar below the header so it never covers navigation controls.',
          'Works whether you are using the mouse, trackpad, or touch.',
          'Perfect for couch mode: tap where you are reading and keep typing without stretching.',
        ],
        badges: ['gesture'],
      },
      {
        id: 'double-tap-theme-cycle',
        icon: 'solar:magic-stick-linear',
        title: 'Double tap the input bar',
        summary: 'Double tap directly on the bar to cycle through your themes.',
        details: [
          'Runs through the custom theme order you defined in Settings.',
          'Long-press the bar and drag if you want to pin it somewhere else after the switch.',
        ],
        badges: ['gesture', 'theme'],
      },
      {
        id: 'skill-drag-mag',
        icon: 'ph:magnet-light',
        title: 'Dock your favorites',
        summary: 'Save skills, media, and widgets to the input bar for easy access.',
        details: [
          'Every pill becomes draggable once you grab it. Drop it anywhere on screen while you work.',
          'They magnet to the input bar edges for a tidy HUD.',
          'Drag a floating pill back to the tray to return it to the carousel.',
        ],
        badges: ['skills'],
      },
      {
        id: 'weather-widget',
        icon: 'ph:sun-horizon-light',
        title: 'Ambient weather & time',
        summary:
          'Toggle the clock icon to open the weather widget. Drag it anywhere—it remembers its position between sessions.',
        details: [
          'Great for planning shoots or checking golden hour without leaving the flow.',
          'Customize the display to show just what you need.',
        ],
        actions: [
          {
            id: 'toggle-weather',
            label: 'Toggle weather widget',
            kind: 'toggle',
            target: 'weather',
          },
        ],
        badges: ['widget'],
      },
      {
        id: 'grid-overlay',
        icon: 'ph:grid-four-light',
        title: 'Toggle the grid',
        summary: 'Turn on the design grid from the menu for visual alignment.',
        details: [
          'Useful when planning layouts or checking spacing.',
          'Say "toggle grid" or use the side menu.',
        ],
        badges: ['design'],
      },
      {
        id: 'keyboard-shortcuts',
        icon: 'ph:keyboard-light',
        title: 'Keyboard shortcuts',
        summary: 'Power users can navigate faster with hotkeys.',
        details: ['⌘⇧H: Toggle this help pane', '⌘K: Focus the input bar', '⌘Enter: Send message'],
        badges: ['keyboard'],
      },
      {
        id: 'gamepad-support',
        icon: 'ph:game-controller-light',
        title: 'Controller support',
        summary: 'Plug in a PS5 DualSense or Xbox controller to navigate the entire workspace.',
        details: [
          'Right stick moves a virtual cursor. Square/X clicks at the cursor position.',
          'D-pad left/right cycles themes. D-pad up starts a new conversation.',
          'L1 toggles notes, R1 toggles the mic, Triangle opens the side menu.',
          'Enable in Settings under Accessibility.',
        ],
        badges: ['gamepad', 'accessibility'],
      },
      {
        id: 'edit-skills',
        icon: 'ph:pencil-simple-line-duotone',
        title: 'Build your own skills',
        summary:
          'The pencil button on the dock opens a mini editor for custom prompts and actions.',
        details: [
          'Add prompts you reuse ("Moodboard for this brief") or actions ("toggle grid").',
          'Everything you create is draggable and magnet-ready just like the built-ins.',
        ],
        actions: [
          {
            id: 'open-skill-editor',
            label: 'Open skill editor',
            kind: 'cta',
            target: 'skills-editor',
          },
        ],
        badges: ['skills'],
      },
    ],
  },
  {
    id: 'apps',
    label: 'Apps & Files',
    description: 'Launch tools, manage documents, and extend the workspace.',
    tips: [
      {
        id: 'app-gallery',
        icon: 'ph:squares-four-light',
        title: 'App gallery',
        summary: 'Open the app gallery from the side menu to browse built-in tools and utilities.',
        details: [
          'Built-in apps include a drum machine, piano synth, sampler, calculator, focus timer, translator, and more.',
          'Apps run in floating windows you can drag, resize, and minimize.',
          'Each app has its own persistent storage that survives between sessions.',
        ],
        badges: ['apps'],
      },
      {
        id: 'create-apps',
        icon: 'ph:magic-wand-light',
        title: 'Create your own apps',
        summary: 'Describe what you want and Prvctice generates a working app for you.',
        details: [
          'Type a description like "a pomodoro timer" or "a habit tracker" in the app gallery.',
          'Generated apps support the full SDK: storage, audio, AI completion, data connectors, and more.',
          'Edit generated apps with the pencil icon, or download the HTML to keep.',
        ],
        badges: ['apps'],
      },
      {
        id: 'files-browser',
        icon: 'ph:folder-open-light',
        title: 'Files browser',
        summary: 'All your uploads, notes, and documents live in one place.',
        details: [
          'Open Files from the app gallery or side menu. Files are sorted into Notes, Images, and Audio folders.',
          'Switch between grid and list views. Sort by name, date, or size.',
          'PDFs open in the built-in viewer. Images open in a preview. Markdown files link back to their source note.',
        ],
        badges: ['files'],
      },
      {
        id: 'notes-auto-save',
        icon: 'ph:floppy-disk-light',
        title: 'Notes auto-save to Files',
        summary:
          'Every note you write is automatically saved as a markdown file in the Files panel.',
        details: [
          'Saves happen in the background with a short delay so typing is never interrupted.',
          'Renaming a note tab updates the filename in Files too.',
          'Closing a tab keeps the file in Files so your work is never lost.',
        ],
        badges: ['notes', 'files'],
      },
      {
        id: 'pdf-viewer',
        icon: 'ph:file-pdf-light',
        title: 'PDF viewer',
        summary: 'Open any PDF in a dedicated viewer with page navigation and annotations.',
        details: [
          'Click a PDF in the Files browser or drop one into chat to open it.',
          'Navigate pages, highlight text, and reference sections in your conversation.',
        ],
        badges: ['files', 'apps'],
      },
    ],
  },
  {
    id: 'flow',
    label: 'Research Flow',
    description: 'Blend research, writing, and inspiration in one timeline.',
    tips: [
      {
        id: 'voice-commands',
        icon: 'ph:microphone-stage-light',
        title: 'Talk to the workspace',
        summary: 'Tap the mic to control Prvctice without touching the keyboard.',
        details: [
          'Use phrases like "open notes", "toggle grid", or "where\'s Lulu?" for instant actions.',
          'Say "help" or "show tips" to open this pane when your hands are full.',
          'The voice commands sheet lives in the dock and updates with every release.',
        ],
        actions: [
          {
            id: 'voice-sheet',
            label: 'Open voice command sheet',
            kind: 'link',
            target: 'voice-commands',
          },
        ],
        badges: ['voice'],
      },
      {
        id: 'notes-send-to-chat',
        icon: 'ph:circles-three-plus-light',
        title: 'Send notes to chat',
        summary:
          'Select text inside Notes and hit "Send to Chat" to ask follow-ups on what you just wrote.',
        details: [
          'Prvctice keeps formatting and Markdown intact so citations and bullets stay clean.',
          'Window stays split so you can compare answers with your original draft.',
        ],
        badges: ['notes', 'chat'],
      },
      {
        id: 'image-attachments',
        icon: 'ph:image-light',
        title: 'Attach images',
        summary: 'Drop or paste images into the input bar to ask about them.',
        details: [
          'Works with screenshots, photos, and diagrams.',
          'AI can describe, analyze, or extract text from images.',
        ],
        badges: ['vision'],
      },
    ],
  },
];

export const helpTipMap = helpSections.reduce((acc, section) => {
  section.tips.forEach((tip) => {
    acc.set(tip.id, { ...tip, sectionId: section.id });
  });
  return acc;
}, new Map<string, HelpTipWithSection>());

export function getHelpTipById(id: string): HelpTipWithSection | null {
  return helpTipMap.get(id) || null;
}
