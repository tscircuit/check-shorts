import { Resvg } from "@resvg/resvg-js";

export const renderSvgToPng = (svg: string): Uint8Array => {
  const resvg = new Resvg(svg, {
    background: "rgba(0, 0, 0, 0)",
    font: { loadSystemFonts: false },
  });
  return new Uint8Array(resvg.render().asPng());
};
