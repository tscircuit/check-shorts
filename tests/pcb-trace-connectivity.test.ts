import { expect, test } from "bun:test";
import type { AnyCircuitElement } from "circuit-json";
import { findBitmapShorts } from "../lib";

const circuitJson = [
  {
    type: "pcb_via",
    pcb_via_id: "via_gnd",
    source_net_id: "gnd",
    pcb_port_ids: ["via_top", "via_bottom"],
    x: 0,
    y: 0,
    hole_diameter: 0.2,
    outer_diameter: 0.5,
    layers: ["top", "bottom"],
    from_layer: "top",
    to_layer: "bottom",
  },
  {
    type: "pcb_trace",
    pcb_trace_id: "bottom_trace",
    route: [
      {
        route_type: "wire",
        x: 0,
        y: 0,
        width: 0.15,
        layer: "bottom",
        start_pcb_port_id: "via_bottom",
      },
      { route_type: "wire", x: 1, y: 0, width: 0.15, layer: "bottom" },
    ],
  },
] as AnyCircuitElement[];

for (const mode of ["pcb", "gerber"] as const) {
  const options = { mode, layer: "bottom", pixelsPerMm: 50 } as const;

  test(`${mode}: trace without a source ID connects through its via port`, async () => {
    expect(await findBitmapShorts(circuitJson, options)).toEqual([]);
  });

  test(`${mode}: overlapping unidentified trace still reports a short`, async () => {
    const unidentified = structuredClone(circuitJson);
    const trace = unidentified.find((element) => element.type === "pcb_trace")!;
    if (trace.type !== "pcb_trace") throw new Error("Missing trace");
    const start = trace.route[0];
    if (start.route_type !== "wire") throw new Error("Missing wire point");
    delete start.start_pcb_port_id;
    expect(
      (await findBitmapShorts(unidentified, options)).length,
    ).toBeGreaterThan(0);
  });
}
