import { expect, test } from "bun:test";
import { writeOrCompareBitmapSnapshot } from "tests/fixtures/bitmap-snapshot";
import { getTestFixture } from "tests/fixtures/get-test-fixture";
import { twoNetNoShortRepro } from "tests/fixtures/repros";

test("renders a TSX repro to Circuit JSON and PCB snapshot", async () => {
  const { circuit } = getTestFixture();
  circuit.add(twoNetNoShortRepro);
  await circuit.renderUntilSettled();

  const circuitJson = circuit.getCircuitJson();

  expect(circuitJson.some((element) => element.type === "pcb_board")).toBe(
    true,
  );
  expect(circuitJson.some((element) => element.type === "pcb_trace")).toBe(
    true,
  );
  expect(circuitJson.some((element) => element.type === "pcb_smtpad")).toBe(
    true,
  );
  expect(
    writeOrCompareBitmapSnapshot(import.meta.path, "pcb-bitmap", circuitJson, {
      mode: "pcb",
    }),
  ).toEqual([]);
  expect(
    writeOrCompareBitmapSnapshot(
      import.meta.path,
      "gerber-bitmap",
      circuitJson,
      { mode: "gerber" },
    ),
  ).toEqual([]);
  await expect(circuit).toMatchPcbSnapshot(import.meta.path);
});
