import type { AnyCircuitElement } from "circuit-json";
import type { BitmapShort } from "./bitmap-short-detector";
import { escapeXml, getSvgPoint, renderPcbSvg } from "./pcb-debug-svg-renderer";

const shortMarkerStroke = "#9b5cff";

export const createShortDebugSvg = (
  circuitJson: AnyCircuitElement[],
  shorts: BitmapShort[],
  options: { layer?: "top" | "bottom" } = {},
): string => {
  const shortLayers = new Set(shorts.map((short) => short.layer));
  const layer =
    options.layer ??
    (shortLayers.size === 1
      ? ([...shortLayers][0] as "top" | "bottom")
      : undefined);
  const baseSvg = renderPcbSvg(circuitJson, layer);
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
  <g data-type="short-debug" data-mode="${escapeXml(short.mode)}" data-layer="${escapeXml(short.layer)}">
    <title>${escapeXml(text)}</title>
    <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="12" fill="none" stroke="${shortMarkerStroke}" stroke-width="3" stroke-opacity="0.65"/>
    <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4" fill="${shortMarkerStroke}" fill-opacity="0.4"/>
    <line x1="${(point.x - 16).toFixed(2)}" y1="${point.y.toFixed(2)}" x2="${(point.x + 16).toFixed(2)}" y2="${point.y.toFixed(2)}" stroke="${shortMarkerStroke}" stroke-width="3" stroke-opacity="0.65"/>
    <line x1="${point.x.toFixed(2)}" y1="${(point.y - 16).toFixed(2)}" x2="${point.x.toFixed(2)}" y2="${(point.y + 16).toFixed(2)}" stroke="${shortMarkerStroke}" stroke-width="3" stroke-opacity="0.65"/>
  </g>`;
    })
    .join("");

  return baseSvg.replace("</svg>", `${overlays}\n</svg>`);
};
