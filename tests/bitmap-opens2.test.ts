import { expect, test } from "bun:test";
import { findBitmapOpens } from "../lib";
import { openNet, wire, via } from "./fixtures/open-net";

test("layer changes need real plated barrels, with the correct span and location", async () => {
  for (const mode of ["pcb", "gerber"] as const) {
    const json = [...openNet(), wire("inner_bridge", -2, 2, "inner2")];
    expect(await findBitmapOpens(json, { mode })).toHaveLength(1);
    expect(await findBitmapOpens([...json, via(-2), via(2)], { mode })).toEqual(
      [],
    );
    expect(
      await findBitmapOpens([...json, via(-2), via(2, ["inner2", "bottom"])], {
        mode,
      }),
    ).toHaveLength(1);
    expect(
      await findBitmapOpens([...json, via(-2), via(4)], { mode }),
    ).toHaveLength(1);
  }
});
