/**
 * generate-icons.js
 * Generates PWA icons (192x192 and 512x512) as valid PNG files.
 * Uses raw PNG binary encoding with Node.js built-in `zlib` — no external deps needed.
 *
 * Icon design: traffic light silhouette
 *   - Dark background (#1a1a1a)
 *   - Dark gray rectangle (traffic light housing)
 *   - Red circle (top light)
 *   - Dark circles (middle and bottom lights, unlit)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/**
 * Writes a 4-byte big-endian unsigned integer into a Buffer at given offset.
 */
function writeUInt32BE(buf, value, offset) {
  buf[offset]     = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8)  & 0xff;
  buf[offset + 3] =  value         & 0xff;
}

/**
 * Computes CRC-32 of a Buffer.
 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Builds a PNG chunk: length(4) + type(4) + data(N) + crc(4)
 */
function makePngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  writeUInt32BE(len, data.length, 0);
  const crcBuf = Buffer.concat([typeBytes, data]);
  const crcVal = Buffer.alloc(4);
  writeUInt32BE(crcVal, crc32(crcBuf), 0);
  return Buffer.concat([len, typeBytes, data, crcVal]);
}

/**
 * Builds the IHDR chunk for an RGBA image.
 */
function makeIHDR(width, height) {
  const data = Buffer.alloc(13);
  writeUInt32BE(data, width,  0);
  writeUInt32BE(data, height, 4);
  data[8]  = 8;  // bit depth
  data[9]  = 2;  // color type: RGB (truecolor)
  data[10] = 0;  // compression method
  data[11] = 0;  // filter method
  data[12] = 0;  // interlace method
  return makePngChunk('IHDR', data);
}

/**
 * Generates raw RGB pixel data for a traffic light icon.
 * Returns a Buffer of width*height*3 bytes (R,G,B per pixel).
 */
function generatePixels(size) {
  const pixels = Buffer.alloc(size * size * 3);

  // Colors
  const BG       = [0x1a, 0x1a, 0x1a]; // dark background
  const HOUSING  = [0x33, 0x33, 0x33]; // dark gray housing rectangle
  const RED_ON   = [0xff, 0x00, 0x00]; // red (top light — active)
  const UNLIT    = [0x22, 0x22, 0x22]; // almost-black unlit circles

  // Housing rectangle: centered, occupies ~50% width, ~75% height
  const hx1 = Math.floor(size * 0.25);
  const hx2 = Math.floor(size * 0.75);
  const hy1 = Math.floor(size * 0.10);
  const hy2 = Math.floor(size * 0.90);

  // Three circles: evenly spaced vertically inside housing
  // Radius ~13% of size
  const radius = Math.floor(size * 0.13);
  const cx = Math.floor(size * 0.50); // horizontal center
  const cy1 = Math.floor(size * 0.27); // top light (red)
  const cy2 = Math.floor(size * 0.50); // middle light (unlit)
  const cy3 = Math.floor(size * 0.73); // bottom light (unlit)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 3;
      let color = BG;

      // Inside housing rectangle?
      if (x >= hx1 && x < hx2 && y >= hy1 && y < hy2) {
        color = HOUSING;
      }

      // Top circle (red)
      const d1sq = (x - cx) ** 2 + (y - cy1) ** 2;
      if (d1sq <= radius * radius) {
        color = RED_ON;
      }

      // Middle circle (unlit)
      const d2sq = (x - cx) ** 2 + (y - cy2) ** 2;
      if (d2sq <= radius * radius) {
        color = UNLIT;
      }

      // Bottom circle (unlit)
      const d3sq = (x - cx) ** 2 + (y - cy3) ** 2;
      if (d3sq <= radius * radius) {
        color = UNLIT;
      }

      pixels[idx]     = color[0];
      pixels[idx + 1] = color[1];
      pixels[idx + 2] = color[2];
    }
  }

  return pixels;
}

/**
 * Builds the IDAT chunk from raw pixel data.
 * Applies PNG filter byte 0 (None) at the start of each scanline.
 */
function makeIDAT(size, pixels) {
  // Build filtered scanlines: each row prefixed with filter byte 0x00
  const scanlines = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const rowOffset = y * (1 + size * 3);
    scanlines[rowOffset] = 0x00; // filter type: None
    pixels.copy(scanlines, rowOffset + 1, y * size * 3, (y + 1) * size * 3);
  }
  const compressed = zlib.deflateSync(scanlines, { level: 9 });
  return makePngChunk('IDAT', compressed);
}

/**
 * Assembles a complete PNG file buffer.
 */
function buildPng(size) {
  const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr  = makeIHDR(size, size);
  const pixels = generatePixels(size);
  const idat  = makeIDAT(size, pixels);
  const iend  = makePngChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([PNG_SIGNATURE, ihdr, idat, iend]);
}

// Generate and write icon files
const iconsDir = path.join(__dirname, 'icons');

const sizes = [192, 512];
for (const size of sizes) {
  const outPath = path.join(iconsDir, `icon-${size}.png`);
  const png = buildPng(size);
  fs.writeFileSync(outPath, png);
  console.log(`Generated ${outPath} (${png.length} bytes)`);
}

console.log('Done.');
