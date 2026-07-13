import { expect } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import looksSame from "@tscircuit/image-utils/looks-same";
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg";
import {
  appendBitmapLegend,
  encodeRgbaPng,
  renderBitmapShortDebug,
} from "lib/index";
import { renderSvgToPng } from "lib/svg-to-png";
import type {
  BitmapShort,
  BitmapShortDebugRender,
  FindBitmapShortsOptions,
} from "lib/index";
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

export const writeOrCompareSvgSnapshot = async (
  testPath: string,
  svg: string,
  snapshotSuffix = "short-debug",
) => {
  const { snapshotDir, snapshotPath } = getSnapshotPath(
    testPath,
    snapshotSuffix,
    "svg",
  );

  mkdirSync(snapshotDir, { recursive: true });

  if (!existsSync(snapshotPath) || Bun.env.BUN_UPDATE_SNAPSHOTS) {
    writeFileSync(snapshotPath, svg);
    return;
  }

  const result = await looksSame(
    renderSvgToPng(readFileSync(snapshotPath, "utf8")),
    renderSvgToPng(svg),
    {
      strict: true,
      ignoreAntialiasing: false,
      ignoreCaret: false,
    },
  );
  expect(result.equal).toBe(true);
};

export const writeOrCompareCircuitJsonSvgSnapshot = async (
  testPath: string,
  circuitJson: AnyCircuitElement[],
  options?: Parameters<typeof convertCircuitJsonToPcbSvg>[1],
): Promise<void> =>
  writeOrCompareSvgSnapshot(
    testPath,
    convertCircuitJsonToPcbSvg(circuitJson, options),
    "pcb",
  );

export const writeOrCompareBinarySnapshot = (
  testPath: string,
  snapshotSuffix: string,
  bytes: Uint8Array,
): Promise<void> | void => {
  const { snapshotDir, snapshotPath } = getSnapshotPath(
    testPath,
    snapshotSuffix,
    "png",
  );

  mkdirSync(snapshotDir, { recursive: true });

  if (!existsSync(snapshotPath) || Bun.env.BUN_UPDATE_SNAPSHOTS) {
    writeFileSync(snapshotPath, bytes);
    return;
  }

  return looksSame(readFileSync(snapshotPath), bytes, {
    strict: true,
    ignoreAntialiasing: false,
    ignoreCaret: false,
  }).then((result) => {
    expect(result.equal).toBe(true);
  });
};

export const writeOrCompareBitmapSnapshot = async (
  testPath: string,
  snapshotSuffix: string,
  circuitJson: AnyCircuitElement[],
  options: FindBitmapShortsOptions,
): Promise<BitmapShort[]> => {
  const debugRender = await renderBitmapShortDebug(circuitJson, options);

  return writeOrCompareBitmapDebugSnapshot(
    testPath,
    snapshotSuffix,
    debugRender,
  );
};

export const writeOrCompareBitmapDebugSnapshot = async (
  testPath: string,
  snapshotSuffix: string,
  debugRender: BitmapShortDebugRender,
): Promise<BitmapShort[]> => {
  await writeOrCompareBinarySnapshot(
    testPath,
    snapshotSuffix,
    encodeRgbaPng(appendBitmapLegend(debugRender)),
  );

  return debugRender.shorts;
};
