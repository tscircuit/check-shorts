import { cju } from "@tscircuit/circuit-json-util";
import type { AnyCircuitElement } from "circuit-json";
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

const getElementLayer = (element: CopperElement): string | undefined => {
  if (element.type === "pcb_plated_hole") return "top";
  if (element.type === "pcb_via") return "top";
  if (element.type === "pcb_trace") {
    return element.route.find((point) => "layer" in point)?.layer;
  }
  return element.layer;
};

const getConnectedIdToGlobalKeyMap = (
  connMap: ConnectivityMap,
): Map<string, string> => {
  const connectedIdToKey = new Map<string, string>();

  for (const [globalConnectivityKey, connectedIds] of Object.entries(
    connMap.netMap,
  )) {
    for (const connectedId of connectedIds) {
      connectedIdToKey.set(connectedId, globalConnectivityKey);
    }
  }

  return connectedIdToKey;
};

const getSourceNetGlobalConnectivityKey = (
  sourceNetId: string,
  connMap: ConnectivityMap,
  db: ReturnType<typeof cju>,
): string => {
  const sourceNet = db.source_net.get(sourceNetId);

  return (
    connMap.getNetConnectedToId(sourceNetId) ??
    sourceNet?.subcircuit_connectivity_map_key ??
    sourceNetId
  );
};

const getCopperElementGlobalConnectivityKey = (
  element: CopperElement,
  connMap: ConnectivityMap,
  connectedIdToKey: Map<string, string>,
  db: ReturnType<typeof cju>,
): string | undefined => {
  if (element.type === "pcb_copper_pour") {
    return element.source_net_id
      ? getSourceNetGlobalConnectivityKey(element.source_net_id, connMap, db)
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
      : element.pcb_trace_id;
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

export const buildConnectivityGroups = ({
  circuitJson,
  connMap,
  db,
  layer,
}: {
  circuitJson: AnyCircuitElement[];
  connMap: ConnectivityMap;
  db: ReturnType<typeof cju>;
  layer: "top" | "bottom";
}): Map<string, CopperElement[]> => {
  const connectedIdToKey = getConnectedIdToGlobalKeyMap(connMap);
  const groups = new Map<string, CopperElement[]>();

  for (const element of circuitJson) {
    if (!isCopperElement(element)) continue;
    if (getElementLayer(element) !== layer) continue;

    const key = getCopperElementGlobalConnectivityKey(
      element,
      connMap,
      connectedIdToKey,
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
