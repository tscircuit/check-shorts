import type { AnyCircuitElement } from "circuit-json";
import {
  drillFill,
  escapeXml,
  formatNumber,
  getBoardRect,
  getCopperFill,
  getElementCenter,
  getRotation,
  getStrokeWidth,
  getSvgPoint,
  hasFinitePoint,
  pathFromPoints,
  pathFromRing,
  renderCircleShape,
  renderOvalShape,
  renderPillShape,
  renderRectShape,
  silkscreenFill,
} from "./utils";

export const renderBoardElement = (
  circuitJson: AnyCircuitElement[],
  element: AnyCircuitElement,
): string | null => {
  if (element.type !== "pcb_board") return null;
  const strokeWidth = formatNumber(getStrokeWidth(circuitJson, 0.1));

  if ("outline" in element && Array.isArray(element.outline)) {
    const points = element.outline.filter(hasFinitePoint);
    if (points.length >= 3) {
      return `<path class="pcb-board" d="${pathFromPoints(circuitJson, points, true)}" fill="none" stroke="rgba(255, 255, 255, 0.5)" stroke-width="${strokeWidth}" data-type="pcb_board" data-pcb-layer="board"/>`;
    }
  }

  const rect = getBoardRect(circuitJson);
  return `<rect class="pcb-board" x="${formatNumber(rect.x)}" y="${formatNumber(rect.y)}" width="${formatNumber(rect.width)}" height="${formatNumber(rect.height)}" fill="none" stroke="rgba(255, 255, 255, 0.5)" stroke-width="${strokeWidth}" data-type="pcb_board" data-pcb-layer="board"/>`;
};

export const renderTrace = (
  circuitJson: AnyCircuitElement[],
  element: Extract<AnyCircuitElement, { type: "pcb_trace" }>,
  layer: "top" | "bottom" | undefined,
): string[] => {
  const paths: string[] = [];
  let currentPoints: Array<{ x: number; y: number; width?: number }> = [];

  const flush = () => {
    if (currentPoints.length < 2) {
      currentPoints = [];
      return;
    }

    const width = currentPoints.find((point) => point.width)?.width ?? 0.2;
    paths.push(
      `<path class="pcb-trace" d="${pathFromPoints(circuitJson, currentPoints)}" fill="none" stroke="${getCopperFill(layer)}" stroke-width="${formatNumber(getStrokeWidth(circuitJson, width))}" stroke-linecap="round" stroke-linejoin="round" data-type="pcb_trace" data-pcb-layer="${escapeXml(layer ?? "mixed")}"/>`,
    );
    currentPoints = [];
  };

  for (const routePoint of element.route) {
    if ("start" in routePoint && "end" in routePoint) {
      const routeLayer = "layer" in routePoint ? routePoint.layer : undefined;
      if (!layer || routeLayer === layer) {
        currentPoints.push({ ...routePoint.start, width: routePoint.width });
        currentPoints.push({ ...routePoint.end, width: routePoint.width });
      }
      flush();
      continue;
    }

    if (!hasFinitePoint(routePoint)) {
      flush();
      continue;
    }

    if (layer && "layer" in routePoint && routePoint.layer !== layer) {
      flush();
      continue;
    }

    currentPoints.push({
      x: routePoint.x,
      y: routePoint.y,
      width: "width" in routePoint ? Number(routePoint.width) : undefined,
    });
  }

  flush();
  return paths;
};

export const renderPad = (
  circuitJson: AnyCircuitElement[],
  element: Extract<AnyCircuitElement, { type: "pcb_smtpad" }>,
  layer: "top" | "bottom" | undefined,
): string | null => {
  const fill = getCopperFill(layer);

  if (element.shape === "polygon") {
    return `<path class="pcb-pad" d="${pathFromPoints(circuitJson, element.points, true)}" fill="${fill}" data-type="pcb_smtpad" data-pcb-layer="${escapeXml(element.layer)}"/>`;
  }

  if (!hasFinitePoint(element)) return null;
  const center = getSvgPoint(circuitJson, element);

  if (element.shape === "circle") {
    const radius = element.radius;
    return `<circle class="pcb-pad" cx="${formatNumber(center.x)}" cy="${formatNumber(center.y)}" r="${formatNumber(getStrokeWidth(circuitJson, radius))}" fill="${fill}" data-type="pcb_smtpad" data-pcb-layer="${escapeXml(element.layer)}"/>`;
  }

  const width = "width" in element ? Number(element.width) : 0.5;
  const height = "height" in element ? Number(element.height) : width;
  const svgWidth = getStrokeWidth(circuitJson, width);
  const svgHeight = getStrokeWidth(circuitJson, height);
  return `<rect class="pcb-pad" x="${formatNumber(center.x - svgWidth / 2)}" y="${formatNumber(center.y - svgHeight / 2)}" width="${formatNumber(svgWidth)}" height="${formatNumber(svgHeight)}" fill="${fill}" data-type="pcb_smtpad" data-pcb-layer="${escapeXml(element.layer)}"/>`;
};

