import { expect, test } from "bun:test";
import { findBitmapOpens } from "../lib";
import { getPedometer, makeRepairVia } from "./repros/pedometer/fixture";
import { cju } from "@tscircuit/circuit-json-util";
import { getFullConnectivityMapFromCircuitJson } from "circuit-json-to-connectivity-map";
import { buildConnectivityGroups } from "../lib/bitmap-copper-groups";
import type { AnyCircuitElement, LayerRef } from "circuit-json";

test("production bitmap continuity finds the literal pedometer PMID copper's missing-via defect", async () => {
  for (const mode of ["pcb", "gerber"] as const) {
    const literal = getPedometer();
    const connMap = getFullConnectivityMapFromCircuitJson(literal);
    const key = connMap.getNetConnectedToId("source_net_6")!;
    const db = cju(literal);
    const copper = new Set<AnyCircuitElement>(
      ["top", "inner1", "inner2", "bottom"].flatMap(
        (layer) =>
          buildConnectivityGroups({
            circuitJson: literal,
            connMap,
            db,
            layer: layer as LayerRef,
          }).get(key) ?? [],
      ),
    );
    // Keep the literal PMID copper unchanged, without unrelated large GND pours.
    const json = literal.filter(
      (e) =>
        copper.has(e) ||
        !e.type.startsWith("pcb_") ||
        e.type === "pcb_board" ||
        e.type === "pcb_component" ||
        (e.type === "pcb_port" &&
          connMap.getNetConnectedToId(e.pcb_port_id) === key),
    );
    const findPmid = (opens: Awaited<ReturnType<typeof findBitmapOpens>>) =>
      opens.find((e) => e.netNames.includes("PMID"));
    const broken = findPmid(
      await findBitmapOpens(json, { mode, pixelsPerMm: 50 }),
    );
    expect(
      broken?.islands
        .map((i) => i.labels)
        .sort((a, b) => a[0]!.localeCompare(b[0]!)),
    ).toEqual([
      ["C16.pin1", "C9.pin1", "U2.VINLS", "U4.EN", "U4.IN"],
      ["C4.pin1", "U2.PMID_A", "U2.PMID_B"],
    ]);
    expect(
      findPmid(
        await findBitmapOpens([...json, makeRepairVia()], {
          mode,
          pixelsPerMm: 50,
        }),
      ),
    ).toBeUndefined();
  }
}, 30_000);
