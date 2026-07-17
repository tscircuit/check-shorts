import { cju, getBoundsOfPcbElements } from "@tscircuit/circuit-json-util";
import type { AnyCircuitElement, LayerRef } from "circuit-json";
import {
  boundsIntersection,
  clamp,
  getBoundsFromPoints,
  type Bounds,
  type Point,
} from "@tscircuit/math-utils";
import { getFullConnectivityMapFromCircuitJson } from "circuit-json-to-connectivity-map";
import {
  buildConnectivityGroups,
  type CopperElement,
  getUniqueOwnerLabels,
} from "./bitmap-copper-groups";
import {
  buildBitmapLegend,
  getDebugColorForConnectivityKey,
  overlayPcbPortMarkers,
  overlayShortMarkers,
  setRgbaPixel,
} from "./bitmap-debug-overlay";
import { getBoardBounds, getRealPointFromPixel } from "./bitmap-geometry";
import { assertGerberLayerCanBeGenerated } from "./gerber-layer";
import { createGerberGroupMask } from "./gerber-mask";
import { createPcbGroupMask } from "./pcb-mask";
import type {
  BitmapShort,
  BitmapShortDebugRender,
  FindBitmapShortsOptions,
} from "./bitmap-short-types";

export type {
  BitmapShort,
  BitmapShortDebugLegendEntry,
  BitmapShortDebugRender,
  FindBitmapShortsOptions,
} from "./bitmap-short-types";

interface ShortPixelGroup {
  mode: "pcb" | "gerber";
  layer: LayerRef;
  firstConnectivityKey: string;
  secondConnectivityKey: string;
  pixels: number[];
  firstOwnerLabels: string[];
  secondOwnerLabels: string[];
}

interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BitmapMask {
  rect: PixelRect;
  mask: Uint8Array;
}

type PcbBoardElement = Extract<AnyCircuitElement, { type: "pcb_board" }>;

const COPPER_POUR_PAINT_PRIORITY = 1;
const OTHER_COPPER_PAINT_PRIORITY = 2;

const includePointInBounds = (
  bounds: Bounds | null,
  point: { x: number; y: number },
  margin = 0,
): Bounds =>
  mergeBounds(bounds, {
    minX: point.x - margin,
    maxX: point.x + margin,
    minY: point.y - margin,
    maxY: point.y + margin,
  })!;

const mergeBounds = (
  first: Bounds | null,
  second: Bounds | null,
): Bounds | null => {
  if (!first) return second;
  if (!second) return first;

  return {
    minX: Math.min(first.minX, second.minX),
    maxX: Math.max(first.maxX, second.maxX),
    minY: Math.min(first.minY, second.minY),
    maxY: Math.max(first.maxY, second.maxY),
  };
};

const isFiniteBounds = (bounds: Bounds): boolean =>
  Number.isFinite(bounds.minX) &&
  Number.isFinite(bounds.minY) &&
  Number.isFinite(bounds.maxX) &&
  Number.isFinite(bounds.maxY);

const expandBounds = (bounds: Bounds, margin: number): Bounds => ({
  minX: bounds.minX - margin,
  maxX: bounds.maxX + margin,
  minY: bounds.minY - margin,
  maxY: bounds.maxY + margin,
});

const clampBounds = (bounds: Bounds, boardBounds: Bounds): Bounds =>
  boundsIntersection(bounds, boardBounds) ?? {
    minX: clamp(bounds.minX, boardBounds.minX, boardBounds.maxX),
    maxX: clamp(bounds.maxX, boardBounds.minX, boardBounds.maxX),
    minY: clamp(bounds.minY, boardBounds.minY, boardBounds.maxY),
    maxY: clamp(bounds.maxY, boardBounds.minY, boardBounds.maxY),
  };

const getCopperPourBounds = (
  element: Extract<CopperElement, { type: "pcb_copper_pour" }>,
): Bounds | null => {
  const points: Point[] = [];

  if (element.shape === "brep") {
    points.push(...(element.brep_shape?.outer_ring?.vertices ?? []));
    for (const innerRing of element.brep_shape?.inner_rings ?? []) {
      points.push(...(innerRing.vertices ?? []));
    }
  } else if ("points" in element && Array.isArray(element.points)) {
    points.push(...element.points);
  }

  return getBoundsFromPoints(points);
};

const getTraceBounds = (
  element: Extract<CopperElement, { type: "pcb_trace" }>,
): Bounds | null => {
  let bounds: Bounds | null = null;

  for (const point of element.route) {
    if ("start" in point && "end" in point) {
      const margin = (point.width ?? 0) / 2;
      bounds = includePointInBounds(bounds, point.start, margin);
      bounds = includePointInBounds(bounds, point.end, margin);
      continue;
    }

    if (!("x" in point) || !("y" in point)) continue;
    const margin =
      "width" in point
        ? Number(point.width) / 2
        : "via_diameter" in point
          ? Number(point.via_diameter) / 2
          : 0;
    bounds = includePointInBounds(bounds, point, margin);
  }

  return bounds;
};