export const renderCopperPour = (
  circuitJson: AnyCircuitElement[],
  element: Extract<AnyCircuitElement, { type: "pcb_copper_pour" }>,
  layer: "top" | "bottom" | undefined,
): string | null => {
  const fill = getCopperFill(layer);

  if (element.shape === "brep") {
    const outerPath = pathFromRing(circuitJson, element.brep_shape.outer_ring);
    if (!outerPath) return null;

    const innerPaths = (element.brep_shape.inner_rings ?? [])
      .map((ring) => pathFromRing(circuitJson, ring))
      .filter(Boolean);
    const d = [outerPath, ...innerPaths].join(" ");

    return `<path class="pcb-copper-pour" d="${d}" fill="${fill}" fill-rule="evenodd" fill-opacity="0.5" data-type="pcb_copper_pour" data-pcb-layer="${escapeXml(element.layer)}"/>`;
  }

  if ("points" in element && Array.isArray(element.points)) {
    if (element.points.length < 3) return null;
    return `<path class="pcb-copper-pour" d="${pathFromPoints(circuitJson, element.points, true)}" fill="${fill}" fill-opacity="0.5" data-type="pcb_copper_pour" data-pcb-layer="${escapeXml(element.layer)}"/>`;
  }

  return null;
};

export const renderCircleCopper = (
  circuitJson: AnyCircuitElement[],
  element: AnyCircuitElement,
  layer: "top" | "bottom" | undefined,
): string | null => {
  const center = getElementCenter(element);
  if (!center) return null;

  const radius =
    "outer_diameter" in element && typeof element.outer_diameter === "number"
      ? element.outer_diameter / 2
      : "diameter" in element && typeof element.diameter === "number"
        ? element.diameter / 2
        : 0.3;

  return renderCircleShape({
    circuitJson,
    center,
    radius,
    fill: getCopperFill(layer),
    className: "pcb-pad",
    dataType: element.type,
  });
};

export const renderDrillShape = (
  circuitJson: AnyCircuitElement[],
  element: AnyCircuitElement,
): string | null => {
  const center = getElementCenter(element);
  if (!center) return null;

  if (element.type === "pcb_cutout") {
    if (element.shape === "circle") {
      return renderCircleShape({
        circuitJson,
        center,
        radius: element.radius,
        fill: drillFill,
        className: "pcb-cutout",
        dataType: "pcb_cutout",
      });
    }

    if (element.shape === "rect") {
      return renderRectShape({
        circuitJson,
        center,
        width: element.width,
        height: element.height,
        fill: drillFill,
        rotation: getRotation(element),
        className: "pcb-cutout",
        dataType: "pcb_cutout",
      });
    }

    if (element.shape === "polygon" && Array.isArray(element.points)) {
      return `<path class="pcb-cutout" d="${pathFromPoints(circuitJson, element.points, true)}" fill="${drillFill}" data-type="pcb_cutout"/>`;
    }
  }

  if (element.type === "pcb_hole") {
    if (element.hole_shape === "circle") {
      return renderCircleShape({
        circuitJson,
        center,
        radius: element.hole_diameter / 2,
        fill: drillFill,
        className: "pcb-hole",
        dataType: "pcb_hole",
      });
    }

    if (element.hole_shape === "square") {
      return renderRectShape({
        circuitJson,
        center,
        width: element.hole_diameter,
        height: element.hole_diameter,
        fill: drillFill,
        rotation: getRotation(element),
        className: "pcb-hole",
        dataType: "pcb_hole",
      });
    }

    if (element.hole_shape === "oval") {
      return renderOvalShape({
        circuitJson,
        center,
        radiusX: element.hole_width / 2,
        radiusY: element.hole_height / 2,
        fill: drillFill,
        rotation: getRotation(element),
        className: "pcb-hole",
        dataType: "pcb_hole",
      });
    }

    if (element.hole_shape === "rect") {
      return renderRectShape({
        circuitJson,
        center,
        width: element.hole_width,
        height: element.hole_height,
        fill: drillFill,
        rotation: getRotation(element),
        className: "pcb-hole",
        dataType: "pcb_hole",
      });
    }

    if (
      element.hole_shape === "pill" ||
      element.hole_shape === "rotated_pill"
    ) {
      return renderPillShape({
        circuitJson,
        center,
        width: element.hole_width,
        height: element.hole_height,
        fill: drillFill,
        rotation: getRotation(element),
        className: "pcb-hole",
        dataType: "pcb_hole",
      });
    }
  }

  if (element.type === "pcb_via") {
    return renderCircleShape({
      circuitJson,
      center,
      radius: element.hole_diameter / 2,
      fill: drillFill,
      className: "pcb-hole",
      dataType: "pcb_via_hole",
    });
  }

  if (element.type === "pcb_plated_hole") {
    if (element.shape === "circle") {
      return renderCircleShape({
        circuitJson,
        center,
        radius: element.hole_diameter / 2,
        fill: drillFill,
        className: "pcb-hole",
        dataType: "pcb_plated_hole_drill",
      });
    }

    if (element.shape === "oval") {
      return renderOvalShape({
        circuitJson,
        center,
        radiusX: element.hole_width / 2,
        radiusY: element.hole_height / 2,
        fill: drillFill,
        rotation: getRotation(element),
        className: "pcb-hole",
        dataType: "pcb_plated_hole_drill",
      });
    }

    if (element.shape === "pill") {
      return renderPillShape({
        circuitJson,
        center,
        width: element.hole_width,
        height: element.hole_height,
        fill: drillFill,
        rotation: getRotation(element),
        className: "pcb-hole",
        dataType: "pcb_plated_hole_drill",
      });
    }

    if (element.shape === "circular_hole_with_rect_pad") {
      return renderCircleShape({
        circuitJson,
        center: {
          x: element.x + (element.hole_offset_x ?? 0),
          y: element.y + (element.hole_offset_y ?? 0),
        },
        radius: element.hole_diameter / 2,
        fill: drillFill,
        className: "pcb-hole",
        dataType: "pcb_plated_hole_drill",
      });
    }
  }

  return null;
};

