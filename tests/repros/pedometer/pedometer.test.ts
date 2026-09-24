import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cju } from "@tscircuit/circuit-json-util";
import { getFullConnectivityMapFromCircuitJson } from "circuit-json-to-connectivity-map";
import { findBitmapShorts } from "lib/index";
import { writeOrCompareSvgSnapshot } from "tests/fixtures/bitmap-snapshot";
import {
  BROKEN_TRACE_ID,
  getPedometer,
  makeRepairVia,
  MISSING_VIA,
  PMID_NET_ID,
} from "./fixture";
import { missingViaSvg } from "./missing-via-svg";
import { probePhysicalNet } from "./physical-net-probe";

const islands = [
  ["C16.pin1", "C9.pin1", "U2.VINLS", "U4.EN", "U4.IN"],
  ["C4.pin1", "U2.PMID_A", "U2.PMID_B"],
];
const connected = [islands.flat().sort()];

test("fixture is the byte-for-byte published circuit JSON, with no rerouting or reduction", () => {
  const bytes = readFileSync(`${import.meta.dir}/pedometer.circuit.json`);
  expect(bytes.length).toBe(2_311_281);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "64c56f80241a1bb502758ddbc92c6f0ed8e3fec9adc14cc2f6f0c47f90a2ce4f",
  );
  expect(getPedometer()).toHaveLength(2712);
});

test("PMID endpoint metadata claims connection, but inner2 terminates at a top-only pad without a via", () => {
  const circuitJson = getPedometer();
  const db = cju(circuitJson);
  const trace = db.pcb_trace.get(BROKEN_TRACE_ID)!;
  const port = db.pcb_port.get("pcb_port_66")!;
  expect(trace.source_trace_id).toBe("source_trace_83");
  expect(trace.route.at(-1)).toEqual({
    route_type: "wire",
    ...MISSING_VIA,
    width: 0.1,
    layer: "inner2",
    end_pcb_port_id: "pcb_port_66",
  });
  expect(port.layers).toEqual(["top"]);
  expect({ x: port.x, y: port.y }).toEqual(MISSING_VIA);
  expect(db.source_port.get(port.source_port_id!)?.name).toBe("PMID_B");
  const nearEndpoint = (p: { x: number; y: number }) =>
    Math.hypot(p.x - MISSING_VIA.x, p.y - MISSING_VIA.y) < 0.2;
  expect(db.pcb_via.list().filter(nearEndpoint)).toEqual([]);
  // Check inline via representations too, not just standalone pcb_via records.
  expect(
    db.pcb_trace
      .list()
      .flatMap((t) => t.route)
      .filter((p) => p.route_type === "via" && nearEndpoint(p)),
  ).toEqual([]);
  const connMap = getFullConnectivityMapFromCircuitJson(circuitJson);
  const netKey = connMap.getNetConnectedToId(PMID_NET_ID);
  expect(netKey).toBeTruthy();
  for (const name of ["C4", "C9"]) {
    const source = db.source_component.list().find((c) => c.name === name)!;
    const sourcePort = db.source_port
      .list()
      .find(
        (p) =>
          p.source_component_id === source.source_component_id &&
          p.name === "pin1",
      )!;
    expect(connMap.getNetConnectedToId(sourcePort.source_port_id)).toBe(netKey);
  }
});

// This is intentionally a characterization of the shorts-only API, not a
// claim that zero shorts is a complete electrical-connectivity signoff.
for (const layer of ["top", "inner1", "inner2", "bottom"] as const) {
  test(`existing Gerber short check accepts the literal open-circuit board on ${layer}`, async () => {
    expect(
      await findBitmapShorts(getPedometer(), {
        mode: "gerber",
        layer,
        pixelsPerMm: 50,
      }),
    ).toEqual([]);
  }, 90_000);
}

for (const [mode, pixelsPerMm] of [
  ["pcb", 50],
  ["gerber", 50],
  ["gerber", 100],
] as const) {
  test(`${mode} ${pixelsPerMm} px/mm: probe every PMID pad across all four layers, then repair the missing via`, async () => {
    const circuitJson = getPedometer();
    const original = JSON.stringify(circuitJson);
    expect(
      await probePhysicalNet(circuitJson, PMID_NET_ID, { mode, pixelsPerMm }),
    ).toEqual(islands);
    expect(
      await probePhysicalNet([...circuitJson, makeRepairVia()], PMID_NET_ID, {
        mode,
        pixelsPerMm,
      }),
    ).toEqual(connected);
    expect(JSON.stringify(circuitJson)).toBe(original);
  }, 90_000);
}

test("a via at the right XY but on the wrong layer span does not repair PMID", async () => {
  const via = makeRepairVia();
  via.layers = ["inner2", "bottom"];
  via.from_layer = "inner2";
  expect(
    await probePhysicalNet([...getPedometer(), via], PMID_NET_ID, {
      pixelsPerMm: 50,
    }),
  ).toEqual(islands);
}, 90_000);

test("a disconnected via with the same logical net does not repair PMID", async () => {
  const via = { ...makeRepairVia(), x: 15, y: 15 };
  expect(
    await probePhysicalNet([...getPedometer(), via], PMID_NET_ID, {
      mode: "gerber",
      pixelsPerMm: 50,
    }),
  ).toEqual(islands);
}, 90_000);

test("SVG snapshots zoom to the missing via with viewBox, and show the repaired control", async () => {
  const original = missingViaSvg(getPedometer());
  const repaired = missingViaSvg([...getPedometer(), makeRepairVia()], true);
  expect(original).toContain('data-type="error-zoom"');
  expect(original).toMatch(/viewBox="[^"]+" data-type="error-zoom"/);
  expect(original).toContain("No via at this layer transition");
  await writeOrCompareSvgSnapshot(
    import.meta.path,
    original,
    "missing-via-zoom",
  );
  await writeOrCompareSvgSnapshot(
    import.meta.path,
    repaired,
    "repaired-via-zoom",
  );
});
