import type { Bounds } from "@tscircuit/math-utils";
import type { AnyCircuitElement, LayerRef } from "circuit-json";
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg";
import { getBoardBounds } from "./bitmap-geometry";
import type { BitmapShort, ShortDebugSvgOptions } from "./bitmap-short-types";

export type { ShortDebugSvgOptions } from "./bitmap-short-types";

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
  const raw = match?.[1];
  if (!raw) return null;
  const value = Number(raw);
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

const formatShortOverlayTitle = (short: BitmapShort, index: number): string => {
  const firstNet = short.firstNetName || short.firstConnectivityKey;
  const secondNet = short.secondNetName || short.secondConnectivityKey;
  const firstDetail =
    short.firstWitnessPath.length > 0
      ? short.firstWitnessPath.join(" -> ")
      : short.firstInvolvedPrimitives.length > 0
        ? short.firstInvolvedPrimitives.map((p) => p.label).join(", ")
        : short.firstOwnerLabels.slice(0, 6).join(", ");
  const secondDetail =
    short.secondWitnessPath.length > 0
      ? short.secondWitnessPath.join(" -> ")
      : short.secondInvolvedPrimitives.length > 0
        ? short.secondInvolvedPrimitives.map((p) => p.label).join(", ")
        : short.secondOwnerLabels.slice(0, 6).join(", ");

  if (
    firstNet &&
    secondNet &&
    (firstNet !== firstDetail || secondNet !== secondDetail)
  ) {
    return `SHORT ${index + 1}: ${firstNet} <-> ${secondNet} (${firstDetail} <-> ${secondDetail})`;
  }

  return `SHORT ${index + 1}: ${firstDetail} <-> ${secondDetail}`;
};

const computeShortCropRect = ({
  circuitJson,
  baseSvg,
  shorts,
  svgWidth,
  svgHeight,
  paddingMm,
  minSpanMm,
}: {
  circuitJson: AnyCircuitElement[];
  baseSvg: string;
  shorts: BitmapShort[];
  svgWidth: number;
  svgHeight: number;
  paddingMm: number;
  minSpanMm: number;
}): Rect => {
  let merged: Bounds | null = null;

  for (const short of shorts) {
    const b: Bounds =
      short.bounds &&
      Number.isFinite(short.bounds.minX) &&
      Number.isFinite(short.bounds.maxX) &&
      Number.isFinite(short.bounds.minY) &&
      Number.isFinite(short.bounds.maxY)
        ? short.bounds
        : {
            minX: short.center.x,
            maxX: short.center.x,
            minY: short.center.y,
            maxY: short.center.y,
          };

    merged = merged
      ? {
          minX: Math.min(merged.minX, b.minX),
          maxX: Math.max(merged.maxX, b.maxX),
          minY: Math.min(merged.minY, b.minY),
          maxY: Math.max(merged.maxY, b.maxY),
        }
      : { ...b };
  }

  if (!merged) {
    return { x: 0, y: 0, width: svgWidth, height: svgHeight };
  }

  let minX = merged.minX - paddingMm;
  let maxX = merged.maxX + paddingMm;
  let minY = merged.minY - paddingMm;
  let maxY = merged.maxY + paddingMm;

  if (maxX - minX < minSpanMm) {
    const midX = (minX + maxX) / 2;
    minX = midX - minSpanMm / 2;
    maxX = midX + minSpanMm / 2;
  }
  if (maxY - minY < minSpanMm) {
    const midY = (minY + maxY) / 2;
    minY = midY - minSpanMm / 2;
    maxY = midY + minSpanMm / 2;
  }

  const topLeft = getSvgPoint(circuitJson, baseSvg, { x: minX, y: maxY });
  const bottomRight = getSvgPoint(circuitJson, baseSvg, { x: maxX, y: minY });

  let cropW = Math.max(1, Math.abs(bottomRight.x - topLeft.x));
  let cropH = Math.max(1, Math.abs(bottomRight.y - topLeft.y));
  const centerX = (topLeft.x + bottomRight.x) / 2;
  const centerY = (topLeft.y + bottomRight.y) / 2;

  const targetAspect = svgWidth / svgHeight;
  if (cropW / cropH < targetAspect) {
    cropW = cropH * targetAspect;
  } else {
    cropH = cropW / targetAspect;
  }

  if (cropW >= svgWidth || cropH >= svgHeight) {
    return { x: 0, y: 0, width: svgWidth, height: svgHeight };
  }

  const x = Math.max(0, Math.min(svgWidth - cropW, centerX - cropW / 2));
  const y = Math.max(0, Math.min(svgHeight - cropH, centerY - cropH / 2));

  return { x, y, width: cropW, height: cropH };
};

const getTransformedRectBounds = (elementTag: string): Bounds | null => {
  const x = getNumberAttribute(elementTag, "x");
  const y = getNumberAttribute(elementTag, "y");
  const width = getNumberAttribute(elementTag, "width");
  const height = getNumberAttribute(elementTag, "height");
  if (x === null || y === null || width === null || height === null) {
    return null;
  }

  const corners = [
    { x, y },
    { x: x + width, y },
    { x, y: y + height },
    { x: x + width, y: y + height },
  ];

  const matrixMatch = elementTag.match(/transform="matrix\(([^)]+)\)"/);
  const matrixRaw = matrixMatch?.[1];
  const mappedCorners = matrixRaw
    ? (() => {
        const values = matrixRaw.split(/[,\s]+/).map((v) => Number(v));
        if (values.length !== 6 || values.some((v) => !Number.isFinite(v))) {
          return null;
        }
        const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = values;
        return corners.map((pt) => ({
          x: a * pt.x + c * pt.y + e,
          y: b * pt.x + d * pt.y + f,
        }));
      })()
    : corners;

  if (!mappedCorners) return null;

  return {
    minX: Math.min(...mappedCorners.map((pt) => pt.x)),
    maxX: Math.max(...mappedCorners.map((pt) => pt.x)),
    minY: Math.min(...mappedCorners.map((pt) => pt.y)),
    maxY: Math.max(...mappedCorners.map((pt) => pt.y)),
  };
};

