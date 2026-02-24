import { ref, type Ref } from 'vue';

interface UseYouTubePlayerReturn {
  visible: Ref<boolean>;
  minimized: Ref<boolean>;
  videoId: Ref<string | null>;
  dragging: Ref<boolean>;
  top: Ref<number | null>;
  left: Ref<number | null>;
  open: (id: string) => void;
  minimize: () => void;
  expand: () => void;
  close: () => void;
}

// Singleton reactive state for the YouTube modal/mini player
let singleton: UseYouTubePlayerReturn | undefined;

export function useYouTubePlayer(): UseYouTubePlayerReturn {
  if (singleton) return singleton;

  const visible = ref(false);
  const minimized = ref(false);
  const videoId = ref<string | null>(null);
  const dragging = ref(false);
  const top = ref<number | null>(null); // px when minimized
  const left = ref<number | null>(null); // px when minimized

  function open(id: string): void {
    if (!id) return;
    videoId.value = id;
    visible.value = true;
    minimized.value = false;
    dragging.value = false;
    top.value = null;
    left.value = null;
  }

  function minimize(): void {
    if (!visible.value) return;
    minimized.value = true;
    // Position in top-right by default
    const header = document.querySelector('header');
    const headerBottom = header ? header.getBoundingClientRect().bottom + 10 : 60;
    top.value = headerBottom;
    // left is null; component will right-anchor via CSS unless left is set by drag
  }

  function expand(): void {
    if (!visible.value) return;
    minimized.value = false;
    dragging.value = false;
    top.value = null;
    left.value = null;
  }

  function close(): void {
    visible.value = false;
    minimized.value = false;
    videoId.value = null;
    dragging.value = false;
    top.value = null;
    left.value = null;
  }

  singleton = { visible, minimized, videoId, dragging, top, left, open, minimize, expand, close };
  return singleton;
}

export function parseYouTubeId(href: string): string | null {
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      // watch?v=ID
      if (url.pathname === '/watch') {
        const v = url.searchParams.get('v');
        if (v) return v;
      }
      // youtu.be style sometimes proxied as /shorts/ID or /embed/ID
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'embed' && parts[1]) return parts[1];
      if (parts[0] === 'shorts' && parts[1]) return parts[1];
    }
    if (host === 'youtu.be') {
      const id = url.pathname.replace(/\//g, '').trim();
      if (id) return id;
    }
  } catch (_) {}
  return null;
}
