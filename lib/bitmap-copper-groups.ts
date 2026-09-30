import { cju } from "@tscircuit/circuit-json-util";
import type { AnyCircuitElement, LayerRef } from "circuit-json";
import type { ConnectivityMap } from "circuit-json-to-connectivity-map";

export type CopperElement =
  | Extract<AnyCircuitElement, { type: "pcb_copper_pour" }>
  | Extract<AnyCircuitElement, { type: "pcb_smtpad" }>
  | Extract<AnyCircuitElement, { type: "pcb_trace" }>
  | Extract<AnyCircuitElement, { type: "pcb_via" }>
  | Extract<AnyCircuitElement, { type: "pcb_plated_hole" }>;

const isCopperElement = (
  element: AnyCircuitElement,
): element is CopperElement =>
  element.type === "pcb_copper_pour" ||
  element.type === "pcb_smtpad" ||
  element.type === "pcb_trace" ||
  element.type === "pcb_via" ||
  element.type === "pcb_plated_hole";

const isCopperElementOnLayer = (
  element: CopperElement,
  layer: LayerRef,
): boolean => {
  if (element.type === "pcb_via" || element.type === "pcb_plated_hole") {
    return element.layers?.includes(layer) ?? true;
  }

  if (element.type === "pcb_trace") {
    return element.route.some(
      (point) => "layer" in point && point.layer === layer,
    );
  }

  return element.layer === layer;
};

// Supplement lookups without changing the caller's map or its canonical keys.
const createConnectivityLookup = (
  connMap: ConnectivityMap,
  db: ReturnType<typeof cju>,
): ((id: string) => string | undefined) => {
  const sourceConnectivityKeys = new Set<string>();
  for (const id of [
    ...db.source_net.list().map((net) => net.source_net_id),
    ...db.source_trace.list().map((trace) => trace.source_trace_id),
  ]) {
    const key = connMap.getNetConnectedToId(id);
    if (key) sourceConnectivityKeys.add(key);
  }

  const viaConnectivityKeys = new Map<string, Set<string>>();
  for (const via of db.pcb_via.list()) {
    if (!via.pcb_port_ids?.length) continue;
    const key =
      connMap.getNetConnectedToId(via.pcb_via_id) ??
      (via.subcircuit_connectivity_map_key
        ? connMap.getNetConnectedToId(via.subcircuit_connectivity_map_key)
        : undefined) ??
      (via.source_net_id
        ? connMap.getNetConnectedToId(via.source_net_id)
        : undefined) ??
      via.subcircuit_connectivity_map_key ??
      (via.source_net_id
        ? getSourceNetGlobalConnectivityKey(
            via.source_net_id,
            (id) => connMap.getNetConnectedToId(id),
            db,
          )
        : undefined) ??
      via.pcb_port_ids
        .map((id) => connMap.getNetConnectedToId(id))
        .find((key) => key !== undefined);
    if (!key) continue;

    for (const id of [via.pcb_via_id, ...via.pcb_port_ids]) {
      const keys = viaConnectivityKeys.get(id) ?? new Set<string>();
      keys.add(key);
      viaConnectivityKeys.set(id, keys);
    }
  }

  return (id) => {
    const key = connMap.getNetConnectedToId(id);
    // Via-port metadata must not reassign an existing logical net.
    if (key && sourceConnectivityKeys.has(key)) return key;

    const viaKeys = new Set(viaConnectivityKeys.get(id));
    if (key) {
      // Include traces and other copper already connected to a via port.
      for (const member of connMap.getIdsConnectedToNet(key)) {
        for (const viaKey of viaConnectivityKeys.get(member) ?? []) {
          viaKeys.add(viaKey);
        }
      }
    }
    // Conflicting via identities leave the original copper group separate.
    return viaKeys.size === 1 ? [...viaKeys][0] : key;
  };
};

