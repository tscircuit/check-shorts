import type { LayerRef } from "circuit-json";

export interface BitmapShort {
  mode: "pcb" | "gerber";
  layer: LayerRef;
  firstConnectivityKey: string;
  secondConnectivityKey: string;
  pixelCount: number;
  center: { x: number; y: number };
  firstOwnerLabels: string[];
  secondOwnerLabels: string[];
}

export interface BitmapShortDebugLegendEntry {
  connectivityKey: string;
  color: [number, number, number];
  labels: string[];
}

export interface FindBitmapShortsOptions {
  width?: number;
  height?: number;
  micronsPerPixel?: number;
  pixelsPerMm?: number;
  layer?: LayerRef;
  mode?: "pcb" | "gerber";
}

export interface BitmapShortDebugRender {
  width: number;
  height: number;
  rgba: Uint8Array;
  shorts: BitmapShort[];
  legend: BitmapShortDebugLegendEntry[];
}
