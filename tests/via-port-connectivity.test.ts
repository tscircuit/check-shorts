import { expect, test } from "bun:test";
import { cju } from "@tscircuit/circuit-json-util";
import type { AnyCircuitElement, PcbVia } from "circuit-json";
import {
  ConnectivityMap,
  getFullConnectivityMapFromCircuitJson,
} from "circuit-json-to-connectivity-map";
import { buildConnectivityGroups } from "lib/bitmap-copper-groups";
import { findBitmapShorts } from "lib/index";

const via: PcbVia = {
  type: "pcb_via",
  pcb_via_id: "pcb_via_0",
  pcb_port_ids: ["pcb_port_top", "pcb_port_bottom"],
  x: 0,
  y: 0,
  hole_diameter: 0.2,
  outer_diameter: 0.6,
  layers: ["top", "bottom"],
};

for (const [description, knownMember, identity] of [
  [
    "via ID",
    "pcb_via_0",
    {
      subcircuit_connectivity_map_key: "sub_gnd",
      source_net_id: "source_net_gnd",
    },
  ],
  ["subcircuit key", "sub_gnd", { subcircuit_connectivity_map_key: "sub_gnd" }],
  [
    "source net",
    "source_net_gnd",
    {
      source_net_id: "source_net_gnd",
      subcircuit_connectivity_map_key: "sub_gnd",
    },
  ],
  ["existing port", "pcb_port_top", {}],
] as const) {
  test(`via ports retain a canonical key known through the ${description}`, () => {
    const circuitJson = [
      { ...via, ...identity },
      {
        type: "pcb_trace",
        pcb_trace_id: "pcb_trace_bottom",
        route: [
          {
            route_type: "wire",
            x: 0,
            y: 0,
            width: 0.2,
            layer: "bottom",
            start_pcb_port_id: "pcb_port_bottom",
          },
          {
            route_type: "wire",
            x: 1,
            y: 0,
            width: 0.2,
            layer: "bottom",
            end_pcb_port_id: "pcb_port_end",
          },
        ],
      },
    ] satisfies AnyCircuitElement[];
    const connMap = new ConnectivityMap({
      canonical_ground: [knownMember],
      unattached_route: ["pcb_port_bottom", "pcb_port_end", "pcb_trace_bottom"],
    });
    const before = structuredClone(connMap);
    const groups = buildConnectivityGroups({
      circuitJson,
      connMap,
      db: cju(circuitJson),
      layer: "bottom",
    });
    expect([...groups.keys()]).toEqual(["canonical_ground"]);
    expect(groups.get("canonical_ground")).toEqual(circuitJson);
    expect(connMap.netMap).toEqual(before.netMap);
    expect(connMap.idToNetMap).toEqual(before.idToNetMap);
  });
}

for (const mode of ["pcb", "gerber"] as const) {
  test(`${mode}: adding via ports preserves a shared subcircuit fallback identity`, async () => {
    const circuitJson: AnyCircuitElement[] = [
      {
        type: "pcb_board",
        pcb_board_id: "pcb_board_0",
        center: { x: 0, y: 0 },
        width: 4,
        height: 4,
        thickness: 1.6,
        num_layers: 2,
        material: "fr4",
      },
      {
        ...via,
        pcb_port_ids: undefined,
        subcircuit_connectivity_map_key: "sub_gnd",
      },
      {
        ...via,
        pcb_via_id: "pcb_via_1",
        pcb_port_ids: undefined,
        x: 0.3,
        subcircuit_connectivity_map_key: "sub_gnd",
      },
      {
        type: "pcb_port",
        pcb_port_id: "pcb_port_top",
        source_port_id: "source_port_top",
        x: 0,
        y: 0,
        layers: ["top"],
      },
      {
        type: "pcb_port",
        pcb_port_id: "pcb_port_bottom",
        source_port_id: "source_port_bottom",
        x: 0,
        y: 0,
        layers: ["bottom"],
      },
    ];
    const options = { mode, layer: "top", pixelsPerMm: 50 } as const;
    expect(await findBitmapShorts(circuitJson, options)).toEqual([]);
    cju(circuitJson).pcb_via.list()[0].pcb_port_ids = via.pcb_port_ids;
    expect(await findBitmapShorts(circuitJson, options)).toEqual([]);
    const groups = buildConnectivityGroups({
      circuitJson,
      connMap: getFullConnectivityMapFromCircuitJson(circuitJson),
      db: cju(circuitJson),
      layer: "top",
    });
    expect([...groups.keys()]).toEqual(["sub_gnd"]);
  });

  test(`${mode}: conflicting via-port metadata cannot merge two identified nets`, async () => {
    const circuitJson: AnyCircuitElement[] = [
      {
        type: "pcb_board",
        pcb_board_id: "pcb_board_0",
        center: { x: 0, y: 0 },
        width: 4,
        height: 4,
        thickness: 1.6,
        num_layers: 2,
        material: "fr4",
      },
      {
        type: "source_net",
        source_net_id: "source_net_gnd",
        name: "GND",
        member_source_group_ids: [],
      },
      {
        type: "source_net",
        source_net_id: "source_net_signal",
        name: "SIGNAL",
        member_source_group_ids: [],
      },
      { ...via, pcb_port_ids: undefined, source_net_id: "source_net_gnd" },
      {
        type: "source_trace",
        source_trace_id: "source_trace_gnd",
        connected_source_port_ids: ["source_port_gnd"],
        connected_source_net_ids: ["source_net_gnd"],
      },
      {
        type: "pcb_port",
        pcb_port_id: "pcb_port_top",
        source_port_id: "source_port_gnd",
        x: 0,
        y: 0,
        layers: ["top"],
      },
      {
        type: "pcb_trace",
        pcb_trace_id: "pcb_trace_gnd",
        source_trace_id: "source_trace_gnd",
        route: [
          { route_type: "wire", x: -1, y: 0, width: 0.2, layer: "top" },
          { route_type: "wire", x: 0, y: 0, width: 0.2, layer: "top" },
        ],
      },
      {
        ...via,
        pcb_via_id: "pcb_via_signal",
        source_net_id: "source_net_signal",
        x: 0.3,
      },
    ];
    const connMap = getFullConnectivityMapFromCircuitJson(circuitJson);
    const groups = buildConnectivityGroups({
      circuitJson,
      connMap,
      db: cju(circuitJson),
      layer: "top",
    });
    const db = cju(circuitJson);
    expect(groups.get(connMap.getNetConnectedToId("source_net_gnd")!)).toEqual([
      db.pcb_via.get("pcb_via_0")!,
      db.pcb_trace.get("pcb_trace_gnd")!,
    ]);
    expect(
      groups.get(connMap.getNetConnectedToId("source_net_signal")!),
    ).toEqual([db.pcb_via.get("pcb_via_signal")!]);
    const shorts = await findBitmapShorts(circuitJson, {
      mode,
      layer: "top",
      pixelsPerMm: 50,
    });
    expect(shorts).toHaveLength(1);
    expect(
      [...shorts[0].firstOwnerLabels, ...shorts[0].secondOwnerLabels].sort(),
    ).toEqual(["pcb_trace_gnd", "pcb_via_0", "pcb_via_signal"]);
  });
}

test("via ports without a known identity do not create a canonical network", () => {
  const circuitJson: AnyCircuitElement[] = [via];
  const connMap = new ConnectivityMap({});
  const groups = buildConnectivityGroups({
    circuitJson,
    connMap,
    db: cju(circuitJson),
    layer: "top",
  });
  expect([...groups.keys()]).toEqual([via.pcb_via_id]);
  expect(connMap.netMap).toEqual({});
});
