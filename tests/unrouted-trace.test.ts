import { expect, test } from "bun:test";
import type { AnyCircuitElement } from "circuit-json";
import { findBitmapShorts } from "../lib";

test("does not throw on an unrouted pcb_trace with no route", async () => {
  const circuitJson = [
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_0",
      center: { x: 0, y: 0 },
      width: 10,
      height: 10,
    },
    {
      type: "pcb_trace",
      pcb_trace_id: "pcb_trace_unrouted",
      source_trace_id: "source_trace_unrouted",
    },
  ] as AnyCircuitElement[];

  expect(
    await findBitmapShorts(circuitJson, {
      mode: "pcb",
      layer: "top",
      width: 200,
      height: 200,
    }),
  ).toEqual([]);
});

test("still detects a short when the board also has an unrouted trace", async () => {
  const circuitJson = [
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_0",
      center: { x: 0, y: 0 },
      width: 10,
      height: 10,
    },
    {
      type: "pcb_trace",
      pcb_trace_id: "pcb_trace_unrouted",
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
          layer: "top",
        },
        {
          route_type: "wire",
          x: 3,
          y: 0,
          width: 1,
          layer: "top",
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
          layer: "top",
        },
        {
          route_type: "wire",
          x: 0,
          y: 3,
          width: 1,
          layer: "top",
        },
      ],
    },
  ] as AnyCircuitElement[];

  const shorts = await findBitmapShorts(circuitJson, {
    mode: "pcb",
    layer: "top",
    width: 200,
    height: 200,
  });

  expect(shorts).toHaveLength(1);
  expect(shorts[0]?.firstConnectivityKey).toBe("pcb_trace_horizontal");
  expect(shorts[0]?.secondConnectivityKey).toBe("pcb_trace_vertical");
});
