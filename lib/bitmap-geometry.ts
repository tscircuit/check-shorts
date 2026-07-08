import {
  cju,
  getBoardBounds as getPcbBoardBounds,
} from "@tscircuit/circuit-json-util";
import type { Bounds } from "@tscircuit/math-utils";
import type { AnyCircuitElement } from "circuit-json";

export const getBoardBounds = (circuitJson: AnyCircuitElement[]): Bounds => {
  const board = cju(circuitJson).pcb_board.list()[0];

  if (!board) {
    return { minX: -10, maxX: 10, minY: -10, maxY: 10 };
  }

  try {
    return getPcbBoardBounds(board);
  } catch {
    const center = board.center ?? { x: 0, y: 0 };
    const width = board.width ?? 20;
    const height = board.height ?? 20;

    return {
      minX: center.x - width / 2,
      maxX: center.x + width / 2,
      minY: center.y - height / 2,
      maxY: center.y + height / 2,
    };
  }
};

export const getRealPointFromPixel = ({
  x,
  y,
  bounds,
  width,
  height,
}: {
  x: number;
  y: number;
  bounds: Bounds;
  width: number;
  height: number;
}): { x: number; y: number } => {
  const realWidth = bounds.maxX - bounds.minX;
  const realHeight = bounds.maxY - bounds.minY;
  const scale = Math.min(width / realWidth, height / realHeight);
  const offsetX = (width - realWidth * scale) / 2;
  const offsetY = (height - realHeight * scale) / 2;

  return {
    x: bounds.minX + (x - offsetX) / scale,
    y: bounds.maxY - (y - offsetY) / scale,
  };
};

export const getPixelPointFromReal = ({
  x,
  y,
  bounds,
  width,
  height,
}: {
  x: number;
  y: number;
  bounds: Bounds;
  width: number;
  height: number;
}): { x: number; y: number; scale: number } => {
  const realWidth = bounds.maxX - bounds.minX;
  const realHeight = bounds.maxY - bounds.minY;
  const scale = Math.min(width / realWidth, height / realHeight);
  const offsetX = (width - realWidth * scale) / 2;
  const offsetY = (height - realHeight * scale) / 2;

  return {
    x: (x - bounds.minX) * scale + offsetX,
    y: (bounds.maxY - y) * scale + offsetY,
    scale,
  };
};
