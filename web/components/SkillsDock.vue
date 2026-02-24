<template>
  <div style="display: contents"></div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { animate } from '@motionone/dom';
import { makeMagnetic } from '@web/utils/magnet.js';
import { useChatStore } from '@web/stores/chat.js';
import { useSkillPreferences } from '@web/composables/useSkillPreferences';
import { useSkillCoordinator } from '@web/composables/useSkillCoordinator';
import { useSkillPhysics } from '@web/composables/useSkillPhysics';
import { useEventBus } from '@web/services/eventBus';
import { overlayOn } from '@web/utils/customOverlay.js';
import { storage } from '@web/storage/storage.js';
import {
  prefersReducedMotion,
  motionDurations,
  motionEasings,
} from '@web/composables/useMotion.js';
import { useMenuActionStore } from '@web/stores/menuAction.js';
import { debugLog, logError } from '@web/utils/debugLog.js';

// Extracted composables
import { getDotColor, blendColors, DOT_COLORS } from '@web/composables/usePillColors';
import {
  animatePillEnter,
  animatePillDrop,
  animatePillRemove,
  animateCombinedPillEnter,
  animateDragStart,
  animateDragEnd,
  animateCombinePreviewGlow,
} from '@web/composables/useSkillAnimations';
import { calculateVelocityDeformation, clearDeformation } from '@web/utils/liquidDeformation';
import {
  ensureDropTargetTooltip,
  isWithinDropTarget,
  updateDropTargetHighlight,
  clearDropTargetHighlight,
  cleanupDropTarget,
} from '@web/composables/useDropTarget';

const chatStore = useChatStore();
const menuStore = useMenuActionStore();
const prefs = useSkillPreferences();
const coordinator = useSkillCoordinator();
const physics = useSkillPhysics();

// Overflow state (imperative, not reactive -- dock is imperative DOM)
let overflowExpanded = false;
let clickOutsideHandler = null;

// Track floating pills to prevent re-rendering them
const floatingPills = new Set();

async function sendPromptText(rawPrompt) {
  const prompt = typeof rawPrompt === 'string' ? rawPrompt.trim() : '';
  if (!prompt) return;
  window.dispatchEvent(new Event('firstPromptSent'));
  try {
    overlayOn('chat');
  } catch (_) {}
  try {
    await chatStore.send(prompt);
  } catch (_) {}
}

/**
 * Handle action execution - delegates to coordinator when possible,
 * falls back to legacy handling for backwards compatibility
 */
function handleAction(action) {
  if (typeof action === 'string' && action.startsWith('help-tip:')) {
    const tipId = action.slice('help-tip:'.length);
    if (typeof window.showHelpTip === 'function') window.showHelpTip(tipId);
    else if (typeof window.openHelpPane === 'function') window.openHelpPane();
    safeCall(window.stopDotMatrix);
    window.dispatchEvent(new Event('firstPromptSent'));
    return;
  }

  // Handle combined/chain skills via coordinator
  if (typeof action === 'string' && action.startsWith('chain:')) {
    const chainId = action.slice('chain:'.length);
    // Ensure coordinator storage is loaded before looking up chain
    coordinator.loadFromStorage().then(() => {
      const chainSkill = coordinator.getSkill(chainId);
      if (chainSkill && chainSkill.chainConfig?.steps) {
        debugLog('skills', 'chain:execute', { chainId, steps: chainSkill.chainConfig.steps });
        // Execute each step in the chain sequentially
        executeChainSteps(chainSkill.chainConfig.steps).catch((err) => {
          logError('skills', 'chain:executeFailed', err);
        });
      } else {
        debugLog('skills', 'chain:notFound', {
          chainId,
          available: Array.from(coordinator.skills.value.keys()),
        });
      }
    });
    return;
  }

  // Check if the action is registered in the coordinator
  const registeredAction = coordinator.getAction(action);
  if (registeredAction) {
    // Execute via coordinator - it handles action dispatch
    coordinator.execute(action).catch((err) => {
      logError('skills', 'action:executeFailed', err);
    });
    return;
  }

  // Legacy fallback for actions not yet migrated to coordinator
  switch (action) {
    case 'open-notes':
      document.getElementById('notes-toggle-button')?.click();
      safeCall(window.stopDotMatrix);
      window.dispatchEvent(new Event('firstPromptSent'));
      break;
    case 'toggle-help':
      if (typeof window.toggleHelpPane === 'function') window.toggleHelpPane();
      else document.getElementById('help-toggle-button')?.click();
      safeCall(window.stopDotMatrix);
      window.dispatchEvent(new Event('firstPromptSent'));
      break;
    case 'voice-commands':
      safeCall(window.stopDotMatrix);
      window.dispatchEvent(new Event('firstPromptSent'));
      if (typeof window.openVoiceCommandsPane === 'function') {
        window.openVoiceCommandsPane();
      } else {
        alert('Voice commands panel not available.');
      }
      break;
    case 'change-theme':
      if (typeof window.openThemeModal === 'function') window.openThemeModal();
      else if (typeof window.setTheme === 'function') {
        const aliasMap = {
          dark: 'night',
          cool: 'vera-baxter',
          minimal: 'vitti',
          focus: 'vitti',
          paper: 'share-bear',
          sunset: 'eva',
          dusk: 'fragile',
          monday: 'custom',
        };
        const stored = storage.mirror.get('theme') || 'light';
        const current = aliasMap[stored] || stored;
        const order = (window.AppSettings && window.AppSettings.themeOrder) || [
          'light',
          'night',
          'vera-baxter',
          'vitti',
        ];
        const idx = order.indexOf(current);
        window.setTheme(order[(idx + 1) % order.length]);
      }
      break;
    case 'set-theme-custom':
      if (typeof window.setTheme === 'function') window.setTheme('custom');
      break;
    case 'toggle-grid': {
      const gridOverlay = document.getElementById('grid-overlay');
      if (!gridOverlay) break;
      const hidden = gridOverlay.classList.toggle('hidden');
      const bar = document.getElementById('bar');
      let showRulerPref = storage.mirror.get('showRulerPreference');
      if (showRulerPref === null) showRulerPref = 'true';
      const allowRuler = showRulerPref === 'true';
      if (bar) bar.classList.toggle('show-ruler', !hidden && allowRuler);
      const btn = document.getElementById('menu-grid-toggle-button');
      if (btn) btn.classList.toggle('active', !hidden);
      if (window.electronGrid && typeof window.electronGrid.setGridState === 'function') {
        window.electronGrid.setGridState(!hidden);
      }
      break;
    }
    default:
      break;
  }
}

