import type { AnyCircuitElement } from "circuit-json";
import {
  renderBoardElement,
  renderCircleCopper,
  renderCopperPour,
  renderDrillShape,
  renderPad,
  renderSilkscreen,
  renderTrace,
} from "./element-renderers";
import { formatNumber, getBoardRect, shouldDrawLayer } from "./utils";

export { escapeXml, getSvgPoint } from "./utils";

export const renderPcbSvg = (
  circuitJson: AnyCircuitElement[],
  layer: "top" | "bottom" | undefined,
): string => {
  const boardRect = getBoardRect(circuitJson);
  const backgroundElements: string[] = [
    `<rect class="boundary" x="0" y="0" fill="#000" width="800" height="600" data-type="pcb_background" data-pcb-layer="global"/>`,
    `<rect class="pcb-boundary" fill="none" stroke="#fff" stroke-width="0.3" x="${formatNumber(boardRect.x)}" y="${formatNumber(boardRect.y)}" width="${formatNumber(boardRect.width)}" height="${formatNumber(boardRect.height)}" data-type="pcb_boundary" data-pcb-layer="global"/>`,
  ];
  const boardElements: string[] = [];
  const copperElements: string[] = [];
  const drillElements: string[] = [];
  const silkscreenElements: string[] = [];

  for (const element of circuitJson) {
    const board = renderBoardElement(circuitJson, element);
    if (board) {
      boardElements.push(board);
      continue;
    }

    if (!shouldDrawLayer(element, layer)) continue;

    if (element.type === "pcb_trace") {
      copperElements.push(...renderTrace(circuitJson, element, layer));
    } else if (element.type === "pcb_smtpad") {
      const pad = renderPad(circuitJson, element, layer);
      if (pad) copperElements.push(pad);
    } else if (element.type === "pcb_copper_pour") {
      const copperPour = renderCopperPour(circuitJson, element, layer);
      if (copperPour) copperElements.push(copperPour);
    } else if (
      element.type === "pcb_via" ||
      element.type === "pcb_plated_hole"
    ) {
      const circleCopper = renderCircleCopper(circuitJson, element, layer);
      if (circleCopper) copperElements.push(circleCopper);

      const drill = renderDrillShape(circuitJson, element);
      if (drill) drillElements.push(drill);
    } else if (element.type === "pcb_hole" || element.type === "pcb_cutout") {
      const drill = renderDrillShape(circuitJson, element);
      if (drill) drillElements.push(drill);
    } else {
      const silkscreen = renderSilkscreen(circuitJson, element);
      if (silkscreen) silkscreenElements.push(silkscreen);
    }
  }

  const elements = [
    ...backgroundElements,
    ...boardElements,
    ...copperElements,
    ...drillElements,
    ...silkscreenElements,
  ];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><style></style>${elements.join("")}</svg>`;
};
