import { expect, test } from "bun:test";
import type { AnyCircuitElement } from "circuit-json";
import { findBitmapOpens } from "../lib/bitmap-open-detector";

const board = {
  type: "pcb_board",
  pcb_board_id: "pcb_board_0",
  center: { x: 0, y: 0 },
  width: 20,
  height: 10,
  thickness: 1.6,
  num_layers: 2,
  material: "fr4",
} as AnyCircuitElement;

/** Two pads on one net, placed well apart. */
const pads = (): AnyCircuitElement[] =>
  [
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pad_a",
      pcb_port_id: "pcb_port_a",
      layer: "top",
      shape: "rect",
      width: 1,
      height: 1,
      x: -5,
      y: 0,
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pad_b",
      pcb_port_id: "pcb_port_b",
      layer: "top",
      shape: "rect",
      width: 1,
      height: 1,
      x: 5,
      y: 0,
    },
  ] as AnyCircuitElement[];

/** Ties both pads into one net, mirroring how connectivity keys are derived. */
const netGlue = (): AnyCircuitElement[] =>
  [
    {
      type: "source_net",
      source_net_id: "source_net_0",
      name: "GND",
      member_source_group_ids: [],
    },
    {
      type: "source_trace",
      source_trace_id: "source_trace_0",
      connected_source_port_ids: ["source_port_a", "source_port_b"],
      connected_source_net_ids: ["source_net_0"],
    },
    {
      type: "source_port",
      source_port_id: "source_port_a",
      name: "pin1",
      source_component_id: "source_component_0",
    },
    {
      type: "source_port",
      source_port_id: "source_port_b",
      name: "pin2",
      source_component_id: "source_component_0",
    },
    {
      type: "pcb_port",
      pcb_port_id: "pcb_port_a",
      source_port_id: "source_port_a",
      pcb_component_id: "pcb_component_0",
      x: -5,
      y: 0,
      layers: ["top"],
    },
    {
      type: "pcb_port",
      pcb_port_id: "pcb_port_b",
      source_port_id: "source_port_b",
      pcb_component_id: "pcb_component_0",
      x: 5,
      y: 0,
      layers: ["top"],
    },
  ] as unknown as AnyCircuitElement[];

test("reports an open when a net's pads are not joined by copper", async () => {
  // Two pads on the same net with NO trace between them: exactly the failure
  // that shipped on the click-shield (button GND legs left unrouted).
  const circuitJson = [board, ...pads(), ...netGlue()];

  const opens = await findBitmapOpens(circuitJson, { layer: "top" });

  expect(opens.length).toBe(1);
  expect(opens[0]!.islands.length).toBe(2);
});

test("reports no open when a trace joins the pads", async () => {
  const trace = {
    type: "pcb_trace",
    pcb_trace_id: "pcb_trace_0",
    source_trace_id: "source_trace_0",
    route: [
      { route_type: "wire", x: -5, y: 0, width: 0.4, layer: "top" },
      { route_type: "wire", x: 5, y: 0, width: 0.4, layer: "top" },
    ],
  } as unknown as AnyCircuitElement;

  const circuitJson = [board, ...pads(), ...netGlue(), trace];

  const opens = await findBitmapOpens(circuitJson, { layer: "top" });

  expect(opens.length).toBe(0);
});

test("counts a copper pour as a real connection", async () => {
  // The pour case is why this check is pixel-based. Graph connectivity
  // (circuit-json-to-connectivity-map) does not model pcb_copper_pour, so a
  // pour-joined net would be false-flagged as open by a graph-only check.
  const pour = {
    type: "pcb_copper_pour",
    pcb_copper_pour_id: "pcb_copper_pour_0",
    layer: "top",
    shape: "rect",
    center: { x: 0, y: 0 },
    width: 16,
    height: 4,
    source_net_id: "source_net_0",
  } as unknown as AnyCircuitElement;

  const circuitJson = [board, ...pads(), ...netGlue(), pour];

  const opens = await findBitmapOpens(circuitJson, { layer: "top" });

  expect(opens.length).toBe(0);
});
