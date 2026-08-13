import type { LayerRef } from "circuit-json";

/**
 * An "open" is the inverse of a short.
 *
 * A short is one contiguous piece of copper owned by *more than one* net. An
 * open is one net whose copper is split across *more than one* disconnected
 * island — i.e. the net was not fully routed, so pads that should be joined are
 * physically separate.
 *
 * Detected on the same rendered copper as shorts, which matters: a net can be
 * joined by a copper pour rather than a trace, and only the rasterised copper
 * shows that. Graph-based connectivity (circuit-json-to-connectivity-map) does
 * not model pours, and a pad belonging to an unrouted net may have no pcb_port
 * at all — so the pixels are the only reliable ground truth.
 */
export interface BitmapOpenIsland {
  /** Pixel count of this island — a rough proxy for how much copper it holds. */
  pixelCount: number;
  /** Island centre in real (mm) coordinates, for reporting/markers. */
  center: { x: number; y: number };
  /** Labels of the copper elements in this island, e.g. "SW1.pin4". */
  ownerLabels: string[];
}

export interface BitmapOpen {
  mode: "pcb" | "gerber";
  layer: LayerRef;
  /** The connectivity key (net) that is split. */
  connectivityKey: string;
  /** Every label on the net, whichever island it fell into. */
  ownerLabels: string[];
  /** The disconnected copper islands, largest first. */
  islands: BitmapOpenIsland[];
}

export interface FindBitmapOpensOptions {
  width?: number;
  height?: number;
  micronsPerPixel?: number;
  pixelsPerMm?: number;
  layer?: LayerRef;
  mode?: "pcb" | "gerber";
}
