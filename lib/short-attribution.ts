import type { cju } from "@tscircuit/circuit-json-util";
import {
  type Bounds,
  getBoundsFromPoints,
  type Point,
} from "@tscircuit/math-utils";
import type { AnyCircuitElement, LayerRef } from "circuit-json";
import type { ConnectivityMap } from "circuit-json-to-connectivity-map";
import {
  type CopperElement,
  getCopperElementGlobalConnectivityKey,
  getCopperElementId,
  getCopperElementLabel,
  isCopperElement,
} from "./bitmap-copper-groups";
import type { ShortInvolvedPrimitive } from "./bitmap-short-types";

interface BulgeVertex {
  x: number;
  y: number;
  bulge?: number;
}

const rotatePoint = (
  point: Point,
  center: Point,
  ccwDegrees: number,
): Point => {
  if (!ccwDegrees) {
    return { x: point.x - center.x, y: point.y - center.y };
  }

  const radians = (-ccwDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos,
  };
};

const distanceToCenteredBox = (
  localPoint: Point,
  width: number,
  height: number,
): number => {
  const dx = Math.max(0, Math.abs(localPoint.x) - width / 2);
  const dy = Math.max(0, Math.abs(localPoint.y) - height / 2);
  return Math.hypot(dx, dy);
};

const distancePointToSegment = (p: Point, a: Point, b: Point): number => {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const lengthSq = vx * vx + vy * vy;

  if (lengthSq <= 1e-12) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }

  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / lengthSq),
  );
  const projX = a.x + t * vx;
  const projY = a.y + t * vy;

  return Math.hypot(p.x - projX, p.y - projY);
};

const isPointInPolygon = (point: Point, ring: Point[]): boolean => {
  if (ring.length < 3) return false;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const current = ring[i];
    const previous = ring[j];
    if (!current || !previous) continue;
    const xi = current.x;
    const yi = current.y;
    const xj = previous.x;
    const yj = previous.y;
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
};

const distancePointToRingEdges = (point: Point, ring: Point[]): number => {
  if (ring.length === 0) return Number.POSITIVE_INFINITY;
  const first = ring[0];
  if (ring.length === 1 && first) {
    return Math.hypot(point.x - first.x, point.y - first.y);
  }

  let minDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (!a || !b) continue;
    const d = distancePointToSegment(point, a, b);
    if (d < minDistance) minDistance = d;
  }

  return minDistance;
};

const distancePointToPolygon = (point: Point, polygon: Point[]): number => {
  if (polygon.length < 3) return distancePointToRingEdges(point, polygon);
  if (isPointInPolygon(point, polygon)) return 0;
  return distancePointToRingEdges(point, polygon);
};

const linearizeBulgeRing = (vertices: BulgeVertex[]): Point[] => {
  if (vertices.length === 0) return [];
  const points: Point[] = [];

  for (let i = 0; i < vertices.length; i++) {
    const start = vertices[i];
    const end = vertices[(i + 1) % vertices.length];
    if (!start || !end) continue;
    points.push({ x: start.x, y: start.y });

    const bulge = start.bulge ?? 0;
    if (Math.abs(bulge) <= 1e-6) continue;

    const chordX = end.x - start.x;
    const chordY = end.y - start.y;
    const chordLength = Math.hypot(chordX, chordY);
    if (chordLength <= 1e-9) continue;

    const theta = 4 * Math.atan(bulge);
    const sinHalfTheta = Math.sin(theta / 2);
    if (Math.abs(sinHalfTheta) <= 1e-9) continue;

    const radius = chordLength / (2 * Math.abs(sinHalfTheta));
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const perpX = -chordY / chordLength;
    const perpY = chordX / chordLength;
    const centerOffset = radius * Math.cos(theta / 2);
    const sign = bulge >= 0 ? 1 : -1;
    const centerSign = Math.abs(bulge) <= 1 ? sign : -sign;
    const cx = midX + perpX * centerOffset * centerSign;
    const cy = midY + perpY * centerOffset * centerSign;

    const startAngle = Math.atan2(start.y - cy, start.x - cx);
    const steps = Math.max(
      4,
      Math.min(24, Math.ceil(Math.abs(theta) / (Math.PI / 12))),
    );
    for (let step = 1; step < steps; step++) {
      const angle = startAngle + (theta * step) / steps;
      points.push({
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      });
    }
  }

  return points;
};

