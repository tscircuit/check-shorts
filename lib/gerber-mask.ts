import type { Bounds } from "@tscircuit/math-utils";
import type { AnyCircuitElement } from "circuit-json";
import { getGerberLayerString } from "./gerber-layer";
import { renderGerberToSvg } from "./gerber-svg";
import { getMaskFromPng } from "./png-mask";
import { renderSvgToPng } from "./svg-to-png";

const getBoardViewBox = (bounds: Bounds): string => {
  const unitScale = 1000;
  const minX = bounds.minX * unitScale;
  const minY = -bounds.maxY * unitScale;
  const width = (bounds.maxX - bounds.minX) * unitScale;
  const height = (bounds.maxY - bounds.minY) * unitScale;

  return `${minX} ${minY} ${width} ${height}`;
};

const forceSvgViewport = ({
  svg,
  bounds,
  width,
  height,
}: {
  svg: string;
  bounds: Bounds;
  width: number;
  height: number;
}): string =>
  svg
    .replace(/\swidth="[^"]*"/, ` width="${width}"`)
    .replace(/\sheight="[^"]*"/, ` height="${height}"`)
    .replace(/\bviewBox="[^"]*"/, `viewBox="${getBoardViewBox(bounds)}"`)
    .replace(
      /\btransform="translate\([^"]+\) scale\(1,-1\)"/,
      `transform="scale(1,-1)"`,
    );

export const createGerberGroupMask = async ({
  elements,
  bounds,
  width,
  height,
  layer,
}: {
  elements: AnyCircuitElement[];
  bounds: Bounds;
  width: number;
  height: number;
  layer: "top" | "bottom";
}): Promise<Uint8Array> => {
  const gerber = getGerberLayerString(elements, layer);
  if (!gerber) return new Uint8Array(width * height);

  const svg = await renderGerberToSvg(gerber);
  const boardSvg = forceSvgViewport({ svg, bounds, width, height });
  return getMaskFromPng(renderSvgToPng(boardSvg));
};
