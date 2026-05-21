const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ICON_COLOR = [99, 102, 241, 255];
const ICON_SIZES = [16, 48, 128];
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = makeCrcTable();

function makeCrcTable() {
  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i += 1) {
    let crc = i;

    for (let j = 0; j < 8; j += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }

    table[i] = crc >>> 0;
  }

  return table;
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const lengthBuffer = Buffer.alloc(4);
  const crcBuffer = Buffer.alloc(4);
  const crcInput = Buffer.concat([typeBuffer, data]);

  lengthBuffer.writeUInt32BE(data.length, 0);
  crcBuffer.writeUInt32BE(crc32(crcInput), 0);

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function createPng(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowLength = 1 + width * 4;
  const rawPixels = Buffer.alloc(rowLength * height);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowLength;
    rawPixels[rowStart] = 0;

    for (let x = 0; x < width; x += 1) {
      const pixelStart = rowStart + 1 + x * 4;
      rawPixels[pixelStart] = ICON_COLOR[0];
      rawPixels[pixelStart + 1] = ICON_COLOR[1];
      rawPixels[pixelStart + 2] = ICON_COLOR[2];
      rawPixels[pixelStart + 3] = ICON_COLOR[3];
    }
  }

  const idat = zlib.deflateSync(rawPixels);

  return Buffer.concat([
    PNG_SIGNATURE,
    createChunk("IHDR", ihdr),
    createChunk("IDAT", idat),
    createChunk("IEND", Buffer.alloc(0))
  ]);
}

function main() {
  const iconsDir = path.join(__dirname, "icons");
  fs.mkdirSync(iconsDir, { recursive: true });

  for (const size of ICON_SIZES) {
    const iconPath = path.join(iconsDir, `icon${size}.png`);
    fs.writeFileSync(iconPath, createPng(size, size));
  }
}

main();
