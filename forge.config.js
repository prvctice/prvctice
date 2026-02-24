const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
// Ensure env vars from .env are available during packaging/make
try {
  require('dotenv').config();
} catch {}

// Read package metadata to keep bundle identity stable across releases
const pkg = require('./package.json');
// Use a single, stable name and bundle identifier. Do not allow env overrides,
// as that can break auto-update by changing the app bundle name or id.
const APP_NAME = (pkg.build && pkg.build.productName) || 'Prvctice';
const APP_BUNDLE_ID = (pkg.build && pkg.build.appId) || 'com.prvctice.app';

const { execSync } = require('child_process');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const ICON_DIR = path.join(__dirname, 'electron', 'assets');
const ICON_BASE = path.join(ICON_DIR, 'icon');
const ICONSET_DIR = path.join(ICON_DIR, 'icon.iconset');
const ICON_ICNS = `${ICON_BASE}.icns`;
const ICON_PNG = `${ICON_BASE}.png`;
const DESKTOP_ENV_PATH = path.join(__dirname, 'src', 'config', 'desktop-env.json');
const APP_UPDATE_YML_PATH = path.join(__dirname, 'app-update.yml');
const DESKTOP_ENV_KEYS = ['AUTO_UPDATE_BASE_URL', 'PRVCTICE_API_URL'];

function writeMacUpdateManifest(zipPath, version) {
  const artifactName = path.basename(zipPath);
  const manifestPath = path.join(path.dirname(zipPath), 'latest-mac.yml');
  try {
    const data = fs.readFileSync(zipPath);
    const hash = crypto.createHash('sha512').update(data).digest('base64');
    const stats = fs.statSync(zipPath);
    const manifest = [
      `version: ${version}`,
      'files:',
      `  - url: ${artifactName}`,
      `    sha512: ${hash}`,
      `    size: ${stats.size}`,
      `path: ${artifactName}`,
      `sha512: ${hash}`,
      `releaseDate: ${new Date().toISOString()}`,
    ].join('\n');
    fs.writeFileSync(manifestPath, `${manifest}\n`, 'utf8');
    console.log(`[auto-update] wrote ${manifestPath}`);
  } catch (err) {
    console.warn(`[auto-update] Failed to write manifest for ${zipPath}:`, err?.message || err);
  }
}

function writeDesktopEnvConfig() {
  try {
    const payload = {};
    for (const key of DESKTOP_ENV_KEYS) {
      const value = process.env[key];
      if (value) payload[key] = value;
    }
    if (!Object.keys(payload).length) {
      if (fs.existsSync(DESKTOP_ENV_PATH)) {
        fs.unlinkSync(DESKTOP_ENV_PATH);
      }
      console.log('[auto-update] No desktop env overrides to embed.');
      return;
    }
    fs.writeFileSync(DESKTOP_ENV_PATH, JSON.stringify(payload, null, 2));
    console.log(
      `[auto-update] Embedded desktop env keys: ${Object.keys(payload)
        .map((k) => `${k}=…`)
        .join(', ')}`
    );
  } catch (err) {
    console.warn('[auto-update] Failed to write desktop env config:', err?.message || err);
  }
}

// Write app-update.yml for electron-updater (required even with setFeedURL)
function writeAppUpdateYml() {
  const baseUrl = process.env.AUTO_UPDATE_BASE_URL;
  if (!baseUrl) {
    console.log('[auto-update] Skipping app-update.yml (AUTO_UPDATE_BASE_URL not set)');
    if (fs.existsSync(APP_UPDATE_YML_PATH)) {
      fs.unlinkSync(APP_UPDATE_YML_PATH);
    }
    return;
  }
  try {
    const yml = [
      'provider: generic',
      `url: ${baseUrl}`,
      `updaterCacheDirName: ${pkg.name}-updater`,
    ].join('\n');
    fs.writeFileSync(APP_UPDATE_YML_PATH, `${yml}\n`, 'utf8');
    console.log(`[auto-update] Wrote ${APP_UPDATE_YML_PATH}`);
  } catch (err) {
    console.warn('[auto-update] Failed to write app-update.yml:', err?.message || err);
  }
}

