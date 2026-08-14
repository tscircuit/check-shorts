import { expect, test } from "bun:test";
import type { AnyCircuitElement } from "circuit-json";
import { findBitmapShorts, type BitmapShortProgressEvent } from "../lib";

test("reports progress while checking connectivity groups", async () => {
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
  const events: BitmapShortProgressEvent[] = [];

  const shorts = await findBitmapShorts(circuitJson, {
    mode: "pcb",
    layer: "top",
    width: 200,
    height: 200,
    onProgress: (event) => events.push(event),
  });

  expect(shorts).toHaveLength(1);
  expect(events.map((event) => event.phase)).toEqual([
    "preparing",
    "rasterizing",
    "rasterizing",
    "rasterizing",
    "detecting",
    "complete",
  ]);
  expect(events[1]).toMatchObject({
    phase: "rasterizing",
    mode: "pcb",
    layer: "top",
    width: 200,
    height: 200,
    completedGroups: 0,
    totalGroups: 2,
    currentConnectivityKey: "pcb_trace_horizontal",
  });
  expect(events[3]).toMatchObject({
    phase: "rasterizing",
    completedGroups: 2,
    totalGroups: 2,
  });
  expect(events.at(-1)).toEqual({
    phase: "complete",
    mode: "pcb",
    layer: "top",
    shortsFound: 1,
  });
});
