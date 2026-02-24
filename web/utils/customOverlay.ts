// web/utils/customOverlay.ts
// Centralized helper for Custom theme background dimming overlay.

type OverlayReason = 'chat' | 'notes' | 'help' | string;

function htmlEl(): HTMLElement {
  return document.documentElement;
}

function flagKey(reason: OverlayReason): string | null {
  const r = String(reason || '').trim();
  if (!r) return null;
  return 'customOverlay' + r.charAt(0).toUpperCase() + r.slice(1);
}

function anyActiveFlag(el: HTMLElement): boolean {
  try {
    const dataset = el.dataset as DOMStringMap;
    return !!(
      dataset.customOverlayChat ||
      dataset.customOverlayNotes ||
      dataset.customOverlayHelp ||
      dataset.mondayOverlayChat ||
      dataset.mondayOverlayNotes ||
      dataset.mondayOverlayHelp
    );
  } catch (_) {
    return false;
  }
}

function isCustomThemeActive(el: HTMLElement): boolean {
  return el.classList.contains('custom-theme') || el.classList.contains('monday-theme');
}

export function updateCustomOverlay(): void {
  try {
    const el = htmlEl();
    const should = isCustomThemeActive(el) && anyActiveFlag(el);
    if (should) {
      el.classList.remove('monday-overlay-dark');
      el.classList.add('custom-overlay-dark');
    } else {
      el.classList.remove('custom-overlay-dark', 'monday-overlay-dark');
    }
  } catch (_) {}
}

export function overlayOn(reason: OverlayReason): void {
  try {
    const el = htmlEl();
    const key = flagKey(reason);
    if (!key) return;
    (el.dataset as Record<string, string>)[key] = '1';
    updateCustomOverlay();
  } catch (_) {}
}

export function overlayOff(reason: OverlayReason): void {
  try {
    const el = htmlEl();
    const key = flagKey(reason);
    if (!key) return;
    if (Object.prototype.hasOwnProperty.call(el.dataset, key)) {
      delete (el.dataset as Record<string, string | undefined>)[key];
    }
    updateCustomOverlay();
  } catch (_) {}
}

export function overlayResetAll(): void {
  try {
    const el = htmlEl();
    const dataset = el.dataset as Record<string, string | undefined>;
    delete dataset.customOverlayChat;
    delete dataset.customOverlayNotes;
    delete dataset.customOverlayHelp;
    delete dataset.mondayOverlayChat;
    delete dataset.mondayOverlayNotes;
    delete dataset.mondayOverlayHelp;
    updateCustomOverlay();
  } catch (_) {}
}
