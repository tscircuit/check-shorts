export type BitmapConnectivityKey = string;

const ADJACENT_PIXEL_OFFSETS = [
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
] as const;

// Separately rasterized copper shapes that share a vector edge can occupy
// neighboring pixels without ever claiming the same pixel. Include diagonal
// neighbors so point contacts are treated as electrical contacts too.
export const getAdjacentPixelOwners = ({
  pixelIndex,
  width,
  height,
  pixelOwners,
}: {
  pixelIndex: number;
  width: number;
  height: number;
  pixelOwners: Array<BitmapConnectivityKey | undefined>;
}): BitmapConnectivityKey[] => {
  const x = pixelIndex % width;
  const y = Math.floor(pixelIndex / width);
  const adjacentOwners = new Set<BitmapConnectivityKey>();

  for (const offset of ADJACENT_PIXEL_OFFSETS) {
    const neighborX = x + offset.x;
    const neighborY = y + offset.y;
    if (
      neighborX < 0 ||
      neighborX >= width ||
      neighborY < 0 ||
      neighborY >= height
    ) {
      continue;
    }

    const owner = pixelOwners[neighborY * width + neighborX];
    if (owner) adjacentOwners.add(owner);
  }

  return [...adjacentOwners];
};
