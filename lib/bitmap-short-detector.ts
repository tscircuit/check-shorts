import { cju } from "@tscircuit/circuit-json-util";
import type { AnyCircuitElement } from "circuit-json";
import type { Bounds } from "@tscircuit/math-utils";
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
  layer: "top" | "bottom";
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

const includePointInBounds = (
  bounds: Bounds | null,
  point: { x: number; y: number },
  margin = 0,
): Bounds => ({
  minX: Math.min(bounds?.minX ?? Number.POSITIVE_INFINITY, point.x - margin),
  maxX: Math.max(bounds?.maxX ?? Number.NEGATIVE_INFINITY, point.x + margin),
  minY: Math.min(bounds?.minY ?? Number.POSITIVE_INFINITY, point.y - margin),
  maxY: Math.max(bounds?.maxY ?? Number.NEGATIVE_INFINITY, point.y + margin),
});

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

const expandBounds = (bounds: Bounds, margin: number): Bounds => ({
  minX: bounds.minX - margin,
  maxX: bounds.maxX + margin,
  minY: bounds.minY - margin,
  maxY: bounds.maxY + margin,
});

const clampBounds = (bounds: Bounds, boardBounds: Bounds): Bounds => ({
  minX: Math.max(boardBounds.minX, bounds.minX),
  maxX: Math.min(boardBounds.maxX, bounds.maxX),
  minY: Math.max(boardBounds.minY, bounds.minY),
  maxY: Math.min(boardBounds.maxY, bounds.maxY),
});

const getCopperPourBounds = (
  element: Extract<CopperElement, { type: "pcb_copper_pour" }>,
): Bounds | null => {
  const points: Array<{ x: number; y: number }> = [];

  if (element.shape === "brep") {
    points.push(...(element.brep_shape?.outer_ring?.vertices ?? []));
    for (const innerRing of element.brep_shape?.inner_rings ?? []) {
      points.push(...(innerRing.vertices ?? []));
    }
  } else if ("points" in element && Array.isArray(element.points)) {
    points.push(...element.points);
  }

  return points.reduce<Bounds | null>(
    (bounds, point) => includePointInBounds(bounds, point),
    null,
  );
};

const getElementBounds = (element: CopperElement): Bounds | null => {
  if (element.type === "pcb_copper_pour") {
    return getCopperPourBounds(element);
  }

  if (element.type === "pcb_smtpad") {
    if (element.shape === "polygon") {
      return element.points.reduce<Bounds | null>(
        (bounds, point) => includePointInBounds(bounds, point),
        null,
      );
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
  }

  if (element.type === "pcb_trace") {
    return element.route.reduce<Bounds | null>((bounds, point) => {
      if ("start" in point && "end" in point) {
        const width = point.width ?? 0;
        return includePointInBounds(
          includePointInBounds(bounds, point.start, width / 2),
          point.end,
          width / 2,
        );
      }

      if (!("x" in point) || !("y" in point)) return bounds;
      const width =
        "width" in point
          ? Number(point.width)
          : "via_diameter" in point
            ? Number(point.via_diameter)
            : 0;
      return includePointInBounds(bounds, point, width / 2);
    }, null);
  }

  const hole = element as CopperElement & {
    outer_diameter?: number;
    hole_diameter?: number;
    outer_width?: number;
    outer_height?: number;
    hole_width?: number;
    hole_height?: number;
  };
  const diameter = Math.max(
    hole.outer_diameter ?? 0,
    hole.hole_diameter ?? 0,
    hole.outer_width ?? 0,
    hole.outer_height ?? 0,
    hole.hole_width ?? 0,
    hole.hole_height ?? 0,
  );
  return includePointInBounds(null, element, diameter / 2);
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
  bounds,
  width,
  height,
  layer,
  mode,
}: {
  elements: CopperElement[];
  bounds: Bounds;
  width: number;
  height: number;
  layer: "top" | "bottom";
  mode: "pcb" | "gerber";
}): Promise<Uint8Array> => {
  if (mode === "gerber") {
    return createGerberGroupMask({ elements, bounds, width, height, layer });
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

  for (let i = 0; i < width * height; i++) {
    setRgbaPixel(rgba, i, [0, 0, 0]);
  }

  const sortedConnectivityGroups = [...connectivityGroups.entries()].sort(
    ([a], [b]) => a.localeCompare(b),
  );
  const legend = buildBitmapLegend({ sortedConnectivityGroups, db });

  for (const [key, elements] of sortedConnectivityGroups) {
    const color = getDebugColorForConnectivityKey(key);
    const groupBounds = getGroupBounds({ elements, boardBounds: bounds });
    const rect = getPixelRectFromBounds({
      bounds: groupBounds,
      boardBounds: bounds,
      width,
      height,
    });
    if (rect.width === 0 || rect.height === 0) continue;
    const maskBounds = getBoundsFromPixelRect({
      rect,
      boardBounds: bounds,
      width,
      height,
    });
    const mask = await createGroupMask({
      elements,
      bounds: maskBounds,
      width: rect.width,
      height: rect.height,
      layer,
      mode,
    });

    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === 0) continue;
      const localX = i % rect.width;
      const localY = Math.floor(i / rect.width);
      const globalPixelIndex = (rect.y + localY) * width + rect.x + localX;

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
        setRgbaPixel(rgba, globalPixelIndex, color);
      }
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
