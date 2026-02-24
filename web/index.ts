// Public surface for reusable pieces
export { createPrvcticePlugin } from './plugin/index.js';
export {
  PRVCTICE_CONFIG,
  PRVCTICE_MARKDOWN_RENDERER,
  PRVCTICE_SANITIZE_HTML,
  PRVCTICE_SOCKET_FACTORY,
  PRVCTICE_FETCH_IMPL,
} from './plugin/keys.js';
export { magnet as vMagnet } from './directives/magnet.js';

// Composables
export { useTheme } from './composables/useTheme.js';
export { useNotifs } from './composables/useNotifs.js';
export { useYouTubePlayer, parseYouTubeId } from './composables/useYouTubePlayer.js';

// Components
export { default as NotifsOverlay } from './components/NotifsOverlay.vue';
export { default as YouTubePlayer } from './components/YouTubePlayer.vue';
