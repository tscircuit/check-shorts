import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { cju } from "@tscircuit/circuit-json-util";
import type { AnyCircuitElement } from "circuit-json";
import { getFullConnectivityMapFromCircuitJson } from "circuit-json-to-connectivity-map";
import { createShortDebugSvg, findBitmapShorts } from "lib/index";
import { writeOrCompareSvgSnapshot } from "tests/fixtures/bitmap-snapshot";

// Unmodified output of the two-capacitor/two-via circuit in core PR #4002,
// rendered with tscircuit 0.0.2646 / core 0.0.1971. The keepout forces the
// GND via-to-via route onto bottom. No endpoint IDs or net IDs were patched.
const circuitJson: AnyCircuitElement[] = JSON.parse(
  readFileSync(
    new URL("./gnd-via-bottom-route.circuit.json", import.meta.url),
    "utf8",
  ),
);

const options = { mode: "gerber", layer: "bottom", pixelsPerMm: 50 } as const;

test("captured bottom route and both through-vias belong to GND without a source trace ID", async () => {
  const db = cju(circuitJson);
  const ground = db.source_net.list().find((net) => net.name === "GND")!;
  const bottomTraces = db.pcb_trace
    .list()
    .filter((trace) =>
      trace.route.some(
        (point) => point.route_type === "wire" && point.layer === "bottom",
      ),
    );
  expect(bottomTraces).toHaveLength(1);
  expect(bottomTraces[0].source_trace_id).toBeUndefined();
  const vias = db.pcb_via.list();
  expect(vias).toHaveLength(2);
  for (const via of vias) {
    expect(via).toMatchObject({
      source_net_id: ground.source_net_id,
      layers: ["top", "inner1", "inner2", "bottom"],
    });
  }
  const connectivityMap = getFullConnectivityMapFromCircuitJson(circuitJson);
  expect(
    connectivityMap.areAllIdsConnected([
      ground.source_net_id,
      bottomTraces[0].pcb_trace_id,
      ...vias.map((via) => via.pcb_via_id),
    ]),
  ).toBe(true);

  const shorts = await findBitmapShorts(circuitJson, options);
  await writeOrCompareSvgSnapshot(
    import.meta.path,
    createShortDebugSvg(circuitJson, shorts, { layer: "bottom" }),
  );
});

// Remove .failing when the checker resolves the PCB trace through its
// connectivity map instead of treating its missing source_trace_id as a new net.
test.failing("same-GND bottom route should not report shorts at its via endpoints", async () => {
  expect(await findBitmapShorts(circuitJson, options)).toEqual([]);
});
