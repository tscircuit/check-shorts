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

export type BitmapShortProgressEvent =
  | {
      phase: "preparing";
      mode: "pcb" | "gerber";
      layer: LayerRef;
    }
  | {
      phase: "rasterizing";
      mode: "pcb" | "gerber";
      layer: LayerRef;
      width: number;
      height: number;
      completedGroups: number;
      totalGroups: number;
      currentConnectivityKey?: string;
    }
  | {
      phase: "detecting";
      mode: "pcb" | "gerber";
      layer: LayerRef;
    }
  | {
      phase: "complete";
      mode: "pcb" | "gerber";
      layer: LayerRef;
      shortsFound: number;
    };

export interface FindBitmapShortsOptions {
  width?: number;
  height?: number;
  micronsPerPixel?: number;
  pixelsPerMm?: number;
  layer?: LayerRef;
  mode?: "pcb" | "gerber";
  onProgress?: (event: BitmapShortProgressEvent) => void;
}

export interface BitmapShortDebugRender {
  width: number;
  height: number;
  rgba: Uint8Array;
  shorts: BitmapShort[];
  legend: BitmapShortDebugLegendEntry[];
}
