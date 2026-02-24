import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';

// Ensure CommonJS `require` is available inside this ESM config file.
const require = createRequire(import.meta.url);
const pkg = require('./package.json');

// Dev helper: spawn the Express/Socket.IO backend when Vite runs standalone.

function startBackendOnDev() {
  let child;
  return {
    name: 'start-backend',
    configureServer() {
      if (child) return;
      // Only spawn when vite is started in serve mode
      child = spawn('npx', ['tsx', 'src/server.ts'], {
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'development' },
      });

      const closeBackend = () => {
        if (child && !child.killed) {
          child.kill('SIGTERM');
        }
      };

      process.on('exit', closeBackend);
      process.on('SIGINT', closeBackend);
      process.on('SIGTERM', closeBackend);
    },
  };
}

// Serve `public/` in dev; build to `dist/`.

export default defineConfig({
  // Expose app version from package.json at build time
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __API_BASE__: JSON.stringify(process.env.VITE_API_BASE || ''),
  },
  // Serve index from project/public; disable Vite's special publicDir handling
  // so modules inside this folder (e.g. /main.js) are transformed rather than
  // served raw. This avoids the bare import error for "vue" in dev.
  root: 'public',
  publicDir: false,
  // Use relative paths for built assets
  base: process.env.ELECTRON_BUILD ? './' : '/research/',
  build: {
    // Target modern environments to support top-level await in modules
    target: 'esnext',
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Manual chunks for better code splitting
        manualChunks: {
          // Core Vue framework
          'vue-vendor': ['vue', 'pinia'],
          // Heavy 3D library - lazy loaded
          'three-vendor': ['three'],
          // Socket.io for real-time
          'socket-vendor': ['socket.io-client'],
          // Markdown and sanitization
          'markdown-vendor': ['marked', 'dompurify'],
          // Rich text editor
          'editor-vendor': ['@tiptap/vue-3', '@tiptap/starter-kit'],
          // PDF rendering and generation
          'pdf-vendor': ['jspdf', 'pdfjs-dist'],
          // Virtual scroller
          'scroller-vendor': ['virtua'],
        },
      },
    },
  },
  esbuild: {
    target: 'esnext',
    supported: { 'top-level-await': true },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
      supported: { 'top-level-await': true },
    },
    // Do not prebundle WebGPU renderer files — serve them as native ESM
    exclude: [
      'three/examples/jsm/renderers/webgpu/WebGPURenderer.js',
      'three/examples/jsm/renderers/webgpu/WebGPUBackend.js',
      'three/examples/jsm/renderers/webgpu/nodes/*',
    ],
  },
  server: {
    // default host/port (omit host to allow OS to choose IPv4/IPv6)
    port: 5173,
    strictPort: true,
    open: true,
    proxy: {
      // Tunnel Socket.io requests to the Node backend that actually hosts it.
      // This keeps existing front-end code unchanged (`/socket.io/...`).
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:3000',
      },
      '/chat': {
        target: 'http://localhost:3000',
      },
    },
  },
  resolve: {
    alias: {
      '@web': path.resolve(__dirname, 'web'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  // Custom plugins: auto-spawn backend in dev and copy a few legacy assets.

  plugins: [
    // Enable Vue SFC support
    vue({
      template: {
        compilerOptions: {
          // Treat Iconify web component as a custom element
          isCustomElement: (tag) => tag === 'iconify-icon',
        },
      },
    }),
    // Auto-spawn back-end in dev
    startBackendOnDev(),

    // Copy legacy static assets referenced directly by HTML/JS.
    {
      name: 'copy-static-folders',
      async writeBundle() {
        const fromTo = [
          {
            from: path.resolve(__dirname, 'public/fonts'),
            to: path.resolve(__dirname, 'dist/fonts'),
          },
          {
            from: path.resolve(__dirname, 'public/scripts'),
            to: path.resolve(__dirname, 'dist/scripts'),
          },
          {
            from: path.resolve(__dirname, 'public/model'),
            to: path.resolve(__dirname, 'dist/model'),
          },
          {
            from: path.resolve(__dirname, 'public/voice-commands.md'),
            to: path.resolve(__dirname, 'dist/voice-commands.md'),
          },
          {
            from: path.resolve(__dirname, 'public/images'),
            to: path.resolve(__dirname, 'dist/images'),
          },
          {
            from: path.resolve(__dirname, 'public/sw.js'),
            to: path.resolve(__dirname, 'dist/sw.js'),
          },
          {
            from: path.resolve(__dirname, 'public/manifest.json'),
            to: path.resolve(__dirname, 'dist/manifest.json'),
          },
        ];

        // Try to load terser for JS minification; fall back to raw copy
        let terserMinify = null;
        try {
          const terser = await import('terser');
          terserMinify = terser.minify;
        } catch {}

        async function ensureDir(p) {
          await fs.mkdir(p, { recursive: true });
        }
        async function copyFileWithMinify(src, dest) {
          try {
            if (terserMinify && src.endsWith('.js')) {
              const code = await fs.readFile(src, 'utf8');
              const out = await terserMinify(code, { compress: true, mangle: true });
              await ensureDir(path.dirname(dest));
              await fs.writeFile(dest, out.code || code, 'utf8');
              return;
            }
          } catch {}
          await ensureDir(path.dirname(dest));
          await fs.copyFile(src, dest);
        }
        async function copyRec(src, dest) {
          const stat = await fs.stat(src);
          if (stat.isDirectory()) {
            await ensureDir(dest);
            const entries = await fs.readdir(src);
            for (const name of entries) {
              await copyRec(path.join(src, name), path.join(dest, name));
            }
          } else {
            await copyFileWithMinify(src, dest);
          }
        }

        for (const { from, to } of fromTo) {
          try {
            await fs.stat(from);
            await copyRec(from, to);
          } catch {}
        }
      },
    },
  ],
});