const getSourceNetGlobalConnectivityKey = (
  sourceNetId: string,
  getConnectivityKey: (id: string) => string | undefined,
  db: ReturnType<typeof cju>,
): string => {
  const sourceNet = db.source_net.get(sourceNetId);

  return (
    getConnectivityKey(sourceNetId) ??
    sourceNet?.subcircuit_connectivity_map_key ??
    sourceNetId
  );
};

const getCopperElementGlobalConnectivityKey = (
  element: CopperElement,
  getConnectivityKey: (id: string) => string | undefined,
  db: ReturnType<typeof cju>,
): string | undefined => {
  if (element.type === "pcb_copper_pour") {
    return element.source_net_id
      ? getSourceNetGlobalConnectivityKey(
          element.source_net_id,
          getConnectivityKey,
          db,
        )
      : element.pcb_copper_pour_id;
  }

  if (element.type === "pcb_smtpad") {
    return element.pcb_port_id
      ? (getConnectivityKey(element.pcb_port_id) ?? element.pcb_port_id)
      : element.pcb_smtpad_id;
  }

  if (element.type === "pcb_trace") {
    return element.source_trace_id
      ? (getConnectivityKey(element.source_trace_id) ?? element.source_trace_id)
      : (getConnectivityKey(element.pcb_trace_id) ?? element.pcb_trace_id);
  }

  if (element.type === "pcb_via") {
    return (
      getConnectivityKey(element.pcb_via_id) ??
      element.subcircuit_connectivity_map_key ??
      element.pcb_via_id
    );
  }

  return element.pcb_port_id
    ? (getConnectivityKey(element.pcb_port_id) ?? element.pcb_port_id)
    : element.pcb_plated_hole_id;
};

export const buildConnectivityGroups = ({
  circuitJson,
  connMap,
  db,
  layer,
}: {
  circuitJson: AnyCircuitElement[];
  connMap: ConnectivityMap;
  db: ReturnType<typeof cju>;
  layer: LayerRef;
}): Map<string, CopperElement[]> => {
  const getConnectivityKey = createConnectivityLookup(connMap, db);

  const groups = new Map<string, CopperElement[]>();

  for (const element of circuitJson) {
    if (!isCopperElement(element)) continue;
    if (!isCopperElementOnLayer(element, layer)) continue;

    const key = getCopperElementGlobalConnectivityKey(
      element,
      getConnectivityKey,
      db,
    );
    if (!key) continue;

    const group = groups.get(key) ?? [];
    group.push(element);
    groups.set(key, group);
  }

  return groups;
};

const getCopperElementLabel = (
  element: CopperElement,
  db: ReturnType<typeof cju>,
): string => {
  if (element.type === "pcb_copper_pour") {
    const sourceNet = element.source_net_id
      ? db.source_net.get(element.source_net_id)
      : null;
    return sourceNet
      ? `copperpour:${sourceNet.name}`
      : element.pcb_copper_pour_id;
  }

  if (element.type === "pcb_smtpad") {
    const pcbComponent = element.pcb_component_id
      ? db.pcb_component.get(element.pcb_component_id)
      : null;
    const sourceComponent = pcbComponent?.source_component_id
      ? db.source_component.get(pcbComponent.source_component_id)
      : null;
    const pcbPort = element.pcb_port_id
      ? db.pcb_port.get(element.pcb_port_id)
      : null;
    const sourcePort = pcbPort?.source_port_id
      ? db.source_port.get(pcbPort.source_port_id)
      : null;

    if (sourceComponent?.name && sourcePort?.name) {
      return `${sourceComponent.name}.${sourcePort.name}`;
    }

    return sourceComponent?.name ?? element.pcb_smtpad_id;
  }

  if (element.type === "pcb_trace") return element.pcb_trace_id;
  if (element.type === "pcb_via") return element.pcb_via_id;
  return element.pcb_plated_hole_id;
};

export const getUniqueOwnerLabels = (
  elements: CopperElement[],
  db: ReturnType<typeof cju>,
): string[] => [
  ...new Set(elements.map((element) => getCopperElementLabel(element, db))),
];
