<template>
  <!-- Static injection of the legacy side-menu markup so existing CSS/JS work -->
  <nav
    id="side-menu"
    class="side-menu"
    aria-label="Main navigation"
    aria-hidden="true"
    data-no-orbit
  >
    <header class="side-menu-header">
      <h2 class="brand-prvctice">PRVCTICE</h2>
      <button class="header-search-btn" data-action="search" aria-label="Search">
        <iconify-icon icon="ph:magnifying-glass"></iconify-icon>
      </button>
    </header>

    <ul class="side-menu-list" role="list">
      <li>
        <button data-action="gallery">
          <iconify-icon icon="ph:storefront"></iconify-icon><span>Apps</span>
        </button>
      </li>

      <li>
        <button data-action="file-library">
          <iconify-icon icon="ph:folder-open"></iconify-icon><span>Files</span>
        </button>
      </li>

      <li>
        <button data-action="skills">
          <iconify-icon icon="ph:lightning"></iconify-icon><span>Skills</span>
        </button>
      </li>

      <li>
        <button data-action="games">
          <iconify-icon icon="ph:game-controller"></iconify-icon><span>Games</span>
        </button>
      </li>

      <li>
        <button data-action="settings">
          <iconify-icon icon="ph:gear-six"></iconify-icon><span>Settings</span>
        </button>
      </li>

      <li>
        <button data-action="about">
          <iconify-icon icon="ph:info"></iconify-icon><span>About</span>
        </button>
      </li>

      <li>
        <button id="menu-grid-toggle-button" data-action="toggle-grid">
          <iconify-icon icon="ph:grid-four"></iconify-icon><span>Toggle Grid</span>
        </button>
      </li>
    </ul>

    <footer class="side-menu-footer">
      <span
        class="brand-short"
        :class="{ expanded: brandExpanded }"
        @mouseenter="brandExpanded = true"
        @mouseleave="brandExpanded = false"
      >
        <span class="brand-p">P</span><span class="brand-expand brand-rvctice">RVCTICE_</span
        ><span class="brand-t">t</span><span class="brand-expand brand-ype">ype </span
        ><span class="brand-a">a</span><span class="brand-version">_v{{ appVersion }}</span>
      </span>
      <button id="close-side-menu" aria-label="Close menu">
        <iconify-icon icon="ph:x"></iconify-icon>
      </button>
    </footer>
  </nav>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useSideMenu } from '@web/composables/useSideMenu.js';

declare const __APP_VERSION__: string;
const appVersion = __APP_VERSION__;
const brandExpanded = ref(false);

const { init } = useSideMenu();
onMounted((): void => {
  init();
});
</script>
