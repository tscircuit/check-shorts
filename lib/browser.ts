/**
 * Browser-safe entry point. Only imports dependencies that load in a browser,
 * so it can be dynamically imported from a CDN:
 *
 *   import("https://jscdn.tscircuit.com/@tscircuit/check-shorts/latest/dist/browser.js/+esm")
 *
 * Only the pure-JS "pcb" bitmap mode is available here. "gerber" mode and the
 * PNG/SVG debug artifacts need Node-only dependencies and stay in the main
 * entry point.
 */
import { createBitmapShortDetector } from "./bitmap-short-detector";

export type {
  BitmapShort,
  BitmapShortDebugLegendEntry,
  BitmapShortDebugRender,
  FindBitmapShortsOptions,
} from "./bitmap-short-types";

export const { renderBitmapShortDebug, findBitmapShorts } =
  createBitmapShortDetector();
