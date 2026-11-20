import { createBitmapShortDetector } from "./bitmap-short-detector";
import { assertGerberLayerCanBeGenerated } from "./gerber-layer";
import { createGerberGroupMask } from "./gerber-mask";

export const { renderBitmapShortDebug, findBitmapShorts } =
  createBitmapShortDetector({
    assertGerberLayerCanBeGenerated,
    createGerberGroupMask,
  });
