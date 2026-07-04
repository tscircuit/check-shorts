import { expect } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  appendBitmapLegend,
  encodeRgbaPng,
  renderBitmapShortDebug,
} from "lib/index";
import type { BitmapShort, FindBitmapShortsOptions } from "lib/index";
import type { AnyCircuitElement } from "circuit-json";

const getSnapshotPath = (
  testPath: string,
  snapshotSuffix: string,
  extension: "png" | "svg",
) => {
  const normalizedTestPath = testPath.replace(/\.test\.tsx?$/, "");
  const snapshotDir = join(dirname(normalizedTestPath), "__snapshots__");

  return {
    snapshotDir,
    snapshotPath: join(
      snapshotDir,
      `${basename(normalizedTestPath)}-${snapshotSuffix}.snap.${extension}`,
    ),
  };
};

export const writeOrCompareSvgSnapshot = (testPath: string, svg: string) => {
  const { snapshotDir, snapshotPath } = getSnapshotPath(
    testPath,
    "short-debug",
    "svg",
  );

  mkdirSync(snapshotDir, { recursive: true });

  if (!Bun.env.BUN_UPDATE_SNAPSHOTS) {
    expect(readFileSync(snapshotPath, "utf8")).toBe(svg);
    return;
  }

  writeFileSync(snapshotPath, svg);
};

export const writeOrCompareBinarySnapshot = (
  testPath: string,
  snapshotSuffix: string,
  bytes: Uint8Array,
) => {
  const { snapshotDir, snapshotPath } = getSnapshotPath(
    testPath,
    snapshotSuffix,
    "png",
  );

  mkdirSync(snapshotDir, { recursive: true });

  if (!Bun.env.BUN_UPDATE_SNAPSHOTS) {
    expect(Buffer.compare(readFileSync(snapshotPath), Buffer.from(bytes))).toBe(
      0,
    );
    return;
  }

  writeFileSync(snapshotPath, bytes);
};

export const writeOrCompareBitmapSnapshot = (
  testPath: string,
  snapshotSuffix: string,
  circuitJson: AnyCircuitElement[],
  options: FindBitmapShortsOptions,
): BitmapShort[] => {
  const debugRender = renderBitmapShortDebug(circuitJson, options);

  writeOrCompareBinarySnapshot(
    testPath,
    snapshotSuffix,
    encodeRgbaPng(appendBitmapLegend(debugRender)),
  );

  return debugRender.shorts;
};
