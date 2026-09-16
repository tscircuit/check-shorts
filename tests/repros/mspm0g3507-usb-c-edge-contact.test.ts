import { expect, test } from "bun:test";
import { findBitmapShorts } from "lib/index";
import { makeMspm0g3507UsbCEdgeContactCircuitJson } from "tests/fixtures/mspm0g3507-usb-c-edge-contact";

test.each(["pcb", "gerber"] as const)(
  "detects the MSPM0G3507 USB-C VBUS edge contacts in %s mode",
  async (mode) => {
    const shorts = await findBitmapShorts(
      makeMspm0g3507UsbCEdgeContactCircuitJson({ leftClearance: 0 }),
      { mode },
    );
    const shortOwnerLabels = shorts.map((short) =>
      [...short.firstOwnerLabels, ...short.secondOwnerLabels].sort(),
    );

    expect(shorts).toHaveLength(2);
    expect(shortOwnerLabels).toContainEqual(["J_USB_C.A4B9", "copperpour:GND"]);
    expect(shortOwnerLabels).toContainEqual(["J_USB_C.B4A9", "copperpour:GND"]);
  },
);

test.each(["pcb", "gerber"] as const)(
  "does not flag the fixed 0.25 mm USB-C VBUS clearance in %s mode",
  async (mode) => {
    const shorts = await findBitmapShorts(
      makeMspm0g3507UsbCEdgeContactCircuitJson({ leftClearance: 0.25 }),
      { mode },
    );

    expect(shorts).toEqual([]);
  },
);