function safeCall(fn) {
  if (typeof fn === 'function')
    try {
      fn();
    } catch (_) {}
}

/**
 * Attach drag handlers to a pill element
 * Integrates with physics system for zone detection and combination preview
 */
function attachDrag(pill) {
  if (!pill || pill._dragInit) return;
  pill._dragInit = true;
  let startX = 0,
    startY = 0,
    moved = false;
  let offsetX = 0,
    offsetY = 0;
  const threshold = 3;

  // Velocity tracking for liquid deformation
  let prevX = 0,
    prevY = 0,
    prevTime = 0;
  let velocityX = 0,
    velocityY = 0;
  const velocitySmoothing = 0.4; // Smooth response

  const onDown = (ev) => {
    ev.preventDefault();
    moved = false;
    pill._dragging = false;
    startX = ev.touches ? ev.touches[0].clientX : ev.clientX;
    startY = ev.touches ? ev.touches[0].clientY : ev.clientY;
    prevX = startX;
    prevY = startY;
    prevTime = performance.now();
    velocityX = 0;
    velocityY = 0;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp, { passive: true });
  };

  const onMove = (ev) => {
    const x = ev.touches ? ev.touches[0].clientX : ev.clientX;
    const y = ev.touches ? ev.touches[0].clientY : ev.clientY;
    const now = performance.now();

    if (!moved && Math.hypot(x - startX, y - startY) > threshold) {
      moved = true;
      const rect = pill.getBoundingClientRect();
      offsetX = startX - rect.left;
      offsetY = startY - rect.top;
      promoteToFloating(pill, rect);
      pill._dragging = true;
      animateDragStart(pill); // Lift animation
      updateDropTargetHighlight(rect);
    }

    if (moved && pill._floating) {
      const newLeft = x - offsetX;
      const newTop = y - offsetY;
      pill.style.left = Math.max(0, Math.min(window.innerWidth - pill.offsetWidth, newLeft)) + 'px';
      pill.style.top = Math.max(0, Math.min(window.innerHeight - pill.offsetHeight, newTop)) + 'px';

      // Calculate velocity for liquid deformation
      const dt = now - prevTime;
      if (dt > 0 && !prefersReducedMotion()) {
        const rawVx = ((x - prevX) / dt) * 16.67; // Normalize to ~60fps
        const rawVy = ((y - prevY) / dt) * 16.67;
        velocityX += (rawVx - velocityX) * velocitySmoothing;
        velocityY += (rawVy - velocityY) * velocitySmoothing;

        // Apply velocity-based squash/stretch
        const deform = calculateVelocityDeformation({ x: velocityX, y: velocityY });
        if (deform.scaleX !== 1 || deform.scaleY !== 1) {
          const angle = Math.atan2(velocityY, velocityX);
          const rotDeg = (angle * 180) / Math.PI;
          pill.style.transform = `rotate(${rotDeg}deg) scale(${deform.scaleX.toFixed(3)}, ${deform.scaleY.toFixed(3)}) rotate(${-rotDeg}deg)`;
          pill.style.transformOrigin = `${50 - deform.originOffset * 50 * Math.cos(angle)}% ${50 - deform.originOffset * 50 * Math.sin(angle)}%`;
        } else {
          pill.style.transform = '';
          pill.style.transformOrigin = '';
        }
      }
      prevX = x;
      prevY = y;
      prevTime = now;

      const pillRect = pill.getBoundingClientRect();
      updateDropTargetHighlight(pillRect);

      // Update physics for zone and combination detection
      const skillId = pill.dataset.skillId;
      if (skillId) {
        const pillCenter = {
          x: pillRect.left + pillRect.width / 2,
          y: pillRect.top + pillRect.height / 2,
        };
        physics.updateCombinationPreview(skillId, pillCenter, {
          x: pillRect.left,
          y: pillRect.top,
          width: pillRect.width,
          height: pillRect.height,
        });

        // Update combine preview glow based on proximity
        const preview = physics.getCombinationPreview();
        if (preview.proximity) {
          const glowIntensity = preview.proximity.isReady
            ? 1
            : preview.proximity.isDetected
              ? 0.5
              : 0;
          animateCombinePreviewGlow(pill, glowIntensity);

          // Also glow the target pill
          if (preview.targetPill?.id) {
            const targetPillEl = document.querySelector(
              `[data-skill-id="${preview.targetPill.id}"]`
            );
            if (targetPillEl) {
              animateCombinePreviewGlow(targetPillEl, glowIntensity);
            }
          }
        } else {
          animateCombinePreviewGlow(pill, 0);
        }
      }
    }
  };

  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);

    // Clear velocity deformation
    clearDeformation(pill);

    // Clear physics combination preview and glow
    physics.clearCombinationPreview();
    animateCombinePreviewGlow(pill, 0);

    // Clear glow on any target pill
    const preview = physics.getCombinationPreview();
    if (preview.targetPill?.id) {
      const targetPillEl = document.querySelector(`[data-skill-id="${preview.targetPill.id}"]`);
      if (targetPillEl) {
        animateCombinePreviewGlow(targetPillEl, 0);
      }
    }

    try {
      const host =
        document.getElementById('skill-carousel') || document.getElementById('prompt-carousel');
      if (host && pill._floating) {
        const tray = host.getBoundingClientRect();
        const r = pill.getBoundingClientRect();
        let handled = false;

        if (isWithinDropTarget(r)) {
          const fallbackX = tray.left + tray.width / 2;
          handled = demoteToTray(pill, fallbackX);
        }

        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const withinX = cx >= tray.left - 20 && cx <= tray.right + 20;
        const withinY = cy >= tray.top - 50 && cy <= tray.bottom + 50;

        if (!handled && withinX && withinY) {
          demoteToTray(pill, cx);
        }
      }

      // Settle animation for floating pills not attached to bar
      if (pill._floating && !pill.classList.contains('magnet-attached')) {
        animateDragEnd(pill);
      }
    } catch (_) {}

    clearDropTargetHighlight();
    setTimeout(() => {
      pill._dragging = false;
    }, 0);
  };

  pill.addEventListener('mousedown', onDown);
  pill.addEventListener('touchstart', onDown, { passive: true });
}

