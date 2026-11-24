import { expect, test } from "bun:test";
import type { AnyCircuitElement } from "circuit-json";
import { cju } from "@tscircuit/circuit-json-util";
import { findBitmapShorts } from "../lib";

const circuitJson = [
  {
    type: "source_net",
    source_net_id: "gnd",
    name: "GND",
    member_source_group_ids: [],
  },
  {
    type: "source_trace",
    source_trace_id: "gnd_trace",
    connected_source_port_ids: [],
    connected_source_net_ids: ["gnd"],
  },
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
    source_trace_id: "gnd_trace",
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

  test(`${mode}: a declared GND trace shares its via's intended net`, async () => {
    expect(await findBitmapShorts(circuitJson, options)).toEqual([]);
  });

  test(`${mode}: a via endpoint cannot supply a trace's missing source owner`, async () => {
    const db = cju(structuredClone(circuitJson));
    db.pcb_trace.update("bottom_trace", { source_trace_id: undefined });
    expect(
      (await findBitmapShorts(db.toArray(), options)).length,
    ).toBeGreaterThan(0);
  });
}
