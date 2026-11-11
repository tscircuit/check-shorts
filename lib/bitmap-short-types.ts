import type { Bounds } from "@tscircuit/math-utils";
import type { LayerRef } from "circuit-json";

export type ShortCopperPrimitiveType =
  | "pcb_copper_pour"
  | "pcb_smtpad"
  | "pcb_trace"
  | "pcb_via"
  | "pcb_plated_hole";

export interface ShortInvolvedPrimitive {
  id: string;
  type: ShortCopperPrimitiveType;
  label: string;
}

export interface BitmapShort {
  mode: "pcb" | "gerber";
  layer: LayerRef;
  firstConnectivityKey: string;
  secondConnectivityKey: string;
  firstNetName: string;
  secondNetName: string;
  pixelCount: number;
  center: { x: number; y: number };
  bounds: Bounds;
  firstInvolvedPrimitives: ShortInvolvedPrimitive[];
  secondInvolvedPrimitives: ShortInvolvedPrimitive[];
  firstWitnessPath: string[];
  secondWitnessPath: string[];
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

export interface ShortDebugSvgOptions {
  layer?: LayerRef;
  crop?: boolean;
  paddingMm?: number;
  minSpanMm?: number;
}

export interface FormatShortReportOptions {
  fileName?: string;
}

export interface BitmapShortDebugRender {
  width: number;
  height: number;
  rgba: Uint8Array;
  shorts: BitmapShort[];
  legend: BitmapShortDebugLegendEntry[];
}
