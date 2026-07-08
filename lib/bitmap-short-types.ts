export interface BitmapShort {
  mode: "pcb" | "gerber";
  layer: string;
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
  layer?: "top" | "bottom";
  mode?: "pcb" | "gerber";
}

export interface BitmapShortDebugRender {
  width: number;
  height: number;
  rgba: Uint8Array;
  shorts: BitmapShort[];
  legend: BitmapShortDebugLegendEntry[];
}
