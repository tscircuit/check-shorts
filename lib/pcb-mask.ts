import { CircuitToCanvasDrawer } from "circuit-to-canvas";
import type {
  AnyCircuitElement,
  LayerRef,
  PcbRenderLayer,
  PcbTrace,
} from "circuit-json";
import type { Bounds } from "@tscircuit/math-utils";
import { BitmapCanvasContext } from "./bitmap-canvas";

const getTraceLayerSegments = (
  trace: PcbTrace,
  layer: LayerRef,
): PcbTrace[] => {
  const segments: PcbTrace[] = [];
  let currentRoute: PcbTrace["route"] = [];

  const flushCurrentRoute = () => {
    if (currentRoute.length < 2) {
      currentRoute = [];
      return;
    }

    segments.push({
      ...trace,
      pcb_trace_id: `${trace.pcb_trace_id}_${layer}_${segments.length}`,
      route: currentRoute,
    });
    currentRoute = [];
  };

  for (const point of trace.route) {
    if ("layer" in point && point.layer === layer) {
      currentRoute.push(point);
      continue;
    }

    flushCurrentRoute();
  }

  flushCurrentRoute();
  return segments;
};

const getPcbLayerElements = (
  elements: AnyCircuitElement[],
  layer: LayerRef,
): AnyCircuitElement[] => {
  const layerElements: AnyCircuitElement[] = [];

  for (const element of elements) {
    if (element.type === "pcb_trace") {
      layerElements.push(...getTraceLayerSegments(element, layer));
    } else {
      layerElements.push(element);
    }
  }

  return layerElements;
};

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
  layer: LayerRef;
}): Uint8Array => {
  const ctx = new BitmapCanvasContext(width, height);
  const drawer = new CircuitToCanvasDrawer(ctx);
  const renderLayer = `${layer}_copper` as PcbRenderLayer;
  const layerElements = getPcbLayerElements(elements, layer);

  drawer.setCameraBounds(bounds);
  drawer.drawElements(layerElements, {
    layers: [renderLayer],
  });
  return ctx.pixels;
};
