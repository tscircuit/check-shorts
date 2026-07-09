import { expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { spawnSync } from "child_process";

const repoRoot = resolve(import.meta.dir, "..");

const run = (command: string, args: string[], cwd: string) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `${command} ${args.join(" ")} failed with exit code ${result.status}`,
        result.stdout,
        result.stderr,
      ].join("\n"),
    );
  }

  return result;
};

test("downstream TypeScript consumers can statically import package exports", () => {
  run("bun", ["run", "build"], repoRoot);

  const consumerRoot = mkdtempSync(join(tmpdir(), "check-shorts-consumer-"));
  const scopedNodeModules = join(consumerRoot, "node_modules", "@tscircuit");
  mkdirSync(scopedNodeModules, { recursive: true });
  symlinkSync(repoRoot, join(scopedNodeModules, "check-shorts"), "dir");

  writeFileSync(
    join(consumerRoot, "package.json"),
    JSON.stringify(
      {
        type: "module",
        dependencies: {
          "@tscircuit/check-shorts":
            "file:./node_modules/@tscircuit/check-shorts",
        },
        devDependencies: {
          typescript: "^5.9.2",
        },
      },
      null,
      2,
    ),
  );

  writeFileSync(
    join(consumerRoot, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022", "DOM"],
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          noEmit: true,
          skipLibCheck: false,
        },
        include: ["index.ts", "repro.ts"],
      },
      null,
      2,
    ),
  );

  writeFileSync(
    join(consumerRoot, "index.ts"),
    [
      'import { createShortDebugSvg, renderBitmapShortDebug } from "@tscircuit/check-shorts";',
      'import type { BitmapShort, BitmapShortDebugRender, FindBitmapShortsOptions } from "@tscircuit/check-shorts";',
      "",
      "const shorts: BitmapShort[] = [];",
      'const options: FindBitmapShortsOptions = { mode: "pcb" };',
      "const render: BitmapShortDebugRender | null = null;",
      "const svg = createShortDebugSvg([], shorts);",
      "const renderDebug: typeof renderBitmapShortDebug = renderBitmapShortDebug;",
      "void options;",
      "void render;",
      "void svg;",
      "void renderDebug;",
    ].join("\n"),
  );

  const tscBin = join(repoRoot, "node_modules", ".bin", "tsc");
  run(tscBin, ["--noEmit"], consumerRoot);

  writeFileSync(
    join(consumerRoot, "bundle.ts"),
    [
      'import { createShortDebugSvg, findBitmapShorts } from "@tscircuit/check-shorts";',
      "",
      "export const render = () => createShortDebugSvg([], []);",
      "export const detect = findBitmapShorts;",
    ].join("\n"),
  );
  run(
    "bun",
    ["build", "bundle.ts", "--outdir", "bundle-dist", "--target", "bun"],
    consumerRoot,
  );
  const bundledRootImport = readFileSync(
    join(consumerRoot, "bundle-dist", "bundle.js"),
    "utf8",
  );
  expect(bundledRootImport).not.toMatch(/\bfrom\s+["']circuit-json["']/);

  writeFileSync(
    join(consumerRoot, "repro.ts"),
    [
      'import { appendCopperBridgeTrace, convertCircuitJsonToGerberLayers, renderTscircuitRepro } from "@tscircuit/check-shorts/repro";',
      'import type { CopperBridgeOptions, GerberLayerMap, RenderedRepro, RenderReproOptions } from "@tscircuit/check-shorts/repro";',
      "",
      "const options: CopperBridgeOptions = { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } };",
      "const bridged = appendCopperBridgeTrace([], options);",
      "const gerbers: GerberLayerMap = convertCircuitJsonToGerberLayers([]);",
      "const render: typeof renderTscircuitRepro = renderTscircuitRepro;",
      "const repro: RenderedRepro | null = null;",
      "const renderOptions: RenderReproOptions = {};",
      "void bridged;",
      "void gerbers;",
      "void render;",
      "void repro;",
      "void renderOptions;",
    ].join("\n"),
  );
  run(tscBin, ["--noEmit", "--project", "tsconfig.json"], consumerRoot);

  const packageJson = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf8"),
  );
  expect(packageJson.exports["."].types).toBe("./dist/index.d.ts");
  expect(packageJson.exports["."].import).toBe("./dist/index.js");
  expect(packageJson.exports["./repro"].types).toBe("./dist/repro.d.ts");
  expect(packageJson.exports["./repro"].import).toBe("./dist/repro.js");

  const bannedRootReferences = ["@tscircuit/core", "circuit-to-svg", "react"];
  const rootDistFiles = ["index.js", "index.d.ts"];
  for (const distFile of rootDistFiles) {
    const contents = readFileSync(join(repoRoot, "dist", distFile), "utf8");
    for (const bannedReference of bannedRootReferences) {
      expect(contents).not.toContain(bannedReference);
    }
    if (distFile.endsWith(".js")) {
      expect(contents).not.toMatch(/\bfrom\s+["']circuit-json["']/);
    }
  }

  expect(readdirSync(join(repoRoot, "dist"))).toContain("repro.js");
  expect(readdirSync(join(repoRoot, "dist"))).toContain("repro.d.ts");
}, 30_000);
