export type SnapEdge = 'top' | 'bottom' | 'left' | 'right';

export interface Position {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MagneticElementOptions {
  id: string;
  element: HTMLElement | string; // Element or selector
  snapEdges?: SnapEdge[]; // Default: all 4
  isTarget?: boolean; // Can others snap to this? Default: true
  isDraggable?: boolean; // Can this be dragged? Default: true
  priority?: number; // Higher = preferred snap target
  threshold?: number; // Override default threshold
  detachThreshold?: number; // Override default detach threshold
}

export interface MagneticElement extends MagneticElementOptions {
  getRect: () => Rect;
  snapEdges: SnapEdge[];
  isTarget: boolean;
  isDraggable: boolean;
}

/**
 * Magnetic attachment state - tracks physical attachment to UI elements
 * (Renamed from AttachmentState to avoid conflict with skills.ts AttachmentState)
 */
export interface MagneticAttachmentState {
  leaderId: string; // Element this is attached to
  edge: SnapEdge; // Which edge attached at
  offset: Position; // Offset from leader's anchor point
}

export interface SnapResult {
  targetId: string;
  targetElement: MagneticElement;
  edge: SnapEdge;
  snapPoint: Position;
  distance: number;
  attraction: number; // 0-1 strength based on distance
}

export interface AttachResult {
  attached: boolean;
  targetId?: string;
  edge?: SnapEdge;
  snapPoint?: Position; // Where the element should be positioned
}

export interface EdgeSnapInfo {
  edge: SnapEdge;
  distance: number;
  snapPoint: Position;
}
