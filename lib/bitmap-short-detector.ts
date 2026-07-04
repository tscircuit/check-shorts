import { CircuitToCanvasDrawer } from "circuit-to-canvas";
import {
  ConnectivityMap,
  getFullConnectivityMapFromCircuitJson,
} from "circuit-json-to-connectivity-map";
import { convertSoupToGerberCommands } from "circuit-json-to-gerber";
import { cju } from "@tscircuit/circuit-json-util";
import type { AnyCircuitElement, PcbPort, PcbRenderLayer } from "circuit-json";
import type { Bounds } from "@tscircuit/math-utils";
import { BitmapCanvasContext } from "./bitmap-canvas";

export interface BitmapShort {
  mode: "pcb" | "gerber";
  layer: string;
  firstConnectivityKey: string;
  secondConnectivityKey: string;
  pixelCount: number;
  center: { x: number; y: number };
  firstOwnerLabels: string[];
  secondOwnerLabels: string[];
}

export interface BitmapShortDebugLegendEntry {
  connectivityKey: string;
  color: [number, number, number];
  labels: string[];
}

export interface FindBitmapShortsOptions {
  width?: number;
  height?: number;
  layer?: "top" | "bottom";
  mode?: "pcb" | "gerber";
}

export interface BitmapShortDebugRender {
  width: number;
  height: number;
  rgba: Uint8Array;
  shorts: BitmapShort[];
  legend: BitmapShortDebugLegendEntry[];
}

type CopperElement =
  | Extract<AnyCircuitElement, { type: "pcb_copper_pour" }>
  | Extract<AnyCircuitElement, { type: "pcb_smtpad" }>
  | Extract<AnyCircuitElement, { type: "pcb_trace" }>
  | Extract<AnyCircuitElement, { type: "pcb_via" }>
  | Extract<AnyCircuitElement, { type: "pcb_plated_hole" }>;

type GerberCommand = ReturnType<
  typeof convertSoupToGerberCommands
>[string][number];

type GerberAperture =
  | { type: "circle"; diameter: number }
  | { type: "rect"; width: number; height: number };

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

const getBoardBounds = (circuitJson: AnyCircuitElement[]): Bounds => {
  const board = cju(circuitJson).pcb_board.list()[0];

  if (!board) {
    return { minX: -10, maxX: 10, minY: -10, maxY: 10 };
  }

  const center = board.center ?? { x: 0, y: 0 };
  const width = board.width ?? 20;
  const height = board.height ?? 20;

  return {
    minX: center.x - width / 2,
    maxX: center.x + width / 2,
    minY: center.y - height / 2,
    maxY: center.y + height / 2,
  };
};

const getRealPointFromPixel = ({
  x,
  y,
  bounds,
  width,
  height,
}: {
  x: number;
  y: number;
  bounds: Bounds;
  width: number;
  height: number;
}): { x: number; y: number } => {
  const realWidth = bounds.maxX - bounds.minX;
  const realHeight = bounds.maxY - bounds.minY;
  const scale = Math.min(width / realWidth, height / realHeight);
  const offsetX = (width - realWidth * scale) / 2;
  const offsetY = (height - realHeight * scale) / 2;

  return {
    x: bounds.minX + (x - offsetX) / scale,
    y: bounds.maxY - (y - offsetY) / scale,
  };
};

