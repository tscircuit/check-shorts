import { expect, test } from "bun:test";
import { appendCopperBridgeTrace, findBitmapShorts } from "lib/index";
import { writeOrCompareBitmapSnapshot } from "tests/fixtures/bitmap-snapshot";
import { getTestFixture } from "tests/fixtures/get-test-fixture";

test("findBitmapShorts without a layer option misses a bottom-layer short", async () => {
  const { circuit } = getTestFixture();
  circuit.add(
    <board width="6mm" height="4mm" routingDisabled>
      <resistor
        name="R1"
        resistance="1k"
        footprint="0805"
        layer="bottom"
        pcbX={0}
      />
      <net name="A" />
      <net name="B" />
      <trace from=".R1 > .pin1" to="net.A" />
      <trace from=".R1 > .pin2" to="net.B" />
    </board>,
  );
  await circuit.renderUntilSettled();

  const [pin1, pin2] = circuit
    .getCircuitJson()
    .filter((e) => e.type === "pcb_smtpad");
  expect(pin1!.layer).toBe("bottom");
  expect(pin2!.layer).toBe("bottom");

  // A bottom-layer copper bridge directly connects net A to net B.
  const circuitJson = appendCopperBridgeTrace(circuit.getCircuitJson(), {
    layer: "bottom",
    start: { x: (pin1 as { x: number }).x, y: (pin1 as { y: number }).y },
    end: { x: (pin2 as { x: number }).x, y: (pin2 as { y: number }).y },
  });

  const bottomShorts = await writeOrCompareBitmapSnapshot(
    import.meta.path,
    "bottom-pcb-bitmap",
    circuitJson,
    { mode: "pcb", layer: "bottom" },
  );
  expect(bottomShorts.length).toBeGreaterThan(0);

  // BUG: with no options, only the top layer is checked, so the bridge
  // in the snapshot above is not reported.
  expect(await findBitmapShorts(circuitJson)).toEqual([]);
});
