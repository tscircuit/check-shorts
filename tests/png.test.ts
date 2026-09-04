import { expect, test } from "bun:test";
import type { BitmapShortDebugLegendEntry } from "../lib/bitmap-short-types";
import { getLegendLabel } from "../lib/png";

const createLegendEntry = (labels: string[]): BitmapShortDebugLegendEntry => ({
  connectivityKey: "connectivity-key",
  color: [80, 120, 160],
  labels,
});

test("keeps legend labels longer than 36 characters when they fit", () => {
  const label = "U2_CHARGER.E3,U3_GAUGE.A3,J3_DISPLAY.pin8";

  expect(getLegendLabel(createLegendEntry([label]), 1_000)).toBe(label);
});

test("truncates legend labels based on their rendered width", () => {
  const label = "U2_CHARGER.E3,U3_GAUGE.A3,J3_DISPLAY.pin8";
  const fittedLabel = getLegendLabel(createLegendEntry([label]), 180);

  expect(fittedLabel).toEndWith("...");
  expect(fittedLabel.length).toBeLessThan(label.length);
});
