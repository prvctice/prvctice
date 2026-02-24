# PDF System Documentation

> **Why this doc:** The PDF system wraps PDF.js to provide viewing, annotation, and AI-assisted document analysis within the floating widget. Read this when working on PDF rendering, highlights, or chat-to-PDF integration.
>
> **Related systems:** [CHAT_STORE_SYSTEM.md](./CHAT_STORE_SYSTEM.md)
> **Architecture context:** [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md) | [CODEMAP.md](./CODEMAP.md)

The PDF System provides complete PDF viewing, annotation, and chat integration capabilities for prvctice. It wraps PDF.js for rendering and provides composables for navigation, highlights, and AI-assisted document analysis.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Core Concepts](#core-concepts)
3. [Contract and Invariants](#contract-and-invariants)
4. [Data Flow](#data-flow)
5. [Rendering Pipeline](#rendering-pipeline)
6. [Text Layer Synchronization](#text-layer-synchronization)
7. [Highlight Coordinate System](#highlight-coordinate-system)
8. [Zoom Modes](#zoom-modes)
9. [Configuration Reference](#configuration-reference)
10. [Failure Modes](#failure-modes)
11. [Code Examples](#code-examples)
12. [File Reference](#file-reference)
13. [Reference Mapping](#reference-mapping)
14. [Changelog](#changelog)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              PDF SYSTEM                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                          DATA SOURCES                                       ││
│  │  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                        ││
│  │  │  File API   │   │   URL       │   │ Blob/Buffer │                        ││
│  │  │ (drag/drop) │   │ (network)   │   │  (memory)   │                        ││
│  │  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘                        ││
│  │         │                 │                 │                               ││
│  │         └────────────────┬┴─────────────────┘                               ││
│  │                          ▼                                                  ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                             │                                                   │
│                             ▼                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                     usePdfRenderer                                          ││
│  │  ┌───────────────────────────────────────────────────────────────────────┐  ││
│  │  │                        PDF.js Integration                             │  ││
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  │  ││
│  │  │  │   Worker    │  │   Document  │  │    Page     │  │   Viewport   │  │  ││
│  │  │  │  (parsing)  │  │   Proxy     │  │   Proxy     │  │  (scaling)   │  │  ││
│  │  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘  │  ││
│  │  │         │                │                │                │          │  ││
│  │  │         └────────────────┴────────────────┴────────────────┘          │  ││
│  │  │                                   │                                   │  ││
│  │  │                                   ▼                                   │  ││
│  │  │  ┌────────────────────────────────────────────────────────────────┐   │  ││
│  │  │  │                    RENDER OUTPUT                               │   │  ││
│  │  │  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │   │  ││
│  │  │  │  │  Canvas Layer   │  │   Text Layer    │  │ Annotation Layer│ │   │  ││
│  │  │  │  │ (visual pixels) │  │ (selectable)    │  │  (highlights)   │ │   │  ││
│  │  │  │  └─────────────────┘  └─────────────────┘  └─────────────────┘ │   │  ││
│  │  │  └────────────────────────────────────────────────────────────────┘   │  ││
│  │  └───────────────────────────────────────────────────────────────────────┘  ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                             │                                                   │
│            ┌────────────────┼────────────────┬────────────────┐                 │
│            ▼                ▼                ▼                ▼                 │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│  │ usePdfNavigation│ │usePdfHighlights │ │usePdfChatInteg. │ │   PDF Export    ││
│  │                 │ │                 │ │                 │ │   (services/)   ││
│  │ ┌─────────────┐ │ │ ┌─────────────┐ │ │ ┌─────────────┐ │ │ ┌─────────────┐ ││
│  │ │  Sidebar    │ │ │ │  Storage    │ │ │ │  Chat API   │ │ │ │   jsPDF     │ ││
│  │ │  Thumbnails │ │ │ │  (local)    │ │ │ │  overlayOn  │ │ │ │   export    │ ││
│  │ │  Preloading │ │ │ │  Colors     │ │ │ │  formatting │ │ │ │  formatting │ ││
│  │ └─────────────┘ │ │ └─────────────┘ │ │ └─────────────┘ │ │ └─────────────┘ ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘│
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            STORAGE                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │  localStorage                                                               ││
│  │  ├── pdf:{docId}:highlights   → PdfHighlight[]                              ││
│  │  ├── pdf:{docId}:annotations  → PdfAnnotation[]                             ││
│  │  └── pdf:{docId}:position     → { page, zoom }                              ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Concepts

### PdfDocument

Represents a loaded PDF with metadata extracted from the file:

```typescript
interface PdfDocument {
  id: string; // Hash of file or URL (SHA-256, first 8 bytes)
  source: string; // Original filename or URL
  title: string; // From PDF metadata or filename
  author?: string; // From PDF metadata
  subject?: string; // From PDF metadata
  numPages: number; // Total page count
  pdfVersion?: string; // e.g., "1.7"
  isEncrypted: boolean; // Has password protection
  fileSize?: number; // In bytes (File sources only)
}
```

### PdfPage

Information about a single page:

```typescript
interface PdfPage {
  pageNumber: number; // 1-indexed
  width: number; // Original PDF units (points, 72 per inch)
  height: number; // Original PDF units
  rotation: number; // 0, 90, 180, or 270 degrees
}
```

### ZoomConfig

Controls how the PDF scales to the container:

```typescript
type ZoomMode = 'fit-width' | 'fit-page' | 'percentage';

interface ZoomConfig {
  mode: ZoomMode;
  percentage: number; // 0.25 to 5.0 (25% to 500%)
}
```

### PdfHighlight

User-created highlight with optional annotation:

```typescript
interface PdfHighlight {
  id: string; // Generated: hl_{timestamp}_{random}
  documentId: string; // Links to PdfDocument.id
  text: string; // Selected text content
  position: PdfTextPosition;
  color: HighlightColor; // 'yellow' | 'green' | 'blue' | 'pink' | 'orange' | 'purple'
  annotation?: string; // Optional user note
  createdAt: number; // Unix timestamp
  updatedAt?: number; // Modified timestamp
}
```

### PdfTextPosition

Location of text within a page:

```typescript
interface PdfTextPosition {
  pageNumber: number; // 1-indexed
  startIndex: number; // Character offset (always 0 in current impl)
  endIndex: number; // Character offset (equals text.length)
  rects: PdfRect[]; // Bounding boxes for rendering
}

interface PdfRect {
  x: number; // PDF coordinates
  y: number;
  width: number;
  height: number;
}
```

---

## Contract and Invariants

### Guarantees Provided

| Guarantee                 | Description                                                        |
| ------------------------- | ------------------------------------------------------------------ |
| **Document ID Stability** | Same file produces same ID (SHA-256 of name + size + lastModified) |
| **Page Range**            | `currentPage` always in range [1, totalPages]                      |
| **Zoom Bounds**           | Scale always clamped to [0.25, 5.0] (25% to 500%)                  |
| **Immutable Updates**     | Highlights array is replaced, never mutated                        |
| **Cleanup on Unmount**    | Document and render tasks destroyed via `onBeforeUnmount`          |
| **Render Cancellation**   | Previous render cancelled before starting new one                  |

### Required Fields by Operation

| Operation              | Required                      | Optional                                          |
| ---------------------- | ----------------------------- | ------------------------------------------------- |
| `loadDocument(source)` | `source: File \| string`      | `password`, `initialPage`, `initialZoom`          |
| `renderPage(options)`  | `canvas: HTMLCanvasElement`   | `textLayerContainer`, `scale`, `devicePixelRatio` |
| `addHighlight(params)` | `text`, `pageNumber`, `rects` | `color`, `annotation`                             |

### Canonical Storage Keys

```typescript
const PDF_STORAGE_KEYS = {
  highlights: (id: string) => `pdf:${id}:highlights`,
  annotations: (id: string) => `pdf:${id}:annotations`,
  position: (id: string) => `pdf:${id}:position`,
};
```

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         DOCUMENT LOADING LIFECYCLE                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  1. SOURCE SELECTION                                                            │
│     ┌──────────────────┐                                                        │
│     │ User drops file  │                                                        │
│     │ or provides URL  │                                                        │
│     └────────┬─────────┘                                                        │
│              │                                                                  │
│              ▼                                                                  │
│  2. DOCUMENT ID GENERATION                                                      │
│     ┌──────────────────┐                                                        │
│     │ generateDocId()  │                                                        │
│     │ - File: name +   │                                                        │
│     │   size + mtime   │                                                        │
│     │ - URL: full URL  │                                                        │
│     │ → SHA-256 hash   │                                                        │
│     └────────┬─────────┘                                                        │
│              │                                                                  │
│              ▼                                                                  │
│  3. PDF.JS LOADING                                                              │
│     ┌──────────────────┐                                                        │
│     │ pdfjsLib.getDoc  │                                                        │
│     │ - Worker parses  │                                                        │
│     │ - Returns proxy  │                                                        │
│     └────────┬─────────┘                                                        │
│              │                                                                  │
│              ▼                                                                  │
│  4. METADATA EXTRACTION                                                         │
│     ┌──────────────────┐                                                        │
│     │ extractMetadata  │                                                        │
│     │ - Title, author  │                                                        │
│     │ - Page count     │                                                        │
│     │ - PDF version    │                                                        │
│     └────────┬─────────┘                                                        │
│              │                                                                  │
│              ▼                                                                  │
│  5. INITIAL PAGE LOAD                                                           │
│     ┌──────────────────┐                                                        │
│     │ updatePageInfo() │                                                        │
│     │ - Get viewport   │                                                        │
│     │ - Set dimensions │                                                        │
│     └────────┬─────────┘                                                        │
│              │                                                                  │
│              ▼                                                                  │
│  6. READY FOR RENDERING                                                         │
│     ┌──────────────────┐                                                        │
│     │ onDocumentLoad   │                                                        │
│     │ callback fires   │                                                        │
│     └──────────────────┘                                                        │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Rendering Pipeline

The rendering pipeline produces three synchronized layers:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         PAGE RENDERING PIPELINE                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  INPUT                                                                          │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  renderPage({ canvas, textLayerContainer, scale, devicePixelRatio })     │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                     │                                           │
│                                     ▼                                           │
│  STEP 1: CANCEL PREVIOUS RENDER                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  if (currentRenderTask) { currentRenderTask.cancel(); }                  │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                     │                                           │
│                                     ▼                                           │
│  STEP 2: CALCULATE VIEWPORTS                                                    │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  // High-DPI viewport (actual pixels)                                    │   │
│  │  viewport = page.getViewport({ scale: renderScale * devicePixelRatio })  │   │
│  │                                                                          │   │
│  │  // CSS viewport (display size)                                          │   │
│  │  cssViewport = page.getViewport({ scale: renderScale })                  │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                     │                                           │
│                                     ▼                                           │
│  STEP 3: CANVAS SETUP                                                           │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  // Physical pixels (for sharp rendering)                                │   │
│  │  canvas.width = viewport.width;      // e.g., 1700 on 2x display         │   │
│  │  canvas.height = viewport.height;    // e.g., 2200 on 2x display         │   │
│  │                                                                          │   │
│  │  // CSS pixels (what user sees)                                          │   │
│  │  canvas.style.width = `${cssViewport.width}px`;   // e.g., 850px         │   │
│  │  canvas.style.height = `${cssViewport.height}px`; // e.g., 1100px        │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                     │                                           │
│                                     ▼                                           │
│  STEP 4: RENDER PAGE                                                            │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  renderTask = page.render({                                              │   │
│  │    canvas: canvas,                                                       │   │
│  │    canvasContext: ctx,                                                   │   │
│  │    viewport: viewport        // High-DPI viewport                        │   │
│  │  });                                                                     │   │
│  │  await renderTask.promise;                                               │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                     │                                           │
│                                     ▼                                           │
│  STEP 5: TEXT LAYER (if container provided)                                     │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  await renderTextLayer(page, cssViewport, container);                    │   │
│  │  // Creates invisible selectable text spans overlaid on canvas           │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  OUTPUT                                                                         │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  ┌─────────────────────────────────────────────────────────────────────┐ │   │
│  │  │ <div class="pdf-page">                                              │ │   │
│  │  │   <canvas />           ← Visual rendering (high-DPI)                │ │   │
│  │  │   <div class="text-layer">                                          │ │   │
│  │  │     <span>Text 1</span>  ← Selectable text (invisible)              │ │   │
│  │  │     <span>Text 2</span>                                             │ │   │
│  │  │   </div>                                                            │ │   │
│  │  │   <div class="annotation-layer">                                    │ │   │
│  │  │     <!-- Highlights rendered here -->                               │ │   │
│  │  │   </div>                                                            │ │   │
│  │  │ </div>                                                              │ │   │
│  │  └─────────────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Text Layer Synchronization

The text layer must align precisely with the canvas to enable text selection:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         TEXT LAYER ALGORITHM                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  PDF TEXT CONTENT                                                               │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  TextItem {                                                              │   │
│  │    str: "Hello World",        // The actual text                         │   │
│  │    transform: [12, 0, 0, 12, 72, 700],  // 6-element matrix              │   │
│  │    width: 66.72,              // Text width in PDF units                 │   │
│  │    height: 12,                // Font size in PDF units                  │   │
│  │    fontName: "g_d0_f1"        // Internal font reference                 │   │
│  │  }                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                     │                                           │
│                                     ▼                                           │
│  TRANSFORM CALCULATION                                                          │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  // Apply viewport transform to text item transform                      │   │
│  │  tx = Util.transform(viewport.transform, item.transform)                 │   │
│  │                                                                          │   │
│  │  // Result: [scaleX, skewY, skewX, scaleY, translateX, translateY]       │   │
│  │  //         tx[4] = left position in CSS pixels                          │   │
│  │  //         tx[5] = position from bottom (PDF origin is bottom-left)     │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                     │                                           │
│                                     ▼                                           │
│  POSITION CONVERSION                                                            │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  // Convert from PDF coordinates (origin bottom-left)                    │   │
│  │  // to CSS coordinates (origin top-left)                                 │   │
│  │                                                                          │   │
│  │  left = tx[4];                                                           │   │
│  │  top = viewport.height - tx[5] - (item.height * scale);                  │   │
│  │  fontSize = Math.max(item.height * scale, 1);                            │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                     │                                           │
│                                     ▼                                           │
│  SPAN CREATION                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  <span style="                                                           │   │
│  │    position: absolute;                                                   │   │
│  │    left: ${left}px;                                                      │   │
│  │    top: ${top}px;                                                        │   │
│  │    font-size: ${fontSize}px;                                             │   │
│  │    color: transparent;        // Invisible text                          │   │
│  │    user-select: text;         // Allows selection                        │   │
│  │  ">Hello World</span>                                                    │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                     │                                           │
│                                     ▼                                           │
│  WIDTH CORRECTION (Second Pass)                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  // Browser-rendered width may differ from PDF's expected width          │   │
│  │  // Apply scaleX transform to match                                      │   │
│  │                                                                          │   │
│  │  actualWidth = span.offsetWidth;                                         │   │
│  │  targetWidth = item.width * scale;                                       │   │
│  │  scaleX = targetWidth / actualWidth;                                     │   │
│  │                                                                          │   │
│  │  if (Math.abs(scaleX - 1) > 0.01) {                                      │   │
│  │    span.style.transform = `scaleX(${scaleX})`;                           │   │
│  │  }                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Why two passes?**

1. First pass: Create all spans in a document fragment (fast, no reflow)
2. Second pass: Measure each span and apply width correction (requires DOM)

---

## Highlight Coordinate System

Highlights use PDF page coordinates, not screen coordinates:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     HIGHLIGHT COORDINATE TRANSFORMATION                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  SCREEN SELECTION                                                               │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  User selects text at screen position (screenX, screenY)                 │   │
│  │                                                                          │   │
│  │  ┌───────────────────────────────────────────────────────────────────┐   │   │
│  │  │    Canvas                                                         │   │   │
│  │  │    ┌─────────────────────────────────────────────────────────┐    │   │   │
│  │  │    │                                                         │    │   │   │
│  │  │    │     "Lorem ipsum dolor sit amet"                        │    │   │   │
│  │  │    │      ████████████                                       │    │   │   │
│  │  │    │      ^ selection starts here                            │    │   │   │
│  │  │    │                                                         │    │   │   │
│  │  │    └─────────────────────────────────────────────────────────┘    │   │   │
│  │  └───────────────────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                     │                                           │
│                                     ▼                                           │
│  GET SELECTION RECTS                                                            │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  // Browser gives us screen-relative rectangles                          │   │
│  │  const selection = window.getSelection();                                │   │
│  │  const range = selection.getRangeAt(0);                                  │   │
│  │  const rects = range.getClientRects();  // Array of DOMRect              │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                     │                                           │
│                                     ▼                                           │
│  CONVERT TO PAGE COORDINATES                                                    │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  // Get canvas bounds                                                    │   │
│  │  const canvasBounds = canvas.getBoundingClientRect();                    │   │
│  │                                                                          │   │
│  │  // For each selection rect:                                             │   │
│  │  pdfRects = rects.map(rect => ({                                         │   │
│  │    x: (rect.left - canvasBounds.left) / scale,                           │   │
│  │    y: (rect.top - canvasBounds.top) / scale,                             │   │
│  │    width: rect.width / scale,                                            │   │
│  │    height: rect.height / scale                                           │   │
│  │  }));                                                                    │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                     │                                           │
│                                     ▼                                           │
│  STORE HIGHLIGHT                                                                │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  highlight = {                                                           │   │
│  │    id: "hl_1706180000000_abc123",                                        │   │
│  │    documentId: "a1b2c3d4",                                               │   │
│  │    text: "ipsum dolor",                                                  │   │
│  │    position: {                                                           │   │
│  │      pageNumber: 1,                                                      │   │
│  │      rects: pdfRects    // In PDF units, not screen pixels               │   │
│  │    },                                                                    │   │
│  │    color: "yellow"                                                       │   │
│  │  };                                                                      │   │
│  │                                                                          │   │
│  │  // Save to localStorage                                                 │   │
│  │  localStorage.setItem(`pdf:a1b2c3d4:highlights`, JSON.stringify([...]))  │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  RENDERING HIGHLIGHTS (opposite direction)                                      │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  // Convert PDF coords back to screen coords for display                 │   │
│  │  const screenRect = {                                                    │   │
│  │    x: pdfRect.x * scale,                                                 │   │
│  │    y: pdfRect.y * scale,                                                 │   │
│  │    width: pdfRect.width * scale,                                         │   │
│  │    height: pdfRect.height * scale                                        │   │
│  │  };                                                                      │   │
│  │                                                                          │   │
│  │  // Render highlight overlay at screenRect position                      │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Key insight:** Storing coordinates in PDF units (not screen pixels) ensures highlights remain correctly positioned when zoom level changes.

---

## Zoom Modes

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              ZOOM MODES                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  FIT-WIDTH (Default)                                                            │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  scale = (containerWidth - 40) / pageWidth                               │   │
│  │                                                                          │   │
│  │  ┌─────────────────────────────────────────────────────────────────────┐ │   │
│  │  │ Container                                                           │ │   │
│  │  │ ┌───────────────────────────────────────────────────────────────┐   │ │   │
│  │  │ │ Page fills width                                              │   │ │   │
│  │  │ │                                                               │   │ │   │
│  │  │ │                                                               │   │ │   │
│  │  │ │                                                               │   │ │   │
│  │  │ │                                                               │   │ │   │
│  │  │ │                                                               │   │ │   │
│  │  │ │                                                               │   │ │   │
│  │  │ │ (may need vertical scroll)                                    │   │ │   │
│  │  │ └───────────────────────────────────────────────────────────────┘   │ │   │
│  │  └─────────────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  FIT-PAGE                                                                       │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  widthScale = (containerWidth - 40) / pageWidth                          │   │
│  │  heightScale = (containerHeight - 40) / pageHeight                       │   │
│  │  scale = Math.min(widthScale, heightScale)                               │   │
│  │                                                                          │   │
│  │  ┌─────────────────────────────────────────────────────────────────────┐ │   │
│  │  │ Container                                                           │ │   │
│  │  │         ┌───────────────────────────────┐                           │ │   │
│  │  │         │ Page fits entirely            │                           │ │   │
│  │  │         │                               │                           │ │   │
│  │  │         │                               │                           │ │   │
│  │  │         │                               │                           │ │   │
│  │  │         │                               │                           │ │   │
│  │  │         └───────────────────────────────┘                           │ │   │
│  │  └─────────────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  PERCENTAGE                                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  scale = zoom.percentage  // Direct 1:1 mapping                          │   │
│  │                                                                          │   │
│  │  ZOOM PRESETS: [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0]                │   │
│  │  STEP: 0.25 (when not hitting preset)                                    │   │
│  │  MIN: 0.25 (25%)                                                         │   │
│  │  MAX: 5.0 (500%)                                                         │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Configuration Reference

### Zoom Constants (usePdfRenderer.ts)

| Constant       | Value                                      | Description               |
| -------------- | ------------------------------------------ | ------------------------- |
| `ZOOM_STEP`    | 0.25                                       | Step size for zoom in/out |
| `ZOOM_MIN`     | 0.25                                       | Minimum zoom (25%)        |
| `ZOOM_MAX`     | 5.0                                        | Maximum zoom (500%)       |
| `ZOOM_PRESETS` | [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0] | Quick zoom levels         |

### Thumbnail Defaults (usePdfNavigation.ts)

| Constant                           | Value | Description                           |
| ---------------------------------- | ----- | ------------------------------------- |
| `DEFAULT_THUMBNAIL_SIZE.maxWidth`  | 120px | Maximum thumbnail width               |
| `DEFAULT_THUMBNAIL_SIZE.maxHeight` | 160px | Maximum thumbnail height              |
| `DEFAULT_PRELOAD_RADIUS`           | 2     | Pages to preload before/after current |

### Intersection Observer (usePdfNavigation.ts)

| Option       | Value   | Description                             |
| ------------ | ------- | --------------------------------------- |
| `rootMargin` | '100px' | Preload thumbnails 100px before visible |
| `threshold`  | 0.1     | Trigger when 10% visible                |

### Highlight Colors (types/pdf.ts)

| Color    | CSS Value                 |
| -------- | ------------------------- |
| `yellow` | `rgba(255, 235, 59, 0.4)` |
| `green`  | `rgba(76, 175, 80, 0.4)`  |
| `blue`   | `rgba(33, 150, 243, 0.4)` |
| `pink`   | `rgba(233, 30, 99, 0.4)`  |
| `orange` | `rgba(255, 152, 0, 0.4)`  |
| `purple` | `rgba(156, 39, 176, 0.4)` |

### PDF Export Layout (services/pdf.ts)

| Constant                | Value | Description               |
| ----------------------- | ----- | ------------------------- |
| `LAYOUT.marginTop`      | 20    | Top margin in points      |
| `LAYOUT.marginBottom`   | 24    | Bottom margin in points   |
| `LAYOUT.marginLeft`     | 24    | Left margin in points     |
| `LAYOUT.marginRight`    | 24    | Right margin in points    |
| `LAYOUT.messageGap`     | 16    | Gap between chat messages |
| `LAYOUT.lineHeight`     | 5     | Text line height          |
| `LAYOUT.codeLineHeight` | 4     | Code block line height    |

---

## Failure Modes

| Scenario                   | Behavior                                                | How to Detect                        |
| -------------------------- | ------------------------------------------------------- | ------------------------------------ |
| **Invalid PDF**            | Error caught, `error` ref set, `onError` callback fires | Check `error.value !== null`         |
| **Password protected**     | Loading fails with password error                       | Error message contains "password"    |
| **Worker not loaded**      | Silent fallback to main thread (slow)                   | Check console for worker warnings    |
| **Render cancelled**       | `RenderingCancelledException` caught and ignored        | Normal behavior during navigation    |
| **Canvas context null**    | Error thrown: "Could not get canvas context"            | Check canvas element exists in DOM   |
| **Text layer drift**       | Visible selection doesn't match canvas text             | Width correction may be insufficient |
| **Storage quota exceeded** | `saveHighlights()` silently fails                       | localStorage error in console        |
| **Invalid page number**    | Clamped to [1, totalPages]                              | `goToPage()` auto-clamps             |

### Debugging Checklist

1. **PDF won't load?**
   - Check `isLoading.value` stuck at `true`
   - Check `error.value` for specific message
   - Verify worker URL is accessible: `pdfWorkerUrl` import

2. **Page appears blank?**
   - Verify canvas is in DOM when `renderPage()` called
   - Check `isRendering.value` transitions to `false`
   - Inspect canvas dimensions (should be non-zero)

3. **Text not selectable?**
   - Verify `textLayerContainer` passed to `renderPage()`
   - Check text layer has `pointer-events: auto`
   - Inspect text spans are positioned correctly

4. **Highlights not persisting?**
   - Check `documentId` is set on highlights composable
   - Verify localStorage not disabled/full
   - Check for JSON parse errors in console

5. **Zoom not working?**
   - Verify `containerRef` passed to `usePdfRenderer`
   - Check container has non-zero dimensions
   - Verify `scale` computed updates on zoom change

---

## Code Examples

### Basic PDF Viewer Setup

```vue
<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { usePdfRenderer } from '@web/composables/usePdfRenderer';
import { usePdfHighlights } from '@web/composables/usePdfHighlights';

const containerRef = ref<HTMLElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const textLayerRef = ref<HTMLDivElement | null>(null);

const {
  document,
  currentPage,
  totalPages,
  scale,
  isLoading,
  isRendering,
  error,
  loadDocument,
  renderPage,
  goToPage,
  nextPage,
  prevPage,
  setZoomMode,
  zoomIn,
  zoomOut,
  destroy,
} = usePdfRenderer({
  containerRef,
  onDocumentLoad: (doc) => {
    console.log('Loaded:', doc.title, doc.numPages, 'pages');
    highlights.setDocumentId(doc.id);
  },
  onError: (err) => console.error('PDF error:', err),
});

const highlights = usePdfHighlights();

// Re-render when page or scale changes
watch([currentPage, scale], async () => {
  if (canvasRef.value && document.value) {
    await renderPage({
      canvas: canvasRef.value,
      textLayerContainer: textLayerRef.value ?? undefined,
      scale: scale.value,
    });
  }
});

async function handleFileDrop(file: File) {
  await loadDocument(file);
}

onBeforeUnmount(() => {
  destroy();
});
</script>

<template>
  <div ref="containerRef" class="pdf-container">
    <div v-if="isLoading" class="loading">Loading PDF...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="document" class="pdf-viewer">
      <!-- Navigation -->
      <div class="toolbar">
        <button @click="prevPage" :disabled="currentPage === 1">Prev</button>
        <span>{{ currentPage }} / {{ totalPages }}</span>
        <button @click="nextPage" :disabled="currentPage === totalPages">Next</button>
        <button @click="zoomOut">-</button>
        <button @click="zoomIn">+</button>
      </div>

      <!-- Page -->
      <div class="page-wrapper">
        <canvas ref="canvasRef" />
        <div ref="textLayerRef" class="text-layer" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.pdf-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: auto;
}

.page-wrapper {
  position: relative;
}

.text-layer {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: auto;
}
</style>
```

### Adding Highlights

```typescript
import { usePdfHighlights } from '@web/composables/usePdfHighlights';

const { addHighlight, getHighlightsForPage, removeHighlight } = usePdfHighlights({
  documentId: 'abc123',
  onHighlightsChange: (hl) => console.log('Highlights updated:', hl.length),
});

// Add a highlight from text selection
function handleTextSelection() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;

  const text = selection.toString().trim();
  if (!text) return;

  const range = selection.getRangeAt(0);
  const rects = Array.from(range.getClientRects()).map((rect) => ({
    x: rect.x / scale,
    y: rect.y / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  }));

  const highlight = addHighlight({
    text,
    pageNumber: currentPage.value,
    rects,
    color: 'yellow',
  });

  selection.removeAllRanges();
  console.log('Created highlight:', highlight.id);
}

// Render highlights for current page
function renderPageHighlights() {
  const pageHighlights = getHighlightsForPage(currentPage.value);
  for (const hl of pageHighlights) {
    // Render each highlight.position.rects at scale
  }
}
```

### Sending to Chat

```typescript
import { usePdfChatIntegration } from '@web/composables/usePdfChatIntegration';

const { sendSelectionToChat, sendHighlightsToChat, sendDocumentSummary, copyTextToClipboard } =
  usePdfChatIntegration({
    document,
    highlights: highlights.highlights,
    currentPage,
    onClearSelection: () => window.getSelection()?.removeAllRanges(),
  });

// Send current selection to chat
function askAiAboutSelection() {
  const selection = window.getSelection()?.toString().trim();
  if (!selection) return;

  sendSelectionToChat(
    {
      text: selection,
      pageNumber: currentPage.value,
    },
    {
      clearSelection: true,
      showNotification: true,
    }
  );
}

// Send all highlights as context
function sendAllHighlights() {
  sendHighlightsToChat();
}

// Generate document summary
async function summarizeDocument() {
  const firstPageText = await getPageText(1);
  sendDocumentSummary(firstPageText);
}
```

### Thumbnail Navigation

```vue
<script setup lang="ts">
import { usePdfNavigation } from '@web/composables/usePdfNavigation';
import { usePdfRenderer } from '@web/composables/usePdfRenderer';

const renderer = usePdfRenderer();

const {
  thumbnails,
  sidebarOpen,
  toggleSidebar,
  generateThumbnail,
  observeThumbnail,
  unobserveThumbnail,
  navigateToPage,
  cleanupObserver,
} = usePdfNavigation({
  currentPage: renderer.currentPage,
  totalPages: renderer.totalPages,
  renderThumbnail: renderer.renderThumbnail,
  onNavigate: (page) => renderer.goToPage(page),
});

function onThumbnailMount(el: HTMLElement, pageNumber: number) {
  observeThumbnail(el, pageNumber);
}

function onThumbnailUnmount(el: HTMLElement) {
  unobserveThumbnail(el);
}
</script>

<template>
  <aside v-if="sidebarOpen" class="thumbnail-sidebar">
    <div
      v-for="thumb in thumbnails"
      :key="thumb.pageNumber"
      :ref="(el) => el && onThumbnailMount(el as HTMLElement, thumb.pageNumber)"
      class="thumbnail"
      :class="{ active: thumb.pageNumber === currentPage }"
      @click="navigateToPage(thumb.pageNumber)"
    >
      <img v-if="thumb.dataUrl" :src="thumb.dataUrl" :alt="`Page ${thumb.pageNumber}`" />
      <div v-else-if="thumb.isLoading" class="loading">...</div>
      <div v-else class="placeholder">{{ thumb.pageNumber }}</div>
    </div>
  </aside>
</template>
```

---

## File Reference

| File                                                                    | Lines | Purpose                                           |
| ----------------------------------------------------------------------- | ----- | ------------------------------------------------- |
| [usePdfRenderer.ts](../web/composables/usePdfRenderer.ts)               | 683   | Core PDF.js wrapper, canvas rendering, text layer |
| [usePdfNavigation.ts](../web/composables/usePdfNavigation.ts)           | 363   | Thumbnail generation, sidebar, lazy loading       |
| [usePdfChatIntegration.ts](../web/composables/usePdfChatIntegration.ts) | 301   | Chat API integration, selection formatting        |
| [usePdfHighlights.ts](../web/composables/usePdfHighlights.ts)           | 379   | Highlight CRUD, localStorage persistence          |
| [types/pdf.ts](../web/types/pdf.ts)                                     | 213   | Type definitions, storage keys, color constants   |
| [services/pdf.ts](../web/services/pdf.ts)                               | 376   | Chat transcript PDF export (jsPDF)                |

---

## Reference Mapping

| Doc Claim                       | Source of Truth          | Location                      |
| ------------------------------- | ------------------------ | ----------------------------- |
| Document ID generation          | `generateDocumentId()`   | `usePdfRenderer.ts:106-125`   |
| Zoom constants (MIN, MAX, STEP) | Constants at top         | `usePdfRenderer.ts:47-54`     |
| Zoom presets array              | `ZOOM_PRESETS`           | `usePdfRenderer.ts:57`        |
| Scale calculation               | `calculateScale()`       | `usePdfRenderer.ts:163-199`   |
| Text layer positioning          | `renderTextLayer()`      | `usePdfRenderer.ts:425-504`   |
| Thumbnail dimensions            | `DEFAULT_THUMBNAIL_SIZE` | `usePdfNavigation.ts:77-80`   |
| Preload radius                  | `DEFAULT_PRELOAD_RADIUS` | `usePdfNavigation.ts:83`      |
| IntersectionObserver options    | `setupObserver()`        | `usePdfNavigation.ts:256-276` |
| Highlight ID format             | `generateHighlightId()`  | `usePdfHighlights.ts:17-19`   |
| Storage key format              | `PDF_STORAGE_KEYS`       | `types/pdf.ts:195-200`        |
| Highlight colors (RGBA)         | `HIGHLIGHT_COLORS`       | `types/pdf.ts:203-210`        |
| PDF export layout               | `LAYOUT`                 | `services/pdf.ts:46-58`       |
| Worker URL setup                | Module-level config      | `usePdfRenderer.ts:38-39`     |

---

## Changelog

- **v1.0** - Initial PDF system with renderer, navigation, highlights, and chat integration
- **v1.1** - Added thumbnail lazy loading with IntersectionObserver
- **v1.2** - Added highlight annotations and export functionality
- **v1.3** - Added PDF export service for chat transcripts
- **v1.4** - Documentation created following template

---

_Last verified: 2026-02-23_
