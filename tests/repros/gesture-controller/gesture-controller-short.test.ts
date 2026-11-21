import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { AnyCircuitElement } from "circuit-json";
import { findBitmapShorts } from "lib/index";
import { writeOrCompareCircuitJsonSvgSnapshot } from "tests/fixtures/bitmap-snapshot";

const circuitJson = JSON.parse(
  readFileSync(`${import.meta.dir}/GestureDistanceController.json`, "utf8"),
) as AnyCircuitElement[];

test("full gesture controller has no Gerber short after exporter update", async () => {
  const pcbShorts = await findBitmapShorts(circuitJson, {
    mode: "pcb",
    layer: "top",
  });
  const gerberShorts = await findBitmapShorts(circuitJson, {
    mode: "gerber",
    layer: "top",
  });

  expect(pcbShorts).toHaveLength(0);
  expect(gerberShorts).toHaveLength(0);
  await writeOrCompareCircuitJsonSvgSnapshot(import.meta.path, circuitJson);
});
