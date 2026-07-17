import type { AnyCircuitElement, LayerRef } from "circuit-json";
import {
  convertSoupToGerberCommands,
  stringifyGerberCommandLayers,
} from "circuit-json-to-gerber";

export type CopperGerberLayerName = "F_Cu" | "B_Cu" | `In${number}_Cu`;

export const getGerberLayerName = (layer: LayerRef): CopperGerberLayerName => {
  if (layer === "top") return "F_Cu";
  if (layer === "bottom") return "B_Cu";
  return `In${layer.slice("inner".length)}_Cu` as CopperGerberLayerName;
};

export const getGerberLayerString = (
  elements: AnyCircuitElement[],
  layer: LayerRef,
): string | undefined => {
  const gerberLayers = stringifyGerberCommandLayers(
    convertSoupToGerberCommands(elements),
  );

  return gerberLayers[getGerberLayerName(layer)];
};

export const assertGerberLayerCanBeGenerated = (
  circuitJson: AnyCircuitElement[],
  layer: LayerRef,
): void => {
  const gerberLayers = convertSoupToGerberCommands(circuitJson);
  const layerName = getGerberLayerName(layer);

  if (!gerberLayers[layerName] || gerberLayers[layerName].length === 0) {
    throw new Error(`Expected ${layerName} Gerber commands to be generated`);
  }
};
