import { expect, test } from "bun:test";
import usbContact from "./fixtures/usb-c-pad-pour-contact.json";
import type { AnyCircuitElement } from "circuit-json";
import { findBitmapShorts } from "../lib/bitmap-short-detector";

// A polygon pad sitting exactly in a pour cutout reproduces the USB-C
// VBUS contact: their boundaries touch, but their filled areas do not overlap.
const makeContact = (gap = 0, sameNet = false): AnyCircuitElement[] =>
  [
    {
      type: "pcb_board",
      pcb_board_id: "board",
      center: { x: 0, y: 0 },
      width: 4,
      height: 4,
      num_layers: 2,
      thickness: 1.6,
      material: "fr4",
    },
    { type: "source_net", source_net_id: "gnd", name: "GND" },
    { type: "source_net", source_net_id: "vbus", name: "VBUS" },
    {
      type: "source_component",
      source_component_id: "usb",
      name: "J_USB_C",
      ftype: "simple_chip",
    },
    {
      type: "source_port",
      source_port_id: "vbus_port",
      source_component_id: "usb",
      name: "A4B9",
      pin_number: 1,
    },
    {
      type: "source_trace",
      source_trace_id: "vbus_trace",
      connected_source_port_ids: ["vbus_port"],
      connected_source_net_ids: [sameNet ? "gnd" : "vbus"],
    },
    {
      type: "pcb_component",
      pcb_component_id: "usb_pcb",
      source_component_id: "usb",
      center: { x: 0, y: 0 },
      width: 1,
      height: 1,
      layer: "top",
      rotation: 0,
    },
    {
      type: "pcb_port",
      pcb_port_id: "vbus_pcb_port",
      source_port_id: "vbus_port",
      pcb_component_id: "usb_pcb",
      x: 0,
      y: 0,
      layers: ["top"],
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pad",
      pcb_component_id: "usb_pcb",
      pcb_port_id: "vbus_pcb_port",
      layer: "top",
      shape: "polygon",
      points: [
        { x: -0.5, y: -0.5 },
        { x: 0.5, y: -0.5 },
        { x: 0.5, y: 0.5 },
        { x: -0.5, y: 0.5 },
      ],
    },
    {
      type: "pcb_copper_pour",
      pcb_copper_pour_id: "pour",
      source_net_id: "gnd",
      layer: "top",
      shape: "brep",
      covered_with_solder_mask: true,
      brep_shape: {
        outer_ring: {
          vertices: [
            { x: -2, y: -2 },
            { x: 2, y: -2 },
            { x: 2, y: 2 },
            { x: -2, y: 2 },
          ],
        },
        inner_rings: [
          {
            vertices: [
              { x: -0.5 - gap, y: -0.5 - gap },
              { x: -0.5 - gap, y: 0.5 + gap },
              { x: 0.5 + gap, y: 0.5 + gap },
              { x: 0.5 + gap, y: -0.5 - gap },
            ],
          },
        ],
      },
    },
  ] as AnyCircuitElement[];

for (const mode of ["gerber", "pcb"] as const) {
  test(`${mode}: detects polygon pad touching a pour cutout`, async () => {
    const shorts = await findBitmapShorts(makeContact(), {
      mode,
      layer: "top",
      pixelsPerMm: 20,
    });
    expect(shorts).toHaveLength(1);
    expect(
      [...shorts[0]!.firstOwnerLabels, ...shorts[0]!.secondOwnerLabels].sort(),
    ).toEqual(["J_USB_C.A4B9", "copperpour:GND"]);
  });
  test(`${mode}: one empty pixel separates pad and pour`, async () => {
    expect(
      await findBitmapShorts(makeContact(0.05), {
        mode,
        layer: "top",
        pixelsPerMm: 20,
      }),
    ).toEqual([]);
  });
  test(`${mode}: same-net pad touching pour is allowed`, async () => {
    expect(
      await findBitmapShorts(makeContact(0, true), {
        mode,
        layer: "top",
        pixelsPerMm: 20,
      }),
    ).toEqual([]);
  });
  test(`${mode}: pad and pour on different layers are allowed`, async () => {
    const json = makeContact();
    const pour = json.find((e) => e.type === "pcb_copper_pour")!;
    pour.layer = "bottom";
    for (const layer of ["top", "bottom"] as const)
      expect(
        await findBitmapShorts(json, { mode, layer, pixelsPerMm: 20 }),
      ).toEqual([]);
  });
}

