import type { AnyCircuitElement } from "circuit-json";
import { getBoardBounds } from "../bitmap-geometry";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const getSvgPoint = (
  circuitJson: AnyCircuitElement[],
  point: { x: number; y: number },
): { x: number; y: number } => {
  const bounds = getBoardBounds(circuitJson);
  const boardWidth = bounds.maxX - bounds.minX;
  const boardHeight = bounds.maxY - bounds.minY;
  const scale = Math.min(700 / boardWidth, 500 / boardHeight);
  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };

  return {
    x: 400 + (point.x - center.x) * scale,
    y: 300 - (point.y - center.y) * scale,
  };
};

export const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export const formatNumber = (value: number): string =>
  Number.isFinite(value) ? Number(value.toFixed(3)).toString() : "0";

export const hasFinitePoint = (
  point: unknown,
): point is { x: number; y: number } =>
  typeof point === "object" &&
  point !== null &&
  "x" in point &&
  "y" in point &&
  typeof point.x === "number" &&
  typeof point.y === "number" &&
  Number.isFinite(point.x) &&
  Number.isFinite(point.y);

export const pathFromPoints = (
  circuitJson: AnyCircuitElement[],
  points: Array<{ x: number; y: number }>,
  closePath = false,
): string => {
  const [firstPoint, ...rest] = points;
  if (!firstPoint) return "";

  const firstSvgPoint = getSvgPoint(circuitJson, firstPoint);
  const commands = [
    `M ${formatNumber(firstSvgPoint.x)} ${formatNumber(firstSvgPoint.y)}`,
  ];

  for (const point of rest) {
    const svgPoint = getSvgPoint(circuitJson, point);
    commands.push(`L ${formatNumber(svgPoint.x)} ${formatNumber(svgPoint.y)}`);
  }

  if (closePath) commands.push("Z");
  return commands.join(" ");
};

export const pathFromRing = (
  circuitJson: AnyCircuitElement[],
  ring: { vertices?: Array<{ x: number; y: number }> },
): string =>
  Array.isArray(ring.vertices)
    ? pathFromPoints(circuitJson, ring.vertices, true)
    : "";

export const getBoardRect = (circuitJson: AnyCircuitElement[]): Rect => {
  const bounds = getBoardBounds(circuitJson);
  const topLeft = getSvgPoint(circuitJson, { x: bounds.minX, y: bounds.maxY });
  const bottomRight = getSvgPoint(circuitJson, {
    x: bounds.maxX,
    y: bounds.minY,
  });

  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
};

export const getStrokeWidth = (
  circuitJson: AnyCircuitElement[],
  realWidth: number,
): number => {
  const bounds = getBoardBounds(circuitJson);
  const scale = Math.min(
    700 / (bounds.maxX - bounds.minX),
    500 / (bounds.maxY - bounds.minY),
  );
  return Math.max(1, realWidth * scale);
};

const getLayer = (element: AnyCircuitElement): string | undefined => {
  if ("layer" in element && typeof element.layer === "string") {
    return element.layer;
  }
  return undefined;
};

export const shouldDrawLayer = (
  element: AnyCircuitElement,
  layer: "top" | "bottom" | undefined,
): boolean => {
  if (!layer) return true;

  if (element.type === "pcb_trace") {
    return element.route.some(
      (point) => "layer" in point && point.layer === layer,
    );
  }

  if (
    (element.type === "pcb_via" || element.type === "pcb_plated_hole") &&
    Array.isArray(element.layers)
  ) {
    return element.layers.includes(layer);
  }

  return getLayer(element) === layer || getLayer(element) === undefined;
};

export const getCopperFill = (layer: "top" | "bottom" | undefined): string =>
  layer === "bottom" ? "rgb(77, 127, 196)" : "rgb(200, 52, 52)";

export const drillFill = "#FF26E2";
export const silkscreenFill = "#f2eda1";

export const getElementCenter = (
  element: AnyCircuitElement,
): { x: number; y: number } | null => {
  if (hasFinitePoint(element)) return element;

  if (
    "center" in element &&
    hasFinitePoint((element as { center?: unknown }).center)
  ) {
    return (element as { center: { x: number; y: number } }).center;
  }

  if (
    "anchor_position" in element &&
    hasFinitePoint((element as { anchor_position?: unknown }).anchor_position)
  ) {
    return (element as { anchor_position: { x: number; y: number } })
      .anchor_position;
  }

  return null;
};

export const getRotation = (element: AnyCircuitElement): number =>
  "ccw_rotation" in element && typeof element.ccw_rotation === "number"
    ? element.ccw_rotation
    : "rotation" in element && typeof element.rotation === "number"
      ? element.rotation
      : 0;

interface ShapeRenderOptions {
  circuitJson: AnyCircuitElement[];
  center: { x: number; y: number };
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  rotation?: number;
  className: string;
  dataType: string;
}

