import { expect, test } from "bun:test";
import { findBitmapOpens } from "../lib";
import { openNet } from "./fixtures/open-net";

test("pour cutouts isolate a pad even though its net name matches the surrounding pour", async () => {
  const json = openNet();
  json.push({
    type: "pcb_copper_pour",
    pcb_copper_pour_id: "pour",
    source_net_id: "gnd",
    layer: "top",
    shape: "brep",
    covered_with_solder_mask: true,
    brep_shape: {
      outer_ring: {
        vertices: [
          { x: -8, y: -2 },
          { x: 8, y: -2 },
          { x: 8, y: 2 },
          { x: -8, y: 2 },
        ],
      },
      inner_rings: [
        {
          vertices: [
            { x: -7, y: -1 },
            { x: -7, y: 1 },
            { x: -5, y: 1 },
            { x: -5, y: -1 },
          ],
        },
      ],
    },
  });
  // Remove A's wire so it cannot escape the cutout.
  const isolated = json.filter(
    (e) => e.type !== "pcb_trace" || e.pcb_trace_id !== "ab",
  );
  for (const mode of ["pcb", "gerber"] as const) {
    expect(
      (await findBitmapOpens(isolated, { mode }))[0]?.islands.map(
        (i) => i.labels,
      ),
    ).toEqual([["A.pin1"], ["B.pin1", "C.pin1", "D.pin1"]]);
    expect(await findBitmapOpens(json, { mode })).toEqual([]);
  }
});
