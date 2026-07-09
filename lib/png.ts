import { deflateSync } from "zlib";
import type {
  BitmapShortDebugLegendEntry,
  BitmapShortDebugRender,
} from "./bitmap-short-detector";

const crcTable = new Uint32Array(256);

for (let i = 0; i < crcTable.length; i++) {
  let crc = i;
  for (let bit = 0; bit < 8; bit++) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  crcTable[i] = crc >>> 0;
}

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const writeUInt32 = (value: number): Uint8Array => {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, value);
  return bytes;
};

const concatBytes = (chunks: Uint8Array[]): Uint8Array => {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
};

const textEncoder = new TextEncoder();

const createChunk = (type: string, data: Uint8Array): Uint8Array => {
  const typeBytes = textEncoder.encode(type);
  const crcInput = concatBytes([typeBytes, data]);

  return concatBytes([
    writeUInt32(data.length),
    typeBytes,
    data,
    writeUInt32(crc32(crcInput)),
  ]);
};

export const encodeRgbaPng = ({
  width,
  height,
  rgba,
}: {
  width: number;
  height: number;
  rgba: Uint8Array;
}): Uint8Array => {
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width);
  headerView.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;

  const scanlines = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const scanlineOffset = y * (width * 4 + 1);
    scanlines[scanlineOffset] = 0;
    scanlines.set(
      rgba.subarray(y * width * 4, (y + 1) * width * 4),
      scanlineOffset + 1,
    );
  }

  return concatBytes([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    createChunk("IHDR", header),
    createChunk("IDAT", deflateSync(scanlines, { level: 1 })),
    createChunk("IEND", new Uint8Array()),
  ]);
};

const glyphs: Record<string, string[]> = {
  " ": ["000", "000", "000", "000", "000"],
  ".": ["0", "0", "0", "0", "1"],
  ":": ["0", "1", "0", "1", "0"],
  _: ["000", "000", "000", "000", "111"],
  "-": ["000", "000", "111", "000", "000"],
  ">": ["100", "010", "001", "010", "100"],
  "/": ["001", "001", "010", "100", "100"],
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  A: ["010", "101", "111", "101", "101"],
  B: ["110", "101", "110", "101", "110"],
  C: ["011", "100", "100", "100", "011"],
  D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "110", "100", "111"],
  F: ["111", "100", "110", "100", "100"],
  G: ["011", "100", "101", "101", "011"],
  H: ["101", "101", "111", "101", "101"],
  I: ["111", "010", "010", "010", "111"],
  J: ["001", "001", "001", "101", "111"],
  K: ["101", "101", "110", "101", "101"],
  L: ["100", "100", "100", "100", "111"],
  M: ["101", "111", "111", "101", "101"],
  N: ["101", "111", "111", "111", "101"],
  O: ["111", "101", "101", "101", "111"],
  P: ["111", "101", "111", "100", "100"],
  Q: ["111", "101", "101", "111", "001"],
  R: ["110", "101", "110", "101", "101"],
  S: ["111", "100", "111", "001", "111"],
  T: ["111", "010", "010", "010", "010"],
  U: ["101", "101", "101", "101", "111"],
  V: ["101", "101", "101", "101", "010"],
  W: ["101", "101", "111", "111", "101"],
  X: ["101", "101", "010", "101", "101"],
  Y: ["101", "101", "010", "010", "010"],
  Z: ["111", "001", "010", "100", "111"],
};

const setPixel = (
  rgba: Uint8Array,
  width: number,
  x: number,
  y: number,
  color: [number, number, number],
) => {
  const offset = (y * width + x) * 4;
  rgba[offset] = color[0];
  rgba[offset + 1] = color[1];
  rgba[offset + 2] = color[2];
  rgba[offset + 3] = 255;
};

const fillRect = ({
  rgba,
  width,
  x,
  y,
  rectWidth,
  rectHeight,
  color,
}: {
  rgba: Uint8Array;
  width: number;
  x: number;
  y: number;
  rectWidth: number;
  rectHeight: number;
  color: [number, number, number];
}) => {
  for (let yy = y; yy < y + rectHeight; yy++) {
    for (let xx = x; xx < x + rectWidth; xx++) {
      setPixel(rgba, width, xx, yy, color);
    }
  }
};

const drawText = ({
  rgba,
  width,
  x,
  y,
  text,
  color,
  scale = 2,
}: {
  rgba: Uint8Array;
  width: number;
  x: number;
  y: number;
  text: string;
  color: [number, number, number];
  scale?: number;
}) => {
  let cursorX = x;

  for (const char of text.toUpperCase()) {
    const glyph = glyphs[char] ?? glyphs[" "]!;

    for (let gy = 0; gy < glyph.length; gy++) {
      const row = glyph[gy]!;
      for (let gx = 0; gx < row.length; gx++) {
        if (row[gx] !== "1") continue;
        fillRect({
          rgba,
          width,
          x: cursorX + gx * scale,
          y: y + gy * scale,
          rectWidth: scale,
          rectHeight: scale,
          color,
        });
      }
    }

    cursorX += (glyph[0]!.length + 1) * scale;
  }
};

const getLegendLabel = (entry: BitmapShortDebugLegendEntry): string => {
  const labels =
    entry.labels.length > 0 ? entry.labels.join(",") : entry.connectivityKey;
  return labels.length > 36 ? `${labels.slice(0, 33)}...` : labels;
};

export const appendBitmapLegend = (
  debugRender: BitmapShortDebugRender,
): BitmapShortDebugRender => {
  const rowHeight = 18;
  const legendRows = Math.max(1, debugRender.legend.length + 2);
  const legendHeight = legendRows * rowHeight + 8;
  const width = debugRender.width;
  const height = debugRender.height + legendHeight;
  const rgba = new Uint8Array(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    setPixel(rgba, width, i % width, Math.floor(i / width), [255, 255, 255]);
  }

  for (let y = 0; y < debugRender.height; y++) {
    rgba.set(
      debugRender.rgba.subarray(
        y * debugRender.width * 4,
        (y + 1) * debugRender.width * 4,
      ),
      y * width * 4,
    );
  }

  const legendY = debugRender.height + 8;
  drawText({
    rgba,
    width,
    x: 10,
    y: legendY,
    text: "LEGEND",
    color: [0, 0, 0],
  });
  drawText({
    rgba,
    width,
    x: 96,
    y: legendY,
    text: "RED:SHORT MARKER ORANGE:PORT BLACK:UNASSIGNED",
    color: [0, 0, 0],
  });

  debugRender.legend.forEach((entry, index) => {
    const y = legendY + rowHeight * (index + 1);
    fillRect({
      rgba,
      width,
      x: 10,
      y,
      rectWidth: 14,
      rectHeight: 10,
      color: entry.color,
    });
    drawText({
      rgba,
      width,
      x: 32,
      y,
      text: getLegendLabel(entry),
      color: [0, 0, 0],
    });
  });

  return { ...debugRender, width, height, rgba };
};