const getSmtpadBounds = (
  element: Extract<CopperElement, { type: "pcb_smtpad" }>,
): Bounds | null => {
  if (element.shape === "polygon") {
    return getBoundsFromPoints(element.points);
  }

  const pad = element as Extract<CopperElement, { type: "pcb_smtpad" }> & {
    x: number;
    y: number;
    width?: number;
    height?: number;
    radius?: number;
  };
  const radius =
    pad.shape === "circle"
      ? (pad.radius ?? (pad.width ?? 0) / 2)
      : Math.hypot(pad.width ?? 0, pad.height ?? 0) / 2;

  return includePointInBounds(null, pad, radius);
};

const getElementBounds = (element: CopperElement): Bounds | null => {
  if (element.type === "pcb_copper_pour") {
    return getCopperPourBounds(element);
  }

  if (element.type === "pcb_smtpad") {
    return getSmtpadBounds(element);
  }

  if (element.type === "pcb_trace") {
    return getTraceBounds(element);
  }

  const bounds = getBoundsOfPcbElements([element]);
  return isFiniteBounds(bounds) ? bounds : null;
};

const getGroupBounds = ({
  elements,
  boardBounds,
}: {
  elements: CopperElement[];
  boardBounds: Bounds;
}): Bounds => {
  const bounds = elements.reduce<Bounds | null>(
    (mergedBounds, element) =>
      mergeBounds(mergedBounds, getElementBounds(element)),
    null,
  );

  return clampBounds(expandBounds(bounds ?? boardBounds, 0.2), boardBounds);
};

const createGroupMask = async ({
  elements,
  pcbBoard,
  bounds,
  width,
  height,
  layer,
  mode,
}: {
  elements: CopperElement[];
  pcbBoard?: PcbBoardElement;
  bounds: Bounds;
  width: number;
  height: number;
  layer: LayerRef;
  mode: "pcb" | "gerber";
}): Promise<Uint8Array> => {
  if (mode === "gerber") {
    return createGerberGroupMask({
      elements: pcbBoard ? [pcbBoard, ...elements] : elements,
      bounds,
      width,
      height,
      layer,
    });
  }

  return createPcbGroupMask({ elements, bounds, width, height, layer });
};

const getBitmapDimensions = (
  bounds: Bounds,
  options: FindBitmapShortsOptions,
): { width: number; height: number } => {
  if (options.width && options.height) {
    return { width: options.width, height: options.height };
  }

  const boardWidth = bounds.maxX - bounds.minX;
  const boardHeight = bounds.maxY - bounds.minY;
  const pixelsPerMm =
    options.pixelsPerMm ?? 1000 / (options.micronsPerPixel ?? 35);
  const width = options.width ?? Math.ceil(boardWidth * pixelsPerMm);
  const height = options.height ?? Math.ceil(boardHeight * pixelsPerMm);

  return { width, height };
};

const getScaleInfo = ({
  bounds,
  width,
  height,
}: {
  bounds: Bounds;
  width: number;
  height: number;
}): { scale: number; offsetX: number; offsetY: number } => {
  const realWidth = bounds.maxX - bounds.minX;
  const realHeight = bounds.maxY - bounds.minY;
  const scale = Math.min(width / realWidth, height / realHeight);

  return {
    scale,
    offsetX: (width - realWidth * scale) / 2,
    offsetY: (height - realHeight * scale) / 2,
  };
};

const getPixelRectFromBounds = ({
  bounds,
  boardBounds,
  width,
  height,
}: {
  bounds: Bounds;
  boardBounds: Bounds;
  width: number;
  height: number;
}): PixelRect => {
  const { scale, offsetX, offsetY } = getScaleInfo({
    bounds: boardBounds,
    width,
    height,
  });
  const minX = Math.floor((bounds.minX - boardBounds.minX) * scale + offsetX);
  const maxX = Math.ceil((bounds.maxX - boardBounds.minX) * scale + offsetX);
  const minY = Math.floor((boardBounds.maxY - bounds.maxY) * scale + offsetY);
  const maxY = Math.ceil((boardBounds.maxY - bounds.minY) * scale + offsetY);
  const x = Math.max(0, Math.min(width, minX));
  const y = Math.max(0, Math.min(height, minY));
  const right = Math.max(x, Math.min(width, maxX));
  const bottom = Math.max(y, Math.min(height, maxY));

  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  };
};

