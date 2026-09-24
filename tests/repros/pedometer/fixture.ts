import { readFileSync } from "node:fs";
import type { AnyCircuitElement, PcbVia } from "circuit-json";

export const PMID_NET_ID = "source_net_6";
export const BROKEN_TRACE_ID = "source_net_6_mst1_0";
export const MISSING_VIA = { x: -8.20005, y: -3.199898 };
export const getPedometer = (): AnyCircuitElement[] =>
  JSON.parse(readFileSync(`${import.meta.dir}/pedometer.circuit.json`, "utf8"));

// Diagnostic control, not a fabrication-approved board repair. Keep the raw
// downloaded fixture unchanged. Existing board vias use a full four-layer span.
export const makeRepairVia = (): PcbVia => ({
  type: "pcb_via",
  pcb_via_id: "repro_missing_pmid_via",
  pcb_trace_id: BROKEN_TRACE_ID,
  ...MISSING_VIA,
  hole_diameter: 0.15,
  outer_diameter: 0.3,
  layers: ["top", "inner1", "inner2", "bottom"],
  from_layer: "top",
  to_layer: "bottom",
  subcircuit_id: "subcircuit_source_group_0",
  subcircuit_connectivity_map_key:
    "unnamedsubcircuitsubcircuit_source_group_0_connectivity_net6",
});
