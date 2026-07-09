import { expect, test } from "bun:test";
import { createShortDebugSvg } from "lib/index";
import { appendCopperBridgeTrace } from "lib/repro";
import {
  writeOrCompareBitmapSnapshot,
  writeOrCompareSvgSnapshot,
} from "tests/fixtures/bitmap-snapshot";
import { getTestFixture } from "tests/fixtures/get-test-fixture";
import { copperBridgeShortRepro } from "tests/fixtures/repros";

test("renders a copper bridge short candidate PCB snapshot", async () => {
  const { circuit } = getTestFixture();
  circuit.add(copperBridgeShortRepro);
  await circuit.renderUntilSettled();

  const bridgedCircuitJson = appendCopperBridgeTrace(circuit.getCircuitJson(), {
    start: { x: -2.2, y: 0 },
    end: { x: 2.2, y: 0 },
  });
  const pcbTraces = bridgedCircuitJson.filter(
    (element) => element.type === "pcb_trace",
  );

  expect(
    pcbTraces.some(
      (element) => element.pcb_trace_id === "pcb_trace_short_bridge",
    ),
  ).toBe(true);
  expect(pcbTraces.length).toBeGreaterThanOrEqual(2);
  const pcbShorts = await writeOrCompareBitmapSnapshot(
    import.meta.path,
    "pcb-bitmap",
    bridgedCircuitJson,
    { mode: "pcb" },
  );
  const gerberShorts = await writeOrCompareBitmapSnapshot(
    import.meta.path,
    "gerber-bitmap",
    bridgedCircuitJson,
    { mode: "gerber" },
  );

  expect(pcbShorts.length).toBe(2);
  expect(gerberShorts.length).toBe(2);
  expect(
    pcbShorts.every((short) =>
      short.secondOwnerLabels.includes("pcb_trace_short_bridge"),
    ),
  ).toBe(true);
  await writeOrCompareSvgSnapshot(
    import.meta.path,
    createShortDebugSvg(bridgedCircuitJson, [...pcbShorts, ...gerberShorts]),
  );
  await expect(bridgedCircuitJson).toMatchPcbSnapshot(import.meta.path);
});
