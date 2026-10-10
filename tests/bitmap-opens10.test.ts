import { expect, test } from "bun:test";
import { findBitmapOpens } from "../lib";
import { getPedometer, makeRepairVia } from "./repros/pedometer/fixture";

test("full-board Gerber probing detects PMID and clears it after the real via repair", async () => {
  const json = getPedometer();
  const original = await findBitmapOpens(json, {
    mode: "gerber",
    pixelsPerMm: 30,
  });
  expect(
    original.find((e) => e.netNames.includes("PMID"))?.islands,
  ).toHaveLength(2);
  const repaired = await findBitmapOpens([...json, makeRepairVia()], {
    mode: "gerber",
    pixelsPerMm: 30,
  });
  expect(repaired.find((e) => e.netNames.includes("PMID"))).toBeUndefined();
}, 30_000);