export const renderCircleShape = ({
  circuitJson,
  center,
  radius,
  fill,
  stroke,
  strokeWidth,
  className,
  dataType,
}: ShapeRenderOptions & { radius: number }): string => {
  const svgCenter = getSvgPoint(circuitJson, center);
  const attributes = [
    `class="${className}"`,
    `cx="${formatNumber(svgCenter.x)}"`,
    `cy="${formatNumber(svgCenter.y)}"`,
    `r="${formatNumber(getStrokeWidth(circuitJson, radius))}"`,
    fill ? `fill="${fill}"` : 'fill="none"',
    stroke ? `stroke="${stroke}"` : "",
    strokeWidth
      ? `stroke-width="${formatNumber(getStrokeWidth(circuitJson, strokeWidth))}"`
      : "",
    `data-type="${escapeXml(dataType)}"`,
  ].filter(Boolean);

  return `<circle ${attributes.join(" ")}/>`;
};

export const renderRectShape = ({
  circuitJson,
  center,
  width,
  height,
  fill,
  stroke,
  strokeWidth,
  rotation = 0,
  className,
  dataType,
}: ShapeRenderOptions & { width: number; height: number }): string => {
  const svgCenter = getSvgPoint(circuitJson, center);
  const svgWidth = getStrokeWidth(circuitJson, width);
  const svgHeight = getStrokeWidth(circuitJson, height);
  const attributes = [
    `class="${className}"`,
    `x="${formatNumber(svgCenter.x - svgWidth / 2)}"`,
    `y="${formatNumber(svgCenter.y - svgHeight / 2)}"`,
    `width="${formatNumber(svgWidth)}"`,
    `height="${formatNumber(svgHeight)}"`,
    fill ? `fill="${fill}"` : 'fill="none"',
    stroke ? `stroke="${stroke}"` : "",
    strokeWidth
      ? `stroke-width="${formatNumber(getStrokeWidth(circuitJson, strokeWidth))}"`
      : "",
    rotation
      ? `transform="rotate(${formatNumber(-rotation)} ${formatNumber(svgCenter.x)} ${formatNumber(svgCenter.y)})"`
      : "",
    `data-type="${escapeXml(dataType)}"`,
  ].filter(Boolean);

  return `<rect ${attributes.join(" ")}/>`;
};

export const renderOvalShape = ({
  circuitJson,
  center,
  radiusX,
  radiusY,
  fill,
  stroke,
  strokeWidth,
  rotation = 0,
  className,
  dataType,
}: ShapeRenderOptions & { radiusX: number; radiusY: number }): string => {
  const svgCenter = getSvgPoint(circuitJson, center);
  const attributes = [
    `class="${className}"`,
    `cx="${formatNumber(svgCenter.x)}"`,
    `cy="${formatNumber(svgCenter.y)}"`,
    `rx="${formatNumber(getStrokeWidth(circuitJson, radiusX))}"`,
    `ry="${formatNumber(getStrokeWidth(circuitJson, radiusY))}"`,
    fill ? `fill="${fill}"` : 'fill="none"',
    stroke ? `stroke="${stroke}"` : "",
    strokeWidth
      ? `stroke-width="${formatNumber(getStrokeWidth(circuitJson, strokeWidth))}"`
      : "",
    rotation
      ? `transform="rotate(${formatNumber(-rotation)} ${formatNumber(svgCenter.x)} ${formatNumber(svgCenter.y)})"`
      : "",
    `data-type="${escapeXml(dataType)}"`,
  ].filter(Boolean);

  return `<ellipse ${attributes.join(" ")}/>`;
};

export const renderPillShape = ({
  circuitJson,
  center,
  width,
  height,
  fill,
  stroke,
  strokeWidth,
  rotation = 0,
  className,
  dataType,
}: ShapeRenderOptions & { width: number; height: number }): string => {
  const svgCenter = getSvgPoint(circuitJson, center);
  const svgWidth = getStrokeWidth(circuitJson, width);
  const svgHeight = getStrokeWidth(circuitJson, height);
  const radius = Math.min(svgWidth, svgHeight) / 2;
  const attributes = [
    `class="${className}"`,
    `x="${formatNumber(svgCenter.x - svgWidth / 2)}"`,
    `y="${formatNumber(svgCenter.y - svgHeight / 2)}"`,
    `width="${formatNumber(svgWidth)}"`,
    `height="${formatNumber(svgHeight)}"`,
    `rx="${formatNumber(radius)}"`,
    `ry="${formatNumber(radius)}"`,
    fill ? `fill="${fill}"` : 'fill="none"',
    stroke ? `stroke="${stroke}"` : "",
    strokeWidth
      ? `stroke-width="${formatNumber(getStrokeWidth(circuitJson, strokeWidth))}"`
      : "",
    rotation
      ? `transform="rotate(${formatNumber(-rotation)} ${formatNumber(svgCenter.x)} ${formatNumber(svgCenter.y)})"`
      : "",
    `data-type="${escapeXml(dataType)}"`,
  ].filter(Boolean);

  return `<rect ${attributes.join(" ")}/>`;
};
