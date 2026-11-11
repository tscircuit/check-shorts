import { expect, test } from "bun:test";
import { comparePcbAndGerberShorts } from "tests/fixtures/bitmap-snapshot";
import { getTestFixture } from "tests/fixtures/get-test-fixture";

async function boardWithVia(x: number, y: number) {
  const { circuit } = getTestFixture();
  circuit.add(
    <board width={4} height={4} layers={6} routingDisabled>
      <chip
        name="J1"
        footprint={
          <footprint>
            <smtpad
              portHints={["pin1"]}
              shape="rotated_rect"
              width={2.2}
              height={0.24}
              ccwRotation={45}
              cornerRadius={0.06}
              layer="top"
            />
          </footprint>
        }
      />
      <via
        name="V1"
        pcbX={x}
        pcbY={y}
        fromLayer="top"
        toLayer="bottom"
        outerDiameter={0.3}
        holeDiameter={0.15}
      />
    </board>,
  );
  await circuit.renderUntilSettled();
  return circuit.getCircuitJson();
}

test("a via on the diagonal pad should short in both modes", async () => {
  const board = await boardWithVia(0.65, 0.65);
  const counts = await comparePcbAndGerberShorts(
    import.meta.path,
    "gerber-bitmap",
    board,
    "Via touches the diagonal pad",
  );
  expect(counts).toEqual({ pcb: 1, gerber: 1 });
});

test("moving the via beside the same pad should clear the short", async () => {
  const board = await boardWithVia(0.85, 0);
  const counts = await comparePcbAndGerberShorts(
    import.meta.path,
    "clear-gerber-bitmap",
    board,
    "Via sits beside the diagonal pad",
  );
  expect(counts).toEqual({ pcb: 0, gerber: 0 });
});