function promoteToFloating(el, rect) {
  if (el._floating) return;
  floatingPills.add(el.dataset.skillId);
  document.body.appendChild(el);
  Object.assign(el.style, {
    position: 'fixed',
    top: (rect ? rect.top : el.offsetTop) + 'px',
    left: (rect ? rect.left : el.offsetLeft) + 'px',
    // Don't set fixed width - let pills expand to show full text
    zIndex: 2000,
    margin: '0',
    pointerEvents: 'auto',
    cursor: 'move',
    display: 'inline-block',
    boxSizing: 'border-box',
  });
  el.classList.add('skill-floating', 'magnetic');
  try {
    const threshold = (window.AppSettings && window.AppSettings.magnetThreshold) || 40;
    el._magnet = makeMagnetic(el, { target: '#bar', threshold, detachOnDown: true, edge: 'both' });
  } catch (_) {}
  // Watch for magnet-attached class changes to update cleanup button
  try {
    el._classObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'class') {
          updateReturnAllButton();
        }
      }
    });
    el._classObserver.observe(el, { attributes: true, attributeFilter: ['class'] });
  } catch (_) {}
  ensureDropTargetTooltip();
  el._floating = true;
  updateReturnAllButton();
}

function demoteToTray(el, xCenter) {
  const host =
    document.getElementById('skill-carousel') || document.getElementById('prompt-carousel');
  if (!host) return false;
  floatingPills.delete(el.dataset.skillId);
  const peers = Array.from(host.querySelectorAll('.skill-pill')).filter((p) => p !== el);
  let insertBefore = null;
  for (const p of peers) {
    const pr = p.getBoundingClientRect();
    const pc = pr.left + pr.width / 2;
    if (xCenter < pc) {
      insertBefore = p;
      break;
    }
  }
  try {
    if (el._magnet && typeof el._magnet.destroy === 'function') {
      el._magnet.destroy();
      el._magnet = null;
    }
  } catch (_) {}
  try {
    if (el._classObserver) {
      el._classObserver.disconnect();
      el._classObserver = null;
    }
  } catch (_) {}
  el.classList.remove(
    'skill-floating',
    'magnetic',
    'magnet-attached',
    'magnet-edge-top',
    'magnet-edge-bottom'
  );
  el.style.position = '';
  el.style.top = '';
  el.style.left = '';
  el.style.width = '';
  el.style.height = '';
  el.style.zIndex = '';
  el.style.margin = '';
  el.style.pointerEvents = '';
  el.style.cursor = '';
  el.style.display = '';
  el.style.boxSizing = '';
  if (insertBefore) host.insertBefore(el, insertBefore);
  else host.appendChild(el);
  el._floating = false;
  clearDropTargetHighlight();
  animatePillDrop(el);
  updateReturnAllButton();
  return true;
}

/**
 * Get all floating pills that are NOT magnet-attached to the bar
 * These are candidates for the "Return All" action
 */
function getReturnableFloatingPills() {
  const returnablePills = [];
  floatingPills.forEach((skillId) => {
    const pill = document.querySelector(`[data-skill-id="${skillId}"]`);
    if (pill && pill._floating && !pill.classList.contains('magnet-attached')) {
      returnablePills.push(pill);
    }
  });
  return returnablePills;
}

