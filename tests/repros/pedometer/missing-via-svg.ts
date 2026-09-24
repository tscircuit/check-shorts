import type { AnyCircuitElement } from "circuit-json";
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg";
import { getBoardBounds, getPixelPointFromReal } from "lib/bitmap-geometry";
import { MISSING_VIA } from "./fixture";

/** Keep the entire literal board in the SVG; viewBox alone performs the zoom. */
export function missingViaSvg(
  circuitJson: AnyCircuitElement[],
  repaired = false,
) {
  const bounds = getBoardBounds(circuitJson);
  const base = convertCircuitJsonToPcbSvg(circuitJson, {
    layer: "inner2",
    width: 1400,
    height: 1150,
    showSolderMask: false,
    includeVersion: false,
    viewport: bounds,
  });
  const xy = (x: number, y: number) =>
    getPixelPointFromReal({ x, y, bounds, width: 1400, height: 1150 });
  const scale = xy(0, 0).scale;
  const p = xy(MISSING_VIA.x, MISSING_VIA.y);
  const corner = xy(-9.65, -1.25);
  const zoom = {
    x: corner.x,
    y: corner.y,
    width: 2.2 * scale,
    height: 2.5 * scale,
  };
  const viewBox = `${zoom.x} ${zoom.y} ${zoom.width} ${zoom.height}`;
  const body = base.replace(/^<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  // Dashed ghost pads are TOP copper references, explicitly labelled as such.
  const topPads = circuitJson.filter(
    (e) => e.type === "pcb_smtpad" && e.pcb_component_id === "pcb_component_18",
  );
  const ghosts = topPads
    .map((e) => {
      if (e.type !== "pcb_smtpad" || e.shape !== "circle") return "";
      const q = xy(e.x, e.y);
      return `<circle cx="${q.x}" cy="${q.y}" r="${e.radius * scale}" fill="none" stroke="#ff6e80" stroke-width="0.65" stroke-dasharray="1 0.7"/>`;
    })
    .join("");
  const color = repaired ? "#61eda2" : "#ffdf65";
  // Inline arrowhead avoids a resvg 2.6 panic with cross-viewport markers.
  const marker = `<g data-type="missing-via-marker"><circle cx="${p.x}" cy="${p.y}" r="${0.19 * scale}" fill="none" stroke="${color}" stroke-width="0.9"/><path d="M${p.x + 0.48 * scale} ${p.y - 0.72 * scale} L${p.x + 0.09 * scale} ${p.y - 0.18 * scale}" stroke="${color}" stroke-width="1.2" fill="none"/><path d="M${p.x + 0.09 * scale} ${p.y - 0.18 * scale} L${p.x + 0.12 * scale} ${p.y - 0.4 * scale} L${p.x + 0.28 * scale} ${p.y - 0.3 * scale} Z" fill="${color}"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1320" height="960" viewBox="0 0 1320 960">
  <rect width="1320" height="960" fill="#101923"/>
  <g font-family="sans-serif" fill="#f1f6ff">
  <text x="28" y="44" font-size="28">PMID missing-via repro: ${repaired ? "repair control" : "literal v1.1.3 board"}</text>
  <text x="28" y="77" font-size="19">Inner2 copper • dashed red circles = top-layer U2 pads, not inner2 connections</text>
  <svg x="28" y="104" width="660" height="750" viewBox="${viewBox}" data-type="error-zoom">${body}${ghosts}${marker}</svg>
  <text x="734" y="124" font-size="22">Whole-board minimap</text>
  <svg x="730" y="146" width="550" height="452" viewBox="0 0 1400 1150">${body}<rect x="${zoom.x}" y="${zoom.y}" width="${zoom.width}" height="${zoom.height}" fill="none" stroke="#57dafa" stroke-width="7"/></svg>
  <text x="734" y="638" font-size="23" fill="${color}">${repaired ? "Added plated via joins the layers" : "No via at this layer transition"}</text>
  <text x="734" y="675" font-size="20">U2.PMID_B / B2 • pcb_port_66</text>
  <text x="734" y="708" font-size="20">x = -8.20005, y = -3.199898 mm</text>
  <text x="734" y="754" font-size="19">Trace ends on inner2; pad exists on top.</text>
  <text x="734" y="787" font-size="19">${repaired ? "Control: all 8 PMID pads in one island." : "Original: 8 PMID pads in 2 islands."}</text>
  <text x="28" y="898" font-size="20">source_net_6_mst1_0 → U2.PMID_B: matching X/Y and endpoint IDs do not connect copper across layers.</text>
  <text x="28" y="932" font-size="17" fill="#b9cbdc">Literal source: imrishabh18/pedometer v1.1.3 • dist/index/circuit.json • zoom uses an SVG viewBox</text>
  </g></svg>`;
}
