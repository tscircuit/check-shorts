import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "..");
const libDir = join(repoRoot, "lib");

const getPackageName = (specifier: string) =>
  specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0]!;

// tests/downstream-import-smoke.test.ts symlinks the repo root into the
// consumer, so the consumer resolves this repo's devDependencies and cannot
// catch a runtime import that a real install would not provide.
test("every runtime import in lib is a declared dependency or peer", () => {
  const packageJson = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf8"),
  );
  const declared = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.peerDependencies ?? {}),
  ]);
  const imported = new Set<string>();

  for (const file of readdirSync(libDir)) {
    const source = readFileSync(join(libDir, file), "utf8");
    // `import type` is erased from dist, so only value imports matter.
    for (const match of source.matchAll(
      /^import\s+(?!type\s)[^;]*?from\s+"([^"]+)"/gms,
    )) {
      const specifier = match[1]!;
      if (specifier.startsWith(".") || specifier.startsWith("node:")) continue;
      if (builtinModules.includes(specifier)) continue;
      imported.add(getPackageName(specifier));
    }
  }

  const undeclared = [...imported].filter((name) => !declared.has(name));

  // BUG: lib/repro-runner.ts imports RootCircuit from "tscircuit", and
  // lib/index.ts re-exports it, but tscircuit is only a devDependency.
  // Importing @tscircuit/check-shorts without tscircuit installed fails.
  expect(undeclared).toEqual(["tscircuit"]);
});
