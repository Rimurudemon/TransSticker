const fs = require('fs');
const path = require('path');

// Simple PNG generator - creates solid color PNG files
function createPNG(width, height, r, g, b) {
  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR chunk
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0); // length
  ihdr.write('IHDR', 4);
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr.writeUInt8(8, 16); // bit depth
  ihdr.writeUInt8(2, 17); // color type (RGB)
  ihdr.writeUInt8(0, 18); // compression
  ihdr.writeUInt8(0, 19); // filter
  ihdr.writeUInt8(0, 20); // interlace
  
  // Calculate CRC for IHDR
  const ihdrCrc = crc32(ihdr.slice(4, 21));
  ihdr.writeUInt32BE(ihdrCrc, 21);
  
  // Create raw image data (uncompressed for simplicity)
  const rawData = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0); // filter byte
    for (let x = 0; x < width; x++) {
      rawData.push(r, g, b);
    }
  }
  
  // Compress with zlib
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(Buffer.from(rawData));
  
  // IDAT chunk
  const idatData = Buffer.concat([Buffer.from('IDAT'), compressed]);
  const idat = Buffer.alloc(8 + idatData.length);
  idat.writeUInt32BE(compressed.length, 0);
  idatData.copy(idat, 4);
  const idatCrc = crc32(idatData);
  idat.writeUInt32BE(idatCrc, 4 + idatData.length);
  
  // IEND chunk
  const iend = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]);
  
  return Buffer.concat([signature, ihdr, idat, iend]);
}

// CRC32 implementation
function crc32(data) {
  let crc = 0xFFFFFFFF;
  const table = new Uint32Array(256);
  
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

const assetsDir = path.join(__dirname, 'assets');

// Purple color: #6C63FF = RGB(108, 99, 255)
const r = 108, g = 99, b = 255;

// Create assets
console.log('Creating placeholder assets...');

fs.writeFileSync(
  path.join(assetsDir, 'icon.png'),
  createPNG(1024, 1024, r, g, b)
);
console.log('✓ Created icon.png (1024x1024)');

fs.writeFileSync(
  path.join(assetsDir, 'adaptive-icon.png'),
  createPNG(1024, 1024, r, g, b)
);
console.log('✓ Created adaptive-icon.png (1024x1024)');

fs.writeFileSync(
  path.join(assetsDir, 'splash.png'),
  createPNG(1284, 2778, r, g, b)
);
console.log('✓ Created splash.png (1284x2778)');

fs.writeFileSync(
  path.join(assetsDir, 'favicon.png'),
  createPNG(48, 48, r, g, b)
);
console.log('✓ Created favicon.png (48x48)');

console.log('\nAll placeholder assets created successfully!');
console.log('Note: Replace these with your actual app icons before publishing.');
