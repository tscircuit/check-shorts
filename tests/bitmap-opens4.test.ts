import { expect, test } from "bun:test";
import { findBitmapOpens } from "../lib";
import { openNet } from "./fixtures/open-net";

test("missing pads and lying endpoint IDs cannot establish continuity", async () => {
  const json = openNet().filter(
    (e) => e.type !== "pcb_smtpad" || e.pcb_port_id !== "port_A",
  );
  for (const e of json)
    if (e.type === "pcb_trace" && e.route[0]?.route_type === "wire")
      e.route[0].start_pcb_port_id = "port_A";
  for (const mode of ["pcb", "gerber"] as const) {
    expect(
      (await findBitmapOpens(json, { mode }))[0]?.islands.map((i) => i.labels),
    ).toEqual([["A.pin1"], ["B.pin1"], ["C.pin1", "D.pin1"]]);
  }
});
