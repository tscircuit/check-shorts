import { expect, test } from "bun:test";
import {
  writeOrCompareBitmapSnapshot,
  writeOrCompareCircuitJsonSvgSnapshot,
} from "tests/fixtures/bitmap-snapshot";
import { getTestFixture } from "tests/fixtures/get-test-fixture";

test("renders a same-net copper pour touch with its source trace filtered out", async () => {
  const { circuit } = getTestFixture();

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

  await circuit.renderUntilSettled();

  const circuitJson = circuit.getCircuitJson();
  const filteredCircuitJson = circuitJson.filter(
    (element) =>
      !(
        element.type === "source_trace" &&
        element.display_name === ".TP_SHORT > .pin1 to net.GND"
      ),
  );

  expect(filteredCircuitJson.length).toBe(circuitJson.length - 1);
  expect(
    (
      await writeOrCompareBitmapSnapshot(
        import.meta.path,
        "pcb-bitmap",
        filteredCircuitJson,
        { mode: "pcb" },
      )
    ).length,
  ).toBe(1);
  expect(
    (
      await writeOrCompareBitmapSnapshot(
        import.meta.path,
        "gerber-bitmap",
        filteredCircuitJson,
        { mode: "gerber" },
      )
    ).length,
  ).toBe(1);
  await writeOrCompareCircuitJsonSvgSnapshot(
    import.meta.path,
    filteredCircuitJson,
  );
});
