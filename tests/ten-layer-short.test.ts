import { expect, test } from "bun:test";
import type { AnyCircuitElement } from "circuit-json";
import { findBitmapShorts } from "../lib";

test("detects a short on inner8 of a 10-layer board", async () => {
  const circuitJson = [
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_0",
      center: { x: 0, y: 0 },
      width: 10,
      height: 10,
      num_layers: 10,
    },
    {
      type: "pcb_trace",
      pcb_trace_id: "pcb_trace_horizontal",
      route: [
        {
          route_type: "wire",
          x: -3,
          y: 0,
          width: 1,
          layer: "inner8",
        },
        {
          route_type: "wire",
          x: 3,
          y: 0,
          width: 1,
          layer: "inner8",
        },
      ],
    },
    {
      type: "pcb_trace",
      pcb_trace_id: "pcb_trace_vertical",
      route: [
        {
          route_type: "wire",
          x: 0,
          y: -3,
          width: 1,
          layer: "inner8",
        },
        {
          route_type: "wire",
          x: 0,
          y: 3,
          width: 1,
          layer: "inner8",
        },
      ],
    },
  ] as AnyCircuitElement[];

  const shorts = await findBitmapShorts(circuitJson, {
    layer: "inner8",
    width: 200,
    height: 200,
  });

  expect(shorts).toHaveLength(1);
  expect(shorts[0]?.layer).toBe("inner8");
  expect(shorts[0]?.firstConnectivityKey).toBe("pcb_trace_horizontal");
  expect(shorts[0]?.secondConnectivityKey).toBe("pcb_trace_vertical");
});
