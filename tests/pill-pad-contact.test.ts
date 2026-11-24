import { expect, test } from "bun:test";
import type { AnyCircuitElement } from "circuit-json";
import { findBitmapShorts } from "../lib";

test("detects horizontal pill pads touching at their rounded ends", async () => {
  const circuitJson = [
    {
      type: "pcb_board",
      pcb_board_id: "board",
      center: { x: 0, y: 0 },
      width: 6,
      height: 4,
      num_layers: 2,
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "left_pad",
      shape: "pill",
      layer: "top",
      x: 0,
      y: 0,
      width: 2,
      height: 1,
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "right_pad",
      shape: "pill",
      layer: "top",
      x: 2,
      y: 0,
      width: 2,
      height: 1,
    },
  ] as AnyCircuitElement[];

  const shorts = await findBitmapShorts(circuitJson, {
    mode: "pcb",
    layer: "top",
    pixelsPerMm: 20,
  });

  expect(shorts).toHaveLength(1);
  expect(shorts[0]?.firstConnectivityKey).toBe("left_pad");
  expect(shorts[0]?.secondConnectivityKey).toBe("right_pad");
});
