import { expect, test } from "bun:test";
import { getTestFixture } from "./fixtures/get-test-fixture";
import { findBitmapOpens } from "../lib/bitmap-open-detector";

/**
 * The incident this whole check exists for.
 *
 * A board shipped with two push-button ground legs left unrouted. The build
 * succeeded, no short existed, and the buttons were dead. Nothing caught it,
 * because when a trace is not routed the connectivity map does not union its
 * pads — each pad gets its own connectivity key, so a copper-only analysis sees
 * two unrelated single-pad nets rather than one broken net. (Measured on the
 * real board: pads joined by one source_trace came back as connectivity_net12
 * and connectivity_net0.)
 *
 * findBitmapOpens therefore seeds from the source netlist and uses the rendered
 * copper as the evidence of what is actually joined.
 */
test("detects a declared connection that was never routed", async () => {
  const { circuit } = getTestFixture();

  circuit.add(
    <board width="30mm" height="30mm" routingDisabled>
      <pushbutton
        name="SW1"
        footprint={
          <footprint>
            <platedhole
              portHints={["pin1"]}
              pcbX="-6.25mm"
              pcbY="2.5mm"
              shape="circle"
              holeDiameter="1.5mm"
              outerDiameter="2.5mm"
            />
            <platedhole
              portHints={["pin4"]}
              pcbX="6.25mm"
              pcbY="-2.5mm"
              shape="circle"
              holeDiameter="1.5mm"
              outerDiameter="2.5mm"
            />
          </footprint>
        }
      />
      <resistor
        name="R1"
        resistance="1k"
        footprint="0402"
        pcbX={10}
        pcbY={-10}
      />
      {/* Declared, but routingDisabled means no copper ever joins them. */}
      <trace from=".SW1 > .pin4" to=".R1 > .pin1" />
    </board>,
  );

  await circuit.renderUntilSettled();
  const circuitJson = circuit.getCircuitJson() as any[];

  const opens = await findBitmapOpens(circuitJson, { mode: "pcb" });

  expect(opens.length).toBeGreaterThan(0);
  // The two pads that should be one net sit in separate copper islands.
  expect(opens[0]!.islands.length).toBeGreaterThan(1);
});

test("reports nothing when the same connection is routed", async () => {
  const { circuit } = getTestFixture();

  circuit.add(
    <board width="30mm" height="30mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-5} pcbY={0} />
      <resistor name="R2" resistance="1k" footprint="0402" pcbX={5} pcbY={0} />
      <trace from=".R1 > .pin1" to=".R2 > .pin1" />
    </board>,
  );

  await circuit.renderUntilSettled();
  const circuitJson = circuit.getCircuitJson() as any[];

  const opens = await findBitmapOpens(circuitJson, { mode: "pcb" });

  expect(opens).toHaveLength(0);
});