/**
 * Return all non-attached floating pills back to the tray with staggered animation
 */
function returnAllFloatingPills() {
  const pills = getReturnableFloatingPills();
  if (pills.length === 0) return;

  const host =
    document.getElementById('skill-carousel') || document.getElementById('prompt-carousel');
  if (!host) return;

  const hostRect = host.getBoundingClientRect();
  const centerX = hostRect.left + hostRect.width / 2;

  // Sort pills by their x position for consistent ordering
  pills.sort((a, b) => {
    const aRect = a.getBoundingClientRect();
    const bRect = b.getBoundingClientRect();
    return aRect.left - bRect.left;
  });

  // Return each pill with staggered timing
  const durations = motionDurations();
  const staggerDelay = Math.min(durations.short * 0.5, 0.08);

  pills.forEach((pill, index) => {
    setTimeout(
      () => {
        demoteToTray(pill, centerX);
      },
      index * staggerDelay * 1000
    );
  });

  // Hide the button immediately
  hideReturnAllButton();
}

// Track return all button state
const returnAllButtonState = {
  button: null,
  visible: false,
};

/**
 * Create or get the "Return All Floating" button
 */
function ensureReturnAllButton() {
  if (returnAllButtonState.button) return returnAllButtonState.button;

  const btn = document.createElement('button');
  btn.id = 'return-all-floating-button';
  btn.className = 'skill-return-all-btn';
  btn.textContent = 'Clean up';
  btn.title = 'Return all floating pills to tray';
  btn.style.cssText = `
    position: fixed;
    bottom: 100px;
    right: 16px;
    height: 32px;
    padding: 0 14px;
    display: none;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-pill-border, rgba(255,255,255,0.2));
    background: var(--color-input-bg, rgba(255,255,255,0.05));
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-radius: 16px;
    cursor: pointer;
    z-index: 1999;
    opacity: 0;
    transform: scale(0.8);
    transition: opacity 0.2s ease, transform 0.2s ease, background 0.15s ease;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text, inherit);
  `;

  btn.addEventListener('click', returnAllFloatingPills);
  btn.addEventListener('mouseenter', () => {
    btn.style.background = 'var(--color-pill-bg-hover, rgba(255,255,255,0.1))';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'var(--color-input-bg, rgba(255,255,255,0.05))';
  });

  document.body.appendChild(btn);
  returnAllButtonState.button = btn;
  return btn;
}

/**
 * Show the return all button with animation
 */
function showReturnAllButton() {
  const btn = ensureReturnAllButton();

  // Always update display to flex, even if we think it's visible
  // (handles edge cases where state got out of sync)
  btn.style.display = 'flex';
  returnAllButtonState.visible = true;

  if (!prefersReducedMotion()) {
    requestAnimationFrame(() => {
      btn.style.opacity = '1';
      btn.style.transform = 'scale(1)';
    });
  } else {
    btn.style.opacity = '1';
    btn.style.transform = 'scale(1)';
  }
}

/**
 * Hide the return all button with animation
 */
function hideReturnAllButton() {
  const btn = returnAllButtonState.button;
  if (!btn) return;

  returnAllButtonState.visible = false;

  if (!prefersReducedMotion()) {
    btn.style.opacity = '0';
    btn.style.transform = 'scale(0.8)';
    setTimeout(() => {
      // Only hide if still not visible (wasn't shown again during animation)
      if (!returnAllButtonState.visible) {
        btn.style.display = 'none';
      }
    }, 200);
  } else {
    btn.style.opacity = '0';
    btn.style.display = 'none';
  }
}

/**
 * Update return all button visibility based on returnable pills
 */
function updateReturnAllButton() {
  const returnablePills = getReturnableFloatingPills();
  if (returnablePills.length > 0) {
    showReturnAllButton();
  } else {
    hideReturnAllButton();
  }
}

/**
 * Get the step data (title and color) for a combined skill's steps
 */
function getChainStepData(chainId) {
  const chainSkill = coordinator.getSkill(chainId);
  if (!chainSkill?.chainConfig?.steps) return [];

  return chainSkill.chainConfig.steps.map((step) => {
    const stepSkill = coordinator.getSkill(step.skillId);
    if (stepSkill) {
      return {
        id: stepSkill.id,
        title: stepSkill.title,
        dotColor: getDotColor(stepSkill.id, stepSkill.color),
      };
    }

    return {
      id: step.skillId,
      title: 'Unknown',
      dotColor: DOT_COLORS[0],
    };
  });
}

/**
 * Create a combined pill with arrow-separated format and blended background
 */
function createCombinedPillContent(pill, stepData) {
  // Calculate blended background from all step colors
  let blendedColor = stepData[0]?.dotColor || '#1a1a24';
  for (let i = 1; i < stepData.length; i++) {
    blendedColor = blendColors(blendedColor, stepData[i].dotColor);
  }
  pill.style.backgroundColor = blendedColor;

  const content = document.createElement('div');
  content.className = 'combined-pill__content';

  stepData.forEach((step, index) => {
    // Add title
    const title = document.createElement('span');
    title.className = 'combined-pill__item-title';
    title.textContent = step.title;
    content.appendChild(title);

    // Add arrow between items (except after last)
    if (index < stepData.length - 1) {
      const arrow = document.createElement('span');
      arrow.className = 'combined-pill__arrow';
      arrow.textContent = '→';
      content.appendChild(arrow);
    }
  });

  pill.appendChild(content);
}