export const getCopperPourGeometryBounds = (
  element: Extract<CopperElement, { type: "pcb_copper_pour" }>,
): Bounds | null => {
  if (element.shape === "rect") {
    const halfDiag = Math.hypot(element.width, element.height) / 2;
    return {
      minX: element.center.x - halfDiag,
      maxX: element.center.x + halfDiag,
      minY: element.center.y - halfDiag,
      maxY: element.center.y + halfDiag,
    };
  }

  if (element.shape === "brep") {
    const points = linearizeBulgeRing(
      element.brep_shape?.outer_ring?.vertices ?? [],
    );
    for (const innerRing of element.brep_shape?.inner_rings ?? []) {
      points.push(...linearizeBulgeRing(innerRing.vertices ?? []));
    }
    return getBoundsFromPoints(points);
  }

  if ("points" in element && Array.isArray(element.points)) {
    return getBoundsFromPoints(element.points);
  }

  return null;
};

export const getCopperElementDistanceToPointOnLayer = (
  element: CopperElement,
  point: Point,
  layer: LayerRef,
): number => {
  if (element.type === "pcb_smtpad") {
    if (element.layer !== layer) return Number.POSITIVE_INFINITY;
    if (element.shape === "polygon") {
      return distancePointToPolygon(point, element.points);
    }
    if (element.shape === "circle") {
      return Math.max(
        0,
        Math.hypot(point.x - element.x, point.y - element.y) - element.radius,
      );
    }
    const rotation =
      "ccw_rotation" in element ? (element.ccw_rotation ?? 0) : 0;
    const local = rotatePoint(point, element, rotation);
    return distanceToCenteredBox(local, element.width, element.height);
  }

  if (element.type === "pcb_via") {
    if (element.layers && !element.layers.includes(layer)) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.max(
      0,
      Math.hypot(point.x - element.x, point.y - element.y) -
        element.outer_diameter / 2,
    );
  }

  if (element.type === "pcb_plated_hole") {
    if (element.layers && !element.layers.includes(layer)) {
      return Number.POSITIVE_INFINITY;
    }
    if (element.shape === "circle") {
      return Math.max(
        0,
        Math.hypot(point.x - element.x, point.y - element.y) -
          element.outer_diameter / 2,
      );
    }
    if (element.shape === "hole_with_polygon_pad") {
      const padPoints = (element.pad_outline ?? []).map((pt) => ({
        x: element.x + pt.x,
        y: element.y + pt.y,
      }));
      return distancePointToPolygon(point, padPoints);
    }
    if ("rect_pad_width" in element && "rect_pad_height" in element) {
      const rotation =
        "rect_ccw_rotation" in element ? (element.rect_ccw_rotation ?? 0) : 0;
      const local = rotatePoint(point, element, rotation);
      return distanceToCenteredBox(
        local,
        element.rect_pad_width,
        element.rect_pad_height,
      );
    }
    if ("outer_width" in element && "outer_height" in element) {
      const rotation =
        "ccw_rotation" in element ? (element.ccw_rotation ?? 0) : 0;
      const local = rotatePoint(point, element, rotation);
      return distanceToCenteredBox(
        local,
        element.outer_width,
        element.outer_height,
      );
    }
    return Number.POSITIVE_INFINITY;
  }

  if (element.type === "pcb_trace") {
    let minDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < element.route.length; i++) {
      const routePoint = element.route[i];
      if (!routePoint) continue;

      if ("start" in routePoint && "end" in routePoint) {
        if ("layer" in routePoint && routePoint.layer !== layer) continue;
        const halfWidth = (routePoint.width ?? 0.15) / 2;
        const d = Math.max(
          0,
          distancePointToSegment(point, routePoint.start, routePoint.end) -
            halfWidth,
        );
        if (d < minDistance) minDistance = d;
        continue;
      }

      if (!("x" in routePoint) || !("y" in routePoint)) continue;

      if (
        ("route_type" in routePoint && routePoint.route_type === "via") ||
        "via_diameter" in routePoint
      ) {
        const touchesLayer =
          ("from_layer" in routePoint && routePoint.from_layer === layer) ||
          ("to_layer" in routePoint && routePoint.to_layer === layer) ||
          !("from_layer" in routePoint);
        if (touchesLayer) {
          const radius =
            ("via_diameter" in routePoint
              ? Number(routePoint.via_diameter)
              : 0.6) / 2;
          const d = Math.max(
            0,
            Math.hypot(point.x - routePoint.x, point.y - routePoint.y) - radius,
          );
          if (d < minDistance) minDistance = d;
        }
      }

      if ("layer" in routePoint && routePoint.layer === layer) {
        const halfWidth =
          ("width" in routePoint ? Number(routePoint.width) : 0.15) / 2;
        const nextPoint = element.route[i + 1];
        if (
          nextPoint &&
          "x" in nextPoint &&
          "y" in nextPoint &&
          "layer" in nextPoint &&
          nextPoint.layer === layer
        ) {
          const nextHalfWidth =
            ("width" in nextPoint ? Number(nextPoint.width) : 0.15) / 2;
          const d = Math.max(
            0,
            distancePointToSegment(point, routePoint, nextPoint) -
              Math.max(halfWidth, nextHalfWidth),
          );
          if (d < minDistance) minDistance = d;
        } else {
          const d = Math.max(
            0,
            Math.hypot(point.x - routePoint.x, point.y - routePoint.y) -
              halfWidth,
          );
          if (d < minDistance) minDistance = d;
        }
      }
    }

    return minDistance;
  }

  if (element.layer !== layer) return Number.POSITIVE_INFINITY;

  if (element.shape === "rect") {
    const local = rotatePoint(point, element.center, element.rotation ?? 0);
    return distanceToCenteredBox(local, element.width, element.height);
  }

  if (element.shape === "polygon") {
    return distancePointToPolygon(point, element.points);
  }

  const outerRing = linearizeBulgeRing(
    element.brep_shape?.outer_ring?.vertices ?? [],
  );
  if (outerRing.length < 3) return Number.POSITIVE_INFINITY;
  if (!isPointInPolygon(point, outerRing)) {
    return distancePointToRingEdges(point, outerRing);
  }

  for (const inner of element.brep_shape?.inner_rings ?? []) {
    const holeRing = linearizeBulgeRing(inner.vertices ?? []);
    if (holeRing.length >= 3 && isPointInPolygon(point, holeRing)) {
      return distancePointToRingEdges(point, holeRing);
    }
  }

  return 0;
};

