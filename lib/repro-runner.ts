import { RootCircuit } from "@tscircuit/core";
import {
  convertSoupToGerberCommands,
  stringifyGerberCommandLayers,
} from "circuit-json-to-gerber";
import type { ReactElement } from "react";
import type { AnyCircuitElement, PcbTrace } from "circuit-json";
import { renderPcbSvg } from "./pcb-debug-svg-renderer";

export interface RenderReproOptions {
  renderUntilSettled?: boolean;
}

export interface RenderedRepro {
  circuitJson: AnyCircuitElement[];
  pcbSvg: string;
}

export type GerberLayerMap = Record<string, string>;

export interface CopperBridgeOptions {
  pcbTraceId?: string;
  layer?: "top" | "bottom";
  width?: number;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

export const renderTscircuitRepro = async (
  tsx: ReactElement,
  options: RenderReproOptions = {},
): Promise<RenderedRepro> => {
  const circuit = new RootCircuit();
  circuit.add(tsx);

  if (options.renderUntilSettled ?? true) {
    await circuit.renderUntilSettled();
  } else {
    circuit.render();
  }

  const circuitJson = circuit.getCircuitJson();
  return {
    circuitJson,
    pcbSvg: renderPcbSvg(circuitJson, undefined),
  };
};

export const convertCircuitJsonToGerberLayers = (
  circuitJson: AnyCircuitElement[],
): GerberLayerMap => {
  const commandLayers = convertSoupToGerberCommands(circuitJson);
  return stringifyGerberCommandLayers(commandLayers);
};

export const appendCopperBridgeTrace = (
  circuitJson: AnyCircuitElement[],
  options: CopperBridgeOptions,
): AnyCircuitElement[] => {
  const layer = options.layer ?? "top";
  const width = options.width ?? 0.2;
  const bridgeTrace: PcbTrace = {
    type: "pcb_trace",
    pcb_trace_id: options.pcbTraceId ?? "pcb_trace_short_bridge",
    route: [
      {
        route_type: "wire",
        x: options.start.x,
        y: options.start.y,
        width,
        layer,
      },
      {
        route_type: "wire",
        x: options.end.x,
        y: options.end.y,
        width,
        layer,
      },
    ],
  };

  return [...circuitJson, bridgeTrace];
};
