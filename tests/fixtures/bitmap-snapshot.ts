import { expect } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { basename, dirname, join } from "path";
import looksSame from "@tscircuit/image-utils/looks-same";
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
) => {
  const { snapshotDir, snapshotPath } = getSnapshotPath(
    testPath,
    "short-debug",
    "svg",
  );

  mkdirSync(snapshotDir, { recursive: true });

  if (!Bun.env.BUN_UPDATE_SNAPSHOTS) {
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
    return;
  }

  writeFileSync(snapshotPath, svg);
};

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

  if (!Bun.env.BUN_UPDATE_SNAPSHOTS) {
    return looksSame(readFileSync(snapshotPath), bytes, {
      strict: true,
      ignoreAntialiasing: false,
      ignoreCaret: false,
    }).then((result) => {
      expect(result.equal).toBe(true);
    });
  }

  writeFileSync(snapshotPath, bytes);
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
