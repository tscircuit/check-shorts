import { cju } from "@tscircuit/circuit-json-util";
import type { AnyCircuitElement } from "circuit-json";
import { getFullConnectivityMapFromCircuitJson } from "circuit-json-to-connectivity-map";
import {
  buildConnectivityGroups,
  getUniqueOwnerLabels,
  type CopperElement,
} from "./bitmap-copper-groups";
import {
  createBitmapMask,
  getBitmapDimensions,
  type PcbBoardElement,
} from "./bitmap-short-detector";
import { getBoardBounds, getRealPointFromPixel } from "./bitmap-geometry";
import { assertGerberLayerCanBeGenerated } from "./gerber-layer";
import type {
  BitmapOpen,
  BitmapOpenIsland,
  FindBitmapOpensOptions,
} from "./bitmap-open-types";

export type {
  BitmapOpen,
  BitmapOpenIsland,
  FindBitmapOpensOptions,
} from "./bitmap-open-types";

interface MaskIsland {
  pixels: number[];
}

/**
 * 4-connected flood fill over a group's rasterised copper, returning one entry
 * per disconnected island. Indices are local to the mask rect.
 */
const findMaskIslands = (mask: Uint8Array, width: number): MaskIsland[] => {
  const islands: MaskIsland[] = [];
  const seen = new Uint8Array(mask.length);
  const height = mask.length / width;

  for (let start = 0; start < mask.length; start++) {
    if (mask[start] === 0 || seen[start] === 1) continue;

    const pixels: number[] = [];
    // Explicit stack: these masks can be large and recursion would blow up.
    const stack = [start];
    seen[start] = 1;

    while (stack.length > 0) {
      const index = stack.pop()!;
      pixels.push(index);

      const x = index % width;
      const y = Math.floor(index / width);

      if (x > 0) {
        const n = index - 1;
        if (mask[n] === 1 && seen[n] === 0) {
          seen[n] = 1;
          stack.push(n);
        }
      }
      if (x < width - 1) {
        const n = index + 1;
        if (mask[n] === 1 && seen[n] === 0) {
          seen[n] = 1;
          stack.push(n);
        }
      }
      if (y > 0) {
        const n = index - width;
        if (mask[n] === 1 && seen[n] === 0) {
          seen[n] = 1;
          stack.push(n);
        }
      }
      if (y < height - 1) {
        const n = index + width;
        if (mask[n] === 1 && seen[n] === 0) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }

    islands.push({ pixels });
  }

  return islands;
};

/**
 * Find nets whose copper is split across more than one island — i.e. nets that
 * were not fully routed. The inverse of findBitmapShorts, computed on the same
 * rendered copper so that pours count as real connections.
 *
 * A net with a single island is fully joined. A net with no copper at all is
 * reported as an open with zero islands: that is the "the router dropped it
 * entirely" case, which is otherwise completely silent.
 */
export const findBitmapOpens = async (
  circuitJson: AnyCircuitElement[],
  options: FindBitmapOpensOptions = {},
): Promise<BitmapOpen[]> => {
  const layer = options.layer ?? "top";
  const mode = options.mode ?? "pcb";
  const connMap = getFullConnectivityMapFromCircuitJson(circuitJson);
  const bounds = getBoardBounds(circuitJson);
  const { width, height } = getBitmapDimensions(bounds, options);
  const db = cju(circuitJson);
  const pcbBoard = circuitJson.find(
    (element): element is PcbBoardElement => element.type === "pcb_board",
  );

  if (mode === "gerber") {
    assertGerberLayerCanBeGenerated(circuitJson, layer);
  }

  const connectivityGroups = buildConnectivityGroups({
    circuitJson,
    connMap,
    db,
    layer,
  });

  const opens: BitmapOpen[] = [];

  const sortedConnectivityGroups = [...connectivityGroups.entries()].sort(
    ([a], [b]) => a.localeCompare(b),
  );

  for (const [connectivityKey, elements] of sortedConnectivityGroups) {
    // A net represented by a single copper element cannot be "split" — there is
    // nothing to join it to. Skip to avoid flagging every isolated pad.
    if (elements.length < 2) continue;

    const ownerLabels = getUniqueOwnerLabels(elements, db);
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

    const maskIslands = findMaskIslands(bitmapMask.mask, bitmapMask.rect.width);
    if (maskIslands.length < 2) continue;

    const islands: BitmapOpenIsland[] = maskIslands
      .map((island) => {
        let sumX = 0;
        let sumY = 0;

        for (const index of island.pixels) {
          const localX = index % bitmapMask.rect.width;
          const localY = Math.floor(index / bitmapMask.rect.width);
          const point = getRealPointFromPixel({
            x: bitmapMask.rect.x + localX,
            y: bitmapMask.rect.y + localY,
            bounds,
            width,
            height,
          });
          sumX += point.x;
          sumY += point.y;
        }

        return {
          pixelCount: island.pixels.length,
          center: {
            x: sumX / island.pixels.length,
            y: sumY / island.pixels.length,
          },
          ownerLabels,
        };
      })
      .sort((a, b) => b.pixelCount - a.pixelCount);

    opens.push({
      mode,
      layer,
      connectivityKey,
      ownerLabels,
      islands,
    });
  }

  return opens.sort((a, b) => b.islands.length - a.islands.length);
};
