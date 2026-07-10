import { type MatcherResult, expect } from "bun:test";
import { RootCircuit } from "tscircuit";
import type { AnyCircuitElement } from "circuit-json";
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg";
import looksSame from "looks-same";
import * as fs from "node:fs";
import * as path from "node:path";

const shouldUpdateSnapshots = () =>
  process.argv.includes("--update-snapshots") ||
  process.argv.includes("-u") ||
  Boolean(process.env.BUN_UPDATE_SNAPSHOTS);

const shouldForceUpdateSnapshots = () =>
  process.argv.includes("--force-update-snapshots") ||
  process.argv.includes("-f") ||
  Boolean(process.env.BUN_FORCE_UPDATE_SNAPSHOTS);

async function savePcbSvgSnapshot({
  circuitJson,
  content,
  testPath,
  options,
}: {
  circuitJson?: AnyCircuitElement[];
  content?: string;
  testPath: string;
  options?: Parameters<typeof convertCircuitJsonToPcbSvg>[1];
}): Promise<MatcherResult> {
  const normalizedTestPath = testPath.replace(/\.test\.tsx?$/, "");
  const snapshotDir = path.join(
    path.dirname(normalizedTestPath),
    "__snapshots__",
  );
  const snapshotName = `${path.basename(normalizedTestPath)}-pcb.snap.svg`;
  const filePath = path.join(snapshotDir, snapshotName);
  const snapshotContent =
    content ?? convertCircuitJsonToPcbSvg(circuitJson ?? [], options ?? {});

  if (!fs.existsSync(snapshotDir)) {
    fs.mkdirSync(snapshotDir, { recursive: true });
  }

  if (
    !fs.existsSync(filePath) ||
    shouldForceUpdateSnapshots() ||
    shouldUpdateSnapshots()
  ) {
    console.log(
      fs.existsSync(filePath)
        ? `Updating snapshot at ${filePath}`
        : `Creating snapshot at ${filePath}`,
    );
    fs.writeFileSync(filePath, snapshotContent);
    return {
      message: () => `Snapshot written at ${filePath}`,
      pass: true,
    };
  }

  const existingSnapshot = fs.readFileSync(filePath);
  const currentBuffer = Buffer.from(snapshotContent);
  const result = await looksSame(currentBuffer, existingSnapshot, {
    strict: false,
    tolerance: 2,
  });

  if (result.equal) {
    return {
      message: () => "Snapshot matches",
      pass: true,
    };
  }

  const diffPath = filePath.replace(/\.snap\.svg$/, ".diff.png");
  await looksSame.createDiff({
    reference: existingSnapshot,
    current: currentBuffer,
    diff: diffPath,
    highlightColor: "#ff00ff",
  });

  return {
    message: () => `Snapshot does not match. Diff saved at ${diffPath}`,
    pass: false,
  };
}

expect.extend({
  async toMatchPcbSnapshot(
    this: unknown,
    received: unknown,
    testPath: string,
    options?: Parameters<typeof convertCircuitJsonToPcbSvg>[1],
  ): Promise<MatcherResult> {
    let circuitJson: AnyCircuitElement[];

    if (typeof received === "string") {
      return savePcbSvgSnapshot({
        content: received,
        testPath,
        options,
      });
    }

    if (received instanceof RootCircuit) {
      await received.renderUntilSettled();
      circuitJson = received.getCircuitJson();
    } else {
      circuitJson = received as AnyCircuitElement[];
    }

    return savePcbSvgSnapshot({
      circuitJson,
      testPath,
      options,
    });
  },
});

declare module "bun:test" {
  interface Matchers<T = unknown> {
    toMatchPcbSnapshot(
      testPath: string,
      options?: Parameters<typeof convertCircuitJsonToPcbSvg>[1],
    ): Promise<MatcherResult>;
  }
}
