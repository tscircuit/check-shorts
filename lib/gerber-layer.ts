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

const normalizeRotation = (rotation: number): number =>
  ((rotation % 360) + 360) % 360;

const isOddQuarterTurn = (rotation: number): boolean =>
  Math.abs(rotation - 90) < 1e-6 || Math.abs(rotation - 270) < 1e-6;

/** gerber-to-svg ignores aperture rotations on rounded-rectangle flashes. */
const normalizeSmtpadRotations = (
  elements: AnyCircuitElement[],
): AnyCircuitElement[] =>
  elements.flatMap((pad): AnyCircuitElement[] => {
    if (pad.type !== "pcb_smtpad" || pad.shape !== "rotated_rect") return [pad];

    const rotation = normalizeRotation(pad.ccw_rotation);
    if (isOddQuarterTurn(rotation)) {
      return [
        { ...pad, width: pad.height, height: pad.width, ccw_rotation: 0 },
      ];
    }
    const radius = Math.min(
      pad.corner_radius ?? 0,
      pad.width / 2,
      pad.height / 2,
    );
    if (rotation === 0 || rotation === 180 || radius <= 0) return [pad];

    // A central rectangle and round-ended strokes have the exact same outline.
    // The Gerber exporter rotates their coordinates directly.
    const offset = pad.height / 2 - radius;
    const angle = (rotation * Math.PI) / 180;
    const caps = (offset === 0 ? [0] : [-offset, offset]).map((y, index) => ({
      ...pad,
      pcb_smtpad_id: `${pad.pcb_smtpad_id}_cap_${index}`,
      shape: "rotated_pill" as const,
      x: pad.x - y * Math.sin(angle),
      y: pad.y + y * Math.cos(angle),
      height: 2 * radius,
      radius,
    }));
    if (offset === 0) return caps;
    return [
      { ...pad, height: 2 * offset, corner_radius: 0, rect_border_radius: 0 },
      ...caps,
    ];
  });

export const getGerberLayerString = (
  elements: AnyCircuitElement[],
  layer: LayerRef,
): string | undefined => {
  const gerberLayers = stringifyGerberCommandLayers(
    convertSoupToGerberCommands(normalizeSmtpadRotations(elements)),
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
