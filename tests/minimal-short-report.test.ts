import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { AnyCircuitElement } from "circuit-json";
import {
  createCroppedShortDebugSvg,
  createShortDebugSvg,
  findBitmapShorts,
  formatShortReport,
  formatShortSummary,
} from "../lib";
import { renderSvgToPng } from "../lib/svg-to-png";

const getBlinkBuddyCircuitJson = (): AnyCircuitElement[] =>
  JSON.parse(
    readFileSync(
      `${import.meta.dir}/repros/blinkbuddy/BlinkBuddy.json`,
      "utf8",
    ),
  );

test("BlinkBuddy report puts conflicting nets first and isolates local primitives instead of 100+ net owners", async () => {
  const circuitJson = getBlinkBuddyCircuitJson();
  const shorts = await findBitmapShorts(circuitJson, {
    mode: "gerber",
    layer: "top",
    micronsPerPixel: 35,
  });

  expect(shorts).toHaveLength(2);

  const firstShort = shorts[0];
  const secondShort = shorts[1];
  expect(firstShort).toBeDefined();
  expect(secondShort).toBeDefined();
  if (!firstShort || !secondShort) return;

  // Legacy whole-net owner lists contain >120 items on BlinkBuddy
  const legacyOwnerCount =
    firstShort.firstOwnerLabels.length + firstShort.secondOwnerLabels.length;
  expect(legacyOwnerCount).toBeGreaterThan(120);

  // Conflicting logical nets are resolved cleanly
  expect([firstShort.firstNetName, firstShort.secondNetName].sort()).toEqual([
    "GND",
    "VBUS_5V",
  ]);

  // Local involved primitives at (26.51, 22.71) only include the contacting USB pad/trace & GND pour
  const firstShortInvolvedLabels = [
    ...firstShort.firstInvolvedPrimitives.map((p) => p.label),
    ...firstShort.secondInvolvedPrimitives.map((p) => p.label),
  ];
  expect(firstShortInvolvedLabels).toContain("J1.A4B9");
  expect(firstShortInvolvedLabels).toContain("copperpour:GND");
  expect(firstShortInvolvedLabels.length).toBeLessThanOrEqual(4);
  expect(firstShortInvolvedLabels).not.toContain("ESD1.VBUS");
  expect(firstShortInvolvedLabels).not.toContain("U1.GND");
  expect(firstShortInvolvedLabels).not.toContain("SW1.pin2");

  // Local involved primitives at (21.53, 23.40) isolate J1.B4A9 & copperpour:GND
  const secondShortInvolvedLabels = [
    ...secondShort.firstInvolvedPrimitives.map((p) => p.label),
    ...secondShort.secondInvolvedPrimitives.map((p) => p.label),
  ];
  expect(secondShortInvolvedLabels).toContain("J1.B4A9");
  expect(secondShortInvolvedLabels).toContain("copperpour:GND");
  expect(secondShortInvolvedLabels.length).toBeLessThanOrEqual(4);
  expect(secondShortInvolvedLabels).not.toContain("J1.A4B9");
  expect(secondShortInvolvedLabels).not.toContain("ESD1.VBUS");

  const report = formatShortReport(shorts, { fileName: "BlinkBuddy.json" });
  const lines = report.split("\n");
  expect(lines[0]).toBe("2 shorts detected in BlinkBuddy.json:");
  // Headline puts the two conflicting logical nets first
  expect(lines[1]).toMatch(
    /^1\. \[top\/gerber\] (GND <-> VBUS_5V|VBUS_5V <-> GND) at \(26\.\d+, 22\.\d+\)mm$/,
  );
  expect(report).toContain("J1.A4B9");
  expect(report).toContain("J1.B4A9");
  expect(report).toContain("copperpour:GND");
  // Report must not dump unrelated net components across the board
  expect(report).not.toContain("ESD1.VBUS");
  expect(report).not.toContain("SW1.pin2");
  expect(report).not.toContain("source_net_0_mst40_0");

  // Uncropped SVG <title> also avoids the 130+ owner dump
  const fullSvg = createShortDebugSvg(circuitJson, shorts, { layer: "top" });
  const titles = [...fullSvg.matchAll(/<title>(.*?)<\/title>/g)].map(
    (m) => m[1] ?? "",
  );
  expect(titles).toHaveLength(2);
  for (const title of titles) {
    expect(title).toMatch(/GND &lt;-&gt; VBUS_5V|VBUS_5V &lt;-&gt; GND/);
    expect(title).not.toContain("ESD1.VBUS");
    expect(title).not.toContain("source_net_0_mst40_0");
  }
}, 60_000);

