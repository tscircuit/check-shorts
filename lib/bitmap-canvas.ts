import {
  type Bounds,
  type Point,
  type Polygon,
  getBoundsFromPoints,
  isPointInsidePolygon,
  pointToSegmentDistance,
} from "@tscircuit/math-utils";
import { applyToPoint, identity, type Matrix } from "transformation-matrix";

type PolygonPath = {
  type: "polygon";
  points: Polygon;
};

type CirclePath = {
  type: "circle";
  center: Point;
  radius: number;
};

type PathPart = PolygonPath | CirclePath;

type CanvasStyle = string | CanvasGradient | CanvasPattern;

const transformPoint = (matrix: Matrix, point: Point): Point =>
  applyToPoint(matrix, point) as Point;

const getBounds = (parts: PathPart[]): Bounds => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const part of parts) {
    if (part.type === "circle") {
      minX = Math.min(minX, part.center.x - part.radius);
      minY = Math.min(minY, part.center.y - part.radius);
      maxX = Math.max(maxX, part.center.x + part.radius);
      maxY = Math.max(maxY, part.center.y + part.radius);
      continue;
    }

    const bounds = getBoundsFromPoints([...part.points]);
    if (!bounds) continue;

    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }

  return {
    minX: Math.floor(minX),
    minY: Math.floor(minY),
    maxX: Math.ceil(maxX),
    maxY: Math.ceil(maxY),
  };
};

export class BitmapCanvasContext {
  canvas: { width: number; height: number };
  pixels: Uint8Array;
  fillStyle: CanvasStyle = "#000";
  strokeStyle: CanvasStyle = "#000";
  globalAlpha = 1;
  lineWidth = 1;
  lineCap: "butt" | "round" | "square" = "butt";
  lineJoin: "bevel" | "round" | "miter" = "miter";
  font = "10px sans-serif";
  textAlign: "start" | "end" | "left" | "right" | "center" = "start";

  private transform = identity();
  private transformStack: Matrix[] = [];
  private pathParts: PathPart[] = [];
  private currentPolygon: Point[] | null = null;

  constructor(width: number, height: number) {
    this.canvas = { width, height };
    this.pixels = new Uint8Array(width * height);
  }

  beginPath(): void {
    this.pathParts = [];
    this.currentPolygon = null;
  }

  closePath(): void {
    this.finishCurrentPolygon();
  }

  moveTo(x: number, y: number): void {
    this.finishCurrentPolygon();
    this.currentPolygon = [transformPoint(this.transform, { x, y })];
  }

  lineTo(x: number, y: number): void {
    if (!this.currentPolygon) this.currentPolygon = [];
    this.currentPolygon.push(transformPoint(this.transform, { x, y }));
  }

