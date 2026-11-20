import { expect, test } from "bun:test";
import { appendCopperBridgeTrace, findBitmapShorts } from "lib/index";
import { writeOrCompareBitmapSnapshot } from "tests/fixtures/bitmap-snapshot";
import { getTestFixture } from "tests/fixtures/get-test-fixture";

test("a zero or tiny resolution silently reports no shorts", async () => {
  const { circuit } = getTestFixture();
  circuit.add(
    <board width="6mm" height="4mm" routingDisabled>
      <resistor name="R1" resistance="1k" footprint="0805" pcbX={0} />
      <net name="A" />
      <net name="B" />
      <trace from=".R1 > .pin1" to="net.A" />
      <trace from=".R1 > .pin2" to="net.B" />
    </board>,
  );
  await circuit.renderUntilSettled();

  const [pin1, pin2] = circuit
    .getCircuitJson()
    .filter((e) => e.type === "pcb_smtpad") as Array<{ x: number; y: number }>;
  const circuitJson = appendCopperBridgeTrace(circuit.getCircuitJson(), {
    start: { x: pin1!.x, y: pin1!.y },
    end: { x: pin2!.x, y: pin2!.y },
  });

  const defaultShorts = await writeOrCompareBitmapSnapshot(
    import.meta.path,
    "pcb-bitmap",
    circuitJson,
    { mode: "pcb" },
  );
  expect(defaultShorts.length).toBeGreaterThan(0);

  // BUG: these options produce an empty (0x0) or near-empty bitmap. Instead of
  // rejecting them, the checker reports that the bridged board has no shorts.
  for (const options of [
    { pixelsPerMm: 0 },
    { micronsPerPixel: Number.POSITIVE_INFINITY },
    { pixelsPerMm: 0.05 },
    { width: -1, height: -1 },
  ]) {
    expect(await findBitmapShorts(circuitJson, options)).toEqual([]);
  }
});
