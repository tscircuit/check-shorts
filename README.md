# check-shorts

Detect unintended shorts between named nets.

## Installation

```bash
bun add -D https://jscdn.tscircuit.com/@tscircuit/check-shorts
```

## Development

```bash
bun install
bun test
bun run typecheck
bun run format:check
```

## Bitmap contact detection

Copper from different nets is considered connected when its occupied pixels
overlap or share an edge or corner. This catches pad-to-pour boundary contacts
even when no pixel is occupied by both nets. An empty pixel between nets keeps
them separate; same-net copper and different layers are not reported as shorts.

The default resolution is 35 microns per pixel. Gaps smaller than the bitmap
resolution may disappear during rasterization. Use `pixelsPerMm` (or
`tsci check shorts --pixels-per-mm`) to resolve smaller clearances.

## Physical continuity (open circuits)

A zero-short result does not establish continuity within each net. Use
`findBitmapOpens(circuitJson, { mode: "gerber" })` alongside `findBitmapShorts`
to probe required emitted PCB terminals against physical copper islands.
Each disconnected net produces one result containing readable terminal groups.

The open checker flood-fills actual copper on every board layer and joins layers
only through explicit plated vias or plated terminals. It also supports inline
vias with barrel dimensions (or matching emitted vias). Net names, route endpoint
IDs, and component-internal connections never create physical bridges. PCB pads
without emitted copper become disconnected terminals; `do_not_connect` ports
are excluded. Ports absent from the emitted PCB and detached copper without
required terminals are outside its scope.

Continuity always uses the complete stack (one through ten layers); there is no
single-layer continuity option. Bitmap resolution limits detectable gaps. Drill
and cutout handling follows the selected copper renderer. Use Gerber mode for
manufacturing-oriented probing; PCB mode can be expensive for large pours with
many vertices. `findBitmapShorts` keeps its existing shorts-only contract.

See the [literal pedometer missing-via repro](tests/repros/pedometer/README.md)
for the measured open and its via-repair control. Production tests cover that
literal PMID copper in both modes and the complete board in Gerber mode.
