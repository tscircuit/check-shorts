import { cju } from "@tscircuit/circuit-json-util";
import type { AnyCircuitElement, LayerRef } from "circuit-json";
import type { ConnectivityMap } from "circuit-json-to-connectivity-map";

export type CopperElement =
  | Extract<AnyCircuitElement, { type: "pcb_copper_pour" }>
  | Extract<AnyCircuitElement, { type: "pcb_smtpad" }>
  | Extract<AnyCircuitElement, { type: "pcb_trace" }>
  | Extract<AnyCircuitElement, { type: "pcb_via" }>
  | Extract<AnyCircuitElement, { type: "pcb_plated_hole" }>;

type ConnectivityId = string;
type GlobalConnectivityKey = string;
type ConnectedIdToGlobalKeyMap = Map<ConnectivityId, GlobalConnectivityKey>;

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

const getConnectedIdToGlobalKeyMap = (
  connMap: ConnectivityMap,
): ConnectedIdToGlobalKeyMap => {
  const connectedIdToKey: ConnectedIdToGlobalKeyMap = new Map();

  for (const [globalConnectivityKey, connectedIds] of Object.entries(
    connMap.netMap,
  )) {
    for (const connectedId of connectedIds) {
      connectedIdToKey.set(connectedId, globalConnectivityKey);
    }
  }

  return connectedIdToKey;
};

const getSourceNetGlobalConnectivityKey = ({
  sourceNetId,
  connMap,
  db,
}: {
  sourceNetId: string;
  connMap: ConnectivityMap;
  db: ReturnType<typeof cju>;
}): GlobalConnectivityKey => {
  const sourceNet = db.source_net.get(sourceNetId);

  return (
    connMap.getNetConnectedToId(sourceNetId) ??
    sourceNet?.subcircuit_connectivity_map_key ??
    sourceNetId
  );
};

const getPcbPortSourceConnectivityMapKey = ({
  pcbPortId,
  db,
}: {
  pcbPortId: string;
  db: ReturnType<typeof cju>;
}): GlobalConnectivityKey | undefined => {
  const sourcePortId = db.pcb_port.get(pcbPortId)?.source_port_id;
  return sourcePortId
    ? db.source_port.get(sourcePortId)?.subcircuit_connectivity_map_key
    : undefined;
};

const getCopperElementSourceConnectivityMapKey = ({
  element,
  db,
}: {
  element: CopperElement;
  db: ReturnType<typeof cju>;
}): GlobalConnectivityKey | undefined => {
  if (element.type === "pcb_copper_pour") {
    return element.source_net_id
      ? db.source_net.get(element.source_net_id)
          ?.subcircuit_connectivity_map_key
      : undefined;
  }

  if (element.type === "pcb_trace") {
    return element.source_trace_id
      ? db.source_trace.get(element.source_trace_id)
          ?.subcircuit_connectivity_map_key
      : undefined;
  }

  if (element.type === "pcb_via") {
    return element.subcircuit_connectivity_map_key;
  }

  return element.pcb_port_id
    ? getPcbPortSourceConnectivityMapKey({
        pcbPortId: element.pcb_port_id,
        db,
      })
    : undefined;
};

const getCopperElementFullConnectivityKey = ({
  element,
  connMap,
  connectedIdToKey,
  db,
}: {
  element: CopperElement;
  connMap: ConnectivityMap;
  connectedIdToKey: ConnectedIdToGlobalKeyMap;
  db: ReturnType<typeof cju>;
}): GlobalConnectivityKey | undefined => {
  if (element.type === "pcb_copper_pour") {
    return element.source_net_id
      ? getSourceNetGlobalConnectivityKey({
          sourceNetId: element.source_net_id,
          connMap,
          db,
        })
      : element.pcb_copper_pour_id;
  }

  if (element.type === "pcb_smtpad") {
    return element.pcb_port_id
      ? (connectedIdToKey.get(element.pcb_port_id) ?? element.pcb_port_id)
      : element.pcb_smtpad_id;
  }

  if (element.type === "pcb_trace") {
    return element.source_trace_id
      ? (connectedIdToKey.get(element.source_trace_id) ??
          element.source_trace_id)
      : (connectedIdToKey.get(element.pcb_trace_id) ?? element.pcb_trace_id);
  }

  if (element.type === "pcb_via") {
    return (
      connectedIdToKey.get(element.pcb_via_id) ??
      element.subcircuit_connectivity_map_key ??
      element.pcb_via_id
    );
  }

  return element.pcb_port_id
    ? (connectedIdToKey.get(element.pcb_port_id) ?? element.pcb_port_id)
    : element.pcb_plated_hole_id;
};