/**
 * Create a pill element for a skill
 * Registers with physics system for combination detection
 */
function createPill(skill) {
  const pill = document.createElement('div');
  pill.dataset.skillId = skill.id;
  // Accessibility: make pill keyboard accessible
  pill.setAttribute('tabindex', '0');
  pill.setAttribute('role', 'button');
  pill.setAttribute('aria-label', `Execute skill: ${skill.title}`);

  // Check if this is a combined skill
  const isCombined = skill.source === 'combined' || skill.value?.startsWith('chain:');

  if (isCombined) {
    // Render as arrow-separated with blended background
    pill.className = 'skill-pill combined-pill';
    const chainId = skill.value?.replace('chain:', '') || skill.id;
    const stepData = getChainStepData(chainId);

    if (stepData.length > 0) {
      createCombinedPillContent(pill, stepData);
    } else {
      // Fallback: render as regular pill if we can't get steps
      pill.className = 'skill-pill';
      const dotColor = getDotColor(skill.id);
      const link = document.createElement('a');
      link.className = 'skill-inner-link';
      link.href = '#';
      link.draggable = false;
      // Build DOM safely to prevent XSS from skill.title
      const dot = document.createElement('span');
      dot.className = 'skill-color-dot';
      dot.style.backgroundColor = dotColor;
      const titleSpan = document.createElement('span');
      titleSpan.className = 'skill-title';
      titleSpan.textContent = skill.title;
      link.appendChild(dot);
      link.appendChild(titleSpan);
      link.setAttribute('tabindex', '-1');
      pill.appendChild(link);
    }
  } else {
    // Regular pill with color dot
    pill.className = 'skill-pill';
    if (skill.source === 'custom') {
      pill.dataset.customId = skill.id;
    }

    const dotColor = getDotColor(skill.id, skill.color);
    const link = document.createElement('a');
    link.className = 'skill-inner-link';
    link.href = '#';
    link.draggable = false;
    // Build DOM safely to prevent XSS from skill.title
    const dot = document.createElement('span');
    dot.className = 'skill-color-dot';
    dot.style.backgroundColor = dotColor;
    const titleSpan = document.createElement('span');
    titleSpan.className = 'skill-title';
    titleSpan.textContent = skill.title;
    link.appendChild(dot);
    link.appendChild(titleSpan);
    link.setAttribute('tabindex', '-1');

    if (skill.type === 'prompt') {
      link.dataset.prompt = skill.value;
      pill.dataset.prompt = skill.value;
    } else {
      link.dataset.action = skill.value;
      pill.dataset.action = skill.value;
    }

    link.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (pill._dragging) return;
      executeSkill(skill);
    });

    pill.appendChild(link);
  }

  // Click handler for combined pills (segments don't have links)
  if (isCombined) {
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (pill._dragging) return;
      executeSkill(skill);
    });
  }

  // Keyboard support for pill execution
  pill.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (pill._dragging) return;
      executeSkill(skill);
    }
  });

  // Register with physics for combination detection
  // Skills are already registered in the coordinator at startup
  const v2Skill = coordinator.getSkill(skill.id) ?? {
    id: skill.id,
    title: skill.title,
    type: skill.type === 'prompt' ? 'prompt' : 'action',
    source: skill.source || 'builtin',
    usageCount: 0,
    lastUsed: 0,
    createdAt: 0,
  };
  physics.registerPill(v2Skill, pill);

  return pill;
}

/**
 * Execute a skill - uses coordinator for chain skills,
 * legacy handling for V1 skills (prompts and simple actions)
 */
async function executeSkill(skill) {
  // Auto-collapse overflow when a pill is clicked
  if (overflowExpanded) {
    overflowExpanded = false;
    unregisterClickOutside();
    collapseOverflow();
  }

  // Chain skills (combined pills) are handled by coordinator
  if (skill.type === 'action' && skill.value?.startsWith('chain:')) {
    handleAction(skill.value);
    return;
  }

  // V1 skills use legacy execution directly
  // This is more reliable than coordinator for simple prompts/actions
  if (skill.type === 'action') {
    handleAction(skill.value);
  } else {
    sendPromptText(skill.value);
  }

  // Track usage in coordinator so the Skills pane reflects actual counts
  const v2 = coordinator.getSkill(skill.id);
  if (v2) {
    coordinator.updateSkill(skill.id, {
      usageCount: v2.usageCount + 1,
      lastUsed: Date.now(),
    });
  }
}

/**
 * Execute chain steps by finding each step's skill and executing its action
 * Falls back to V1 skill lookup for backwards compatibility
 */