const pruneOffViewportResvgHazards = (
  svg: string,
  cropRect: Rect,
  svgWidth: number,
  svgHeight: number,
): string => {
  const pxScaleX = svgWidth / cropRect.width;
  const pxScaleY = svgHeight / cropRect.height;

  // resvg 2.6 panics on <rect mask="url(#...)"> when its clipped viewport
  // intersection rounds to 0px, and on cross-viewport marker arrowheads.
  return svg
    .replace(/<rect\b[^>]*\smask="url\(#[^"]+\)"[^>]*\/>/g, (rectTag) => {
      const box = getTransformedRectBounds(rectTag);
      if (!box) return "";
      const overlapW =
        Math.min(box.maxX, cropRect.x + cropRect.width) -
        Math.max(box.minX, cropRect.x);
      const overlapH =
        Math.min(box.maxY, cropRect.y + cropRect.height) -
        Math.max(box.minY, cropRect.y);
      if (overlapW * pxScaleX < 2 || overlapH * pxScaleY < 2) {
        return "";
      }
      return rectTag;
    })
    .replace(/\smarker-(?:start|end|mid)="[^"]*"/g, "");
};

const applySvgViewBox = (
  svg: string,
  cropRect: Rect,
  svgWidth: number,
  svgHeight: number,
): string => {
  const viewBoxValue = `${cropRect.x.toFixed(2)} ${cropRect.y.toFixed(2)} ${cropRect.width.toFixed(2)} ${cropRect.height.toFixed(2)}`;
  const sanitizedSvg = pruneOffViewportResvgHazards(
    svg,
    cropRect,
    svgWidth,
    svgHeight,
  );
  return sanitizedSvg.replace(/^<svg\b[^>]*>/, (rootTag) => {
    if (/\sviewBox="[^"]*"/.test(rootTag)) {
      return rootTag.replace(/\sviewBox="[^"]*"/, ` viewBox="${viewBoxValue}"`);
    }
    return `${rootTag.slice(0, -1)} viewBox="${viewBoxValue}" data-cropped="true">`;
  });
};

export const createShortDebugSvg = (
  circuitJson: AnyCircuitElement[],
  shorts: BitmapShort[],
  options: ShortDebugSvgOptions = {},
): string => {
  const shortLayers = new Set(shorts.map((short) => short.layer));
  const layer =
    options.layer ??
    (shortLayers.size === 1 ? ([...shortLayers][0] as LayerRef) : undefined);
  const baseSvg = convertCircuitJsonToPcbSvg(circuitJson, { layer });

  const rootMatch = baseSvg.match(/^<svg\b[^>]*>/);
  const svgWidth =
    (rootMatch ? getNumberAttribute(rootMatch[0], "width") : null) ?? 800;
  const svgHeight =
    (rootMatch ? getNumberAttribute(rootMatch[0], "height") : null) ?? 600;

  const shouldCrop = Boolean(options.crop && shorts.length > 0);
  const cropRect = shouldCrop
    ? computeShortCropRect({
        circuitJson,
        baseSvg,
        shorts,
        svgWidth,
        svgHeight,
        paddingMm: options.paddingMm ?? 1.5,
        minSpanMm: options.minSpanMm ?? 2.4,
      })
    : null;
  const zoomScale = cropRect ? cropRect.width / svgWidth : 1;

  const outerRadius = shouldCrop ? (14 * zoomScale).toFixed(2) : "14";
  const outerStroke = shouldCrop ? (4 * zoomScale).toFixed(2) : "4";
  const innerRadius = shouldCrop ? (6 * zoomScale).toFixed(2) : "6";
  const innerStroke = shouldCrop ? (3 * zoomScale).toFixed(2) : "3";

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
      const text = formatShortOverlayTitle(short, index);
      const firstNet = short.firstNetName || short.firstConnectivityKey;
      const secondNet = short.secondNetName || short.secondConnectivityKey;
      const netAttrs =
        firstNet && secondNet
          ? ` data-first-net="${escapeXml(firstNet)}" data-second-net="${escapeXml(secondNet)}"`
          : "";

      return `
  <g data-type="short-debug" data-mode="${escapeXml(short.mode)}" data-layer="${escapeXml(short.layer)}"${netAttrs}>
    <title>${escapeXml(text)}</title>
    <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${outerRadius}" fill="none" stroke="${shortMarkerStroke}" stroke-width="${outerStroke}"/>
    <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${innerRadius}" fill="none" stroke="${shortMarkerStroke}" stroke-width="${innerStroke}"/>
  </g>`;
    })
    .join("");

  const svgWithOverlays = baseSvg.replace("</svg>", `${overlays}\n</svg>`);
  return cropRect
    ? applySvgViewBox(svgWithOverlays, cropRect, svgWidth, svgHeight)
    : svgWithOverlays;
};

export const createCroppedShortDebugSvg = (
  circuitJson: AnyCircuitElement[],
  shorts: BitmapShort[],
  options: Omit<ShortDebugSvgOptions, "crop"> = {},
): string =>
  createShortDebugSvg(circuitJson, shorts, { ...options, crop: true });
