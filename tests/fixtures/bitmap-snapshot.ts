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
import { createAlphabetTextSvg } from "lib/png";
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

// Both modes rasterize the same top-layer input. Embed the original RGBA pixels
// at 1:1 scale so a change in the pad angle or short marker is visible.
export async function comparePcbAndGerberShorts(
  testPath: string,
  suffix: string,
  circuitJson: AnyCircuitElement[],
  title: string,
) {
  const options = { layer: "top" as const, width: 320, height: 320 };
  const pcb = await renderBitmapShortDebug(circuitJson, {
    ...options,
    mode: "pcb",
  });
  const gerber = await renderBitmapShortDebug(circuitJson, {
    ...options,
    mode: "gerber",
  });
  const panel = (label: string, render: BitmapShortDebugRender, x: number) => {
    const count = render.shorts.length;
    const caption = `${label} - ${count} ${count === 1 ? "short" : "shorts"}`;
    const image = Buffer.from(encodeRgbaPng(render)).toString("base64");
    return `${createAlphabetTextSvg({ text: caption, x: x + 10, top: 47, size: 17 })}
      <image x="${x}" y="74" width="320" height="320" href="data:image/png;base64,${image}"/>`;
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="648" height="431">
    <rect width="100%" height="100%" fill="white"/>
    ${createAlphabetTextSvg({ text: title, x: 10, top: 10, size: 21 })}
    ${panel("PCB copper", pcb, 0)}
    ${panel("Gerber checker", gerber, 328)}
    ${createAlphabetTextSvg({ text: "Salmon = pad    Blue = via    Pink ring = detected short", x: 10, top: 405, size: 16, maxWidth: 628 })}
  </svg>`;
  await writeOrCompareBinarySnapshot(testPath, suffix, renderSvgToPng(svg));
  return { pcb: pcb.shorts.length, gerber: gerber.shorts.length };
}
