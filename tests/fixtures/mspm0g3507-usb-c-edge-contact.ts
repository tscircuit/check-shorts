import type { AnyCircuitElement } from "circuit-json";

// Reduced from ShiboSoftwareDev/mspm0g3507-usb-c-dev-board. The original
// faulty B-Rep cleared three sides of each VBUS polygon pad by 0.25 mm but
// left the fourth side coincident with the GND pour.

const makePolygonPad = ({
  pcbSmtpadId,
  pcbPortId,
  points,
}: {
  pcbSmtpadId: string;
  pcbPortId: string;
  points: Array<{ x: number; y: number }>;
}): AnyCircuitElement =>
  ({
    type: "pcb_smtpad",
    pcb_smtpad_id: pcbSmtpadId,
    pcb_component_id: "pcb_component_usb_c",
    pcb_port_id: pcbPortId,
    layer: "top",
    shape: "polygon",
    points,
    is_covered_with_solder_mask: false,
  }) as AnyCircuitElement;

const makePcbPort = ({
  pcbPortId,
  sourcePortId,
}: {
  pcbPortId: string;
  sourcePortId: string;
}): AnyCircuitElement =>
  ({
    type: "pcb_port",
    pcb_port_id: pcbPortId,
    pcb_component_id: "pcb_component_usb_c",
    source_port_id: sourcePortId,
    x: 0,
    y: 0,
  }) as AnyCircuitElement;

const makeSourcePort = ({
  sourcePortId,
  name,
}: {
  sourcePortId: string;
  name: string;
}): AnyCircuitElement =>
  ({
    type: "source_port",
    source_port_id: sourcePortId,
    source_component_id: "source_component_usb_c",
    name,
  }) as AnyCircuitElement;

const bottomVbusPadPoints = [
  { x: -39.5758412, y: -2.7001724 },
  { x: -38.2758692, y: -2.7001724 },
  { x: -38.2758692, y: -2.400173 },
  { x: -38.2758692, y: -2.4001476 },
  { x: -38.2758692, y: -2.1001482 },
  { x: -39.5758412, y: -2.1001482 },
  { x: -39.5758412, y: -2.4001476 },
  { x: -39.5758412, y: -2.400173 },
];

const topVbusPadPoints = [
  { x: -39.5759936, y: 2.0999704 },
  { x: -38.2760216, y: 2.0999704 },
  { x: -38.2760216, y: 2.3999952 },
  { x: -38.276047, y: 2.3999952 },
  { x: -38.276047, y: 2.6999438 },
  { x: -39.576019, y: 2.6999438 },
  { x: -39.576019, y: 2.399919 },
  { x: -39.5759936, y: 2.399919 },
];

const makeClearanceRing = ({
  points,
  leftClearance,
}: {
  points: Array<{ x: number; y: number }>;
  leftClearance: number;
}) => {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    vertices: [
      { x: Math.min(...xs) - leftClearance, y: Math.min(...ys) - 0.25 },
      { x: Math.max(...xs) + 0.25, y: Math.min(...ys) - 0.25 },
      { x: Math.max(...xs) + 0.25, y: Math.max(...ys) + 0.25 },
      { x: Math.min(...xs) - leftClearance, y: Math.max(...ys) + 0.25 },
    ],
  };
};

export const makeMspm0g3507UsbCEdgeContactCircuitJson = ({
  leftClearance,
}: {
  leftClearance: number;
}): AnyCircuitElement[] =>
  [
    {
      type: "source_net",
      source_net_id: "source_net_gnd",
      name: "GND",
      subcircuit_connectivity_map_key: "net:GND",
    },
    {
      type: "source_component",
      source_component_id: "source_component_usb_c",
      name: "J_USB_C",
    },
    makeSourcePort({ sourcePortId: "source_port_b4a9", name: "B4A9" }),
    makeSourcePort({ sourcePortId: "source_port_a4b9", name: "A4B9" }),
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_mspm0g3507",
      center: { x: -22.2, y: 0 },
      width: 45,
      height: 20.4,
    },
    {
      type: "pcb_component",
      pcb_component_id: "pcb_component_usb_c",
      source_component_id: "source_component_usb_c",
      center: { x: -41.1, y: 0 },
      width: 8.64,
      height: 7.2,
      layer: "top",
    },
    makePcbPort({
      pcbPortId: "pcb_port_b4a9",
      sourcePortId: "source_port_b4a9",
    }),
    makePcbPort({
      pcbPortId: "pcb_port_a4b9",
      sourcePortId: "source_port_a4b9",
    }),
    makePolygonPad({
      pcbSmtpadId: "pcb_smtpad_b4a9",
      pcbPortId: "pcb_port_b4a9",
      points: bottomVbusPadPoints,
    }),
    makePolygonPad({
      pcbSmtpadId: "pcb_smtpad_a4b9",
      pcbPortId: "pcb_port_a4b9",
      points: topVbusPadPoints,
    }),
    {
      type: "pcb_copper_pour",
      pcb_copper_pour_id: "pcb_copper_pour_gnd",
      shape: "brep",
      layer: "top",
      source_net_id: "source_net_gnd",
      brep_shape: {
        outer_ring: {
          vertices: [
            { x: -44.7, y: -10.2 },
            { x: 0.3, y: -10.2 },
            { x: 0.3, y: 10.2 },
            { x: -44.7, y: 10.2 },
          ],
        },
        inner_rings: [
          makeClearanceRing({ points: bottomVbusPadPoints, leftClearance }),
          makeClearanceRing({ points: topVbusPadPoints, leftClearance }),
        ],
      },
    },
  ] as AnyCircuitElement[];
