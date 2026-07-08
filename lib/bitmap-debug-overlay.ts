import type { Bounds } from "@tscircuit/math-utils";
import type { AnyCircuitElement, PcbPort } from "circuit-json";
import type {
  BitmapShort,
  BitmapShortDebugLegendEntry,
} from "./bitmap-short-types";
import type { CopperElement } from "./bitmap-copper-groups";
import { getPixelPointFromReal } from "./bitmap-geometry";
import { getUniqueOwnerLabels } from "./bitmap-copper-groups";
import type { cju } from "@tscircuit/circuit-json-util";

export const getDebugColorForConnectivityKey = (
  key: string,
): [number, number, number] => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }

  return [
    80 + (hash % 160),
    80 + ((hash >>> 8) % 160),
    80 + ((hash >>> 16) % 160),
  ];
};

export const setRgbaPixel = (
  rgba: Uint8Array,
  index: number,
  color: [number, number, number],
): void => {
  const offset = index * 4;
  rgba[offset] = color[0];
  rgba[offset + 1] = color[1];
  rgba[offset + 2] = color[2];
  rgba[offset + 3] = 255;
};

const blendRgbaPixel = (
  rgba: Uint8Array,
  index: number,
  color: [number, number, number],
  alpha: number,
): void => {
  const offset = index * 4;
  const inverseAlpha = 1 - alpha;
  rgba[offset] = Math.round(rgba[offset]! * inverseAlpha + color[0] * alpha);
  rgba[offset + 1] = Math.round(
    rgba[offset + 1]! * inverseAlpha + color[1] * alpha,
  );
  rgba[offset + 2] = Math.round(
    rgba[offset + 2]! * inverseAlpha + color[2] * alpha,
  );
  rgba[offset + 3] = 255;
};

export const buildBitmapLegend = ({
  sortedConnectivityGroups,
  db,
}: {
  sortedConnectivityGroups: Array<[string, CopperElement[]]>;
  db: ReturnType<typeof cju>;
}): BitmapShortDebugLegendEntry[] =>
  sortedConnectivityGroups.map(
    ([connectivityKey, elements]): BitmapShortDebugLegendEntry => ({
      connectivityKey,
      color: getDebugColorForConnectivityKey(connectivityKey),
      labels: getUniqueOwnerLabels(elements, db),
    }),
  );

const drawDebugCircleOutline = ({
  rgba,
  width,
  height,
  center,
  radius,
  color,
  alpha = 1,
  strokeWidth = 2.4,
}: {
  rgba: Uint8Array;
  width: number;
  height: number;
  center: { x: number; y: number };
  radius: number;
  color: [number, number, number];
  alpha?: number;
  strokeWidth?: number;
}): void => {
  const strokeRadius = strokeWidth / 2;
  const minX = Math.max(0, Math.floor(center.x - radius - strokeRadius));
  const maxX = Math.min(width - 1, Math.ceil(center.x + radius + strokeRadius));
  const minY = Math.max(0, Math.floor(center.y - radius - strokeRadius));
  const maxY = Math.min(
    height - 1,
    Math.ceil(center.y + radius + strokeRadius),
  );

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const distance = Math.hypot(x + 0.5 - center.x, y + 0.5 - center.y);
      if (Math.abs(distance - radius) <= strokeRadius) {
        blendRgbaPixel(rgba, y * width + x, color, alpha);
      }
    }
  }
};

const drawDebugFilledCircle = ({
  rgba,
  width,
  height,
  center,
  radius,
  color,
  alpha,
}: {
  rgba: Uint8Array;
  width: number;
  height: number;
  center: { x: number; y: number };
  radius: number;
  color: [number, number, number];
  alpha: number;
}): void => {
  const minX = Math.max(0, Math.floor(center.x - radius));
  const maxX = Math.min(width - 1, Math.ceil(center.x + radius));
  const minY = Math.max(0, Math.floor(center.y - radius));
  const maxY = Math.min(height - 1, Math.ceil(center.y + radius));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const distance = Math.hypot(x + 0.5 - center.x, y + 0.5 - center.y);
      if (distance <= radius) {
        blendRgbaPixel(rgba, y * width + x, color, alpha);
      }
    }
  }
};

const drawDebugLine = ({
  rgba,
  width,
  height,
  start,
  end,
  color,
  alpha,
  strokeWidth = 1.5,
}: {
  rgba: Uint8Array;
  width: number;
  height: number;
  start: { x: number; y: number };
  end: { x: number; y: number };
  color: [number, number, number];
  alpha: number;
  strokeWidth?: number;
}): void => {
  const strokeRadius = strokeWidth / 2;
  const minX = Math.max(0, Math.floor(Math.min(start.x, end.x) - strokeRadius));
  const maxX = Math.min(
    width - 1,
    Math.ceil(Math.max(start.x, end.x) + strokeRadius),
  );
  const minY = Math.max(0, Math.floor(Math.min(start.y, end.y) - strokeRadius));
  const maxY = Math.min(
    height - 1,
    Math.ceil(Math.max(start.y, end.y) + strokeRadius),
  );
  const lineLength = Math.hypot(end.x - start.x, end.y - start.y);
  if (lineLength === 0) return;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((px - start.x) * (end.x - start.x) +
            (py - start.y) * (end.y - start.y)) /
            lineLength ** 2,
        ),
      );
      const nearestX = start.x + (end.x - start.x) * t;
      const nearestY = start.y + (end.y - start.y) * t;
      if (Math.hypot(px - nearestX, py - nearestY) <= strokeRadius) {
        blendRgbaPixel(rgba, y * width + x, color, alpha);
      }
    }
  }
};

export const overlayPcbPortMarkers = ({
  circuitJson,
  bounds,
  width,
  height,
  rgba,
}: {
  circuitJson: AnyCircuitElement[];
  bounds: Bounds;
  width: number;
  height: number;
  rgba: Uint8Array;
}): void => {
  for (const element of circuitJson) {
    if (element.type !== "pcb_port") continue;
    const port = element as PcbPort;
    const point = getPixelPointFromReal({
      x: port.x,
      y: port.y,
      bounds,
      width,
      height,
    });

    drawDebugCircleOutline({
      rgba,
      width,
      height,
      center: point,
      radius: 5,
      color: [255, 165, 0],
    });
  }
};

export const overlayShortMarkers = ({
  shorts,
  bounds,
  width,
  height,
  rgba,
}: {
  shorts: BitmapShort[];
  bounds: Bounds;
  width: number;
  height: number;
  rgba: Uint8Array;
}): void => {
  const markerColor: [number, number, number] = [155, 92, 255];

  for (const short of shorts) {
    const point = getPixelPointFromReal({
      x: short.center.x,
      y: short.center.y,
      bounds,
      width,
      height,
    });

    drawDebugCircleOutline({
      rgba,
      width,
      height,
      center: point,
      radius: 12,
      color: markerColor,
      alpha: 0.65,
      strokeWidth: 3,
    });
    drawDebugFilledCircle({
      rgba,
      width,
      height,
      center: point,
      radius: 4,
      color: markerColor,
      alpha: 0.4,
    });
    drawDebugLine({
      rgba,
      width,
      height,
      start: { x: point.x - 16, y: point.y },
      end: { x: point.x + 16, y: point.y },
      color: markerColor,
      alpha: 0.65,
      strokeWidth: 3,
    });
    drawDebugLine({
      rgba,
      width,
      height,
      start: { x: point.x, y: point.y - 16 },
      end: { x: point.x, y: point.y + 16 },
      color: markerColor,
      alpha: 0.65,
      strokeWidth: 3,
    });
  }
};
