import { expect, test } from "bun:test";
import { findBitmapOpens } from "../lib";
import { openNet, wire } from "./fixtures/open-net";

test("plated through-hole terminals connect their actual copper layers", async () => {
  const json = openNet().filter(
    (e) =>
      e.type !== "pcb_smtpad" || !["port_B", "port_C"].includes(e.pcb_port_id!),
  );
  for (const [name, x] of [
    ["B", -2],
    ["C", 2],
  ] as const)
    json.push({
      type: "pcb_plated_hole",
      pcb_plated_hole_id: `hole_${name}`,
      pcb_port_id: `port_${name}`,
      pcb_component_id: name,
      shape: "circle",
      x,
      y: 0,
      hole_diameter: 0.4,
      outer_diameter: 1,
      layers: ["top", "inner1", "inner2", "bottom"],
    });
  for (const mode of ["pcb", "gerber"] as const) {
    expect(
      await findBitmapOpens([...json, wire("bridge", -2, 2, "bottom")], {
        mode,
      }),
    ).toEqual([]);
    expect(await findBitmapOpens(json, { mode })).toHaveLength(1);
  }
});
