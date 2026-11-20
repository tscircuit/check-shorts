import { readFileSync } from "node:fs";
import type { AnyCircuitElement } from "circuit-json";

export const VM_SOURCE_TRACE_ID = "source_trace_8";
export const TVS_GROUND_PCB_PORT_ID = "pcb_port_150";
export const TVS_GROUND_SOURCE_PORT_ID = "source_port_150";

export const getNema8Controller = (): AnyCircuitElement[] =>
  JSON.parse(
    readFileSync(`${import.meta.dir}/nema8-controller.circuit.json`, "utf8"),
  );
