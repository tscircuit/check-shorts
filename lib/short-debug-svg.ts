import { convertCircuitJsonToPcbSvg } from "circuit-to-svg";
import type { AnyCircuitElement, LayerRef } from "circuit-json";
import type { BitmapShort } from "./bitmap-short-detector";
import { getBoardBounds } from "./bitmap-geometry";
import type { BitmapOpen } from "./bitmap-open-detector";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const getNumberAttribute = (
  svgElement: string,
  name: string,
): number | null => {
  const match = svgElement.match(new RegExp(`(?:^|\\s)${name}="([^"]+)"`));
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
};

const getPcbBoundaryRect = (svg: string): Rect | null => {
  const match = svg.match(/<rect\b[^>]*class="pcb-boundary"[^>]*>/);
  const element = match?.[0];
  if (!element) return null;

  const x = getNumberAttribute(element, "x");
  const y = getNumberAttribute(element, "y");
  const width = getNumberAttribute(element, "width");
  const height = getNumberAttribute(element, "height");
  if (x === null || y === null || width === null || height === null) {
    return null;
  }

  return { x, y, width, height };
};

const getSvgPoint = (
  circuitJson: AnyCircuitElement[],
  baseSvg: string,
  point: { x: number; y: number },
): { x: number; y: number } => {
  const bounds = getBoardBounds(circuitJson);
  const rect = getPcbBoundaryRect(baseSvg);

  if (!rect) {
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
  }

  return {
    x:
      rect.x +
      ((point.x - bounds.minX) / (bounds.maxX - bounds.minX)) * rect.width,
    y:
      rect.y +
      ((bounds.maxY - point.y) / (bounds.maxY - bounds.minY)) * rect.height,
  };
};

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const shortMarkerStroke = "#9b5cff";

export const createShortDebugSvg = (
  circuitJson: AnyCircuitElement[],
  shorts: BitmapShort[],
  options: { layer?: LayerRef; opens?: BitmapOpen[] } = {},
): string => {
  const shortLayers = new Set(shorts.map((short) => short.layer));
  const layer =
    options.layer ??
    (shortLayers.size === 1 ? ([...shortLayers][0] as LayerRef) : undefined);
  const openErrors: AnyCircuitElement[] = (options.opens ?? []).map(
    (open, index) => ({
      type: "pcb_port_not_connected_error",
      error_type: "pcb_port_not_connected_error",
      pcb_port_not_connected_error_id: `bitmap_open_${index}`,
      pcb_port_ids: [
        ...new Set(open.islands.flatMap((island) => island.pcbPortIds)),
      ],
      pcb_component_ids: circuitJson
        .filter(
          (e) =>
            e.type === "pcb_port" &&
            open.islands.some((island) =>
              island.pcbPortIds.includes(e.pcb_port_id),
            ),
        )
        .flatMap((e) =>
          e.type === "pcb_port" && e.pcb_component_id
            ? [e.pcb_component_id]
            : [],
        ),
      message: `OPEN ${open.netNames.join(", ") || open.connectivityKey}: ${open.islands.map((island) => island.labels.join(", ")).join(" | ")}`,
    }),
  );
  const baseSvg = convertCircuitJsonToPcbSvg([...circuitJson, ...openErrors], {
    layer,
    ...(openErrors.length
      ? { shouldDrawErrors: true, showErrorsInTextOverlay: true }
      : {}),
  });
  const seenShortCenters = new Set<string>();
  const overlays = shorts
    .filter((short) => {
      const key = `${short.center.x.toFixed(3)}:${short.center.y.toFixed(3)}`;
      if (seenShortCenters.has(key)) return false;
      seenShortCenters.add(key);
      return true;
    })
    .map((short, index) => {
      const point = getSvgPoint(circuitJson, baseSvg, short.center);
      const firstLabel = short.firstOwnerLabels.join(", ");
      const secondLabel = short.secondOwnerLabels.join(", ");
      const text = `SHORT ${index + 1}: ${firstLabel} <-> ${secondLabel}`;

      return `
  <g data-type="short-debug" data-mode="${escapeXml(short.mode)}" data-layer="${escapeXml(short.layer)}">
    <title>${escapeXml(text)}</title>
    <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="14" fill="none" stroke="${shortMarkerStroke}" stroke-width="4"/>
    <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="6" fill="none" stroke="${shortMarkerStroke}" stroke-width="3"/>
  </g>`;
    })
    .join("");

  return baseSvg.replace("</svg>", `${overlays}\n</svg>`);
};