async function executeChainSteps(steps) {
  for (const step of steps) {
    const stepSkill = coordinator.getSkill(step.skillId);

    if (!stepSkill) {
      debugLog('skills', 'chain:stepNotFound', { stepId: step.skillId });
      continue;
    }

    // Execute skill based on type
    if (stepSkill.type === 'prompt' && stepSkill.promptConfig?.text) {
      await sendPromptText(stepSkill.promptConfig.text);
    } else if (stepSkill.type === 'action' && stepSkill.actionConfig?.actionId) {
      handleAction(stepSkill.actionConfig.actionId);
    } else if (stepSkill.type === 'chain' && stepSkill.chainConfig?.steps) {
      // Recursively execute nested chains
      await executeChainSteps(stepSkill.chainConfig.steps);
    }

    // Small delay between steps for UI feedback
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function createEditButton() {
  const btn = document.createElement('button');
  btn.id = 'edit-skills-button';
  btn.className = 'skill-edit-btn';
  btn.innerHTML = '<iconify-icon icon="ph:pencil-simple-line"></iconify-icon>';
  btn.style.flex = '0 0 auto';
  btn.style.width = '28px';
  btn.style.height = '28px';
  btn.style.display = 'inline-flex';
  btn.style.alignItems = 'center';
  btn.style.justifyContent = 'center';
  // Use CSS custom properties for theming consistency
  btn.style.border = '1px solid var(--color-pill-border, rgba(255,255,255,0.2))';
  btn.style.background = 'var(--color-input-bg, rgba(255,255,255,0.05))';
  btn.style.borderRadius = '50%';
  btn.style.cursor = 'pointer';
  btn.addEventListener('click', () => {
    menuStore.openSettings('skills');
  });
  return btn;
}

/**
 * Convert a UnifiedSkill (from useSkillPreferences) to V1 format
 * compatible with createPill
 */
function unifiedToV1(unified) {
  return {
    id: unified.id,
    title: unified.title,
    type: unified.type,
    value: unified.value,
    source: unified.source,
  };
}

/**
 * Create an overflow button showing hidden skill count
 */
function createOverflowButton(count) {
  const btn = document.createElement('button');
  btn.className = 'skill-pill skill-overflow-btn';
  btn.textContent = `+${count} more`;
  btn.setAttribute('aria-label', `Show ${count} more skills`);
  btn.addEventListener('click', handleOverflowClick);
  return btn;
}

/**
 * Create a collapse button to hide overflow skills
 */
function createCollapseButton() {
  const btn = document.createElement('button');
  btn.className = 'skill-pill skill-overflow-btn skill-collapse-btn';
  btn.textContent = '\u2190 less';
  btn.setAttribute('aria-label', 'Collapse overflow skills');
  btn.addEventListener('click', handleOverflowClick);
  return btn;
}

/**
 * Expand: append overflow pills + collapse button after the current pills.
 * Collapse: animate-remove overflow pills + swap button back.
 * Existing favorited pills stay untouched — no full re-render.
 */
function expandOverflow() {
  const host =
    document.getElementById('skill-carousel') || document.getElementById('prompt-carousel');
  if (!host) return;

  const overflow = prefs.enabledNotFavorited.value;
  if (overflow.length === 0) return;

  // Remove the "+N more" button
  host.querySelector('.skill-overflow-btn')?.remove();

  // Append each overflow pill with staggered enter animation
  let order = 0;
  for (const unified of overflow) {
    const skill = unifiedToV1(unified);
    if (floatingPills.has(skill.id)) continue;
    const pill = createPill(skill);
    pill.classList.add('skill-overflow-pill');
    host.appendChild(pill);
    attachDrag(pill);
    animatePillEnter(pill, order);
    order += 1;
  }

  // Append collapse button
  const collapseBtn = createCollapseButton();
  host.appendChild(collapseBtn);
}

function collapseOverflow() {
  const host =
    document.getElementById('skill-carousel') || document.getElementById('prompt-carousel');
  if (!host) return;

  // Remove collapse button immediately
  host.querySelector('.skill-collapse-btn')?.remove();

  // Animate-remove each overflow pill
  const overflowPills = Array.from(host.querySelectorAll('.skill-overflow-pill'));
  const removePromises = overflowPills.map((pill) => {
    if (pill.dataset.skillId) {
      physics.unregisterPill(pill.dataset.skillId);
    }
    return animatePillRemove(pill);
  });

  // After all animations finish, add the "+N more" button back
  Promise.all(removePromises).then(() => {
    const overflow = prefs.enabledNotFavorited.value;
    if (overflow.length > 0 && !host.querySelector('.skill-overflow-btn')) {
      const overflowBtn = createOverflowButton(overflow.length);
      host.appendChild(overflowBtn);
    }
  });
}

/**
 * Toggle overflow expanded state with targeted add/remove
 */
function handleOverflowClick(ev) {
  if (ev) {
    ev.preventDefault();
    ev.stopPropagation();
  }
  overflowExpanded = !overflowExpanded;
  if (overflowExpanded) {
    expandOverflow();
    registerClickOutside();
  } else {
    collapseOverflow();
    unregisterClickOutside();
  }
}

/**
 * Collapse overflow when clicking outside the dock
 */
function onClickOutside(ev) {
  const host =
    document.getElementById('skill-carousel') || document.getElementById('prompt-carousel');
  if (!host) return;
  if (!host.contains(ev.target) && overflowExpanded) {
    overflowExpanded = false;
    collapseOverflow();
    unregisterClickOutside();
  }
}

function registerClickOutside() {
  if (clickOutsideHandler) return;
  clickOutsideHandler = onClickOutside;
  // Use setTimeout so the current click event doesn't immediately trigger collapse
  setTimeout(() => {
    document.addEventListener('click', clickOutsideHandler, true);
  }, 0);
}

function unregisterClickOutside() {
  if (clickOutsideHandler) {
    document.removeEventListener('click', clickOutsideHandler, true);
    clickOutsideHandler = null;
  }
}

function renderPills() {
  const host =
    document.getElementById('skill-carousel') || document.getElementById('prompt-carousel');
  if (!host) return;

  // Remove existing pills and overflow buttons but keep edit button and floating pills
  // Also unregister from physics system
  Array.from(host.querySelectorAll('.skill-pill')).forEach((pill) => {
    if (!floatingPills.has(pill.dataset.skillId)) {
      // Unregister from physics before removing (skip overflow/collapse buttons)
      if (pill.dataset.skillId) {
        physics.unregisterPill(pill.dataset.skillId);
      }
      pill.remove();
    }
  });

  // Ensure edit button exists
  let editBtn = host.querySelector('#edit-skills-button');
  if (!editBtn) {
    editBtn = createEditButton();
    host.insertBefore(editBtn, host.firstChild);
  }

  // Determine which skills to show based on overflow state
  const favorited = prefs.favoritedSkills.value;
  const overflow = prefs.enabledNotFavorited.value;
  const skillsToRender = overflowExpanded ? [...favorited, ...overflow] : favorited;

  // Render pills
  let order = 0;
  for (const unified of skillsToRender) {
    const skill = unifiedToV1(unified);
    // Skip if floating
    if (floatingPills.has(skill.id)) continue;

    const pill = createPill(skill);
    host.appendChild(pill);
    attachDrag(pill);
    animatePillEnter(pill, order);
    order += 1;
  }

  // Add overflow or collapse button
  if (overflowExpanded && overflow.length > 0) {
    const collapseBtn = createCollapseButton();
    host.appendChild(collapseBtn);
  } else if (!overflowExpanded && overflow.length > 0) {
    const overflowBtn = createOverflowButton(overflow.length);
    host.appendChild(overflowBtn);
  }
}

// Watch for skill preference changes (favorited and enabled-not-favorited)
// Use a stable derived key (ID list) instead of deep comparison on recreated objects
// to avoid infinite re-render loops
watch(
  () => {
    const favIds = prefs.favoritedSkills.value.map((s) => s.id).join(',');
    const overIds = prefs.enabledNotFavorited.value.map((s) => s.id).join(',');
    return `${favIds}|${overIds}`;
  },
  async () => {
    await nextTick();
    renderPills();
  }
);

/**
 * Handle arrow key navigation within the carousel
 */
function handleCarouselKeydown(e) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

  const carousel =
    document.getElementById('skill-carousel') || document.getElementById('prompt-carousel');
  if (!carousel) return;

  const pills = Array.from(carousel.querySelectorAll('.skill-pill'));
  if (pills.length === 0) return;

  const currentIndex = pills.indexOf(document.activeElement);
  if (currentIndex === -1) {
    // Focus first pill if none focused
    pills[0]?.focus();
    return;
  }

  e.preventDefault();
  if (e.key === 'ArrowRight' && currentIndex < pills.length - 1) {
    pills[currentIndex + 1]?.focus();
  } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
    pills[currentIndex - 1]?.focus();
  }
}

