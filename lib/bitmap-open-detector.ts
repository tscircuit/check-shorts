import { cju } from "@tscircuit/circuit-json-util";
import type { Bounds } from "@tscircuit/math-utils";
import type { AnyCircuitElement, LayerRef } from "circuit-json";
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
import {
  getBoardBounds,
  getPixelPointFromReal,
  getRealPointFromPixel,
} from "./bitmap-geometry";
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
/** Copper layers that actually carry copper in this circuit. */
const getCopperLayersInUse = (circuitJson: AnyCircuitElement[]): LayerRef[] => {
  const layers = new Set<LayerRef>();

  for (const element of circuitJson) {
    if (
      element.type === "pcb_via" ||
      element.type === "pcb_plated_hole" ||
      element.type === "pcb_smtpad" ||
      element.type === "pcb_copper_pour"
    ) {
      const elementLayers =
        "layers" in element && element.layers
          ? element.layers
          : "layer" in element && element.layer
            ? [element.layer]
            : [];
      for (const elementLayer of elementLayers) {
        layers.add(elementLayer as LayerRef);
      }
    }

    if (element.type === "pcb_trace") {
      for (const point of element.route) {
        if ("layer" in point && point.layer)
          layers.add(point.layer as LayerRef);
      }
    }
  }

  if (layers.size === 0) layers.add("top");

  // Stable, predictable order: outer layers first.
  const preferredOrder: LayerRef[] = ["top", "bottom"];
  return [
    ...preferredOrder.filter((layer) => layers.has(layer)),
    ...[...layers].filter((layer) => !preferredOrder.includes(layer)).sort(),
  ];
};

/** Index into a mask rect for a real-world point, or undefined if outside it. */
const getMaskPixelIndexForPoint = ({
  point,
  rect,
  bounds,
  width,
  height,
}: {
  point: { x: number; y: number };
  rect: { x: number; y: number; width: number; height: number };
  bounds: Bounds;
  width: number;
  height: number;
}): number | undefined => {
  const pixelPoint = getPixelPointFromReal({
    x: point.x,
    y: point.y,
    bounds,
    width,
    height,
  });
  const localX = Math.round(pixelPoint.x) - rect.x;
  const localY = Math.round(pixelPoint.y) - rect.y;

  if (
    localX < 0 ||
    localY < 0 ||
    localX >= rect.width ||
    localY >= rect.height
  ) {
    return undefined;
  }

  return localY * rect.width + localX;
};

/**
 * Union-find over island identifiers, used to merge islands that are joined
 * through a layer-crossing element (a via or plated hole).
 */
const makeUnionFind = () => {
  const parent = new Map<string, string>();

  const find = (key: string): string => {
    let current = parent.get(key) ?? key;
    if (!parent.has(key)) parent.set(key, key);
    while (current !== parent.get(current)) {
      current = parent.get(current)!;
    }
    parent.set(key, current);
    return current;
  };

  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  };

  return { find, union };
};

