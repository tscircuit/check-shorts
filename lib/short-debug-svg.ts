import { convertCircuitJsonToPcbSvg } from "circuit-to-svg";
import type { AnyCircuitElement } from "circuit-json";
import { cju } from "@tscircuit/circuit-json-util";
import type { BitmapShort } from "./bitmap-short-detector";

const getSvgPoint = (
  circuitJson: AnyCircuitElement[],
  point: { x: number; y: number },
): { x: number; y: number } => {
  const board = cju(circuitJson).pcb_board.list()[0];
  const center = board?.center ?? { x: 0, y: 0 };
  const boardWidth = board?.width ?? 20;
  const boardHeight = board?.height ?? 20;
  const scale = Math.min(700 / boardWidth, 500 / boardHeight);

  return {
    x: 400 + (point.x - center.x) * scale,
    y: 300 - (point.y - center.y) * scale,
  };
};

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export const createShortDebugSvg = (
  circuitJson: AnyCircuitElement[],
  shorts: BitmapShort[],
): string => {
  const baseSvg = convertCircuitJsonToPcbSvg(circuitJson);
  const seenShortCenters = new Set<string>();
  const overlays = shorts
    .filter((short) => {
      const key = `${short.center.x.toFixed(3)}:${short.center.y.toFixed(3)}`;
      if (seenShortCenters.has(key)) return false;
      seenShortCenters.add(key);
      return true;
    })
    .map((short, index) => {
      const point = getSvgPoint(circuitJson, short.center);
      const firstLabel = short.firstOwnerLabels.join(", ");
      const secondLabel = short.secondOwnerLabels.join(", ");
      const text = `SHORT ${index + 1}: ${firstLabel} <-> ${secondLabel}`;

      return `
  <g data-type="short-debug" data-mode="${escapeXml(short.mode)}">
    <title>${escapeXml(text)}</title>
    <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="10" fill="none" stroke="#ff0033" stroke-width="3"/>
    <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4" fill="none" stroke="#ff0033" stroke-width="2"/>
    <line x1="${(point.x - 14).toFixed(2)}" y1="${point.y.toFixed(2)}" x2="${(point.x + 14).toFixed(2)}" y2="${point.y.toFixed(2)}" stroke="#ff0033" stroke-width="2"/>
    <line x1="${point.x.toFixed(2)}" y1="${(point.y - 14).toFixed(2)}" x2="${point.x.toFixed(2)}" y2="${(point.y + 14).toFixed(2)}" stroke="#ff0033" stroke-width="2"/>
  </g>`;
    })
    .join("");

  return baseSvg.replace("</svg>", `${overlays}\n</svg>`);
};
