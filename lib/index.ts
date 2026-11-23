export {
  appendCopperBridgeTrace,
  convertCircuitJsonToGerberLayers,
  renderTscircuitRepro,
  type CopperBridgeOptions,
  type GerberLayerMap,
  type RenderedRepro,
  type RenderReproOptions,
} from "./repro-runner";
export {
  findBitmapShorts,
  renderBitmapShortDebug,
} from "./node-bitmap-short-detector";
export type {
  BitmapShortDebugLegendEntry,
  BitmapShortDebugRender,
  BitmapShort,
  FindBitmapShortsOptions,
} from "./bitmap-short-types";
export { createShortDebugSvg } from "./short-debug-svg";
export { appendBitmapLegend, encodeRgbaPng } from "./png";
export {
  findBitmapOpens,
  type BitmapOpen,
  type FindBitmapOpensOptions,
} from "./bitmap-open-detector";
