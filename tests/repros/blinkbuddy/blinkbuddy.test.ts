import { expect, test } from "bun:test";
import { readFileSync } from "fs";
import type { AnyCircuitElement } from "circuit-json";
import { createShortDebugSvg, renderBitmapShortDebug } from "lib/index";
import { writeOrCompareBitmapDebugSnapshot } from "tests/fixtures/bitmap-snapshot";
import "tests/fixtures/extend-expect-circuit-snapshot";

const getBlinkBuddyCircuitJson = (): AnyCircuitElement[] =>
  JSON.parse(readFileSync(`${import.meta.dir}/BlinkBuddy.json`, "utf8"));

const getLabels = (short: {
  firstOwnerLabels: string[];
  secondOwnerLabels: string[];
}): string[] => [...short.firstOwnerLabels, ...short.secondOwnerLabels];

test("bitmap short debug uses fixed physical resolution by default", async () => {
  const debug = await renderBitmapShortDebug([
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_resolution_probe",
      center: { x: 0, y: 0 },
      width: 2,
      height: 1,
    } as AnyCircuitElement,
  ]);

  expect(debug.width).toBe(58);
  expect(debug.height).toBe(29);
});

test("BlinkBuddy gerber repro finds separate top copper-pour contacts", async () => {
  const circuitJson = getBlinkBuddyCircuitJson();
  const topDebug = await renderBitmapShortDebug(circuitJson, {
    mode: "gerber",
    layer: "top",
    micronsPerPixel: 35,
  });
  const bottomDebug = await renderBitmapShortDebug(circuitJson, {
    mode: "gerber",
    layer: "bottom",
    micronsPerPixel: 100,
  });
  const gerberTopShorts = await writeOrCompareBitmapDebugSnapshot(
    import.meta.path,
    "gerber-top-bitmap",
    topDebug,
  );

  expect(topDebug.width).toBe(2343);
  expect(topDebug.height).toBe(1715);
  expect(topDebug.shorts).toHaveLength(3);
  expect(gerberTopShorts).toEqual(topDebug.shorts);
  expect(bottomDebug.shorts).toEqual([]);

  for (const short of topDebug.shorts) {
    const labels = getLabels(short);
    expect(labels).toContain("copperpour:GND");
    expect(labels).toContain("ESD1.VBUS");
  }

  expect(topDebug.shorts[0]?.center.x).toBeCloseTo(26.43, 1);
  expect(topDebug.shorts[0]?.center.y).toBeCloseTo(22.38, 1);
  expect(topDebug.shorts[1]?.center.x).toBeCloseTo(26.57, 1);
  expect(topDebug.shorts[1]?.center.y).toBeCloseTo(23.29, 1);
  expect(topDebug.shorts[2]?.center.x).toBeCloseTo(21.55, 1);
  expect(topDebug.shorts[2]?.center.y).toBeCloseTo(23.38, 1);
  await expect(
    createShortDebugSvg(circuitJson, topDebug.shorts, { layer: "top" }),
  ).toMatchPcbSnapshot(import.meta.path);
}, 90_000);