// Extracted from ShiboSoftwareDev/mspm0g3507-usb-c-dev-board v1.4.2.
// The copper and pad coordinates are unchanged; only the board/pour extent
// is cropped and unrelated elements removed to keep this regression small.

test.each(["gerber", "pcb"] as const)(
  "%s: USB-C VBUS pads contact the GND pour at default bitmap resolution",
  async (mode) => {
    const shorts = await findBitmapShorts(usbContact as AnyCircuitElement[], {
      mode,
      layer: "top",
    });
    for (const pin of ["J_USB_C.A4B9", "J_USB_C.B4A9"]) {
      expect(
        shorts.some((short) => {
          const labels = [
            ...short.firstOwnerLabels,
            ...short.secondOwnerLabels,
          ];
          return labels.includes(pin) && labels.includes("copperpour:GND");
        }),
      ).toBe(true);
    }
  },
);

const makePads = (
  centers: { x: number; y: number }[],
  size: number,
): AnyCircuitElement[] =>
  [
    makeContact()[0]!,
    ...centers.map((center, i) => ({
      type: "pcb_smtpad",
      pcb_smtpad_id: `pad_${i}`,
      pcb_component_id: `component_${i}`,
      shape: "rect",
      layer: "top",
      width: size,
      height: size,
      ...center,
    })),
  ] as AnyCircuitElement[];

for (const mode of ["gerber", "pcb"] as const) {
  test(`${mode}: detects pads meeting only at a corner`, async () => {
    const shorts = await findBitmapShorts(
      makePads(
        [
          { x: -0.5, y: -0.5 },
          { x: 0.5, y: 0.5 },
        ],
        1,
      ),
      { mode, pixelsPerMm: 20 },
    );
    expect(shorts).toHaveLength(1);
  });
  test(`${mode}: does not connect opposite edges through bitmap row wrapping`, async () => {
    expect(
      await findBitmapShorts(
        makePads(
          [
            { x: 1.975, y: 0.025 },
            { x: -1.975, y: -0.025 },
          ],
          0.05,
        ),
        { mode, pixelsPerMm: 20 },
      ),
    ).toEqual([]);
  });
  test(`${mode}: still detects overlapping pads`, async () => {
    expect(
      await findBitmapShorts(
        makePads(
          [
            { x: -0.25, y: 0 },
            { x: 0.25, y: 0 },
          ],
          1,
        ),
        { mode, pixelsPerMm: 20 },
      ),
    ).toHaveLength(1);
  });
}

for (const mode of ["gerber", "pcb"] as const) {
  test.each([0.0125, 0.025, 0.0375])(
    `${mode}: pad-to-pour contact at pixel phase %s mm`,
    async (offset) => {
      const json = makeContact();
      for (const element of json) {
        if (element.type === "pcb_smtpad" && element.shape === "polygon") {
          for (const point of element.points) {
            point.x += offset;
            point.y += offset;
          }
        }
        if (element.type === "pcb_copper_pour" && element.shape === "brep") {
          for (const ring of element.brep_shape.inner_rings) {
            for (const point of ring.vertices) {
              point.x += offset;
              point.y += offset;
            }
          }
        }
      }
      expect(
        await findBitmapShorts(json, { mode, pixelsPerMm: 20 }),
      ).toHaveLength(1);
    },
  );
}
