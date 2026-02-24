/**
 * Drop target management for skill pills
 *
 * Manages the toggle button as a drop target for returning floating pills.
 * Extracted from SkillsDock.vue for reusability.
 */

export interface DropTargetState {
  button: HTMLElement | null;
  tooltip: HTMLElement | null;
  resizeHandler: (() => void) | null;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const DROP_TARGET_MARGIN = 32;

const dropTargetState: DropTargetState = {
  button: null,
  tooltip: null,
  resizeHandler: null,
};

/**
 * Resolve the drop target button element
 */
export function resolveDropTargetButton(): HTMLElement | null {
  const btn = document.getElementById('toggle-skills-button');
  if (!btn) return null;
  if (dropTargetState.button !== btn) {
    dropTargetState.button = btn;
    dropTargetState.tooltip = null;
  }
  return btn;
}

/**
 * Position the drop target tooltip based on viewport
 */
export function positionDropTargetTooltip(): void {
  const btn = dropTargetState.button || resolveDropTargetButton();
  const tooltip = dropTargetState.tooltip;
  if (!btn || !tooltip) return;

  tooltip.classList.remove(
    'skill-drop-tooltip--align-left',
    'skill-drop-tooltip--align-right',
    'skill-drop-tooltip--over-tray'
  );

  try {
    const host =
      document.getElementById('skill-carousel') || document.getElementById('prompt-carousel');
    if (host && !host.classList.contains('hidden')) {
      tooltip.classList.add('skill-drop-tooltip--over-tray');
    }
  } catch (_) {
    // Ignore errors finding carousel
  }

  const btnRect = btn.getBoundingClientRect();
  const tooltipWidth = tooltip.offsetWidth || 0;
  const centerX = btnRect.left + btnRect.width / 2;
  const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || tooltipWidth;
  const margin = 24;

  if (centerX + tooltipWidth / 2 > viewportWidth - margin) {
    tooltip.classList.add('skill-drop-tooltip--align-right');
  } else if (centerX - tooltipWidth / 2 < margin) {
    tooltip.classList.add('skill-drop-tooltip--align-left');
  }
}

/**
 * Ensure the drop target tooltip exists
 */
export function ensureDropTargetTooltip(): HTMLElement | null {
  const btn = resolveDropTargetButton();
  if (!btn) return null;

  if (!dropTargetState.tooltip || dropTargetState.tooltip.parentElement !== btn) {
    const tooltip = document.createElement('div');
    tooltip.className = 'skill-drop-tooltip';

    const icon = document.createElement('iconify-icon');
    icon.className = 'skill-drop-tooltip-icon';
    icon.setAttribute('icon', 'ph:tray-arrow-up');

    const label = document.createElement('span');
    label.className = 'skill-drop-tooltip-label';
    label.textContent = 'Drag here to return';

    tooltip.appendChild(icon);
    tooltip.appendChild(label);
    btn.appendChild(tooltip);
    dropTargetState.tooltip = tooltip;

    if (!dropTargetState.resizeHandler) {
      dropTargetState.resizeHandler = () => positionDropTargetTooltip();
      window.addEventListener('resize', dropTargetState.resizeHandler, { passive: true });
    }
  }

  positionDropTargetTooltip();
  return btn;
}

/**
 * Check if a rect is within the drop target area
 */
export function isWithinDropTarget(rect: Rect | DOMRect): boolean {
  const btn = resolveDropTargetButton();
  if (!btn || !rect) return false;

  const targetRect = btn.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  return (
    cx >= targetRect.left - DROP_TARGET_MARGIN &&
    cx <= targetRect.right + DROP_TARGET_MARGIN &&
    cy >= targetRect.top - DROP_TARGET_MARGIN &&
    cy <= targetRect.bottom + DROP_TARGET_MARGIN
  );
}

/**
 * Update drop target visual highlighting
 */
export function updateDropTargetHighlight(rect: Rect | DOMRect): boolean {
  const btn = ensureDropTargetTooltip();
  if (!btn) return false;

  const active = isWithinDropTarget(rect);
  if (active) {
    btn.classList.add('skill-drop-ready', 'skill-drop-target');
  } else {
    btn.classList.remove('skill-drop-target', 'skill-drop-ready');
  }
  positionDropTargetTooltip();
  return active;
}

/**
 * Clear all drop target highlighting
 */
export function clearDropTargetHighlight(): void {
  const btn = dropTargetState.button || resolveDropTargetButton();
  if (!btn) return;
  btn.classList.remove('skill-drop-ready', 'skill-drop-target');
  positionDropTargetTooltip();
}

/**
 * Cleanup drop target resources
 */
export function cleanupDropTarget(): void {
  clearDropTargetHighlight();

  if (dropTargetState.resizeHandler) {
    window.removeEventListener('resize', dropTargetState.resizeHandler);
    dropTargetState.resizeHandler = null;
  }

  if (dropTargetState.tooltip?.parentElement) {
    dropTargetState.tooltip.parentElement.removeChild(dropTargetState.tooltip);
  }

  dropTargetState.tooltip = null;
  dropTargetState.button = null;
}

/**
 * Composable hook for drop target management
 */
export function useDropTarget() {
  return {
    resolveDropTargetButton,
    ensureDropTargetTooltip,
    positionDropTargetTooltip,
    isWithinDropTarget,
    updateDropTargetHighlight,
    clearDropTargetHighlight,
    cleanupDropTarget,
    DROP_TARGET_MARGIN,
  };
}

export default useDropTarget;
