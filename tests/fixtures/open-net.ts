import type { AnyCircuitElement, LayerRef, PcbTrace } from "circuit-json";

export const wire = (
  id: string,
  x1: number,
  x2: number,
  layer: LayerRef = "top",
): PcbTrace => ({
  type: "pcb_trace",
  pcb_trace_id: id,
  route: [
    { route_type: "wire", x: x1, y: 0, width: 0.3, layer },
    { route_type: "wire", x: x2, y: 0, width: 0.3, layer },
  ],
});

export const openNet = (): AnyCircuitElement[] =>
  [
    {
      type: "pcb_board",
      pcb_board_id: "board",
      center: { x: 0, y: 0 },
      width: 20,
      height: 10,
      num_layers: 4,
    },
    { type: "source_net", source_net_id: "gnd", name: "GND" },
    ...["A", "B", "C", "D"].flatMap((name, i) => [
      {
        type: "source_component",
        source_component_id: name,
        name,
        ftype: "simple_chip",
      },
      {
        type: "source_port",
        source_port_id: `source_${name}`,
        source_component_id: name,
        name: "pin1",
      },
      {
        type: "source_trace",
        source_trace_id: `source_trace_${name}`,
        connected_source_port_ids: [`source_${name}`],
        connected_source_net_ids: ["gnd"],
      },
      {
        type: "pcb_component",
        pcb_component_id: name,
        source_component_id: name,
        center: { x: -6 + i * 4, y: 0 },
        width: 1,
        height: 1,
        layer: "top",
        rotation: 0,
      },
      {
        type: "pcb_port",
        pcb_port_id: `port_${name}`,
        source_port_id: `source_${name}`,
        pcb_component_id: name,
        x: -6 + i * 4,
        y: 0,
        layers: ["top"],
      },
      {
        type: "pcb_smtpad",
        pcb_smtpad_id: `pad_${name}`,
        pcb_component_id: name,
        pcb_port_id: `port_${name}`,
        x: -6 + i * 4,
        y: 0,
        shape: "rect",
        width: 1,
        height: 1,
        layer: "top",
      },
    ]),
    { ...wire("ab", -6, -2), source_trace_id: "source_trace_A" },
    { ...wire("cd", 2, 6), source_trace_id: "source_trace_C" },
  ] as AnyCircuitElement[];

export const via = (
  x: number,
  layers: LayerRef[] = ["top", "inner1", "inner2", "bottom"],
): AnyCircuitElement => ({
  type: "pcb_via",
  pcb_via_id: `via_${x}`,
  x,
  y: 0,
  outer_diameter: 0.8,
  hole_diameter: 0.4,
  layers,
});