const getSourcePortTerminalLabel = (
  sourcePortId: string,
  db: ReturnType<typeof cju>,
): string | null => {
  const sourcePort = db.source_port.get(sourcePortId);
  if (!sourcePort) return null;
  const sourceComponent = sourcePort.source_component_id
    ? db.source_component.get(sourcePort.source_component_id)
    : null;
  if (sourceComponent?.name && sourcePort.name) {
    return `${sourceComponent.name}.${sourcePort.name}`;
  }
  return sourcePort.name || null;
};

export const resolveLogicalNetName = ({
  connectivityKey,
  groupElements,
  circuitJson,
  connMap,
  db,
}: {
  connectivityKey: string;
  groupElements: CopperElement[];
  circuitJson: AnyCircuitElement[];
  connMap: ConnectivityMap;
  db: ReturnType<typeof cju>;
}): string => {
  const connectedIds = new Set<string>(
    connMap.netMap[connectivityKey] ?? [connectivityKey],
  );
  connectedIds.add(connectivityKey);

  const netNames = new Set<string>();

  for (const element of circuitJson) {
    if (element.type === "source_net") {
      if (
        connectedIds.has(element.source_net_id) ||
        element.subcircuit_connectivity_map_key === connectivityKey
      ) {
        if (element.name) netNames.add(element.name);
      }
    } else if (element.type === "source_trace") {
      if (
        connectedIds.has(element.source_trace_id) ||
        element.subcircuit_connectivity_map_key === connectivityKey
      ) {
        for (const netId of element.connected_source_net_ids ?? []) {
          const sourceNet = db.source_net.get(netId);
          if (sourceNet?.name) netNames.add(sourceNet.name);
        }
      }
    }
  }

  for (const element of groupElements) {
    if (element.type === "pcb_copper_pour" && element.source_net_id) {
      const sourceNet = db.source_net.get(element.source_net_id);
      if (sourceNet?.name) netNames.add(sourceNet.name);
    }
  }

  if (netNames.size > 0) {
    return [...netNames].sort().join("/");
  }

  const terminalLabels = new Set<string>();
  for (const connectedId of connectedIds) {
    const directPortLabel = getSourcePortTerminalLabel(connectedId, db);
    if (directPortLabel) {
      terminalLabels.add(directPortLabel);
      continue;
    }

    const pcbPort = db.pcb_port.get(connectedId);
    if (pcbPort?.source_port_id) {
      const portLabel = getSourcePortTerminalLabel(pcbPort.source_port_id, db);
      if (portLabel) terminalLabels.add(portLabel);
    }
  }

  for (const element of groupElements) {
    if (element.type === "pcb_smtpad" || element.type === "pcb_plated_hole") {
      const label = getCopperElementLabel(element, db);
      if (label.includes(".")) terminalLabels.add(label);
    }
  }

  if (terminalLabels.size > 0) {
    const sorted = [...terminalLabels].sort();
    if (sorted.length <= 2) return sorted.join("—");
    return `${sorted[0]}..${sorted[1]} (+${sorted.length - 2})`;
  }

  for (const element of circuitJson) {
    if (
      element.type === "source_trace" &&
      connectedIds.has(element.source_trace_id) &&
      element.display_name
    ) {
      return element.display_name;
    }
  }

  const firstGroupElement = groupElements[0];
  if (firstGroupElement) {
    return getCopperElementLabel(firstGroupElement, db);
  }

  return connectivityKey;
};

