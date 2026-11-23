import { cju } from "@tscircuit/circuit-json-util";
import type { AnyCircuitElement, LayerRef, PcbPort } from "circuit-json";
import { getFullConnectivityMapFromCircuitJson } from "circuit-json-to-connectivity-map";
import {
  buildConnectivityGroups,
  getCopperElementLabel,
  type CopperElement,
} from "./bitmap-copper-groups";
import { getBoardBounds } from "./bitmap-geometry";
import { createBitmapMask, getBitmapDimensions } from "./bitmap-short-detector";
import type { FindBitmapShortsOptions } from "./bitmap-short-types";

export interface BitmapOpen {
  mode: "pcb" | "gerber";
  connectivityKey: string;
  netNames: string[];
  islands: Array<{ pcbPortIds: string[]; labels: string[] }>;
}

export type FindBitmapOpensOptions = Omit<FindBitmapShortsOptions, "layer">;

/** Board-wide continuity of required emitted PCB ports. Logical metadata selects
 * the expected terminals; it never joins physical islands. A layer-only bitmap
 * cannot prove continuity, so this API always checks the complete layer stack.
 */
export const findBitmapOpens = async (
  circuitJson: AnyCircuitElement[],
  options: FindBitmapOpensOptions = {},
): Promise<BitmapOpen[]> => {
  const mode = options.mode ?? "pcb";
  const db = cju(circuitJson);
  const board = circuitJson.find((e) => e.type === "pcb_board");
  const layerCount = board?.type === "pcb_board" ? board.num_layers : 2;
  if (layerCount < 1 || layerCount > 10 || !Number.isInteger(layerCount)) {
    throw new Error(`Unsupported copper layer count: ${layerCount}`);
  }
  const layers: LayerRef[] =
    layerCount === 1
      ? ["top"]
      : [
          "top",
          ...Array.from(
            { length: layerCount - 2 },
            (_, i) => `inner${i + 1}` as LayerRef,
          ),
          "bottom",
        ];
  const bounds = getBoardBounds(circuitJson);
  const { width, height } = getBitmapDimensions(bounds, options);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("Bitmap dimensions must be positive integers");
  }
  // Do not let route endpoint assertions or component-internal connections
  // change the set of connections required from bare PCB copper.
  const expectedMap = getFullConnectivityMapFromCircuitJson(
    circuitJson.filter(
      (e) => e.type === "source_trace" || e.type === "pcb_port",
    ),
  );
  const nets = new Map<string, PcbPort[]>();
  for (const port of db.pcb_port.list()) {
    if (
      port.source_port_id &&
      db.source_port.get(port.source_port_id)?.do_not_connect
    )
      continue;
    const key = expectedMap.getNetConnectedToId(port.pcb_port_id);
    if (!key) continue;
    const ports = nets.get(key) ?? [];
    ports.push(port);
    nets.set(key, ports);
  }
  const requiredNets = [...nets].filter(([, ports]) => ports.length > 1);
  if (!requiredNets.length) return [];

  const normalized = [...circuitJson];
  // Inline vias are copper barrels too. Never infer a barrel merely from a
  // wire changing layer or having an end_pcb_port_id.
  for (const trace of db.pcb_trace.list()) {
    for (const [index, point] of trace.route.entries()) {
      if (point.route_type !== "via") continue;
      const from = layers.indexOf(point.from_layer);
      const to = layers.indexOf(point.to_layer);
      if (from < 0 || to < 0)
        throw new Error("Inline via references an unavailable layer");
      const span = layers.slice(Math.min(from, to), Math.max(from, to) + 1);
      if (
        db.pcb_via
          .list()
          .some(
            (v) =>
              v.x === point.x &&
              v.y === point.y &&
              span.every((l) => v.layers.includes(l)),
          )
      )
        continue;
      if (!point.outer_diameter || !point.hole_diameter) {
        throw new Error(
          `Cannot verify inline via without barrel dimensions: ${trace.pcb_trace_id}[${index}]`,
        );
      }
      normalized.push({
        type: "pcb_via",
        pcb_via_id: `bitmap_inline_${trace.pcb_trace_id}_${index}`,
        x: point.x,
        y: point.y,
        layers: span,
        outer_diameter: point.outer_diameter,
        hole_diameter: point.hole_diameter,
      });
    }
  }
  const copperMap = getFullConnectivityMapFromCircuitJson(normalized);
  const copperDb = cju(normalized);
  const parent = [0];
  const root = (id: number): number => {
    while (parent[id] !== id) {
      parent[id] = parent[parent[id]!]!;
      id = parent[id]!;
    }
    return id;
  };
  const join = (a: number, b: number) => {
    parent[root(b)] = root(a);
  };
  const labelsByLayer = new Map<LayerRef, Int32Array>();
  const copper = new Set<CopperElement>();
  const maskFor = (elements: CopperElement[], layer: LayerRef) =>
    createBitmapMask({
      elements,
      pcbBoard: board,
      boardBounds: bounds,
      width,
      height,
      layer,
      mode,
    });
  // Flood-fill actual copper, including unowned copper. A path through a short
  // is still physically conductive; short detection separately reports it.
  for (const layer of layers) {
    const groups = buildConnectivityGroups({
      circuitJson: normalized,
      connMap: copperMap,
      db: copperDb,
      layer,
    });
    const elements = [...groups.values()].flat();
    for (const element of elements) copper.add(element);
    const bitmap = await maskFor(elements, layer);
    const labels = new Int32Array(width * height);
    labelsByLayer.set(layer, labels);
    if (!bitmap) continue;
    const { rect, mask } = bitmap;
    const visited = new Uint8Array(mask.length);
    const queue = new Int32Array(mask.length);
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || visited[start]) continue;
      const id = parent.length;
      parent.push(id);
      let count = 1;
      queue[0] = start;
      visited[start] = 1;
      for (let i = 0; i < count; i++) {
        const pixel = queue[i]!;
        const x = pixel % rect.width;
        const y = Math.floor(pixel / rect.width);
        labels[(rect.y + y) * width + rect.x + x] = id;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx,
              ny = y + dy;
            if (nx < 0 || nx >= rect.width || ny < 0 || ny >= rect.height)
              continue;
            const n = ny * rect.width + nx;
            if (!mask[n] || visited[n]) continue;
            visited[n] = 1;
            queue[count++] = n;
          }
      }
    }
  }
  const contactsFor = async (element: CopperElement, layer: LayerRef) => {
    const bitmap = await maskFor([element], layer);
    const contacts = new Set<number>();
    if (!bitmap) return contacts;
    const labels = labelsByLayer.get(layer)!;
    for (let i = 0; i < bitmap.mask.length; i++) {
      if (!bitmap.mask[i]) continue;
      const id =
        labels[
          (bitmap.rect.y + Math.floor(i / bitmap.rect.width)) * width +
            bitmap.rect.x +
            (i % bitmap.rect.width)
        ];
      if (id) contacts.add(root(id));
    }
    return contacts;
  };
  for (const element of copper) {
    if (element.type !== "pcb_via" && element.type !== "pcb_plated_hole")
      continue;
    const contacts = new Set<number>();
    for (const layer of element.layers) {
      if (!labelsByLayer.has(layer))
        throw new Error("Plated barrel references an unavailable layer");
      for (const id of await contactsFor(element, layer)) contacts.add(id);
    }
    const ids = [...contacts];
    for (const id of ids.slice(1)) join(ids[0]!, id);
  }
  const errors: BitmapOpen[] = [];
  for (const [connectivityKey, ports] of requiredNets) {
    const islands = new Map<
      number,
      { pcbPortIds: Set<string>; labels: Set<string> }
    >();
    for (const port of ports) {
      const terminals = [...copper].filter(
        (e) =>
          (e.type === "pcb_smtpad" || e.type === "pcb_plated_hole") &&
          e.pcb_port_id === port.pcb_port_id,
      );
      const roots = new Set<number>();
      for (const terminal of terminals) {
        const terminalLayers =
          terminal.type === "pcb_smtpad"
            ? [terminal.layer]
            : terminal.type === "pcb_plated_hole"
              ? terminal.layers
              : [];
        for (const layer of terminalLayers)
          for (const id of await contactsFor(terminal, layer))
            roots.add(root(id));
      }
      // Missing emitted pad geometry must not silently pass continuity.
      if (!roots.size) {
        roots.add(parent.length);
        parent.push(parent.length);
      }
      const component = port.pcb_component_id
        ? db.pcb_component.get(port.pcb_component_id)
        : null;
      const sourceComponent = component?.source_component_id
        ? db.source_component.get(component.source_component_id)
        : null;
      const sourcePort = port.source_port_id
        ? db.source_port.get(port.source_port_id)
        : null;
      const label = terminals[0]
        ? getCopperElementLabel(terminals[0], db)
        : `${sourceComponent?.name ?? port.pcb_component_id}.${sourcePort?.name ?? port.pcb_port_id}`;
      for (const id of roots) {
        const island = islands.get(id) ?? {
          pcbPortIds: new Set<string>(),
          labels: new Set<string>(),
        };
        island.pcbPortIds.add(port.pcb_port_id);
        island.labels.add(label);
        islands.set(id, island);
      }
    }
    if (islands.size <= 1) continue;
    errors.push({
      mode,
      connectivityKey,
      netNames: db.source_net
        .list()
        .filter(
          (n) =>
            expectedMap.getNetConnectedToId(n.source_net_id) ===
            connectivityKey,
        )
        .map((n) => n.name),
      islands: [...islands.values()].map((g) => ({
        pcbPortIds: [...g.pcbPortIds].sort(),
        labels: [...g.labels].sort(),
      })),
    });
  }
  return errors;
};
