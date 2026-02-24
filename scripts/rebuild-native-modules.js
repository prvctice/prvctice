#!/usr/bin/env node
/**
 * Rebuild native Node modules for Electron.
 *
 * Problem: @electron/rebuild often skips modules that have prebuilt binaries,
 * even when those binaries are for the wrong Node.js ABI version.
 *
 * Solution: Delete prebuilds/build directories first, then use prebuild-install
 * with explicit Electron runtime target, falling back to node-gyp if needed.
 *
 * Run: npm run desktop:rebuild
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const NATIVE_MODULES = ['better-sqlite3'];

function getElectronVersion() {
  try {
    const electronPkg = require('electron/package.json');
    return electronPkg.version;
  } catch {
    console.error('Electron not found. Install it first: npm install electron');
    process.exit(1);
  }
}

function rebuildModule(moduleName, electronVersion) {
  const modulePath = path.join(__dirname, '..', 'node_modules', moduleName);

  if (!fs.existsSync(modulePath)) {
    console.log(`  ⏭ ${moduleName} not installed, skipping`);
    return;
  }

  console.log(`  ◆ Rebuilding ${moduleName} for Electron ${electronVersion}...`);

  // Step 1: Clean existing builds to force a fresh rebuild
  const buildDir = path.join(modulePath, 'build');
  const prebuildsDir = path.join(modulePath, 'prebuilds');

  if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true });
    console.log(`    Cleaned build/`);
  }
  if (fs.existsSync(prebuildsDir)) {
    fs.rmSync(prebuildsDir, { recursive: true });
    console.log(`    Cleaned prebuilds/`);
  }

  // Step 2: Try prebuild-install first (downloads precompiled Electron binary)
  const prebuildResult = spawnSync(
    'npx',
    ['prebuild-install', '--runtime', 'electron', '--target', electronVersion],
    { cwd: modulePath, stdio: 'pipe', shell: true }
  );

  if (prebuildResult.status === 0) {
    console.log(`    ✓ Installed Electron prebuild`);
    return;
  }

  // Step 3: Fall back to compiling from source with node-gyp
  console.log(`    Prebuild not available, compiling from source...`);

  const env = {
    ...process.env,
    npm_config_runtime: 'electron',
    npm_config_target: electronVersion,
    npm_config_disturl: 'https://electronjs.org/headers',
  };

  // Check if module has a build-release script
  const pkgPath = path.join(modulePath, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  if (pkg.scripts && pkg.scripts['build-release']) {
    const buildResult = spawnSync('npm', ['run', 'build-release'], {
      cwd: modulePath,
      env,
      stdio: 'inherit',
      shell: true,
    });

    if (buildResult.status === 0) {
      console.log(`    ✓ Built from source`);
      return;
    }
  }

  // Last resort: direct node-gyp rebuild
  const gypResult = spawnSync('npx', ['node-gyp', 'rebuild'], {
    cwd: modulePath,
    env,
    stdio: 'inherit',
    shell: true,
  });

  if (gypResult.status === 0) {
    console.log(`    ✓ Built with node-gyp`);
  } else {
    console.error(`    ✗ Failed to rebuild ${moduleName}`);
    process.exit(1);
  }
}

function main() {
  const electronVersion = getElectronVersion();
  console.log(`\nRebuilding native modules for Electron ${electronVersion}\n`);

  for (const moduleName of NATIVE_MODULES) {
    rebuildModule(moduleName, electronVersion);
  }

  console.log(`\n✓ Native modules rebuilt for Electron\n`);
}

main();