const getTraceEndpointPcbPortIds = (
  trace: Extract<AnyCircuitElement, { type: "pcb_trace" }>,
): string[] =>
  trace.route.flatMap((routePoint) => {
    if (routePoint.route_type !== "wire") return [];
    return [routePoint.start_pcb_port_id, routePoint.end_pcb_port_id].filter(
      (pcbPortId): pcbPortId is string => Boolean(pcbPortId),
    );
  });

// A trace endpoint on a different source net makes the full connectivity map
// merge two intended nets. Only those merged groups need source-level keys;
// every other group keeps the existing full-connectivity behavior.
const getFullConnectivityKeysContainingSourceConflicts = ({
  circuitJson,
  connectedIdToKey,
  db,
}: {
  circuitJson: AnyCircuitElement[];
  connectedIdToKey: ConnectedIdToGlobalKeyMap;
  db: ReturnType<typeof cju>;
}): Set<GlobalConnectivityKey> => {
  const fullConnectivityKeysContainingSourceConflicts =
    new Set<GlobalConnectivityKey>();

  for (const element of circuitJson) {
    if (element.type !== "pcb_trace" || !element.source_trace_id) continue;

    const traceSourceConnectivityMapKey = db.source_trace.get(
      element.source_trace_id,
    )?.subcircuit_connectivity_map_key;
    if (!traceSourceConnectivityMapKey) continue;

    const endpointHasDifferentSourceKey = getTraceEndpointPcbPortIds(
      element,
    ).some((pcbPortId) => {
      const endpointSourceConnectivityMapKey =
        getPcbPortSourceConnectivityMapKey({ pcbPortId, db });
      return (
        endpointSourceConnectivityMapKey !== undefined &&
        endpointSourceConnectivityMapKey !== traceSourceConnectivityMapKey
      );
    });
    if (!endpointHasDifferentSourceKey) continue;

    const fullConnectivityKey = connectedIdToKey.get(element.source_trace_id);
    if (fullConnectivityKey) {
      fullConnectivityKeysContainingSourceConflicts.add(fullConnectivityKey);
    }
  }

  return fullConnectivityKeysContainingSourceConflicts;
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
}): Map<GlobalConnectivityKey, CopperElement[]> => {
  const connectedIdToKey = getConnectedIdToGlobalKeyMap(connMap);
  const fullConnectivityKeysContainingSourceConflicts =
    getFullConnectivityKeysContainingSourceConflicts({
      circuitJson,
      connectedIdToKey,
      db,
    });
  const groups = new Map<GlobalConnectivityKey, CopperElement[]>();

  for (const element of circuitJson) {
    if (!isCopperElement(element)) continue;
    if (!isCopperElementOnLayer(element, layer)) continue;

    const fullConnectivityKey = getCopperElementFullConnectivityKey({
      element,
      connMap,
      connectedIdToKey,
      db,
    });
    if (!fullConnectivityKey) continue;

    const sourceConnectivityMapKey = getCopperElementSourceConnectivityMapKey({
      element,
      db,
    });
    const globalConnectivityKey =
      fullConnectivityKeysContainingSourceConflicts.has(fullConnectivityKey)
        ? (sourceConnectivityMapKey ?? `full:${fullConnectivityKey}`)
        : fullConnectivityKey;

    const group = groups.get(globalConnectivityKey) ?? [];
    group.push(element);
    groups.set(globalConnectivityKey, group);
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
