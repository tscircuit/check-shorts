import { expect, test } from "bun:test";
import { findBitmapOpens, findBitmapShorts } from "../lib";
import { openNet, wire } from "./fixtures/open-net";

test("reports the two same-net islands from checks #402 in both rendering modes", async () => {
  for (const mode of ["pcb", "gerber"] as const) {
    const json = openNet();
    expect(await findBitmapShorts(json, { mode })).toEqual([]);
    const opens = await findBitmapOpens(json, { mode });
    expect(opens).toHaveLength(1);
    expect(opens[0]?.netNames).toEqual(["GND"]);
    expect(opens[0]?.islands.map((i) => i.labels)).toEqual([
      ["A.pin1", "B.pin1"],
      ["C.pin1", "D.pin1"],
    ]);
    // The bridge has no source or endpoint metadata: only its copper matters.
    expect(
      await findBitmapOpens([...json, wire("bridge", -2, 2)], { mode }),
    ).toEqual([]);
  }
});
