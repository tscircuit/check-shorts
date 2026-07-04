import { CircuitToCanvasDrawer } from "circuit-to-canvas";
import type { AnyCircuitElement, PcbRenderLayer } from "circuit-json";
import type { Bounds } from "@tscircuit/math-utils";
import { BitmapCanvasContext } from "./bitmap-canvas";

export const createPcbGroupMask = ({
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
}): Uint8Array => {
  const ctx = new BitmapCanvasContext(width, height);
  const drawer = new CircuitToCanvasDrawer(ctx);
  const renderLayer: PcbRenderLayer =
    layer === "top" ? "top_copper" : "bottom_copper";

  drawer.setCameraBounds(bounds);
  drawer.drawElements(elements, {
    layers: [renderLayer],
  });
  return ctx.pixels;
};
