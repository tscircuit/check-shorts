import { expect, test } from "bun:test";
import {
  convertCircuitJsonToGerberLayers,
  renderTscircuitRepro,
} from "lib/repro";
import { twoNetNoShortRepro } from "tests/fixtures/repros";

test("converts rendered Circuit JSON into Gerber layers", async () => {
  const { circuitJson } = await renderTscircuitRepro(twoNetNoShortRepro);
  const gerberLayers = convertCircuitJsonToGerberLayers(circuitJson);

  expect(Object.keys(gerberLayers)).toContain("F_Cu");
  expect(gerberLayers.F_Cu).toContain("%FSLAX");
});
