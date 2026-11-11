import type {
  BitmapShort,
  FormatShortReportOptions,
  ShortInvolvedPrimitive,
} from "./bitmap-short-types";

const MAX_DISPLAYED_PRIMITIVES_PER_SIDE = 6;

const formatPrimitiveList = (
  involvedPrimitives: ShortInvolvedPrimitive[],
  fallbackLabels: string[],
): string => {
  const labels =
    involvedPrimitives.length > 0
      ? [...new Set(involvedPrimitives.map((primitive) => primitive.label))]
      : fallbackLabels.slice(0, MAX_DISPLAYED_PRIMITIVES_PER_SIDE);

  if (labels.length === 0) return "unknown";
  if (labels.length <= MAX_DISPLAYED_PRIMITIVES_PER_SIDE) {
    return labels.join(", ");
  }

  const head = labels.slice(0, MAX_DISPLAYED_PRIMITIVES_PER_SIDE).join(", ");
  return `${head} (+${labels.length - MAX_DISPLAYED_PRIMITIVES_PER_SIDE} more)`;
};

const formatWitnessChain = (witnessPath: string[], fallback: string): string =>
  witnessPath.length > 0 ? witnessPath.join(" -> ") : fallback;

export const formatShortSummary = (
  short: BitmapShort,
  index?: number,
): string => {
  const prefix = index !== undefined ? `${index + 1}. ` : "";
  const firstNet = short.firstNetName || short.firstConnectivityKey;
  const secondNet = short.secondNetName || short.secondConnectivityKey;

  return `${prefix}[${short.layer}/${short.mode}] ${firstNet} <-> ${secondNet} at (${short.center.x.toFixed(3)}, ${short.center.y.toFixed(3)})mm`;
};

export const formatShortReport = (
  shorts: BitmapShort[],
  options: FormatShortReportOptions = {},
): string => {
  if (shorts.length === 0) {
    return options.fileName
      ? `No shorts detected in ${options.fileName}`
      : "No shorts detected";
  }

  const countText = `${shorts.length} short${shorts.length === 1 ? "" : "s"} detected`;
  const header = options.fileName
    ? `${countText} in ${options.fileName}:`
    : `${countText}:`;

  const blocks = shorts.map((short, index) => {
    const firstNet = short.firstNetName || short.firstConnectivityKey;
    const secondNet = short.secondNetName || short.secondConnectivityKey;
    const firstInvolved = formatPrimitiveList(
      short.firstInvolvedPrimitives,
      short.firstOwnerLabels,
    );
    const secondInvolved = formatPrimitiveList(
      short.secondInvolvedPrimitives,
      short.secondOwnerLabels,
    );
    const firstWitness = formatWitnessChain(short.firstWitnessPath, firstNet);
    const secondWitness = formatWitnessChain(
      short.secondWitnessPath,
      secondNet,
    );
    const { minX, minY, maxX, maxY } = short.bounds;

    return [
      formatShortSummary(short, index),
      `   involved: ${firstInvolved} <-> ${secondInvolved}`,
      `   witness: ${firstWitness} <-> ${secondWitness}`,
      `   region: [${minX.toFixed(3)}, ${minY.toFixed(3)}]..[${maxX.toFixed(3)}, ${maxY.toFixed(3)}]mm (${short.pixelCount}px)`,
    ].join("\n");
  });

  return [header, ...blocks].join("\n");
};