  rect(x: number, y: number, width: number, height: number): void {
    this.finishCurrentPolygon();
    this.pathParts.push({
      type: "polygon",
      points: [
        transformPoint(this.transform, { x, y }),
        transformPoint(this.transform, { x: x + width, y }),
        transformPoint(this.transform, { x: x + width, y: y + height }),
        transformPoint(this.transform, { x, y: y + height }),
      ],
    });
  }

  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
  ): void {
    const fullCircle = Math.abs(endAngle - startAngle) >= Math.PI * 2 - 1e-6;
    const center = transformPoint(this.transform, { x, y });
    const scaledRadius =
      radius * Math.hypot(this.transform.a, this.transform.b);

    if (fullCircle) {
      this.finishCurrentPolygon();
      this.pathParts.push({
        type: "circle",
        center,
        radius: scaledRadius,
      });
      return;
    }

    if (!this.currentPolygon) this.currentPolygon = [];
    const steps = Math.max(8, Math.ceil(Math.abs(endAngle - startAngle) / 0.2));
    for (let i = 0; i <= steps; i++) {
      const t = startAngle + ((endAngle - startAngle) * i) / steps;
      this.currentPolygon.push(
        transformPoint(this.transform, {
          x: x + Math.cos(t) * radius,
          y: y + Math.sin(t) * radius,
        }),
      );
    }
  }

  arcTo(x1: number, y1: number): void {
    this.lineTo(x1, y1);
  }

  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
  ): void {
    if (!this.currentPolygon) this.currentPolygon = [];
    const steps = Math.max(
      16,
      Math.ceil(Math.abs(endAngle - startAngle) / 0.15),
    );
    for (let i = 0; i <= steps; i++) {
      const t = startAngle + ((endAngle - startAngle) * i) / steps;
      const localX = Math.cos(t) * radiusX;
      const localY = Math.sin(t) * radiusY;
      this.currentPolygon.push(
        transformPoint(this.transform, {
          x: x + localX * Math.cos(rotation) - localY * Math.sin(rotation),
          y: y + localX * Math.sin(rotation) + localY * Math.cos(rotation),
        }),
      );
    }
  }

  fill(): void {
    this.finishCurrentPolygon();
    if (this.globalAlpha <= 0) return;
    this.rasterizeFill(this.pathParts);
  }

  stroke(): void {
    this.finishCurrentPolygon();
    if (this.globalAlpha <= 0) return;
    for (const part of this.pathParts) {
      if (part.type !== "polygon") continue;
      this.rasterizeStroke(part.points, this.lineWidth);
    }
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    this.beginPath();
    this.rect(x, y, width, height);
    this.fill();
  }

  save(): void {
    this.transformStack.push({ ...this.transform });
  }

  restore(): void {
    this.transform = this.transformStack.pop() ?? identity();
  }

  clip(): void {}

  translate(x: number, y: number): void {
    this.transform.e += this.transform.a * x + this.transform.c * y;
    this.transform.f += this.transform.b * x + this.transform.d * y;
  }

  rotate(angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const { a, b, c, d } = this.transform;
    this.transform.a = a * cos + c * sin;
    this.transform.b = b * cos + d * sin;
    this.transform.c = c * cos - a * sin;
    this.transform.d = d * cos - b * sin;
  }

  scale(x: number, y: number): void {
    this.transform.a *= x;
    this.transform.b *= x;
    this.transform.c *= y;
    this.transform.d *= y;
  }

  setLineDash(): void {}
  fillText(): void {}
  measureText(text: string) {
    return { width: text.length * 6 };
  }

  private finishCurrentPolygon(): void {
    if (this.currentPolygon && this.currentPolygon.length > 0) {
      this.pathParts.push({ type: "polygon", points: this.currentPolygon });
    }
    this.currentPolygon = null;
  }

  private rasterizeFill(parts: PathPart[]): void {
    if (parts.length === 0) return;

    const bounds = getBounds(parts);
    const minX = Math.max(0, bounds.minX);
    const minY = Math.max(0, bounds.minY);
    const maxX = Math.min(this.canvas.width - 1, bounds.maxX);
    const maxY = Math.min(this.canvas.height - 1, bounds.maxY);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const point = { x: x + 0.5, y: y + 0.5 };
        let insideCount = 0;

        for (const part of parts) {
          if (part.type === "circle") {
            const distance = Math.hypot(
              point.x - part.center.x,
              point.y - part.center.y,
            );
            if (distance <= part.radius) insideCount++;
          } else if (isPointInsidePolygon(point, part.points)) {
            insideCount++;
          }
        }

        if (insideCount % 2 === 1) this.setPixel(x, y);
      }
    }
  }

  private rasterizeStroke(points: Polygon, width: number): void {
    if (points.length < 2) return;
    const radius = Math.max(0.5, width / 2);
    const bounds = getBounds([{ type: "polygon", points }]);
    const minX = Math.max(0, Math.floor(bounds.minX - radius));
    const minY = Math.max(0, Math.floor(bounds.minY - radius));
    const maxX = Math.min(
      this.canvas.width - 1,
      Math.ceil(bounds.maxX + radius),
    );
    const maxY = Math.min(
      this.canvas.height - 1,
      Math.ceil(bounds.maxY + radius),
    );

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const point = { x: x + 0.5, y: y + 0.5 };
        for (let i = 0; i < points.length - 1; i++) {
          const start = points[i];
          const end = points[i + 1];
          if (!start || !end) continue;
          if (pointToSegmentDistance(point, start, end) <= radius) {
            this.setPixel(x, y);
            break;
          }
        }
      }
    }
  }

  private setPixel(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) {
      return;
    }
    this.pixels[y * this.canvas.width + x] = 1;
  }
}
