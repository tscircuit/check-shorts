import gerberToSvg from "gerber-to-svg";

export const renderGerberToSvg = (gerber: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    gerberToSvg(
      gerber,
      {
        id: "check-shorts-gerber",
        attributes: { color: "#fff" },
        optimizePaths: true,
      },
      (error, svg) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(svg);
      },
    );
  });
};