test("reconstructs minimal multi-hop witness path (Comp.pin -> trace -> via) without flooding GND pour", async () => {
  const decouplingElements: AnyCircuitElement[] = [];
  for (let i = 0; i < 20; i++) {
    const x = -8 + (i % 5) * 1.5;
    const y = -6 + Math.floor(i / 5) * 1.5;
    decouplingElements.push(
      {
        type: "source_component",
        source_component_id: `cap_src_${i}`,
        name: `C${i + 1}`,
        ftype: "simple_capacitor",
      } as AnyCircuitElement,
      {
        type: "source_port",
        source_port_id: `cap_port_${i}`,
        source_component_id: `cap_src_${i}`,
        name: "GND",
      } as AnyCircuitElement,
      {
        type: "source_trace",
        source_trace_id: `cap_gnd_link_${i}`,
        connected_source_port_ids: [`cap_port_${i}`],
        connected_source_net_ids: ["net_gnd"],
      } as AnyCircuitElement,
      {
        type: "pcb_component",
        pcb_component_id: `cap_pcb_${i}`,
        source_component_id: `cap_src_${i}`,
        center: { x, y },
        width: 0.8,
        height: 0.8,
        layer: "top",
        rotation: 0,
      } as AnyCircuitElement,
      {
        type: "pcb_port",
        pcb_port_id: `cap_pcb_port_${i}`,
        source_port_id: `cap_port_${i}`,
        pcb_component_id: `cap_pcb_${i}`,
        x,
        y,
        layers: ["top"],
      } as AnyCircuitElement,
      {
        type: "pcb_smtpad",
        pcb_smtpad_id: `cap_pad_${i}`,
        pcb_component_id: `cap_pcb_${i}`,
        pcb_port_id: `cap_pcb_port_${i}`,
        layer: "top",
        shape: "rect",
        x,
        y,
        width: 0.5,
        height: 0.5,
      } as AnyCircuitElement,
    );
  }

  const circuitJson: AnyCircuitElement[] = [
    {
      type: "pcb_board",
      pcb_board_id: "board_witness",
      center: { x: 0, y: 0 },
      width: 20,
      height: 16,
      num_layers: 2,
      thickness: 1.6,
      material: "fr4",
    } as AnyCircuitElement,
    {
      type: "source_net",
      source_net_id: "net_gnd",
      name: "GND",
    } as AnyCircuitElement,
    {
      type: "source_net",
      source_net_id: "net_rf",
      name: "RF_FEED",
    } as AnyCircuitElement,
    {
      type: "source_component",
      source_component_id: "u1_src",
      name: "U1",
      ftype: "simple_chip",
    } as AnyCircuitElement,
    {
      type: "source_port",
      source_port_id: "u1_rf_port",
      source_component_id: "u1_src",
      name: "RF_OUT",
    } as AnyCircuitElement,
    {
      type: "source_trace",
      source_trace_id: "rf_source_trace",
      connected_source_port_ids: ["u1_rf_port"],
      connected_source_net_ids: ["net_rf"],
    } as AnyCircuitElement,
    {
      type: "pcb_component",
      pcb_component_id: "u1_pcb",
      source_component_id: "u1_src",
      center: { x: -6, y: 4 },
      width: 2,
      height: 2,
      layer: "top",
      rotation: 0,
    } as AnyCircuitElement,
    {
      type: "pcb_port",
      pcb_port_id: "u1_rf_pcb_port",
      source_port_id: "u1_rf_port",
      pcb_component_id: "u1_pcb",
      x: -6,
      y: 4,
      layers: ["top"],
    } as AnyCircuitElement,
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "u1_rf_pad",
      pcb_component_id: "u1_pcb",
      pcb_port_id: "u1_rf_pcb_port",
      layer: "top",
      shape: "rect",
      x: -6,
      y: 4,
      width: 0.6,
      height: 0.6,
    } as AnyCircuitElement,
    // Trace runs on top from U1.RF_OUT (-6, 4) to intermediate point (2, 4),
    // then a second bottom segment (2, 4) -> (6, 4) bridges via_mid to via_short,
    // so ONLY pcb_via_short touches the top-layer GND pour at (6, 4)!
    {
      type: "pcb_trace",
      pcb_trace_id: "pcb_trace_rf_top",
      source_trace_id: "rf_source_trace",
      route: [
        {
          route_type: "wire",
          x: -6,
          y: 4,
          width: 0.25,
          layer: "top",
          start_pcb_port_id: "u1_rf_pcb_port",
        },
        {
          route_type: "wire",
          x: 2,
          y: 4,
          width: 0.25,
          layer: "top",
        },
      ],
    } as AnyCircuitElement,
    {
      type: "pcb_via",
      pcb_via_id: "pcb_via_rf_mid",
      source_trace_id: "rf_source_trace",
      x: 2,
      y: 4,
      hole_diameter: 0.25,
      outer_diameter: 0.6,
      layers: ["top", "bottom"],
      from_layer: "top",
      to_layer: "bottom",
    } as AnyCircuitElement,
    {
      type: "pcb_trace",
      pcb_trace_id: "pcb_trace_rf_bottom",
      source_trace_id: "rf_source_trace",
      route: [
        {
          route_type: "wire",
          x: 2,
          y: 4,
          width: 0.25,
          layer: "bottom",
        },
        {
          route_type: "wire",
          x: 6,
          y: 4,
          width: 0.25,
          layer: "bottom",
        },
      ],
    } as AnyCircuitElement,
    {
      type: "pcb_via",
      pcb_via_id: "pcb_via_rf_short",
      source_trace_id: "rf_source_trace",
      x: 6,
      y: 4,
      hole_diameter: 0.25,
      outer_diameter: 0.6,
      layers: ["top", "bottom"],
      from_layer: "bottom",
      to_layer: "top",
    } as AnyCircuitElement,
    {
      type: "pcb_copper_pour",
      pcb_copper_pour_id: "pour_gnd_right",
      source_net_id: "net_gnd",
      layer: "top",
      shape: "rect",
      center: { x: 6, y: 4 },
      width: 4,
      height: 4,
      covered_with_solder_mask: true,
    } as AnyCircuitElement,
    ...decouplingElements,
  ];

  const shorts = await findBitmapShorts(circuitJson, {
    mode: "pcb",
    layer: "top",
    pixelsPerMm: 25,
  });

  expect(shorts).toHaveLength(1);
  const short = shorts[0];
  expect(short).toBeDefined();
  if (!short) return;

  expect([short.firstNetName, short.secondNetName].sort()).toEqual([
    "GND",
    "RF_FEED",
  ]);

  const rfIsFirst = short.firstNetName === "RF_FEED";
  const rfInvolved = rfIsFirst
    ? short.firstInvolvedPrimitives
    : short.secondInvolvedPrimitives;
  const gndInvolved = rfIsFirst
    ? short.secondInvolvedPrimitives
    : short.firstInvolvedPrimitives;
  const rfWitness = rfIsFirst
    ? short.firstWitnessPath
    : short.secondWitnessPath;
  const gndWitness = rfIsFirst
    ? short.secondWitnessPath
    : short.firstWitnessPath;

  // Only pcb_via_rf_short touches the GND pour at (6, 4) on top!
  expect(rfInvolved.map((p) => p.label)).toEqual(["pcb_via_rf_short"]);
  expect(gndInvolved.map((p) => p.label)).toEqual(["copperpour:GND"]);

  // Multi-hop minimal witness path across layers from U1.RF_OUT to pcb_via_rf_short!
  expect(rfWitness).toEqual([
    "U1.RF_OUT",
    "pcb_trace_rf_top",
    "pcb_via_rf_mid",
    "pcb_trace_rf_bottom",
    "pcb_via_rf_short",
  ]);
  expect(gndWitness).toEqual(["copperpour:GND"]);

  const summary = formatShortSummary(short, 0);
  expect(summary).toMatch(/GND <-> RF_FEED|RF_FEED <-> GND/);
  const report = formatShortReport(shorts);
  expect(report).toContain(
    "U1.RF_OUT -> pcb_trace_rf_top -> pcb_via_rf_mid -> pcb_trace_rf_bottom -> pcb_via_rf_short",
  );
  expect(report).not.toContain("C1.GND");
  expect(report).not.toContain("C20.GND");
});

