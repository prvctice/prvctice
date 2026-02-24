/// <reference types="vite/client" />

// Vite asset imports with ?url suffix
declare module '*?url' {
  const src: string;
  export default src;
}

// Specific module declaration for pdfjs-dist worker
declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const workerUrl: string;
  export default workerUrl;
}
