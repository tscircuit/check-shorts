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
const legacyCircuitJson: AnyCircuitElement[] = JSON.parse(
  readFileSync(
    new URL("./gnd-via-bottom-route.circuit.json", import.meta.url),
    "utf8",
  ),
);

// Unmodified output from core PR #4002 at a311bcb5 (core 0.0.1994).
// The bottom route now references the ports listed in pcb_via.pcb_port_ids.
const viaPortCircuitJson: AnyCircuitElement[] = JSON.parse(
  readFileSync(
    new URL("./gnd-via-bottom-route-via-ports.circuit.json", import.meta.url),
    "utf8",
  ),
);

const options = { mode: "gerber", layer: "bottom", pixelsPerMm: 50 } as const;

test("captured bottom route and both through-vias belong to GND without a source trace ID", async () => {
  const db = cju(legacyCircuitJson);
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
  const connectivityMap =
    getFullConnectivityMapFromCircuitJson(legacyCircuitJson);
  expect(
    connectivityMap.areAllIdsConnected([
      ground.source_net_id,
      bottomTraces[0].pcb_trace_id,
      ...vias.map((via) => via.pcb_via_id),
    ]),
  ).toBe(true);

  const shorts = await findBitmapShorts(legacyCircuitJson, options);
  await writeOrCompareSvgSnapshot(
    import.meta.path,
    createShortDebugSvg(legacyCircuitJson, shorts, { layer: "bottom" }),
  );
});

test("current core output routes through the bottom ports of both GND vias", async () => {
  const db = cju(viaPortCircuitJson);
  const ground = db.source_net.list().find((net) => net.name === "GND")!;
  const trace = db.pcb_trace.list().find((trace) => !trace.source_trace_id)!;
  const wirePoints = trace.route.filter((point) => point.route_type === "wire");
  const endpointPortIds = [
    wirePoints[0].start_pcb_port_id!,
    wirePoints.at(-1)!.end_pcb_port_id!,
  ];
  expect(new Set(endpointPortIds).size).toBe(2);
  for (const endpointPortId of endpointPortIds) {
    expect(db.pcb_port.get(endpointPortId)).toMatchObject({
      layers: ["bottom"],
    });
    expect(
      db.pcb_via
        .list()
        .find((via) => via.pcb_port_ids?.includes(endpointPortId)),
    ).toMatchObject({
      source_net_id: ground.source_net_id,
      layers: ["top", "inner1", "inner2", "bottom"],
    });
  }
  const shorts = await findBitmapShorts(viaPortCircuitJson, options);
  await writeOrCompareSvgSnapshot(
    import.meta.path,
    createShortDebugSvg(viaPortCircuitJson, shorts, { layer: "bottom" }),
    "via-ports-short-debug",
  );
});

for (const [coreVersion, circuitJson] of [
  ["0.0.1971", legacyCircuitJson],
  ["0.0.1994", viaPortCircuitJson],
] as const) {
  for (const mode of ["pcb", "gerber"] as const) {
    test(`core ${coreVersion}, ${mode}: same-GND bottom route does not report shorts at its via endpoints`, async () => {
      expect(await findBitmapShorts(circuitJson, { ...options, mode })).toEqual(
        [],
      );
    });

    test(`core ${coreVersion}, ${mode}: a route with no endpoint identity remains separate copper`, async () => {
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
        expect([
          ...short.firstOwnerLabels,
          ...short.secondOwnerLabels,
        ]).toContain(isolatedTrace.pcb_trace_id);
      }
    });

    test(`core ${coreVersion}, ${mode}: a different-net via touching the GND route still reports a short`, async () => {
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
        expect([
          ...short.firstOwnerLabels,
          ...short.secondOwnerLabels,
        ]).toContain(groundTrace.pcb_trace_id);
      }
    });
  }
}
