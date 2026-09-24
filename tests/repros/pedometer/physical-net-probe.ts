import { cju } from "@tscircuit/circuit-json-util";
import type { AnyCircuitElement, LayerRef } from "circuit-json";
import { getFullConnectivityMapFromCircuitJson } from "circuit-json-to-connectivity-map";
import { buildConnectivityGroups } from "lib/bitmap-copper-groups";
import { getBoardBounds, getPixelPointFromReal } from "lib/bitmap-geometry";
import { createPcbGroupMask } from "lib/pcb-mask";
import { createGerberGroupMask } from "lib/gerber-mask";

/**
 * Test-only physical continuity oracle for this literal board, not a public DRC.
 * Logical metadata selects copper belonging to the requested net. Only occupied
 * pixels join copper on one layer; only explicit plated vias join layers.
 * A trace ID, endpoint port ID, or shared source net never creates a physical edge.
 * Deliberately limited to this fixture's explicit pcb_vias and top-side SMT pads.
 */
export async function probePhysicalNet(
  circuitJson: AnyCircuitElement[],
  sourceNetId: string,
  {
    mode = "pcb",
    pixelsPerMm = 100,
  }: {
    mode?: "pcb" | "gerber";
    pixelsPerMm?: number;
  } = {},
) {
  const layers: LayerRef[] = ["top", "inner1", "inner2", "bottom"];
  const db = cju(circuitJson);
  const connMap = getFullConnectivityMapFromCircuitJson(circuitJson);
  const key = connMap.getNetConnectedToId(sourceNetId)!;
  if (!key) throw new Error(`Missing net ${sourceNetId}`);
  const bounds = getBoardBounds(circuitJson);
  const width = Math.ceil((bounds.maxX - bounds.minX) * pixelsPerMm);
  const height = Math.ceil((bounds.maxY - bounds.minY) * pixelsPerMm);
  const board = circuitJson.find((e) => e.type === "pcb_board")!;
  const parent: number[] = [0];
  const root = (id: number): number => {
    while (parent[id] !== id) {
      parent[id] = parent[parent[id]];
      id = parent[id];
    }
    return id;
  };
  const join = (a: number, b: number) => {
    if (a && b) parent[root(b)] = root(a);
  };
  const labelsByLayer = new Map<LayerRef, Int32Array>();
  const elementsById = new Map<string, AnyCircuitElement>();
  for (const layer of layers) {
    const elements =
      buildConnectivityGroups({ circuitJson, connMap, db, layer }).get(key) ??
      [];
    for (const e of elements) {
      if (e.type === "pcb_smtpad") elementsById.set(e.pcb_smtpad_id, e);
      if (e.type === "pcb_via") elementsById.set(e.pcb_via_id, e);
    }
    const args = {
      elements: [board, ...elements],
      bounds,
      width,
      height,
      layer,
    };
    const mask =
      mode === "pcb"
        ? createPcbGroupMask(args)
        : await createGerberGroupMask(args);
    const labels = new Int32Array(width * height);
    // Label physical 8-connected islands using the same contact convention as
    // findBitmapShorts. No layer-to-layer adjacency is permitted here.
    const queue = new Int32Array(width * height);
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || labels[start]) continue;
      const id = parent.length;
      parent.push(id);
      let count = 1;
      queue[0] = start;
      labels[start] = id;
      for (let i = 0; i < count; i++) {
        const pixel = queue[i];
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            const n = ny * width + nx;
            if (!mask[n] || labels[n]) continue;
            labels[n] = id;
            queue[count++] = n;
          }
        }
      }
    }
    labelsByLayer.set(layer, labels);
  }
  const pixel = (x: number, y: number) =>
    getPixelPointFromReal({ x, y, bounds, width, height });
  const at = (layer: LayerRef, x: number, y: number) => {
    const p = pixel(x, y);
    const px = Math.floor(p.x);
    const py = Math.floor(p.y);
    if (px < 0 || px >= width || py < 0 || py >= height) return 0;
    return labelsByLayer.get(layer)?.[py * width + px] ?? 0;
  };
  // Sample inside each via's copper annulus, not its nonconductive drill center.
  // Join only layers actually listed on that plated via. Coincident wires on
  // different layers, and SMT pads, cannot create vertical connections.
  for (const e of elementsById.values()) {
    if (e.type !== "pcb_via") continue;
    const radius = (e.hole_diameter + e.outer_diameter) / 4;
    const contacts = new Set<number>();
    for (const layer of e.layers) {
      for (let i = 0; i < 16; i++) {
        const angle = (i * Math.PI) / 8;
        const id = at(
          layer,
          e.x + radius * Math.cos(angle),
          e.y + radius * Math.sin(angle),
        );
        if (id) contacts.add(id);
      }
    }
    const ids = [...contacts];
    for (const id of ids.slice(1)) join(ids[0], id);
  }
  const groups = new Map<number, string[]>();
  for (const e of elementsById.values()) {
    if (e.type !== "pcb_smtpad") continue;
    if (e.shape === "polygon")
      throw new Error("Repro oracle expects centered pads");
    const port = e.pcb_port_id ? db.pcb_port.get(e.pcb_port_id) : null;
    const sourcePort = port?.source_port_id
      ? db.source_port.get(port.source_port_id)
      : null;
    const component = e.pcb_component_id
      ? db.pcb_component.get(e.pcb_component_id)
      : null;
    const sourceComponent = component?.source_component_id
      ? db.source_component.get(component.source_component_id)
      : null;
    const label = `${sourceComponent?.name}.${sourcePort?.name}`;
    const id = at(e.layer, e.x, e.y);
    if (!id) throw new Error(`No copper at ${label} on ${e.layer}`);
    const group = groups.get(root(id)) ?? [];
    group.push(label);
    groups.set(root(id), group);
  }
  return [...groups.values()]
    .map((g) => g.sort())
    .sort((a, b) => a[0].localeCompare(b[0]));
}
