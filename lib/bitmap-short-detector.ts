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

export const renderBitmapShortDebug = async (
  circuitJson: AnyCircuitElement[],
  options: FindBitmapShortsOptions = {},
): Promise<BitmapShortDebugRender> => {
  const width = options.width ?? 600;
  const height = options.height ?? 600;
  const layer = options.layer ?? "top";
  const mode = options.mode ?? "pcb";
  const connMap = getFullConnectivityMapFromCircuitJson(circuitJson);
  const bounds = getBoardBounds(circuitJson);
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
  const shortMap = new Map<
    string,
    BitmapShort & { pixelXSum: number; pixelYSum: number }
  >();
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
    const mask = await createGroupMask({
      elements,
      bounds,
      width,
      height,
      layer,
      mode,
    });

    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === 0) continue;

      const existingOwner = pixelOwners[i];
      if (existingOwner && existingOwner !== key) {
        const [firstConnectivityKey, secondConnectivityKey] = [
          existingOwner,
          key,
        ].sort();
        const shortKey = `${layer}:${firstConnectivityKey}:${secondConnectivityKey}`;
        const existingShort = shortMap.get(shortKey);

        if (existingShort) {
          existingShort.pixelCount++;
          existingShort.pixelXSum += i % width;
          existingShort.pixelYSum += Math.floor(i / width);
        } else {
          const firstElements =
            connectivityGroups.get(firstConnectivityKey) ?? [];
          const secondElements =
            connectivityGroups.get(secondConnectivityKey) ?? [];
          shortMap.set(shortKey, {
            mode,
            layer,
            firstConnectivityKey,
            secondConnectivityKey,
            pixelCount: 1,
            pixelXSum: i % width,
            pixelYSum: Math.floor(i / width),
            center: { x: 0, y: 0 },
            firstOwnerLabels: getUniqueOwnerLabels(firstElements, db),
            secondOwnerLabels: getUniqueOwnerLabels(secondElements, db),
          });
        }
      } else if (!existingOwner) {
        pixelOwners[i] = key;
        setRgbaPixel(rgba, i, color);
      }
    }
  }

  const shorts = [...shortMap.values()].map(
    ({ pixelXSum, pixelYSum, ...short }): BitmapShort => ({
      ...short,
      center: getRealPointFromPixel({
        x: pixelXSum / short.pixelCount,
        y: pixelYSum / short.pixelCount,
        bounds,
        width,
        height,
      }),
    }),
  );

  overlayPcbPortMarkers({ circuitJson, bounds, width, height, rgba });
  overlayShortMarkers({ shorts, bounds, width, height, rgba });

  return { width, height, rgba, shorts, legend };
};

export const findBitmapShorts = async (
  circuitJson: AnyCircuitElement[],
  options: FindBitmapShortsOptions = {},
): Promise<BitmapShort[]> =>
  (await renderBitmapShortDebug(circuitJson, options)).shorts;