export const findBitmapOpens = async (
  circuitJson: AnyCircuitElement[],
  options: FindBitmapOpensOptions = {},
): Promise<BitmapOpen[]> => {
  const mode = options.mode ?? "pcb";
  const connMap = getFullConnectivityMapFromCircuitJson(circuitJson);
  const bounds = getBoardBounds(circuitJson);
  const { width, height } = getBitmapDimensions(bounds, options);
  const db = cju(circuitJson);
  const pcbBoard = circuitJson.find(
    (element): element is PcbBoardElement => element.type === "pcb_board",
  );

  // A net is only "open" if it is disconnected across the WHOLE board, so every
  // copper layer is analysed together. Looking at one layer in isolation would
  // flag every ordinary top->via->bottom route as split.
  const layers: LayerRef[] =
    options.layer !== undefined
      ? [options.layer]
      : getCopperLayersInUse(circuitJson);

  if (mode === "gerber") {
    for (const layer of layers) {
      assertGerberLayerCanBeGenerated(circuitJson, layer);
    }
  }

  const opens: BitmapOpen[] = [];
  const groupsByLayer = new Map<LayerRef, Map<string, CopperElement[]>>();

  for (const layer of layers) {
    groupsByLayer.set(
      layer,
      buildConnectivityGroups({ circuitJson, connMap, db, layer }),
    );
  }

  // Merge the connectivity groups that the SOURCE says belong together.
  //
  // This is what makes unrouted nets detectable at all. When a trace is not
  // routed, getFullConnectivityMapFromCircuitJson does not union its pads —
  // each ends up with its own connectivity key, so a copper-only analysis sees
  // two unrelated one-pad nets rather than one broken net. (Measured: pads
  // joined by a single source_trace came back as connectivity_net12 and
  // connectivity_net0.) Seeding from source_trace restores the intent, and the
  // copper still provides the evidence of what is actually joined — including
  // pours, which the graph connectivity map does not model.
  const groupMerge = makeUnionFind();
  const keyForSourcePort = new Map<string, string>();

  // Map source_port -> connectivity key. Prefer the pcb_port link, but fall
  // back to the pad's port hints: a pad on an unrouted net can be left without
  // a pcb_port entirely, and that is exactly the pad we must not lose track of.
  const sourcePortsByComponentAndName = new Map<string, string>();
  for (const sourcePort of db.source_port.list()) {
    if (!sourcePort.source_component_id || !sourcePort.name) continue;
    sourcePortsByComponentAndName.set(
      `${sourcePort.source_component_id}:${sourcePort.name}`,
      sourcePort.source_port_id,
    );
  }

  for (const [, groups] of groupsByLayer) {
    for (const [key, elements] of groups) {
      for (const element of elements) {
        const pcbPortId =
          "pcb_port_id" in element ? element.pcb_port_id : undefined;

        if (pcbPortId) {
          const pcbPort = db.pcb_port.get(pcbPortId);
          if (pcbPort?.source_port_id) {
            keyForSourcePort.set(pcbPort.source_port_id, key);
            continue;
          }
        }

        // No pcb_port: resolve via the owning component + the pad's port hint.
        const pcbComponentId =
          "pcb_component_id" in element ? element.pcb_component_id : undefined;
        const portHints =
          "port_hints" in element ? (element.port_hints ?? []) : [];
        if (!pcbComponentId || portHints.length === 0) continue;

        const sourceComponentId =
          db.pcb_component.get(pcbComponentId)?.source_component_id;
        if (!sourceComponentId) continue;

        for (const hint of portHints) {
          const sourcePortId = sourcePortsByComponentAndName.get(
            `${sourceComponentId}:${hint}`,
          );
          if (sourcePortId) {
            keyForSourcePort.set(sourcePortId, key);
            break;
          }
        }
      }
    }
  }

  for (const element of circuitJson) {
    if (element.type !== "source_trace") continue;
    const connectedKeys = (element.connected_source_port_ids ?? [])
      .map((sourcePortId) => keyForSourcePort.get(sourcePortId))
      .filter((key): key is string => Boolean(key));
    for (let i = 1; i < connectedKeys.length; i++) {
      groupMerge.union(connectedKeys[0]!, connectedKeys[i]!);
    }
  }

  const mergedGroupsByLayer = new Map<LayerRef, Map<string, CopperElement[]>>();
  for (const [layer, groups] of groupsByLayer) {
    const merged = new Map<string, CopperElement[]>();
    for (const [key, elements] of groups) {
      const root = groupMerge.find(key);
      merged.set(root, [...(merged.get(root) ?? []), ...elements]);
    }
    mergedGroupsByLayer.set(layer, merged);
  }
  groupsByLayer.clear();
  for (const [layer, merged] of mergedGroupsByLayer) {
    groupsByLayer.set(layer, merged);
  }

  const connectivityKeys = [
    ...new Set(
      [...groupsByLayer.values()].flatMap((groups) => [...groups.keys()]),
    ),
  ].sort((a, b) => a.localeCompare(b));

  for (const connectivityKey of connectivityKeys) {
    const { find, union } = makeUnionFind();
    const islandsById = new Map<string, BitmapOpenIsland>();
    // Which island (per layer) each layer-crossing element landed in, so the
    // same via seen on two layers merges those layers' islands.
    const crossLayerElementIslands = new Map<string, string[]>();
    // Which island each PAD (smtpad / plated hole) landed in. Pads are the
    // things that must end up connected; pours and traces are just the means.
    const padIslands = new Map<string, string[]>();
    const allElements: CopperElement[] = [];

    for (const layer of layers) {
      const elements = groupsByLayer.get(layer)?.get(connectivityKey) ?? [];
      if (elements.length === 0) continue;
      allElements.push(...elements);

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

      const maskIslands = findMaskIslands(
        bitmapMask.mask,
        bitmapMask.rect.width,
      );

      const pixelToIsland = new Map<number, string>();

      maskIslands.forEach((island, islandIndex) => {
        const islandId = `${layer}:${islandIndex}`;
        find(islandId);

        let sumX = 0;
        let sumY = 0;
        for (const index of island.pixels) {
          pixelToIsland.set(index, islandId);
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

        islandsById.set(islandId, {
          pixelCount: island.pixels.length,
          center: {
            x: sumX / island.pixels.length,
            y: sumY / island.pixels.length,
          },
          ownerLabels: getUniqueOwnerLabels(elements, db),
        });
      });

      // Record which island each via / plated hole / pad occupies on this
      // layer. Vias and plated holes span layers, so the islands they touch are
      // physically joined by them; pads are what we ultimately judge.
      for (const element of elements) {
        const isVia = element.type === "pcb_via";
        const isPlatedHole = element.type === "pcb_plated_hole";
        const isSmtPad = element.type === "pcb_smtpad";
        if (!isVia && !isPlatedHole && !isSmtPad) continue;

        const elementId = isVia
          ? element.pcb_via_id
          : isPlatedHole
            ? element.pcb_plated_hole_id
            : element.pcb_smtpad_id;
        // Polygon SMT pads carry `points` rather than a centre.
        const elementPoint =
          "x" in element && "y" in element
            ? { x: element.x, y: element.y }
            : "points" in element && element.points.length > 0
              ? {
                  x:
                    element.points.reduce((sum, p) => sum + p.x, 0) /
                    element.points.length,
                  y:
                    element.points.reduce((sum, p) => sum + p.y, 0) /
                    element.points.length,
                }
              : undefined;
        const pixelIndex = elementPoint
          ? getMaskPixelIndexForPoint({
              point: elementPoint,
              rect: bitmapMask.rect,
              bounds,
              width,
              height,
            })
          : undefined;
        const islandId =
          pixelIndex === undefined ? undefined : pixelToIsland.get(pixelIndex);

        if (isVia || isPlatedHole) {
          if (islandId) {
            const seen = crossLayerElementIslands.get(elementId) ?? [];
            seen.push(islandId);
            crossLayerElementIslands.set(elementId, seen);
          }
        }

        // Plated holes are pads too (through-hole parts), so they count both as
        // a layer bridge and as something that must be connected.
        if (isPlatedHole || isSmtPad) {
          const seen = padIslands.get(elementId) ?? [];
          if (islandId) seen.push(islandId);
          padIslands.set(elementId, seen);
        }
      }
    }

    for (const islandIds of crossLayerElementIslands.values()) {
      for (let i = 1; i < islandIds.length; i++) {
        union(islandIds[0]!, islandIds[i]!);
      }
    }

    const mergedIslands = new Map<string, BitmapOpenIsland>();
    for (const [islandId, island] of islandsById) {
      const root = find(islandId);
      const existing = mergedIslands.get(root);
      if (!existing) {
        mergedIslands.set(root, { ...island });
        continue;
      }
      const totalPixels = existing.pixelCount + island.pixelCount;
      mergedIslands.set(root, {
        pixelCount: totalPixels,
        center: {
          x:
            (existing.center.x * existing.pixelCount +
              island.center.x * island.pixelCount) /
            totalPixels,
          y:
            (existing.center.y * existing.pixelCount +
              island.center.y * island.pixelCount) /
            totalPixels,
        },
        ownerLabels: existing.ownerLabels,
      });
    }

    // What matters is whether the net's PADS are joined, not how many islands
    // the fill happens to produce. A copper pour legitimately breaks into many
    // regions as it flows around obstacles; that is not a fault. It is only an
    // open if two pads that should be connected land in different islands (or a
    // pad has no copper at all).
    const padIslandRoots = new Set<string>();
    let padsWithoutCopper = 0;

    for (const [elementId, islandIds] of padIslands) {
      if (islandIds.length === 0) {
        padsWithoutCopper++;
        continue;
      }
      padIslandRoots.add(find(islandIds[0]!));
    }

    const distinctPadGroups = padIslandRoots.size + padsWithoutCopper;
    if (distinctPadGroups < 2) continue;

    // Report only the islands that actually hold pads, plus the pad-less ones.
    const reportedIslands = [...mergedIslands.entries()]
      .filter(([root]) => padIslandRoots.has(root))
      .map(([, island]) => island)
      .sort((a, b) => b.pixelCount - a.pixelCount);

    opens.push({
      mode,
      layer: layers[0]!,
      connectivityKey,
      ownerLabels: getUniqueOwnerLabels(allElements, db),
      islands: reportedIslands,
    });
  }

  return opens.sort((a, b) => b.islands.length - a.islands.length);
};
