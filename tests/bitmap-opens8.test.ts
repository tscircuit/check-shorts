import { expect, test } from "bun:test";
import type { AnyCircuitElement } from "circuit-json";
import { createShortDebugSvg, findBitmapOpens } from "../lib";
import fixture from "./fixtures/disconnected-pcb-net.circuit.json";
import { writeOrCompareSvgSnapshot } from "./fixtures/bitmap-snapshot";

// Rendered from checks #402's exact TSX fixture at 143a260, using CLI 0.1.2291.
// Keep emitted copper fixed: rebuilding with older Core can reroute the gap.
test("literal checks #402 copper reports disconnected GND pads and renders diagnostics", async () => {
  const json = fixture as AnyCircuitElement[];
  for (const mode of ["pcb", "gerber"] as const) {
    const opens = await findBitmapOpens(json, { mode });
    expect(opens).toHaveLength(1);
    expect(opens[0]?.islands.map((i) => i.labels)).toEqual([
      ["A.pin1", "B.pin1"],
      ["C.pin1", "D.pin1"],
    ]);
    await writeOrCompareSvgSnapshot(
      import.meta.path,
      createShortDebugSvg(json, [], { opens }),
      `${mode}-open`,
    );
  }
});
