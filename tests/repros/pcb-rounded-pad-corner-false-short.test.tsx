import { expect, test } from "bun:test";
import { writeOrCompareBitmapSnapshot } from "tests/fixtures/bitmap-snapshot";
import { getTestFixture } from "tests/fixtures/get-test-fixture";

const RoundedPad = ({ name, offset }: { name: string; offset: string }) => (
  <chip
    name={name}
    pcbX={offset}
    pcbY={offset}
    pinLabels={{ pin1: "P" }}
    footprint={
      <footprint>
        <smtpad
          shape="rect"
          width="2mm"
          height="2mm"
          cornerRadius="0.8mm"
          portHints={["pin1"]}
          pcbX={0}
          pcbY={0}
        />
      </footprint>
    }
  />
);

// The two 2mm pads have 0.8mm corner radii. Their square bounding boxes
// overlap by 0.1mm at the board center, but the rounded copper is about
// 0.52mm apart there. See the PCB snapshot: the corners are drawn square.
test("pcb mode reports a short between rounded pad corners that do not touch", async () => {
  const { circuit } = getTestFixture();
  circuit.add(
    <board width="6mm" height="6mm" routingDisabled>
      <RoundedPad name="U1" offset="-0.95mm" />
      <RoundedPad name="U2" offset="0.95mm" />
      <net name="A" />
      <net name="B" />
      <trace from=".U1 > .pin1" to="net.A" />
      <trace from=".U2 > .pin1" to="net.B" />
    </board>,
  );
  await circuit.renderUntilSettled();
  const circuitJson = circuit.getCircuitJson();

  const pads = circuitJson.filter((e) => e.type === "pcb_smtpad");
  expect(
    pads.map((pad) => "corner_radius" in pad && pad.corner_radius),
  ).toEqual([0.8, 0.8]);

  const pcbShorts = await writeOrCompareBitmapSnapshot(
    import.meta.path,
    "pcb-bitmap",
    circuitJson,
    { mode: "pcb" },
  );
  const gerberShorts = await writeOrCompareBitmapSnapshot(
    import.meta.path,
    "gerber-bitmap",
    circuitJson,
    { mode: "gerber" },
  );

  // Gerber mode keeps the rounded corners and correctly finds no short.
  expect(gerberShorts).toHaveLength(0);
  // BUG: BitmapCanvasContext.arcTo() draws a straight line to the arc's
  // control point, so rounded corners become square and the pads touch.
  expect(pcbShorts).toHaveLength(1);
  expect(pcbShorts[0]!.firstOwnerLabels).toEqual(["U1.P"]);
  expect(pcbShorts[0]!.secondOwnerLabels).toEqual(["U2.P"]);
});
