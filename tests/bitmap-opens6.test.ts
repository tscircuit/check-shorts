import { expect, test } from "bun:test";
import { findBitmapOpens } from "../lib";
import { openNet, wire, via } from "./fixtures/open-net";

test("ten-layer stacks are joined only by barrels spanning the probed inner layer", async () => {
  const json = openNet();
  for (const e of json) if (e.type === "pcb_board") e.num_layers = 10;
  json.push(wire("bridge", -2, 2, "inner8"));
  const all = [
    "top",
    "inner1",
    "inner2",
    "inner3",
    "inner4",
    "inner5",
    "inner6",
    "inner7",
    "inner8",
    "bottom",
  ] as const;
  for (const mode of ["pcb", "gerber"] as const) {
    expect(await findBitmapOpens(json, { mode })).toHaveLength(1);
    expect(
      await findBitmapOpens([...json, via(-2, [...all]), via(2, [...all])], {
        mode,
      }),
    ).toEqual([]);
  }
});