onMounted(async () => {
  // Ensure coordinator storage is loaded
  await coordinator.loadFromStorage();

  // Ensure preferences are loaded before initial render
  await prefs.loadPreferences();

  // Initial render (reads from preferences composable)
  await nextTick();
  renderPills();

  // Expose for legacy compatibility
  try {
    window.handleSkillAction = handleAction;
    window.attachDraggableWhenReady = attachDrag;
  } catch (_) {}

  // Listen for skill combination events from physics system
  useEventBus().on('skill:combine', handleCombineEvent);

  // Listen for skill prompt events from coordinator
  useEventBus().on('skill:prompt', handlePromptEvent);

  // Accessibility: add keyboard navigation to carousel
  const carousel =
    document.getElementById('skill-carousel') || document.getElementById('prompt-carousel');
  if (carousel) {
    carousel.addEventListener('keydown', handleCarouselKeydown);
  }
});

/**
 * Remove and animate out a source pill after combination
 */
function removeSourcePill(skillId) {
  // Find the pill element
  const pill = document.querySelector(`[data-skill-id="${skillId}"]`);
  if (!pill) return;

  // Unregister from physics
  physics.unregisterPill(skillId);

  // Remove from floating pills set
  floatingPills.delete(skillId);

  // Clean up magnetic behavior
  if (pill._magnet && typeof pill._magnet.destroy === 'function') {
    try {
      pill._magnet.destroy();
      pill._magnet = null;
    } catch (_) {}
  }

  // Clean up class observer
  if (pill._classObserver) {
    try {
      pill._classObserver.disconnect();
      pill._classObserver = null;
    } catch (_) {}
  }

  // Animate out and remove
  const durations = motionDurations();
  const easings = motionEasings();

  if (!prefersReducedMotion()) {
    animate(
      pill,
      {
        opacity: [1, 0],
        transform: ['scale(1)', 'scale(0.5)'],
      },
      {
        duration: durations.short,
        easing: easings.standard,
      }
    )
      .finished.catch(() => {})
      .finally(() => {
        pill.remove();
      });
  } else {
    pill.remove();
  }
}

/**
 * Handle skill combination from physics hold gesture
 */
