import { expect, test } from "bun:test";
import { createShortDebugSvg, findBitmapShorts } from "lib/index";
import {
  writeOrCompareBitmapSnapshot,
  writeOrCompareSvgSnapshot,
} from "tests/fixtures/bitmap-snapshot";
import { getTestFixture } from "tests/fixtures/get-test-fixture";

const addCopperPourTouchingTestpoint = (
  circuit: ReturnType<typeof getTestFixture>["circuit"],
) => {
  circuit.add(
    <board width="14mm" height="10mm">
      <net name="GND" />
      <net name="VCC" />
      <testpoint
        name="TP_SHORT"
        footprintVariant="pad"
        padShape="circle"
        padDiameter="2mm"
        pcbX="0mm"
        pcbY="0mm"
        connections={{ pin1: "net.GND" }}
      />
      <copperpour layer="top" connectsTo="net.GND" unbroken />
    </board>,
  );
};

test("bitmap coloring ignores same-net copper pour contact", async () => {
  const { circuit } = getTestFixture();
  addCopperPourTouchingTestpoint(circuit);
  await circuit.renderUntilSettled();

  const shorts = await findBitmapShorts(circuit.getCircuitJson());

  expect(shorts).toEqual([]);
});

test("bitmap coloring detects filtered-source-trace copper pour short", async () => {
  const { circuit } = getTestFixture();
  addCopperPourTouchingTestpoint(circuit);
  await circuit.renderUntilSettled();

  const circuitJson = circuit.getCircuitJson();
  const filteredCircuitJson = circuitJson.filter(
    (element) =>
      !(
        element.type === "source_trace" &&
        element.display_name === ".TP_SHORT > .pin1 to net.GND"
      ),
  );
  const pcbShorts = await writeOrCompareBitmapSnapshot(
    import.meta.path,
    "pcb-bitmap",
    filteredCircuitJson,
    { mode: "pcb" },
  );
  const gerberShorts = await writeOrCompareBitmapSnapshot(
    import.meta.path,
    "gerber-bitmap",
    filteredCircuitJson,
    { mode: "gerber" },
  );
  const debugSvg = createShortDebugSvg(filteredCircuitJson, [
    ...pcbShorts,
    ...gerberShorts,
  ]);

  expect(pcbShorts.length).toBe(1);
  expect(gerberShorts.length).toBe(1);
  expect(pcbShorts[0]?.pixelCount).toBeGreaterThan(0);
  expect(gerberShorts[0]?.pixelCount).toBeGreaterThan(0);
  expect(
    [
      ...new Set([
        ...(pcbShorts[0]?.firstOwnerLabels ?? []),
        ...(pcbShorts[0]?.secondOwnerLabels ?? []),
      ]),
    ].sort(),
  ).toEqual(["TP_SHORT.pin1", "copperpour:GND"]);
  await writeOrCompareSvgSnapshot(import.meta.path, debugSvg);
});
