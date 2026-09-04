import { deflateSync } from "node:zlib";
import { decode } from "fast-png";
import {
  glyphAdvanceRatio,
  glyphWidthRatio,
  spaceWidthRatio,
  strokeWidthRatio,
  svgAlphabet,
} from "@tscircuit/alphabet";
import type {
  BitmapShortDebugLegendEntry,
  BitmapShortDebugRender,
} from "./bitmap-short-detector";
import { renderSvgToPng } from "./svg-to-png";

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

const markerLegend = [
  { color: "#ff00ff", label: "Short marker" },
  { color: "#ffa500", label: "PCB port" },
  { color: "#000000", label: "Unassigned" },
] as const;

const getGlyphAdvance = (character: string): number =>
  glyphAdvanceRatio[character] ??
  (character === " " ? spaceWidthRatio : glyphWidthRatio);

const getAlphabetTextWidth = (text: string, size: number): number => {
  let width = 0;
  for (const character of text) {
    width += getGlyphAdvance(character) * size;
  }
  return width;
};

export const getLegendLabel = (
  entry: BitmapShortDebugLegendEntry,
  maxWidth: number,
  size = 16,
): string => {
  const label =
    entry.labels.length > 0 ? entry.labels.join(",") : entry.connectivityKey;
  if (getAlphabetTextWidth(label, size) <= maxWidth) return label;

  const ellipsis = "...";
  let fittedLabel = "";
  let fittedWidth = getAlphabetTextWidth(ellipsis, size);

  if (fittedWidth > maxWidth) return "";

  for (const character of label) {
    const characterWidth = getGlyphAdvance(character) * size;
    if (fittedWidth + characterWidth > maxWidth) break;
    fittedLabel += character;
    fittedWidth += characterWidth;
  }

  return `${fittedLabel}${ellipsis}`;
};

const createAlphabetTextSvg = ({
  text,
  x,
  top,
  size,
  maxWidth,
}: {
  text: string;
  x: number;
  top: number;
  size: number;
  maxWidth?: number;
}): string => {
  let cursorX = 0;
  const paths: string[] = [];

  for (const character of text) {
    const path = svgAlphabet[character as keyof typeof svgAlphabet];
    if (path) {
      paths.push(`<path d="${path}" transform="translate(${cursorX} 0)"/>`);
    }
    cursorX += getGlyphAdvance(character);
  }

  const renderedSize =
    maxWidth === undefined || cursorX === 0
      ? size
      : Math.min(size, maxWidth / cursorX);

  // Alphabet paths start around y=0.24, so offset the normalized glyph space
  // to make `top` the visible top edge of each line.
  return `<g fill="none" stroke="#111" stroke-width="${strokeWidthRatio}" stroke-linecap="round" stroke-linejoin="round" transform="translate(${x} ${top - 0.24 * renderedSize}) scale(${renderedSize})">${paths.join("")}</g>`;
};

const createBitmapLegendSvg = ({
  width,
  height,
  legend,
}: {
  width: number;
  height: number;
  legend: BitmapShortDebugLegendEntry[];
}): string => {
  const headerHeight = 26;
  const rowHeight = 20;
  const rows = [
    ...markerLegend.map(
      (entry, index) => `
    <rect x="10" y="${headerHeight + index * rowHeight + 3}" width="14" height="10" rx="1" fill="${entry.color}"/>
    ${createAlphabetTextSvg({
      text: entry.label,
      x: 32,
      top: headerHeight + index * rowHeight + 2,
      size: 16,
      maxWidth: width - 42,
    })}`,
    ),
    ...legend.map((entry, index) => {
      const labelMaxWidth = width - 42;
      const labelSize = 16;
      return `
    <rect x="10" y="${headerHeight + (markerLegend.length + index) * rowHeight + 3}" width="14" height="10" rx="1" fill="rgb(${entry.color.join(",")})"/>
    ${createAlphabetTextSvg({
      text: getLegendLabel(entry, labelMaxWidth, labelSize),
      x: 32,
      top: headerHeight + (markerLegend.length + index) * rowHeight + 2,
      size: labelSize,
      maxWidth: labelMaxWidth,
    })}`;
    }),
  ].join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="white"/>
  ${createAlphabetTextSvg({ text: "Legend", x: 10, top: 4, size: 15 })}${rows}
</svg>`;
};

export const appendBitmapLegend = (
  debugRender: BitmapShortDebugRender,
): BitmapShortDebugRender => {
  const legendHeight =
    34 + (markerLegend.length + debugRender.legend.length) * 20;
  const width = debugRender.width;
  const height = debugRender.height + legendHeight;
  const rgba = new Uint8Array(width * height * 4);

  for (let y = 0; y < debugRender.height; y++) {
    rgba.set(
      debugRender.rgba.subarray(
        y * debugRender.width * 4,
        (y + 1) * debugRender.width * 4,
      ),
      y * width * 4,
    );
  }
  const legendPng = decode(
    renderSvgToPng(
      createBitmapLegendSvg({
        width,
        height: legendHeight,
        legend: debugRender.legend,
      }),
    ),
  );
  if (
    legendPng.width !== width ||
    legendPng.height !== legendHeight ||
    legendPng.channels !== 4 ||
    legendPng.depth !== 8
  ) {
    throw new Error("Unable to render bitmap debug legend");
  }
  rgba.set(legendPng.data, debugRender.height * width * 4);

  return { ...debugRender, width, height, rgba };
};