export const renderSilkscreen = (
  circuitJson: AnyCircuitElement[],
  element: AnyCircuitElement,
): string | null => {
  if (element.type === "pcb_silkscreen_text") {
    const center = getElementCenter(element);
    if (!center) return null;
    const point = getSvgPoint(circuitJson, center);
    const text = "text" in element ? String(element.text) : "";
    const fontSize =
      "font_size" in element && typeof element.font_size === "number"
        ? getStrokeWidth(circuitJson, element.font_size)
        : 18;
    return `<text x="${formatNumber(point.x)}" y="${formatNumber(point.y)}" fill="${silkscreenFill}" font-family="Arial, sans-serif" font-size="${formatNumber(fontSize)}" text-anchor="middle" dominant-baseline="central" data-type="pcb_silkscreen_text">${escapeXml(text)}</text>`;
  }

  if (element.type === "pcb_silkscreen_path" && Array.isArray(element.route)) {
    const points = element.route.filter(hasFinitePoint);
    if (points.length < 2) return null;
    const strokeWidth = element.stroke_width ?? 0.1;
    return `<path class="pcb-silkscreen" d="${pathFromPoints(circuitJson, points)}" fill="none" stroke="${silkscreenFill}" stroke-width="${formatNumber(getStrokeWidth(circuitJson, strokeWidth))}" stroke-linecap="round" stroke-linejoin="round" data-type="pcb_silkscreen_path"/>`;
  }

  if (element.type === "pcb_silkscreen_line") {
    return `<path class="pcb-silkscreen" d="${pathFromPoints(circuitJson, [
      { x: element.x1, y: element.y1 },
      { x: element.x2, y: element.y2 },
    ])}" fill="none" stroke="${silkscreenFill}" stroke-width="${formatNumber(getStrokeWidth(circuitJson, element.stroke_width ?? 0.1))}" stroke-linecap="round" data-type="pcb_silkscreen_line"/>`;
  }

  if (element.type === "pcb_silkscreen_circle") {
    return renderCircleShape({
      circuitJson,
      center: element.center,
      radius: element.radius,
      stroke: silkscreenFill,
      strokeWidth: element.stroke_width ?? 0.1,
      className: "pcb-silkscreen",
      dataType: "pcb_silkscreen_circle",
    });
  }

  if (element.type === "pcb_silkscreen_rect") {
    return renderRectShape({
      circuitJson,
      center: element.center,
      width: element.width,
      height: element.height,
      fill: element.is_filled ? silkscreenFill : undefined,
      stroke: silkscreenFill,
      strokeWidth: element.stroke_width ?? 0.1,
      className: "pcb-silkscreen",
      dataType: "pcb_silkscreen_rect",
    });
  }

  if (element.type === "pcb_silkscreen_oval") {
    return renderOvalShape({
      circuitJson,
      center: element.center,
      radiusX: element.radius_x,
      radiusY: element.radius_y,
      stroke: silkscreenFill,
      strokeWidth: 0.1,
      rotation: getRotation(element),
      className: "pcb-silkscreen",
      dataType: "pcb_silkscreen_oval",
    });
  }

  if (element.type === "pcb_silkscreen_pill") {
    return renderPillShape({
      circuitJson,
      center: element.center,
      width: element.width,
      height: element.height,
      stroke: silkscreenFill,
      strokeWidth: 0.2,
      className: "pcb-silkscreen",
      dataType: "pcb_silkscreen_pill",
    });
  }

  return null;
};
