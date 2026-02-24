// web/directives/magnet.ts – Vue directive wrapper for makeMagnetic
import type { DirectiveBinding } from 'vue';
import { makeMagnetic } from '@web/utils/magnet';

interface MagnetOptions {
  target?: string | HTMLElement;
  threshold?: number;
  detachThreshold?: number;
  edge?: 'both' | 'top' | 'bottom';
  detachOnDown?: boolean;
}

export const magnet = {
  mounted(el: HTMLElement, binding: DirectiveBinding<MagnetOptions | undefined>): void {
    try {
      makeMagnetic(el, binding?.value || {});
    } catch (_) {}
  },
};

export default magnet;
