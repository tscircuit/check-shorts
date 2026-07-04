import { decode } from "fast-png";

export const getMaskFromPng = (pngBytes: Uint8Array): Uint8Array => {
  const png = decode(pngBytes);
  const mask = new Uint8Array(png.width * png.height);

  if (png.depth !== 8) return mask;

  for (let pixelIndex = 0; pixelIndex < mask.length; pixelIndex++) {
    const sourceIndex = pixelIndex * png.channels;
    const alpha =
      png.channels >= 4 ? Number(png.data[sourceIndex + 3] ?? 0) : 255;
    const red = Number(png.data[sourceIndex] ?? 0);
    const green = Number(png.data[sourceIndex + 1] ?? red);
    const blue = Number(png.data[sourceIndex + 2] ?? red);

    if (alpha > 127 && red + green + blue > 0) {
      mask[pixelIndex] = 1;
    }
  }

  return mask;
};
