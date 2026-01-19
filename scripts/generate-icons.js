#!/usr/bin/env node

/**
 * Generate PNG icons from SVG for PWA
 *
 * This script requires the 'sharp' package:
 *   npm install sharp --save-dev
 *
 * Then run:
 *   node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');

async function generateIcons() {
  try {
    // Try to load sharp
    const sharp = require('sharp');

    const svgPath = path.join(__dirname, '../public/icon.svg');
    const svg = fs.readFileSync(svgPath);

    const sizes = [192, 512];

    for (const size of sizes) {
      const outputPath = path.join(__dirname, `../public/icon-${size}.png`);

      await sharp(svg)
        .resize(size, size)
        .png()
        .toFile(outputPath);

      console.log(`Generated: icon-${size}.png`);
    }

    console.log('Icon generation complete!');
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      console.log('Sharp module not found. Installing...');
      console.log('Run: npm install sharp --save-dev');
      console.log('Then: node scripts/generate-icons.js');

      // Create simple fallback placeholder PNGs using base64
      console.log('\nCreating placeholder icons instead...');
      createPlaceholderIcons();
    } else {
      console.error('Error:', err.message);
    }
  }
}

function createPlaceholderIcons() {
  // Simple 1x1 purple pixel as base64 PNG - this is just a placeholder
  // The actual icons should be generated from the SVG
  const placeholder = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAD/wH8F5a8+gAAAABJRU5ErkJggg==',
    'base64'
  );

  fs.writeFileSync(path.join(__dirname, '../public/icon-192.png'), placeholder);
  fs.writeFileSync(path.join(__dirname, '../public/icon-512.png'), placeholder);

  console.log('Created placeholder icons. For proper icons:');
  console.log('1. Install sharp: npm install sharp --save-dev');
  console.log('2. Run: node scripts/generate-icons.js');
  console.log('Or manually convert public/icon.svg to PNG at 192x192 and 512x512');
}

generateIcons();