test("createCroppedShortDebugSvg produces a tightly cropped, valid renderable SVG", async () => {
  const circuitJson = getBlinkBuddyCircuitJson();
  const shorts = await findBitmapShorts(circuitJson, {
    mode: "gerber",
    layer: "top",
    micronsPerPixel: 35,
  });

  const firstShort = shorts[0];
  expect(firstShort).toBeDefined();
  if (!firstShort) return;

  const croppedSvg = createCroppedShortDebugSvg(circuitJson, [firstShort], {
    layer: "top",
    paddingMm: 1.5,
  });

  expect(croppedSvg).toContain('data-cropped="true"');
  const viewBoxMatch = croppedSvg.match(/\bviewBox="([^"]+)"/);
  expect(viewBoxMatch?.[1]).toBeDefined();
  const [vbX, vbY, vbW, vbH] = (viewBoxMatch?.[1] ?? "")
    .split(" ")
    .map((n) => Number(n));
  expect(Number.isFinite(vbX)).toBe(true);
  expect(Number.isFinite(vbY)).toBe(true);
  // Tightly zoomed (< 15% of the 800x600 full-board coordinate span)
  expect(vbW).toBeGreaterThan(5);
  expect(vbW).toBeLessThan(120);
  expect(vbH).toBeGreaterThan(5);
  expect(vbH).toBeLessThan(90);

  // Renders cleanly through resvg to a crisp PNG
  const pngBytes = renderSvgToPng(croppedSvg);
  expect(pngBytes.byteLength).toBeGreaterThan(1000);
  expect(Array.from(pngBytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);

  // Zero-short report helper
  expect(formatShortReport([])).toBe("No shorts detected");
  expect(formatShortReport([], { fileName: "board.json" })).toBe(
    "No shorts detected in board.json",
  );
}, 60_000);
