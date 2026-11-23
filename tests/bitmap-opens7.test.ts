import { expect, test } from "bun:test";
import { findBitmapOpens } from "../lib";
import { openNet } from "./fixtures/open-net";

test("component-internal connections do not provide bare-board copper bridges", async () => {
  const json = openNet();
  for (const e of json)
    if (e.type === "source_component" && e.name === "A")
      e.internally_connected_source_port_ids = [["source_B", "source_C"]];
  for (const mode of ["pcb", "gerber"] as const)
    expect(await findBitmapOpens(json, { mode })).toHaveLength(1);
});
