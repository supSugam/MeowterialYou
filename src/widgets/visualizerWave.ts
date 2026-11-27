/**
 * Cairo source gradients and smooth Bezier wave rendering for the audio visualizer.
 */

import Cairo from 'gi://cairo';
import type {
  VisualizerColorMode,
  VisualizerGradientColors,
  VisualizerPosition,
  VisualizerStyle,
} from './visualizerTypes.js';

export interface GjsCairoPattern {
  addColorStopRGBA(offset: number, red: number, green: number, blue: number, alpha: number): void;
}

export interface GjsCairoContext {
  arc(xc: number, yc: number, radius: number, angle1: number, angle2: number): void;
  rectangle(x: number, y: number, width: number, height: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  curveTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void;
  closePath(): void;
  fill(): void;
  setSource(pattern: GjsCairoPattern): void;
  setSourceRGBA(red: number, green: number, blue: number, alpha: number): void;
  $dispose(): void;
}

interface GjsCairoModule {
  LinearGradient: new (x0: number, y0: number, x1: number, y1: number) => GjsCairoPattern;
}

export interface Point2D {
  x: number;
  y: number;
}

function addSymmetricStops(gradient: GjsCairoPattern, colors: VisualizerGradientColors, alpha: number): void {
  const { startRgb, midRgb, endRgb } = colors;
  gradient.addColorStopRGBA(0, endRgb[0], endRgb[1], endRgb[2], alpha);
  gradient.addColorStopRGBA(0.25, midRgb[0], midRgb[1], midRgb[2], alpha);
  gradient.addColorStopRGBA(0.5, startRgb[0], startRgb[1], startRgb[2], alpha);
  gradient.addColorStopRGBA(0.75, midRgb[0], midRgb[1], midRgb[2], alpha);
  gradient.addColorStopRGBA(1, endRgb[0], endRgb[1], endRgb[2], alpha);
}

export function applyVisualizerSource(
  cr: GjsCairoContext,
  width: number,
  height: number,
  position: VisualizerPosition,
  style: VisualizerStyle,
  colorMode: VisualizerColorMode,
  colors: VisualizerGradientColors,
  alpha: number
): void {
  const { startRgb, midRgb, endRgb } = colors;
  if (colorMode === 'solid') {
    cr.setSourceRGBA(startRgb[0], startRgb[1], startRgb[2], alpha);
    return;
  }

  const cairoRuntime = Cairo as unknown as GjsCairoModule;
  const isHorizontal = position === 'bottom' || position === 'top';
  let gradient: GjsCairoPattern;

  if (colorMode === 'spectrum') {
    gradient = isHorizontal
      ? new cairoRuntime.LinearGradient(0, 0, width, 0)
      : new cairoRuntime.LinearGradient(0, 0, 0, height);
    gradient.addColorStopRGBA(0, startRgb[0], startRgb[1], startRgb[2], alpha);
    gradient.addColorStopRGBA(0.55, midRgb[0], midRgb[1], midRgb[2], alpha);
    gradient.addColorStopRGBA(1, endRgb[0], endRgb[1], endRgb[2], alpha);
    cr.setSource(gradient);
    return;
  }

  gradient =
    position === 'bottom'
      ? new cairoRuntime.LinearGradient(0, height, 0, 0)
      : position === 'top'
        ? new cairoRuntime.LinearGradient(0, 0, 0, height)
        : position === 'left'
          ? new cairoRuntime.LinearGradient(0, 0, width, 0)
          : new cairoRuntime.LinearGradient(width, 0, 0, 0);

  if (style === 'mirrored') {
    addSymmetricStops(gradient, colors, alpha);
  } else {
    gradient.addColorStopRGBA(0, startRgb[0], startRgb[1], startRgb[2], alpha);
    gradient.addColorStopRGBA(0.55, midRgb[0], midRgb[1], midRgb[2], alpha);
    gradient.addColorStopRGBA(1, endRgb[0], endRgb[1], endRgb[2], alpha);
  }
  cr.setSource(gradient);
}

export function drawSmoothWavePolygon(
  cr: GjsCairoContext,
  points: ReadonlyArray<Point2D>,
  startBase: Point2D,
  endBase: Point2D
): void {
  if (points.length < 2) return;
  cr.moveTo(startBase.x, startBase.y);
  cr.lineTo(points[0].x, points[0].y);

  let prevX = points[0].x;
  let prevY = points[0].y;
  for (let i = 1; i < points.length - 1; i++) {
    const ctrl = points[i];
    const next = points[i + 1];
    const midX = (ctrl.x + next.x) / 2;
    const midY = (ctrl.y + next.y) / 2;
    cr.curveTo(
      prevX + (2 / 3) * (ctrl.x - prevX),
      prevY + (2 / 3) * (ctrl.y - prevY),
      midX + (2 / 3) * (ctrl.x - midX),
      midY + (2 / 3) * (ctrl.y - midY),
      midX,
      midY
    );
    prevX = midX;
    prevY = midY;
  }

  const last = points[points.length - 1];
  cr.lineTo(last.x, last.y);
  cr.lineTo(endBase.x, endBase.y);
  cr.closePath();
  cr.fill();
}
