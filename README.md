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
