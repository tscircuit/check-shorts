import type { AnyCircuitElement } from "circuit-json";
import {
  convertSoupToGerberCommands,
  stringifyGerberCommandLayers,
} from "circuit-json-to-gerber";

export const getGerberLayerName = (layer: "top" | "bottom"): "F_Cu" | "B_Cu" =>
  layer === "top" ? "F_Cu" : "B_Cu";

export const getGerberLayerString = (
  elements: AnyCircuitElement[],
  layer: "top" | "bottom",
): string | undefined => {
  const gerberLayers = stringifyGerberCommandLayers(
    convertSoupToGerberCommands(elements),
  );

  return gerberLayers[getGerberLayerName(layer)];
};

export const assertGerberLayerCanBeGenerated = (
  circuitJson: AnyCircuitElement[],
  layer: "top" | "bottom",
): void => {
  const gerberLayers = convertSoupToGerberCommands(circuitJson);
  const layerName = getGerberLayerName(layer);

  if (!gerberLayers[layerName] || gerberLayers[layerName].length === 0) {
    throw new Error(`Expected ${layerName} Gerber commands to be generated`);
  }
};
