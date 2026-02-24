#!/usr/bin/env node
/**
 * Generate PWA and touch icons from a single source image.
 * Place your source image at public/images/icon-source.png before running.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

(async () => {
  const rootDir = path.resolve(__dirname, '..');
  const srcPath = path.join(rootDir, 'public', 'images', 'icon-source.png');
  if (!fs.existsSync(srcPath)) {
    console.error(`Error: Source image not found at ${srcPath}`);
    console.error("Please place your icon file there and name it 'icon-source.png'.");
    process.exit(1);
  }
  const outDir = path.join(rootDir, 'public', 'images');
  fs.mkdirSync(outDir, { recursive: true });

  // PWA icon sizes
  const pwaSizes = [72, 96, 128, 144, 152, 192, 384, 512];
  for (const size of pwaSizes) {
    const outPath = path.join(outDir, `icon-${size}x${size}.png`);
    await sharp(srcPath).resize(size, size).toFile(outPath);
    console.log(`Saved PWA icon: ${outPath}`);
  }

  // Apple touch icon sizes
  const appleSizes = [120, 152, 167, 180];
  for (const size of appleSizes) {
    const outPath = path.join(outDir, `apple-touch-icon-${size}x${size}.png`);
    await sharp(srcPath).resize(size, size).toFile(outPath);
    console.log(`Saved Apple touch icon: ${outPath}`);
  }

  // Favicon (.ico) sizes
  const faviconSizes = [16, 32, 48];
  const tmpDir = path.join(__dirname, '.tmp-icons');
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpPaths = [];
  for (const size of faviconSizes) {
    const tmpPath = path.join(tmpDir, `favicon-${size}x${size}.png`);
    await sharp(srcPath).resize(size, size).toFile(tmpPath);
    tmpPaths.push(tmpPath);
  }
  try {
    const icoBuffer = await pngToIco(tmpPaths);
    const faviconPath = path.join(rootDir, 'public', 'favicon.ico');
    fs.writeFileSync(faviconPath, icoBuffer);
    console.log(`Saved favicon: ${faviconPath}`);
  } catch (err) {
    console.error('Error generating favicon.ico:', err);
  }

  // Cleanup temporary files
  for (const p of tmpPaths) {
    try {
      fs.unlinkSync(p);
    } catch {}
  }
  try {
    fs.rmdirSync(tmpDir);
  } catch {}
})();
