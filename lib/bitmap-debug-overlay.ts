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
}: {
  rgba: Uint8Array;
  width: number;
  height: number;
  center: { x: number; y: number };
  radius: number;
  color: [number, number, number];
}): void => {
  const minX = Math.max(0, Math.floor(center.x - radius - 1));
  const maxX = Math.min(width - 1, Math.ceil(center.x + radius + 1));
  const minY = Math.max(0, Math.floor(center.y - radius - 1));
  const maxY = Math.min(height - 1, Math.ceil(center.y + radius + 1));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const distance = Math.hypot(x + 0.5 - center.x, y + 0.5 - center.y);
      if (Math.abs(distance - radius) <= 1.2) {
        setRgbaPixel(rgba, y * width + x, color);
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
      radius: 8,
      color: [255, 0, 0],
    });
    drawDebugCircleOutline({
      rgba,
      width,
      height,
      center: point,
      radius: 4,
      color: [255, 0, 0],
    });
  }
};
