import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cju } from "@tscircuit/circuit-json-util";
import { getFullConnectivityMapFromCircuitJson } from "circuit-json-to-connectivity-map";
import { findBitmapShorts } from "lib/index";
import {
  getNema8Controller,
  TVS_GROUND_PCB_PORT_ID,
  TVS_GROUND_SOURCE_PORT_ID,
  VM_SOURCE_TRACE_ID,
} from "./fixture";

test("fixture is the byte-for-byte published v1.0.48 Circuit JSON", () => {
  const bytes = readFileSync(
    `${import.meta.dir}/nema8-controller.circuit.json`,
  );
  expect(bytes.length).toBe(1_473_700);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "32f2eaaa2d3878ec108a9f8789e857d26a17b4bebeddd2d4aabfb1d923c373c1",
  );
  expect(getNema8Controller()).toHaveLength(2469);
});

test("VM route metadata ends on the TVS GND port and merges the intended nets", () => {
  const circuitJson = getNema8Controller();
  const db = cju(circuitJson);
  const trace = db.pcb_trace
    .list()
    .find((candidate) => candidate.source_trace_id === VM_SOURCE_TRACE_ID)!;
  expect(trace.route.at(-1)).toEqual({
    route_type: "wire",
    x: 1.8691600000000002,
    y: 3.4999999999999996,
    width: 0.56,
    layer: "bottom",
    end_pcb_port_id: TVS_GROUND_PCB_PORT_ID,
  });

  const tvsGroundPort = db.pcb_port.get(TVS_GROUND_PCB_PORT_ID)!;
  expect(tvsGroundPort).toMatchObject({
    source_port_id: TVS_GROUND_SOURCE_PORT_ID,
    layers: ["bottom"],
    x: 1.8691600000000002,
    y: 3.4999999999999996,
  });

  const vmSourceTrace = db.source_trace.get(VM_SOURCE_TRACE_ID)!;
  const tvsGroundSourcePort = db.source_port.get(TVS_GROUND_SOURCE_PORT_ID)!;
  expect(vmSourceTrace.subcircuit_connectivity_map_key).toBe(
    "CONTROLLER_PCB_connectivity_net2",
  );
  expect(tvsGroundSourcePort.subcircuit_connectivity_map_key).toBe(
    "CONTROLLER_PCB_connectivity_net33",
  );

  const fullConnectivityMap =
    getFullConnectivityMapFromCircuitJson(circuitJson);
  expect(
    fullConnectivityMap.areIdsConnected(
      VM_SOURCE_TRACE_ID,
      TVS_GROUND_SOURCE_PORT_ID,
    ),
  ).toBe(true);
});

test.each(["pcb", "gerber"] as const)(
  "%s: detects the NEMA8 D_VM_TVS VM-to-GND copper bridge",
  async (mode) => {
    const shorts = await findBitmapShorts(getNema8Controller(), {
      mode,
      layer: "bottom",
    });
    const tvsShort = shorts.find((short) => {
      const ownerLabels = [
        ...short.firstOwnerLabels,
        ...short.secondOwnerLabels,
      ];
      return (
        ownerLabels.includes("D_VM_TVS.pin1") &&
        ownerLabels.includes("D_VM_TVS.pin2") &&
        Math.hypot(short.center.x - 0.95, short.center.y - 3.45) < 0.25
      );
    });

    expect(tvsShort).toBeDefined();
  },
);
