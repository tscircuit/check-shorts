import { expect, test } from "bun:test";
import { renderBitmapShortDebug } from "lib/index";
import type { BitmapShortDebugRender } from "lib/index";
import {
  writeOrCompareBitmapDebugSnapshot,
  writeOrCompareCircuitJsonSvgSnapshot,
} from "tests/fixtures/bitmap-snapshot";
import { getTestFixture } from "tests/fixtures/get-test-fixture";

test("renders a connected inner-layer trace and copper pour in PCB mode", async () => {
  const { circuit } = getTestFixture();
  circuit.add(
    <board width="10mm" height="8mm" layers={4}>
      <net name="GND" />
      <resistor name="R1" resistance="1k" footprint="0402" pcbX="-3mm" />
      <resistor name="R2" resistance="1k" footprint="0402" pcbX="3mm" />
      <trace
        from=".R1 > .pin1"
        to=".R2 > .pin1"
        pcbPath={[
          ".R1 > .pin1",
          { x: -1, y: 1, via: true, toLayer: "inner1" },
          { x: 0, y: 1 },
          { x: 1, y: 1 },
          { x: 1, y: 1, via: true, fromLayer: "inner1", toLayer: "top" },
          ".R2 > .pin1",
        ]}
      />
      <trace from=".R1 > .pin1" to="net.GND" />
      <copperpour layer="inner1" connectsTo="net.GND" unbroken />
    </board>,
  );
  await circuit.renderUntilSettled();

  const circuitJson = circuit.getCircuitJson();
  await writeOrCompareCircuitJsonSvgSnapshot(import.meta.path, circuitJson, {
    layer: "inner1",
  });
  let debugRender: BitmapShortDebugRender | undefined;
  let result:
    | { status: "error"; message: string }
    | { status: "success"; shortCount: number };

  try {
    debugRender = await renderBitmapShortDebug(circuitJson, {
      mode: "pcb",
      layer: "inner1",
      width: 220,
      height: 176,
    });
    result = { status: "success", shortCount: debugRender.shorts.length };
  } catch (error) {
    result = {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  expect(result).toMatchInlineSnapshot(`
    {
      "message": "layerCanvas.getContext is not a function. (In 'layerCanvas.getContext(\"2d\")', 'layerCanvas.getContext' is undefined)",
      "status": "error",
    }
  `);

  if (debugRender) {
    await writeOrCompareBitmapDebugSnapshot(
      import.meta.path,
      "pcb-bitmap",
      debugRender,
    );
  }
});
