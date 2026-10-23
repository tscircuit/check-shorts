import { expect, test } from "bun:test";
import { getTestFixture } from "./fixtures/get-test-fixture";
import { findBitmapOpens } from "../lib/bitmap-open-detector";

/**
 * Hardware patterns where disjoint copper on one net is CORRECT, and which an
 * opens check must therefore not flag. Each of these was found as a real false
 * positive (or intent mismatch) by probing the detector against the pattern,
 * not by speculation.
 */

// A component body joins its internally-connected pads — switch poles, relay
// contacts, multi-leg terminals. The connectivity map unions those pins into
// one net whose copper is legitimately disjoint: the join is inside the part,
// not on the board. Declared internal connections must bridge islands exactly
// like vias bridge layers.
test("internally-connected pins are a join, not an open", async () => {
  const { circuit } = getTestFixture();

  circuit.add(
    <board width="30mm" height="30mm" routingDisabled>
      <chip
        name="SW1"
        internallyConnectedPins={[["pin1", "pin3"]]}
        footprint={
          <footprint>
            <platedhole
              portHints={["pin1"]}
              pcbX="-6mm"
              pcbY="2mm"
              shape="circle"
              holeDiameter="1mm"
              outerDiameter="2mm"
            />
            <platedhole
              portHints={["pin3"]}
              pcbX="-6mm"
              pcbY="-2mm"
              shape="circle"
              holeDiameter="1mm"
              outerDiameter="2mm"
            />
          </footprint>
        }
      />
    </board>,
  );

  await circuit.renderUntilSettled();
  const opens = await findBitmapOpens(circuit.getCircuitJson() as any, {
    mode: "pcb",
  });

  expect(opens).toHaveLength(0);
});

// The bridge must never EXCUSE a real fault: a declared connection that goes
// beyond the internally-joined pair and has no copper is still an open. This
// is the exact failure mode that shipped a dead board — bridging internal
// connections must not reintroduce it.
test("internal bridge does not mask a genuinely unrouted connection", async () => {
  const { circuit } = getTestFixture();

  circuit.add(
    <board width="30mm" height="30mm" routingDisabled>
      <chip
        name="SW1"
        internallyConnectedPins={[["pin1", "pin3"]]}
        footprint={
          <footprint>
            <platedhole
              portHints={["pin1"]}
              pcbX="-6mm"
              pcbY="2mm"
              shape="circle"
              holeDiameter="1mm"
              outerDiameter="2mm"
            />
            <platedhole
              portHints={["pin3"]}
              pcbX="-6mm"
              pcbY="-2mm"
              shape="circle"
              holeDiameter="1mm"
              outerDiameter="2mm"
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
      {/* Declared, never routed: must still be reported. */}
      <trace from=".SW1 > .pin3" to=".R1 > .pin1" />
    </board>,
  );

  await circuit.renderUntilSettled();
  const opens = await findBitmapOpens(circuit.getCircuitJson() as any, {
    mode: "pcb",
  });

  expect(opens.length).toBeGreaterThan(0);
});

// A bridged solder jumper's connection is the solder blob / part body, not
// routed copper — a config bridge, not a fault.
test("bridged solder jumper is not an open", async () => {
  const { circuit } = getTestFixture();

  circuit.add(
    <board width="20mm" height="20mm" routingDisabled>
      <solderjumper
        name="SJ1"
        pinCount={2}
        bridgedPins={[["1", "2"]]}
        footprint="solderjumper2_bridged12"
      />
    </board>,
  );

  await circuit.renderUntilSettled();
  const opens = await findBitmapOpens(circuit.getCircuitJson() as any, {
    mode: "pcb",
  });

  expect(opens).toHaveLength(0);
});

// Some nets are joined OFF the board by design — mounting holes bonded through
// a metal enclosure, signals joined by a cable or mating connector. Circuit
// JSON cannot express "joined outside the board", so those nets are suppressed
// explicitly by name. Unsuppressed, the split is still reported (the check
// cannot know the enclosure exists).
test("enclosure-joined net flags by default and is silenced by ignoreNets", async () => {
  const { circuit } = getTestFixture();

  circuit.add(
    <board width="30mm" height="30mm" routingDisabled>
      <chip
        name="H1"
        footprint={
          <footprint>
            <platedhole
              portHints={["pin1"]}
              pcbX="0mm"
              pcbY="0mm"
              shape="circle"
              holeDiameter="3mm"
              outerDiameter="5mm"
            />
          </footprint>
        }
        connections={{ pin1: "net.CHASSIS" }}
      />
      <chip
        name="H2"
        footprint={
          <footprint>
            <platedhole
              portHints={["pin1"]}
              pcbX="10mm"
              pcbY="10mm"
              shape="circle"
              holeDiameter="3mm"
              outerDiameter="5mm"
            />
          </footprint>
        }
        connections={{ pin1: "net.CHASSIS" }}
      />
    </board>,
  );

  await circuit.renderUntilSettled();
  const circuitJson = circuit.getCircuitJson() as any;

  const flagged = await findBitmapOpens(circuitJson, { mode: "pcb" });
  expect(flagged.length).toBeGreaterThan(0);

  const suppressed = await findBitmapOpens(circuitJson, {
    mode: "pcb",
    ignoreNets: ["CHASSIS"],
  });
  expect(suppressed).toHaveLength(0);
});
