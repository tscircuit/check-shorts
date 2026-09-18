import { expect, test } from "bun:test";
import type { AnyCircuitElement } from "circuit-json";
import { findBitmapShorts } from "../lib";
import fixture from "./fixtures/ina228-jp2.circuit.json";

// JP2 extracted from the SparkFun INA228 board. Its two footprint bridge traces
// have endpoint PCB ports, but no source_trace_id; the three pins are bridged.
const circuitJson = fixture as AnyCircuitElement[];

for (const mode of ["pcb", "gerber"] as const) {
  test(`${mode}: intentional JP2 copper bridges are not shorts`, async () => {
    expect(
      await findBitmapShorts(circuitJson, { mode, layer: "bottom" }),
    ).toEqual([]);
  });

  for (const assigned of [true, false]) {
    test(`${mode}: detects ${assigned ? "a different net" : "unassigned copper"} crossing JP2`, async () => {
      const crossingTrace: AnyCircuitElement = {
        type: "pcb_trace",
        pcb_trace_id: "pcb_trace_crossing",
        ...(assigned ? { source_trace_id: "source_trace_gnd" } : {}),
        route: [
          { route_type: "wire", layer: "bottom", width: 0.2, x: 2.5, y: 1 },
          { route_type: "wire", layer: "bottom", width: 0.2, x: 2.5, y: 3 },
        ],
      };
      const shorts = await findBitmapShorts(
        [
          ...circuitJson,
          {
            type: "source_net",
            source_net_id: "source_net_gnd",
            name: "GND",
            member_source_group_ids: [],
          },
          {
            type: "source_trace",
            source_trace_id: "source_trace_gnd",
            connected_source_port_ids: [],
            connected_source_net_ids: ["source_net_gnd"],
          },
          crossingTrace,
        ],
        { mode, layer: "bottom" },
      );
      expect(shorts.length).toBeGreaterThan(0);
      expect(
        shorts.some((short) =>
          [...short.firstOwnerLabels, ...short.secondOwnerLabels].includes(
            "pcb_trace_crossing",
          ),
        ),
      ).toBe(true);
    });
  }
}