const getPixelPointFromReal = ({
  x,
  y,
  bounds,
  width,
  height,
}: {
  x: number;
  y: number;
  bounds: Bounds;
  width: number;
  height: number;
}): { x: number; y: number; scale: number } => {
  const realWidth = bounds.maxX - bounds.minX;
  const realHeight = bounds.maxY - bounds.minY;
  const scale = Math.min(width / realWidth, height / realHeight);
  const offsetX = (width - realWidth * scale) / 2;
  const offsetY = (height - realHeight * scale) / 2;

  return {
    x: (x - bounds.minX) * scale + offsetX,
    y: (bounds.maxY - y) * scale + offsetY,
    scale,
  };
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

const buildConnectivityGroups = ({
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

const getGerberAperture = (command: GerberCommand): GerberAperture | null => {
  if (command.command_code !== "ADD") return null;
  if (!("standard_template_code" in command)) return null;

  if (command.standard_template_code === "C") {
    return { type: "circle", diameter: command.diameter };
  }

  if (command.standard_template_code === "R") {
    return { type: "rect", width: command.x_size, height: command.y_size };
  }

  return null;
};

const getGerberLayerCommands = (
  elements: CopperElement[],
  layer: "top" | "bottom",
): GerberCommand[] => {
  const gerberLayers = convertSoupToGerberCommands(elements);
  const layerName = layer === "top" ? "F_Cu" : "B_Cu";

  return gerberLayers[layerName] ?? [];
};

const drawGerberFlash = ({
  ctx,
  aperture,
  x,
  y,
  scale,
}: {
  ctx: BitmapCanvasContext;
  aperture: GerberAperture;
  x: number;
  y: number;
  scale: number;
}) => {
  ctx.beginPath();
  if (aperture.type === "circle") {
    ctx.arc(x, y, (aperture.diameter * scale) / 2, 0, Math.PI * 2);
  } else {
    ctx.rect(
      x - (aperture.width * scale) / 2,
      y - (aperture.height * scale) / 2,
      aperture.width * scale,
      aperture.height * scale,
    );
  }
  ctx.fill();
};

const createGerberGroupMask = ({
  elements,
  bounds,
  width,
  height,
  layer,
}: {
  elements: CopperElement[];
  bounds: Bounds;
  width: number;
  height: number;
  layer: "top" | "bottom";
}): Uint8Array => {
  const ctx = new BitmapCanvasContext(width, height);
  const apertures = new Map<number, GerberAperture>();
  const commands = getGerberLayerCommands(elements, layer);
  let selectedAperture: GerberAperture | null = null;
  let currentPoint: { x: number; y: number } | null = null;
  let isRegion = false;

  for (const command of commands) {
    if ("aperture_number" in command) {
      const aperture = getGerberAperture(command);
      if (aperture) apertures.set(command.aperture_number, aperture);
    }

    if (command.command_code === "D") {
      selectedAperture = apertures.get(command.aperture_number) ?? null;
      continue;
    }

    if (command.command_code === "G36") {
      isRegion = true;
      ctx.beginPath();
      continue;
    }

    if (command.command_code === "G37") {
      isRegion = false;
      ctx.closePath();
      ctx.fill();
      currentPoint = null;
      continue;
    }

    if (command.command_code === "D02") {
      const point = getPixelPointFromReal({
        x: command.x,
        y: command.y,
        bounds,
        width,
        height,
      });
      currentPoint = point;
      if (isRegion) ctx.moveTo(point.x, point.y);
      continue;
    }

    if (command.command_code === "D01") {
      const point = getPixelPointFromReal({
        x: command.x,
        y: command.y,
        bounds,
        width,
        height,
      });

      if (isRegion) {
        ctx.lineTo(point.x, point.y);
      } else if (currentPoint && selectedAperture?.type === "circle") {
        ctx.beginPath();
        ctx.lineWidth = selectedAperture.diameter * point.scale;
        ctx.moveTo(currentPoint.x, currentPoint.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
      }

      currentPoint = point;
      continue;
    }

    if (command.command_code === "D03" && selectedAperture) {
      const point = getPixelPointFromReal({
        x: command.x,
        y: command.y,
        bounds,
        width,
        height,
      });
      drawGerberFlash({
        ctx,
        aperture: selectedAperture,
        x: point.x,
        y: point.y,
        scale: point.scale,
      });
      currentPoint = point;
    }
  }

  return ctx.pixels;
};

const createPcbGroupMask = ({
  elements,
  bounds,
  width,
  height,
  layer,
}: {
  elements: CopperElement[];
  bounds: Bounds;
  width: number;
  height: number;
  layer: "top" | "bottom";
}): Uint8Array => {
  const ctx = new BitmapCanvasContext(width, height);
  const drawer = new CircuitToCanvasDrawer(ctx);
  const renderLayer: PcbRenderLayer =
    layer === "top" ? "top_copper" : "bottom_copper";

  drawer.setCameraBounds(bounds);
  drawer.drawElements(elements as AnyCircuitElement[], {
    layers: [renderLayer],
  });
  return ctx.pixels;
};

const createGroupMask = ({
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
}): Uint8Array => {
  if (mode === "gerber") {
    return createGerberGroupMask({ elements, bounds, width, height, layer });
  }

  return createPcbGroupMask({ elements, bounds, width, height, layer });
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

const getUniqueOwnerLabels = (
  elements: CopperElement[],
  db: ReturnType<typeof cju>,
): string[] => [
  ...new Set(elements.map((element) => getCopperElementLabel(element, db))),
];

const assertGerberLayerCanBeGenerated = (
  circuitJson: AnyCircuitElement[],
  layer: "top" | "bottom",
): void => {
  const gerberLayers = convertSoupToGerberCommands(circuitJson);
  const layerName = layer === "top" ? "F_Cu" : "B_Cu";

  if (!gerberLayers[layerName] || gerberLayers[layerName].length === 0) {
    throw new Error(`Expected ${layerName} Gerber commands to be generated`);
  }
};

const getDebugColorForConnectivityKey = (
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

const setRgbaPixel = (
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

const overlayPcbPortMarkers = ({
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

const overlayShortMarkers = ({
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

export const renderBitmapShortDebug = (
  circuitJson: AnyCircuitElement[],
  options: FindBitmapShortsOptions = {},
): BitmapShortDebugRender => {
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
  const legend = sortedConnectivityGroups.map(
    ([connectivityKey, elements]): BitmapShortDebugLegendEntry => ({
      connectivityKey,
      color: getDebugColorForConnectivityKey(connectivityKey),
      labels: getUniqueOwnerLabels(elements, db),
    }),
  );

  for (const [key, elements] of sortedConnectivityGroups) {
    const color = getDebugColorForConnectivityKey(key);
    const mask = createGroupMask({
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

export const findBitmapShorts = (
  circuitJson: AnyCircuitElement[],
  options: FindBitmapShortsOptions = {},
): BitmapShort[] => renderBitmapShortDebug(circuitJson, options).shorts;
