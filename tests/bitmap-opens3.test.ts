import { expect, test } from "bun:test";
import type { AnyCircuitElement } from "circuit-json";
import { findBitmapOpens } from "../lib";
import { openNet, wire } from "./fixtures/open-net";

test("explicit inline vias join layers without standalone via records", async () => {
  const bridge = wire("bridge", -2, 2, "inner2");
  bridge.route = [
    {
      route_type: "via",
      x: -2,
      y: 0,
      from_layer: "top",
      to_layer: "inner2",
      outer_diameter: 0.8,
      hole_diameter: 0.4,
    },
    ...bridge.route,
    {
      route_type: "via",
      x: 2,
      y: 0,
      from_layer: "inner2",
      to_layer: "top",
      outer_diameter: 0.8,
      hole_diameter: 0.4,
    },
  ];
  for (const mode of ["pcb", "gerber"] as const) {
    expect(
      await findBitmapOpens([...openNet(), bridge] as AnyCircuitElement[], {
        mode,
      }),
    ).toEqual([]);
  }
});
