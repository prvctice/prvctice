/**
 * Motion One type extensions
 *
 * The @motionone/dom library's animate() function supports the standard Web Animations API
 * `fill` property, but the library's TypeScript types don't include it. This file provides
 * extended types that include the missing properties.
 */

import type { MotionKeyframesDefinition } from '@motionone/dom';

/**
 * Extended animation options - allows any valid animation options
 * The motion library accepts more than what's strictly typed (like `fill` from Web Animations API)
 */
export interface ExtendedAnimationOptions {
  duration?: number;
  delay?: number;
  endDelay?: number;
  repeat?: number;
  direction?: PlaybackDirection;
  easing?: string | number[] | ((t: number) => number);
  fill?: FillMode;
  autoplay?: boolean;
  allowWebkitAcceleration?: boolean;
  offset?: number[];
}

/**
 * Animation controls returned from the animate function
 */
export interface AnimationControls {
  play: () => void;
  pause: () => void;
  cancel: () => void;
  stop?: () => void;
  finish?: () => void;
  reverse?: () => void;
  finished: Promise<unknown>;
  currentTime: number | null;
  playbackRate?: number;
  playState: AnimationPlayState;
}

/**
 * Properly typed animate function signature
 */
export type AnimateFunction = (
  elements: Element | Element[] | NodeListOf<Element> | string,
  keyframes: MotionKeyframesDefinition,
  options?: ExtendedAnimationOptions
) => AnimationControls;

export type { MotionKeyframesDefinition };
