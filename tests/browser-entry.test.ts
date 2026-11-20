import { expect, test } from "bun:test";
import type { AnyCircuitElement } from "circuit-json";
import { findBitmapShorts } from "../lib/browser";
import usbContact from "./fixtures/usb-c-pad-pour-contact.json";

const circuitJson = usbContact as AnyCircuitElement[];

// Packages that load when the bundle is imported in a browser from jscdn.
const browserLoadablePackages = [
  "@tscircuit/circuit-json-util",
  "@tscircuit/math-utils",
  "circuit-json-to-connectivity-map",
  "circuit-to-canvas",
  "transformation-matrix",
];

test("browser entry only imports packages that load in a browser", async () => {
  const build = await Bun.build({
    entrypoints: [`${import.meta.dir}/../lib/browser.ts`],
    target: "node",
    format: "esm",
    packages: "external",
  });
  expect(build.success).toBe(true);

  const bundle = await build.outputs[0]!.text();
  const importedPackages = new Set(
    [...bundle.matchAll(/\bfrom\s*"([^"]+)"/g)].map((match) => match[1]!),
  );

  expect([...importedPackages].sort()).toEqual(browserLoadablePackages);
});

test("browser entry detects shorts in pcb mode", async () => {
  const shorts = await findBitmapShorts(circuitJson, {
    mode: "pcb",
    layer: "top",
  });

  expect(shorts.length).toBeGreaterThan(0);
});

test("browser entry rejects gerber mode", async () => {
  await expect(
    findBitmapShorts(circuitJson, { mode: "gerber", layer: "top" }),
  ).rejects.toThrow('mode "gerber" is not available in the browser build');
});
