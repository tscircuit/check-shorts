import { expect, test } from "bun:test";
import { getGerberLayerName } from "../lib/gerber-layer";

test("maps all ten copper layers to Gerber layer names", () => {
  expect(getGerberLayerName("top")).toBe("F_Cu");
  expect(getGerberLayerName("inner1")).toBe("In1_Cu");
  expect(getGerberLayerName("inner7")).toBe("In7_Cu");
  expect(getGerberLayerName("inner8")).toBe("In8_Cu");
  expect(getGerberLayerName("bottom")).toBe("B_Cu");
});
