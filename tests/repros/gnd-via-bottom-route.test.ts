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

for (const mode of ["pcb", "gerber"] as const) {
  test(`${mode}: same-GND bottom route does not report shorts at its via endpoints`, async () => {
    expect(await findBitmapShorts(circuitJson, { ...options, mode })).toEqual(
      [],
    );
  });

  test(`${mode}: a route with no endpoint identity remains separate copper`, async () => {
    const isolatedCircuitJson = structuredClone(circuitJson);
    const isolatedTrace = cju(isolatedCircuitJson)
      .pcb_trace.list()
      .find((trace) => !trace.source_trace_id)!;
    for (const point of isolatedTrace.route) {
      if (point.route_type !== "wire") continue;
      delete point.start_pcb_port_id;
      delete point.end_pcb_port_id;
    }

    const shorts = await findBitmapShorts(isolatedCircuitJson, {
      ...options,
      mode,
    });
    expect(shorts).toHaveLength(2);
    for (const short of shorts) {
      expect([...short.firstOwnerLabels, ...short.secondOwnerLabels]).toContain(
        isolatedTrace.pcb_trace_id,
      );
    }
  });

  test(`${mode}: a different-net via touching the GND route still reports a short`, async () => {
    const signalVia = {
      type: "pcb_via" as const,
      pcb_via_id: "pcb_via_signal",
      source_net_id: "source_net_signal",
      x: -1,
      y: 0,
      hole_diameter: 0.3,
      outer_diameter: 0.45,
      layers: cju(circuitJson).pcb_via.list()[0].layers,
      from_layer: "top" as const,
      to_layer: "bottom" as const,
    };
    const shortedCircuitJson: AnyCircuitElement[] = [
      ...circuitJson,
      {
        type: "source_net",
        source_net_id: "source_net_signal",
        name: "SIGNAL",
        member_source_group_ids: [],
      },
      signalVia,
    ];
    const shorts = await findBitmapShorts(shortedCircuitJson, {
      ...options,
      mode,
    });
    const signalShorts = shorts.filter((short) =>
      [...short.firstOwnerLabels, ...short.secondOwnerLabels].includes(
        signalVia.pcb_via_id,
      ),
    );
    expect(signalShorts.length).toBeGreaterThan(0);
    const groundTrace = cju(circuitJson)
      .pcb_trace.list()
      .find((trace) => !trace.source_trace_id)!;
    for (const short of signalShorts) {
      expect([...short.firstOwnerLabels, ...short.secondOwnerLabels]).toContain(
        groundTrace.pcb_trace_id,
      );
    }
  });
}
