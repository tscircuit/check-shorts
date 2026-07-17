import { convertCircuitJsonToPcbSvg } from "circuit-to-svg";
import type { AnyCircuitElement, LayerRef } from "circuit-json";
import type { BitmapShort } from "./bitmap-short-detector";
import { getBoardBounds } from "./bitmap-geometry";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const getNumberAttribute = (
  svgElement: string,
  name: string,
): number | null => {
  const match = svgElement.match(new RegExp(`(?:^|\\s)${name}="([^"]+)"`));
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
};

const getPcbBoundaryRect = (svg: string): Rect | null => {
  const match = svg.match(/<rect\b[^>]*class="pcb-boundary"[^>]*>/);
  const element = match?.[0];
  if (!element) return null;

  const x = getNumberAttribute(element, "x");
  const y = getNumberAttribute(element, "y");
  const width = getNumberAttribute(element, "width");
  const height = getNumberAttribute(element, "height");
  if (x === null || y === null || width === null || height === null) {
    return null;
  }

  return { x, y, width, height };
};

const getSvgPoint = (
  circuitJson: AnyCircuitElement[],
  baseSvg: string,
  point: { x: number; y: number },
): { x: number; y: number } => {
  const bounds = getBoardBounds(circuitJson);
  const rect = getPcbBoundaryRect(baseSvg);

  if (!rect) {
    const boardWidth = bounds.maxX - bounds.minX;
    const boardHeight = bounds.maxY - bounds.minY;
    const scale = Math.min(700 / boardWidth, 500 / boardHeight);
    const center = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    };

    return {
      x: 400 + (point.x - center.x) * scale,
      y: 300 - (point.y - center.y) * scale,
    };
  }

  return {
    x:
      rect.x +
      ((point.x - bounds.minX) / (bounds.maxX - bounds.minX)) * rect.width,
    y:
      rect.y +
      ((bounds.maxY - point.y) / (bounds.maxY - bounds.minY)) * rect.height,
  };
};

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const shortMarkerStroke = "#9b5cff";

export const createShortDebugSvg = (
  circuitJson: AnyCircuitElement[],
  shorts: BitmapShort[],
  options: { layer?: LayerRef } = {},
): string => {
  const shortLayers = new Set(shorts.map((short) => short.layer));
  const layer =
    options.layer ??
    (shortLayers.size === 1 ? ([...shortLayers][0] as LayerRef) : undefined);
  const baseSvg = convertCircuitJsonToPcbSvg(circuitJson, { layer });
  const seenShortCenters = new Set<string>();
  const overlays = shorts
    .filter((short) => {
      const key = `${short.center.x.toFixed(3)}:${short.center.y.toFixed(3)}`;
      if (seenShortCenters.has(key)) return false;
      seenShortCenters.add(key);
      return true;
    })
    .map((short, index) => {
      const point = getSvgPoint(circuitJson, baseSvg, short.center);
      const firstLabel = short.firstOwnerLabels.join(", ");
      const secondLabel = short.secondOwnerLabels.join(", ");
      const text = `SHORT ${index + 1}: ${firstLabel} <-> ${secondLabel}`;

      return `
  <g data-type="short-debug" data-mode="${escapeXml(short.mode)}" data-layer="${escapeXml(short.layer)}">
    <title>${escapeXml(text)}</title>
    <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="12" fill="none" stroke="${shortMarkerStroke}" stroke-width="3" stroke-opacity="0.65"/>
    <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4" fill="${shortMarkerStroke}" fill-opacity="0.4"/>
    <line x1="${(point.x - 16).toFixed(2)}" y1="${point.y.toFixed(2)}" x2="${(point.x + 16).toFixed(2)}" y2="${point.y.toFixed(2)}" stroke="${shortMarkerStroke}" stroke-width="3" stroke-opacity="0.65"/>
    <line x1="${point.x.toFixed(2)}" y1="${(point.y - 16).toFixed(2)}" x2="${point.x.toFixed(2)}" y2="${(point.y + 16).toFixed(2)}" stroke="${shortMarkerStroke}" stroke-width="3" stroke-opacity="0.65"/>
  </g>`;
    })
    .join("");

  return baseSvg.replace("</svg>", `${overlays}\n</svg>`);
};