const getBoundsFromPixelRect = ({
  rect,
  boardBounds,
  width,
  height,
}: {
  rect: PixelRect;
  boardBounds: Bounds;
  width: number;
  height: number;
}): Bounds => {
  const { scale, offsetX, offsetY } = getScaleInfo({
    bounds: boardBounds,
    width,
    height,
  });

  return {
    minX: boardBounds.minX + (rect.x - offsetX) / scale,
    maxX: boardBounds.minX + (rect.x + rect.width - offsetX) / scale,
    maxY: boardBounds.maxY - (rect.y - offsetY) / scale,
    minY: boardBounds.maxY - (rect.y + rect.height - offsetY) / scale,
  };
};

const createBitmapMask = async ({
  elements,
  pcbBoard,
  boardBounds,
  width,
  height,
  layer,
  mode,
}: {
  elements: CopperElement[];
  pcbBoard?: PcbBoardElement;
  boardBounds: Bounds;
  width: number;
  height: number;
  layer: LayerRef;
  mode: "pcb" | "gerber";
}): Promise<BitmapMask | null> => {
  const groupBounds = getGroupBounds({ elements, boardBounds });
  const rect = getPixelRectFromBounds({
    bounds: groupBounds,
    boardBounds,
    width,
    height,
  });
  if (rect.width === 0 || rect.height === 0) return null;

  const maskBounds = getBoundsFromPixelRect({
    rect,
    boardBounds,
    width,
    height,
  });
  const mask = await createGroupMask({
    elements,
    pcbBoard,
    bounds: maskBounds,
    width: rect.width,
    height: rect.height,
    layer,
    mode,
  });

  return { rect, mask };
};

const paintBitmapMask = ({
  bitmapMask,
  color,
  priority,
  width,
  rgba,
  paintPriorities,
}: {
  bitmapMask: BitmapMask;
  color: [number, number, number];
  priority: 1 | 2;
  width: number;
  rgba: Uint8Array;
  paintPriorities: Uint8Array;
}): void => {
  const { mask, rect } = bitmapMask;

  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 0) continue;
    const localX = i % rect.width;
    const localY = Math.floor(i / rect.width);
    const pixelIndex = (rect.y + localY) * width + rect.x + localX;

    // Higher-priority copper is drawn on top; ties retain the first group's
    // deterministic color.
    if (paintPriorities[pixelIndex]! >= priority) continue;
    paintPriorities[pixelIndex] = priority;
    setRgbaPixel(rgba, pixelIndex, color);
  }
};

const createShortsFromPixelGroups = ({
  shortPixelGroups,
  bounds,
  width,
  height,
}: {
  shortPixelGroups: ShortPixelGroup[];
  bounds: Bounds;
  width: number;
  height: number;
}): BitmapShort[] => {
  const shorts: BitmapShort[] = [];

  for (const shortPixelGroup of shortPixelGroups) {
    const unvisitedPixels = new Set(shortPixelGroup.pixels);

    while (unvisitedPixels.size > 0) {
      const firstPixel = unvisitedPixels.values().next().value as number;
      const queue = [firstPixel];
      unvisitedPixels.delete(firstPixel);
      let pixelCount = 0;
      let pixelXSum = 0;
      let pixelYSum = 0;

      for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
        const pixelIndex = queue[queueIndex]!;
        const x = pixelIndex % width;
        const y = Math.floor(pixelIndex / width);
        pixelCount++;
        pixelXSum += x;
        pixelYSum += y;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            const neighborIndex = ny * width + nx;
            if (!unvisitedPixels.has(neighborIndex)) continue;
            unvisitedPixels.delete(neighborIndex);
            queue.push(neighborIndex);
          }
        }
      }

      shorts.push({
        mode: shortPixelGroup.mode,
        layer: shortPixelGroup.layer,
        firstConnectivityKey: shortPixelGroup.firstConnectivityKey,
        secondConnectivityKey: shortPixelGroup.secondConnectivityKey,
        pixelCount,
        center: getRealPointFromPixel({
          x: pixelXSum / pixelCount,
          y: pixelYSum / pixelCount,
          bounds,
          width,
          height,
        }),
        firstOwnerLabels: shortPixelGroup.firstOwnerLabels,
        secondOwnerLabels: shortPixelGroup.secondOwnerLabels,
      });
    }
  }

  return shorts.sort((a, b) => b.pixelCount - a.pixelCount);
};