function handleCombineEvent(event) {
  const { sourceId, targetId, mode, sourceSkill, targetSkill, midpoint, sourceRect, targetRect } =
    event;
  try {
    // Remove source pills immediately so they don't stay visible
    removeSourcePill(sourceId);
    removeSourcePill(targetId);

    // Use coordinator to combine skills
    const combined = coordinator.combine(sourceSkill, targetSkill, mode);
    debugLog('skills', 'combine:created', { sourceId, targetId, combinedId: combined.id });

    // Check if this pill is already floating — if so, just highlight it
    const existingPill = document.querySelector(`[data-skill-id="${combined.id}"]`);
    if (existingPill && floatingPills.has(combined.id)) {
      existingPill.classList.add('skill-pill--highlight');
      setTimeout(() => {
        existingPill.classList.remove('skill-pill--highlight');
      }, 800);
      return;
    }

    // Create the combined pill as a floating element near the source pills
    const combinedV1 = {
      id: combined.id,
      title: combined.title,
      type: 'action',
      value: `chain:${combined.id}`,
      source: 'combined',
    };

    const pill = createPill(combinedV1);

    // Position at the midpoint between the two combined pills
    if (midpoint) {
      // Estimate pill width for centering (will adjust after render)
      const estimatedWidth = 100;
      const estimatedHeight = 32;
      const initialLeft = midpoint.x - estimatedWidth / 2;
      const initialTop = midpoint.y - estimatedHeight / 2;

      // Make it floating immediately
      floatingPills.add(pill.dataset.skillId);
      document.body.appendChild(pill);

      Object.assign(pill.style, {
        position: 'fixed',
        left: initialLeft + 'px',
        top: initialTop + 'px',
        zIndex: 2000,
        margin: '0',
        pointerEvents: 'auto',
        cursor: 'move',
        display: 'inline-block',
        boxSizing: 'border-box',
        opacity: '0',
        transform: 'scale(0.8)',
      });
      pill.classList.add('skill-floating', 'magnetic');
      pill._floating = true;

      // Animate entrance
      requestAnimationFrame(() => {
        // Recenter based on actual pill dimensions
        const actualWidth = pill.offsetWidth;
        const actualHeight = pill.offsetHeight;
        pill.style.left = midpoint.x - actualWidth / 2 + 'px';
        pill.style.top = midpoint.y - actualHeight / 2 + 'px';
        pill.style.width = actualWidth + 'px';

        // Add magnetic behavior
        try {
          const threshold = (window.AppSettings && window.AppSettings.magnetThreshold) || 40;
          pill._magnet = makeMagnetic(pill, {
            target: '#bar',
            threshold,
            detachOnDown: true,
            edge: 'both',
          });
        } catch (_) {}

        // Watch for magnet-attached class changes to update cleanup button
        try {
          pill._classObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
              if (mutation.attributeName === 'class') {
                updateReturnAllButton();
              }
            }
          });
          pill._classObserver.observe(pill, { attributes: true, attributeFilter: ['class'] });
        } catch (_) {}

        // Animate in with a pop effect
        const durations = motionDurations();
        const easings = motionEasings();

        if (!prefersReducedMotion()) {
          animate(
            pill,
            {
              opacity: [0, 1],
              transform: ['scale(0.8)', 'scale(1.05)', 'scale(1)'],
            },
            {
              duration: durations.medium,
              easing: easings.emphasis,
            }
          )
            .finished.catch(() => {})
            .finally(() => {
              pill.style.removeProperty('opacity');
              pill.style.removeProperty('transform');
            });
        } else {
          pill.style.opacity = '1';
          pill.style.transform = 'scale(1)';
        }
      });

      attachDrag(pill);
      updateReturnAllButton();
    } else {
      // Fallback: render normally if no position data
      renderPills();
    }
  } catch (err) {
    logError('skills', 'combine:failed', err);
  }
}

/**
 * Handle prompt events from coordinator execution
 */
function handlePromptEvent(event) {
  const { text, appendToInput, autoSubmit } = event;
  if (autoSubmit) {
    sendPromptText(text);
  } else {
    // Dispatch to input bar
    useEventBus().emit('skill:insert-text', { text, autoSubmit: false });
  }
}

onBeforeUnmount(() => {
  // Clean up overflow state
  overflowExpanded = false;
  unregisterClickOutside();

  try {
    delete window.handleSkillAction;
    delete window.attachDraggableWhenReady;
  } catch (_) {}

  // Remove event listeners
  useEventBus().off('skill:combine', handleCombineEvent);
  useEventBus().off('skill:prompt', handlePromptEvent);

  // Unregister all pills from physics and remove keyboard handler
  const host =
    document.getElementById('skill-carousel') || document.getElementById('prompt-carousel');
  if (host) {
    host.removeEventListener('keydown', handleCarouselKeydown);
  }
  if (host) {
    Array.from(host.querySelectorAll('.skill-pill')).forEach((pill) => {
      if (pill.dataset.skillId) {
        physics.unregisterPill(pill.dataset.skillId);
      }
    });
  }
  // Also unregister floating pills
  floatingPills.forEach((skillId) => {
    physics.unregisterPill(skillId);
  });

  // Clean up drop target (tooltip, resize handler, etc.)
  cleanupDropTarget();

  // Clean up return all button
  if (returnAllButtonState.button && returnAllButtonState.button.parentElement) {
    returnAllButtonState.button.parentElement.removeChild(returnAllButtonState.button);
  }
  returnAllButtonState.button = null;
  returnAllButtonState.visible = false;
});
</script>