module.exports = {
  packagerConfig: {
    // Override default app name and bundle identifier
    name: APP_NAME,
    executableName: APP_NAME,
    appBundleId: APP_BUNDLE_ID,
    // Use custom icons stored outside the node-gyp build directory
    icon: ICON_BASE,
    asar: true,
    // Ensure native addons are unpacked from the ASAR so Node can dlopen them
    asarUnpack: ['**/*.node', 'build/Release/*.node'],
    // Extend Info.plist for microphone and speech recognition permissions
    extendInfo: path.join(__dirname, 'electron', 'Info.plist'),
    // Include app-update.yml in Resources for electron-updater
    extraResource: [APP_UPDATE_YML_PATH],
    osxSign: {
      hardenedRuntime: true,
      entitlements: path.join(__dirname, 'electron', 'entitlements.mac.plist'),
      entitlementsInherit: path.join(__dirname, 'electron', 'entitlements.mac.plist'),
      // Optional: force a specific signing identity (e.g.,
      // 'Developer ID Application: Your Name (TEAMID)') via env var
      identity: process.env.APPLE_SIGN_IDENTITY,
    },
    // Use electron-packager's built-in notarization support. Prefer notarytool.
    // Configure via either Apple ID + app-specific password or App Store Connect API key.
    osxNotarize: (() => {
      if (process.platform !== 'darwin') return undefined;
      // If a notarytool keychain profile exists, prefer it (no plaintext creds)
      if (process.env.APPLE_KEYCHAIN_PROFILE) {
        return {
          tool: 'notarytool',
          keychainProfile: process.env.APPLE_KEYCHAIN_PROFILE,
        };
      }
      // Prefer App Store Connect API key if provided
      if (
        process.env.APPLE_API_KEY &&
        process.env.APPLE_API_KEY_ID &&
        process.env.APPLE_API_ISSUER
      ) {
        return {
          tool: 'notarytool',
          teamId: process.env.APPLE_TEAM_ID,
          appleApiKey: {
            key: process.env.APPLE_API_KEY, // path to AuthKey_XXXX.p8
            keyId: process.env.APPLE_API_KEY_ID,
            issuerId: process.env.APPLE_API_ISSUER,
          },
        };
      }
      // Fallback to Apple ID + app-specific password
      if (process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD) {
        return {
          tool: 'notarytool',
          teamId: process.env.APPLE_TEAM_ID,
          appleId: process.env.APPLE_ID,
          appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
        };
      }
      // Notarization disabled unless credentials are supplied via env vars.
      return undefined;
    })(),
    // Exclude development-only and server-side files from the packaged app
    ignore: [
      // Dotenv and variants
      /(^|\/)\.env(\..*)?$/,
      // Local uploads/logs/tests/coverage
      /(^|\/)uploads\//,
      /(^|\/)logs\//,
      /(^|\/)tests\//,
      /(^|\/)coverage\//,
      /(^|\/)blobs\//,
      // public/ is redundant - assets are bundled into dist/ by Vite
      /(^|\/)public\//,
      // TypeScript types not needed at runtime (root types/ only, not node_modules/*/lib/types/)
      /^\/types\//,
      // Server-only source files
      /(^|\/)src\/server\.js$/,
      /(^|\/)src\/app\.js$/,
      /(^|\/)src\/socket\.js$/,
      /(^|\/)src\/routes\//,
      /(^|\/)src\/services\//,
      // Development files not needed in production
      /(^|\/)\.github\//,
      /(^|\/)\.husky\//,
      /(^|\/)\.vscode\//,
      /(^|\/)\.claude\//,
      /(^|\/)archive\//,
      /(^|\/)docs\//,
      /^\/scripts\//,
      /(^|\/)web\//,
      /\.md$/,
      /\.rtf$/,
      // Config files not needed at runtime
      /tsconfig.*\.json$/,
      /vite\.config\./,
      /eslint\./,
      /prettier\./,
      /stylelint\./,
      // Server-only dependencies (not used in Electron main process)
      /node_modules\/googleapis/,
      /node_modules\/@google\/generative-ai/,
      /node_modules\/@google\/genai/,
      /node_modules\/googleapis-common/,
      /node_modules\/google-auth-library/,
      /node_modules\/gtoken/,
      /node_modules\/gaxios/,
      // Frontend dependencies already bundled by Vite into dist/
      /node_modules\/vue($|\/)/,
      /node_modules\/@vue\//,
      /node_modules\/three($|\/)/,
      /node_modules\/jspdf($|\/)/,
      /node_modules\/html2canvas/,
      /node_modules\/canvg/,
      /node_modules\/@tiptap\//,
      /node_modules\/prosemirror/,
      /node_modules\/@floating-ui/,
      /node_modules\/markdown-it/,
      /node_modules\/@motionone\//,
      /node_modules\/vue-virtual-scroller/,
      /node_modules\/iconify-icon/,
      /node_modules\/marked($|\/)/,
      /node_modules\/dompurify/,
      /node_modules\/pinia($|\/)/,
      /node_modules\/socket\.io-client/,
      /node_modules\/socket\.io($|\/)/,
      /node_modules\/engine\.io($|\/)/,
      /node_modules\/engine\.io-client/,
      /node_modules\/es-module-shims/,
      /node_modules\/sql\.js/,
      /node_modules\/axios($|\/)/,
      // AI SDKs (server-side only) and their dependencies
      /node_modules\/@anthropic-ai/,
      /node_modules\/openai($|\/)/,
      /node_modules\/@openrouter/,
      /node_modules\/zod($|\/)/,
      // Server-side monitoring (prom-client and deps)
      /node_modules\/prom-client/,
      /node_modules\/bintrees/,
      /node_modules\/tdigest/,
      // Polyfills and dev tooling not needed at runtime
      /node_modules\/core-js/,
      /node_modules\/@babel\//,
      /node_modules\/@types\//,
      /node_modules\/typescript/,
      /node_modules\/csstype/,
      /node_modules\/postcss($|\/)/,
      /node_modules\/ts-algebra/,
      /node_modules\/json-schema-to-ts/,
      /node_modules\/prebuild-install/,
      // Large transitive deps not needed
      /node_modules\/web-streams-polyfill/,
      /node_modules\/@opentelemetry\//,
      // Dev dependencies that should never be packaged
      /node_modules\/c8($|\/)/,
      // pdfjs-dist legacy folder (16MB) - for old browsers, not needed in Electron
      /node_modules\/pdfjs-dist\/legacy/,
      // @napi-rs/canvas (25MB) - server-side canvas, not needed when Electron provides real DOM
      /node_modules\/@napi-rs\/canvas/,
      // better-sqlite3 build artifacts and source deps (not needed at runtime, ~24MB saved)
      /node_modules\/better-sqlite3\/deps/,
      /node_modules\/better-sqlite3\/build\/Release\/obj/,
      /node_modules\/better-sqlite3\/build\/Release\/sqlite3\.a/,
      /node_modules\/better-sqlite3\/src/,
      // Build artifacts from native module compilation
      /^\/build\//,
    ],
  },
  rebuildConfig: {},
  // We only ship macOS dmg builds – remove other targets to speed up CI.
  makers: [
    {
      name: '@electron-forge/maker-dmg',
      config: {
        // Use custom background for the DMG window. Keep this OUT of the
        // project-root "build" directory because node-gyp cleans that folder
        // when rebuilding native addons. Store it under electron/ instead.
        background: path.join(__dirname, 'electron', 'dmgBackground.png'),
        icon: ICON_ICNS,
        title: APP_NAME,
        iconSize: 184,
        contents: [
          {
            x: 192,
            y: 190,
            type: 'file',
            // DMG will reference the packaged .app; path includes dynamic arch
            path: path.join(
              __dirname,
              'out',
              `${APP_NAME}-darwin-${process.arch}`,
              `${APP_NAME}.app`
            ),
          },
          { x: 606, y: 190, type: 'link', path: '/Applications' },
        ],
      },
    },
    {
      name: '@electron-forge/maker-zip',
      // No auto-update metadata; we just produce a plain ZIP
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  // Generate native app icons before packaging
  hooks: {
    prePackage: () => {
      const { execSync } = require('child_process');
      const root = __dirname;
      execSync(`mkdir -p "${ICON_DIR}"`);
      writeDesktopEnvConfig();
      writeAppUpdateYml();

      // Ensure the optimised front-end is available inside the packaged app.
      // We do this *before* the icon generation so that any build failures are
      // surfaced quickly.
      try {
        console.log('Building web assets…');
        execSync('ELECTRON_BUILD=true npm run web:build', { stdio: 'inherit' });
      } catch (err) {
        console.error('\nFailed to build web assets. Aborting package.');
        throw err;
      }

      // If a previously compiled native addon exists it will be picked up from
      // build/Release and unpacked (see asarUnpack). We do not force a rebuild
      // here to avoid breaking packaging on machines without a full Xcode toolchain.
      // Use an existing high-resolution icon for macOS
      const src = path.join(root, 'public', 'images', 'icon-512x512.png');
      execSync(`rm -rf "${ICONSET_DIR}" && mkdir -p "${ICONSET_DIR}"`);
      [16, 32, 64, 128, 256, 512].forEach((size) => {
        execSync(`sips -Z ${size} "${src}" --out "${ICONSET_DIR}/icon_${size}x${size}.png"`);
        execSync(`sips -Z ${size * 2} "${src}" --out "${ICONSET_DIR}/icon_${size}x${size}@2x.png"`);
      });
      execSync(`iconutil -c icns "${ICONSET_DIR}" -o "${ICON_ICNS}"`);
      execSync(`cp "${src}" "${ICON_PNG}"`);
    },
    // osxSign handles signing with entitlements and hardened runtime - no manual re-signing needed
    // After artifacts are made, sign/notarize/staple the DMG so Gatekeeper trusts it
    postMake: async (_forgeConfig, results) => {
      if (process.platform !== 'darwin') return;
      try {
        const dmgs = [];
        const apps = [];
        const zips = [];
        for (const r of results) {
          if (r.platform !== 'darwin') continue;
          for (const art of r.artifacts || []) {
            if (art.endsWith('.dmg')) dmgs.push(art);
            if (art.endsWith('.app')) apps.push(art);
            if (art.endsWith('.zip')) zips.push(art);
          }
        }
        const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

        // Staple apps (already notarized by osxNotarize)
        for (const app of apps) {
          try {
            run(`xcrun stapler staple "${app}"`);
          } catch {}
        }

        // Sign, notarize, and staple DMGs
        const identity = process.env.APPLE_SIGN_IDENTITY;
        const appleId = process.env.APPLE_ID;
        const appPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
        const teamId = process.env.APPLE_TEAM_ID;
        const keychainProfile = process.env.APPLE_KEYCHAIN_PROFILE;

        for (const dmg of dmgs) {
          // Step 1: Sign the DMG
          if (identity) {
            console.log(`[postMake] Signing DMG: ${dmg}`);
            try {
              run(`codesign --force --sign "${identity}" "${dmg}"`);
              console.log('[postMake] DMG signed successfully');
            } catch (err) {
              console.warn('[postMake] DMG signing failed:', err?.message || err);
              continue;
            }
          } else {
            console.warn('[postMake] Skipping DMG signing - APPLE_SIGN_IDENTITY not set');
            continue;
          }

          // Step 2: Notarize the DMG
          let notarizeCmd;
          let notarizeStdin;
          if (keychainProfile) {
            notarizeCmd = `xcrun notarytool submit "${dmg}" --keychain-profile "${keychainProfile}" --wait --output-format json`;
          } else if (appleId && appPassword && teamId) {
            // Pass password via stdin to avoid exposing it in process listing
            notarizeCmd = `xcrun notarytool submit "${dmg}" --apple-id "${appleId}" --password @- --team-id "${teamId}" --wait --output-format json`;
            notarizeStdin = appPassword;
          }

          if (notarizeCmd) {
            console.log(`[postMake] Notarizing DMG: ${dmg}`);
            try {
              const execOpts = { encoding: 'utf8' };
              if (notarizeStdin) execOpts.input = notarizeStdin;
              const output = execSync(notarizeCmd, execOpts);
              const result = JSON.parse(output);
              if (result.status !== 'Accepted') {
                console.error(`[postMake] DMG notarization rejected: ${result.status}`);
                console.error(
                  `[postMake] Check logs with: xcrun notarytool log ${result.id} --apple-id ... --password ... --team-id ...`
                );
                continue;
              }
              console.log('[postMake] DMG notarized successfully');
            } catch (err) {
              console.warn('[postMake] DMG notarization failed:', err?.message || err);
              continue;
            }
          } else {
            console.warn('[postMake] Skipping DMG notarization - credentials not set');
            continue;
          }

          // Step 3: Staple the notarization ticket
          console.log(`[postMake] Stapling DMG: ${dmg}`);
          try {
            run(`xcrun stapler staple "${dmg}"`);
            console.log('[postMake] DMG stapled successfully');
          } catch (err) {
            console.warn('[postMake] DMG stapling failed:', err?.message || err);
          }
        }

        for (const zip of zips) {
          writeMacUpdateManifest(zip, pkg.version);
        }
      } catch (e) {
        console.warn('Post-make processing failed:', e?.message || e);
      }
    },
  },
};
