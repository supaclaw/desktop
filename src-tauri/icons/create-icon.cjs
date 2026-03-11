// Creates a minimal valid 16x16 icon.ico for Tauri Windows build
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname);
const outPath = path.join(dir, 'icon.ico');

// ICO header (6 bytes): reserved 0,0 type 1,0 count 1,0
const header = Buffer.from([0, 0, 1, 0, 1, 0]);
// ICONDIRENTRY (16 bytes): 16x16, 0 colors, 0 reserved, 1 plane, 32 bpp, size 1064, offset 22
const entry = Buffer.alloc(16);
entry[0] = 16; entry[1] = 16; entry[2] = 0; entry[3] = 0;
entry[4] = 1; entry[5] = 0; entry[6] = 32; entry[7] = 0;
entry.writeUInt32LE(1064, 8);   // size of image data
entry.writeUInt32LE(22, 12);   // offset to image data

// BITMAPINFOHEADER (40 bytes) for 16x16 32bpp
const dib = Buffer.alloc(40);
dib.writeUInt32LE(40, 0);   // header size
dib.writeInt32LE(16, 4);    // width
dib.writeInt32LE(16, 8);    // height (16 for 32bpp with alpha, no AND mask)
dib.writeUInt16LE(1, 12);   // planes
dib.writeUInt16LE(32, 14);  // bit count
dib.writeUInt32LE(0, 16);   // compression
dib.writeUInt32LE(1024, 20); // image size
dib.writeInt32LE(0, 24); dib.writeInt32LE(0, 28); dib.writeUInt32LE(0, 32); dib.writeUInt32LE(0, 36);

// 16x16 32bpp pixels (BGRA, bottom-up), 1024 bytes - simple gray
const pixels = Buffer.alloc(1024);
for (let i = 0; i < 1024; i += 4) {
  pixels[i] = 128;     // B
  pixels[i + 1] = 128; // G
  pixels[i + 2] = 128; // R
  pixels[i + 3] = 255; // A
}

const ico = Buffer.concat([header, entry, dib, pixels]);
fs.writeFileSync(outPath, ico);
console.log('Created', outPath);