export const renderBitmapShortDebug = async (
  circuitJson: AnyCircuitElement[],
  options: FindBitmapShortsOptions = {},
): Promise<BitmapShortDebugRender> => {
  const layer = options.layer ?? "top";
  const mode = options.mode ?? "pcb";
  const connMap = getFullConnectivityMapFromCircuitJson(circuitJson);
  const bounds = getBoardBounds(circuitJson);
  const { width, height } = getBitmapDimensions(bounds, options);
  const db = cju(circuitJson);
  const pcbBoard = circuitJson.find(
    (element): element is PcbBoardElement => element.type === "pcb_board",
  );
  const connectivityGroups = buildConnectivityGroups({
    circuitJson,
    connMap,
    db,
    layer,
  });

  if (mode === "gerber") {
    assertGerberLayerCanBeGenerated(circuitJson, layer);
  }

  const pixelOwners = new Array<string | undefined>(width * height);
  const shortPixelGroupMap = new Map<string, ShortPixelGroup>();
  const rgba = new Uint8Array(width * height * 4);
  const paintPriorities = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i++) {
    setRgbaPixel(rgba, i, [0, 0, 0]);
  }

  const sortedConnectivityGroups = [...connectivityGroups.entries()].sort(
    ([a], [b]) => a.localeCompare(b),
  );
  const legend = buildBitmapLegend({ sortedConnectivityGroups, db });

  for (const [key, elements] of sortedConnectivityGroups) {
    const color = getDebugColorForConnectivityKey(key);
    const bitmapMask = await createBitmapMask({
      elements,
      pcbBoard,
      boardBounds: bounds,
      width,
      height,
      layer,
      mode,
    });
    if (!bitmapMask) continue;

    for (let i = 0; i < bitmapMask.mask.length; i++) {
      if (bitmapMask.mask[i] === 0) continue;
      const localX = i % bitmapMask.rect.width;
      const localY = Math.floor(i / bitmapMask.rect.width);
      const globalPixelIndex =
        (bitmapMask.rect.y + localY) * width + bitmapMask.rect.x + localX;

      const existingOwner = pixelOwners[globalPixelIndex];
      if (existingOwner && existingOwner !== key) {
        const [firstConnectivityKey, secondConnectivityKey] = [
          existingOwner,
          key,
        ].sort();
        const shortKey = `${layer}:${firstConnectivityKey}:${secondConnectivityKey}`;
        const existingShortPixelGroup = shortPixelGroupMap.get(shortKey);

        if (existingShortPixelGroup) {
          existingShortPixelGroup.pixels.push(globalPixelIndex);
        } else {
          const firstElements =
            connectivityGroups.get(firstConnectivityKey) ?? [];
          const secondElements =
            connectivityGroups.get(secondConnectivityKey) ?? [];
          shortPixelGroupMap.set(shortKey, {
            mode,
            layer,
            firstConnectivityKey,
            secondConnectivityKey,
            pixels: [globalPixelIndex],
            firstOwnerLabels: getUniqueOwnerLabels(firstElements, db),
            secondOwnerLabels: getUniqueOwnerLabels(secondElements, db),
          });
        }
      } else if (!existingOwner) {
        pixelOwners[globalPixelIndex] = key;
      }
    }

    const copperPourElements = elements.filter(
      (element) => element.type === "pcb_copper_pour",
    );
    const nonPourElements = elements.filter(
      (element) => element.type !== "pcb_copper_pour",
    );

    if (copperPourElements.length === 0) {
      paintBitmapMask({
        bitmapMask,
        color,
        priority: OTHER_COPPER_PAINT_PRIORITY,
        width,
        rgba,
        paintPriorities,
      });
      continue;
    }

    if (nonPourElements.length === 0) {
      paintBitmapMask({
        bitmapMask,
        color,
        priority: COPPER_POUR_PAINT_PRIORITY,
        width,
        rgba,
        paintPriorities,
      });
      continue;
    }

    const copperPourMask = await createBitmapMask({
      elements: copperPourElements,
      pcbBoard,
      boardBounds: bounds,
      width,
      height,
      layer,
      mode,
    });
    if (copperPourMask) {
      paintBitmapMask({
        bitmapMask: copperPourMask,
        color,
        priority: COPPER_POUR_PAINT_PRIORITY,
        width,
        rgba,
        paintPriorities,
      });
    }

    const nonPourMask = await createBitmapMask({
      elements: nonPourElements,
      pcbBoard,
      boardBounds: bounds,
      width,
      height,
      layer,
      mode,
    });
    if (nonPourMask) {
      paintBitmapMask({
        bitmapMask: nonPourMask,
        color,
        priority: OTHER_COPPER_PAINT_PRIORITY,
        width,
        rgba,
        paintPriorities,
      });
    }
  }

  const shorts = createShortsFromPixelGroups({
    shortPixelGroups: [...shortPixelGroupMap.values()],
    bounds,
    width,
    height,
  });

  overlayPcbPortMarkers({ circuitJson, bounds, width, height, rgba });
  overlayShortMarkers({ shorts, bounds, width, height, rgba });

  return { width, height, rgba, shorts, legend };
};

export const findBitmapShorts = async (
  circuitJson: AnyCircuitElement[],
  options: FindBitmapShortsOptions = {},
): Promise<BitmapShort[]> =>
  (await renderBitmapShortDebug(circuitJson, options)).shorts;