const getPrimitivePriority = (primitive: ShortInvolvedPrimitive): number => {
  if (primitive.label.includes(".")) return 0;
  if (primitive.type === "pcb_copper_pour") return 1;
  if (primitive.type === "pcb_smtpad" || primitive.type === "pcb_plated_hole") {
    return 2;
  }
  if (primitive.type === "pcb_via") return 3;
  return 4;
};

const toShortInvolvedPrimitive = (
  element: CopperElement,
  db: ReturnType<typeof cju>,
): ShortInvolvedPrimitive => ({
  id: getCopperElementId(element),
  type: element.type,
  label: getCopperElementLabel(element, db),
});

export const findInvolvedPrimitivesForShortCluster = ({
  elements,
  samplePoints,
  layer,
  contactToleranceMm,
  db,
}: {
  elements: CopperElement[];
  samplePoints: Point[];
  layer: LayerRef;
  contactToleranceMm: number;
  db: ReturnType<typeof cju>;
}): ShortInvolvedPrimitive[] => {
  if (elements.length === 0) return [];

  const matched: ShortInvolvedPrimitive[] = [];
  let closestElement: CopperElement | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const element of elements) {
    let elementMinDistance = Number.POSITIVE_INFINITY;
    for (const samplePoint of samplePoints) {
      const distance = getCopperElementDistanceToPointOnLayer(
        element,
        samplePoint,
        layer,
      );
      if (distance < elementMinDistance) {
        elementMinDistance = distance;
      }
      if (elementMinDistance <= contactToleranceMm) {
        break;
      }
    }

    if (elementMinDistance < closestDistance) {
      closestDistance = elementMinDistance;
      closestElement = element;
    }

    if (elementMinDistance <= contactToleranceMm) {
      matched.push(toShortInvolvedPrimitive(element, db));
    }
  }

  if (matched.length === 0 && closestElement) {
    matched.push(toShortInvolvedPrimitive(closestElement, db));
  }

  const seen = new Set<string>();
  return matched
    .sort((a, b) => {
      const priorityDiff = getPrimitivePriority(a) - getPrimitivePriority(b);
      if (priorityDiff !== 0) return priorityDiff;
      return a.label.localeCompare(b.label);
    })
    .filter((item) => {
      const key = `${item.type}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const isNamedAnchorLabel = (
  label: string,
  type: ShortInvolvedPrimitive["type"],
): boolean =>
  label.includes(".") ||
  (type === "pcb_copper_pour" && label.startsWith("copperpour:"));

const getElementLayers = (element: CopperElement): LayerRef[] => {
  if (element.type === "pcb_via" || element.type === "pcb_plated_hole") {
    return element.layers ?? ["top", "bottom"];
  }
  if (element.type === "pcb_trace") {
    const layers = new Set<LayerRef>();
    for (const pt of element.route) {
      if ("layer" in pt && pt.layer) layers.add(pt.layer);
      if ("from_layer" in pt && pt.from_layer) layers.add(pt.from_layer);
      if ("to_layer" in pt && pt.to_layer) layers.add(pt.to_layer);
    }
    return [...layers];
  }
  return [element.layer];
};

const getElementPortIds = (element: CopperElement): string[] => {
  const portIds = new Set<string>();
  if (
    (element.type === "pcb_smtpad" || element.type === "pcb_plated_hole") &&
    element.pcb_port_id
  ) {
    portIds.add(element.pcb_port_id);
  }
  if (element.type === "pcb_trace") {
    for (const pt of element.route) {
      if ("start_pcb_port_id" in pt && pt.start_pcb_port_id) {
        portIds.add(pt.start_pcb_port_id);
      }
      if ("end_pcb_port_id" in pt && pt.end_pcb_port_id) {
        portIds.add(pt.end_pcb_port_id);
      }
    }
  }
  return [...portIds];
};

const getElementKeyPointsOnLayer = (
  element: CopperElement,
  layer: LayerRef,
): Point[] => {
  if (element.type === "pcb_smtpad") {
    if (element.layer !== layer) return [];
    if (element.shape === "polygon") return element.points;
    return [{ x: element.x, y: element.y }];
  }
  if (element.type === "pcb_via" || element.type === "pcb_plated_hole") {
    if (element.layers && !element.layers.includes(layer)) return [];
    return [{ x: element.x, y: element.y }];
  }
  if (element.type === "pcb_trace") {
    const pts: Point[] = [];
    for (const pt of element.route) {
      if ("start" in pt && "end" in pt) {
        if (!("layer" in pt) || pt.layer === layer) {
          pts.push(pt.start, pt.end);
        }
      } else if ("x" in pt && "y" in pt) {
        if (
          ("layer" in pt && pt.layer === layer) ||
          ("from_layer" in pt && pt.from_layer === layer) ||
          ("to_layer" in pt && pt.to_layer === layer)
        ) {
          pts.push({ x: pt.x, y: pt.y });
        }
      }
    }
    return pts;
  }
  return [];
};

const areElementsPhysicallyAdjacent = (
  a: CopperElement,
  b: CopperElement,
): boolean => {
  const layersA = getElementLayers(a);
  const layersB = new Set(getElementLayers(b));
  const sharedLayers = layersA.filter((layer) => layersB.has(layer));
  if (sharedLayers.length === 0) return false;

  const touchToleranceMm = 0.06;
  for (const layer of sharedLayers) {
    const pointsA = getElementKeyPointsOnLayer(a, layer);
    for (const pt of pointsA) {
      if (
        getCopperElementDistanceToPointOnLayer(b, pt, layer) <= touchToleranceMm
      ) {
        return true;
      }
    }
    const pointsB = getElementKeyPointsOnLayer(b, layer);
    for (const pt of pointsB) {
      if (
        getCopperElementDistanceToPointOnLayer(a, pt, layer) <= touchToleranceMm
      ) {
        return true;
      }
    }
  }

  return false;
};

const getAnchorElementLabel = (
  element: CopperElement,
  db: ReturnType<typeof cju>,
): string => {
  if (element.type === "pcb_plated_hole" && element.pcb_port_id) {
    const pcbComponent = element.pcb_component_id
      ? db.pcb_component.get(element.pcb_component_id)
      : null;
    const sourceComponent = pcbComponent?.source_component_id
      ? db.source_component.get(pcbComponent.source_component_id)
      : null;
    const pcbPort = db.pcb_port.get(element.pcb_port_id);
    const sourcePort = pcbPort?.source_port_id
      ? db.source_port.get(pcbPort.source_port_id)
      : null;
    if (sourceComponent?.name && sourcePort?.name) {
      return `${sourceComponent.name}.${sourcePort.name}`;
    }
  }
  return getCopperElementLabel(element, db);
};

export const buildMinimalWitnessPath = ({
  involvedPrimitives,
  connectivityKey,
  circuitJson,
  connMap,
  connectedIdToKey,
  db,
}: {
  involvedPrimitives: ShortInvolvedPrimitive[];
  connectivityKey: string;
  circuitJson: AnyCircuitElement[];
  connMap: ConnectivityMap;
  connectedIdToKey: Map<string, string>;
  db: ReturnType<typeof cju>;
}): string[] => {
  const targetPrimitive = involvedPrimitives[0];
  if (!targetPrimitive) return [connectivityKey];

  const directTerminal = involvedPrimitives.find((p) => p.label.includes("."));
  if (directTerminal) {
    return [directTerminal.label];
  }

  const directPour = involvedPrimitives.find(
    (p) => p.type === "pcb_copper_pour" && p.label.startsWith("copperpour:"),
  );
  if (directPour) {
    return [directPour.label];
  }

  const netElements: CopperElement[] = [];
  for (const element of circuitJson) {
    if (!isCopperElement(element)) continue;
    const key = getCopperElementGlobalConnectivityKey(
      element,
      connMap,
      connectedIdToKey,
      db,
    );
    if (key === connectivityKey) {
      netElements.push(element);
    }
  }

  const startIndex = netElements.findIndex(
    (el) =>
      el.type === targetPrimitive.type &&
      getCopperElementId(el) === targetPrimitive.id,
  );
  if (startIndex === -1) {
    return [targetPrimitive.label];
  }

  const portToElementIndices = new Map<string, number[]>();
  netElements.forEach((element, idx) => {
    for (const portId of getElementPortIds(element)) {
      const list = portToElementIndices.get(portId) ?? [];
      list.push(idx);
      portToElementIndices.set(portId, list);
    }
  });

  const adjacency = Array.from(
    { length: netElements.length },
    () => new Set<number>(),
  );
  for (const indices of portToElementIndices.values()) {
    for (let i = 0; i < indices.length; i++) {
      const idxA = indices[i];
      if (idxA === undefined) continue;
      for (let j = i + 1; j < indices.length; j++) {
        const idxB = indices[j];
        if (idxB === undefined) continue;
        adjacency[idxA]?.add(idxB);
        adjacency[idxB]?.add(idxA);
      }
    }
  }

  for (let i = 0; i < netElements.length; i++) {
    const elA = netElements[i];
    if (!elA) continue;
    for (let j = i + 1; j < netElements.length; j++) {
      const elB = netElements[j];
      if (!elB || adjacency[i]?.has(j)) continue;
      if (areElementsPhysicallyAdjacent(elA, elB)) {
        adjacency[i]?.add(j);
        adjacency[j]?.add(i);
      }
    }
  }

  const parent = new Int32Array(netElements.length).fill(-1);
  const visited = new Uint8Array(netElements.length);
  const queue: number[] = [startIndex];
  visited[startIndex] = 1;

  let bestAnchorIndex = -1;
  let fallbackPourAnchorIndex = -1;

  for (let qIdx = 0; qIdx < queue.length; qIdx++) {
    const current = queue[qIdx];
    if (current === undefined) continue;
    const currentEl = netElements[current];
    if (!currentEl) continue;
    const anchorLabel = getAnchorElementLabel(currentEl, db);

    if (current !== startIndex) {
      if (anchorLabel.includes(".")) {
        bestAnchorIndex = current;
        break;
      }
      if (isNamedAnchorLabel(anchorLabel, currentEl.type)) {
        if (fallbackPourAnchorIndex === -1) {
          fallbackPourAnchorIndex = current;
        }
        continue;
      }
    }

    const sortedNeighbors = [...(adjacency[current] ?? [])].sort((a, b) => {
      const elA = netElements[a];
      const elB = netElements[b];
      const labelA = elA ? getAnchorElementLabel(elA, db) : "";
      const labelB = elB ? getAnchorElementLabel(elB, db) : "";
      return labelA.localeCompare(labelB);
    });
    for (const next of sortedNeighbors) {
      if (visited[next]) continue;
      visited[next] = 1;
      parent[next] = current;
      queue.push(next);
    }
  }

  const chosenAnchor =
    bestAnchorIndex !== -1 ? bestAnchorIndex : fallbackPourAnchorIndex;

  if (chosenAnchor !== -1) {
    const chain: string[] = [];
    let cursor = chosenAnchor;
    while (cursor !== -1) {
      const el = netElements[cursor];
      if (el) {
        const label =
          cursor === chosenAnchor
            ? getAnchorElementLabel(el, db)
            : getCopperElementLabel(el, db);
        if (chain[chain.length - 1] !== label) {
          chain.push(label);
        }
      }
      cursor = parent[cursor] ?? -1;
    }
    return chain;
  }

  for (const el of netElements) {
    const anchorLabel = getAnchorElementLabel(el, db);
    if (anchorLabel.includes(".")) {
      return [anchorLabel, targetPrimitive.label];
    }
  }

  return [targetPrimitive.label];
};
