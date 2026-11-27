/**
 * Cairo bar and wave rendering primitives for the desktop audio visualizer.
 */

import type {
  VisualizerColorMode,
  VisualizerGradientColors,
  VisualizerPosition,
  VisualizerStyle,
} from './visualizerTypes.js';
import {
  applyVisualizerSource,
  drawSmoothWavePolygon,
  type GjsCairoContext,
  type Point2D,
} from './visualizerWave.js';

export type { GjsCairoContext } from './visualizerWave.js';

const MIN_BAR_LENGTH_PX = 2;

export interface VisualizerPaintParams {
  context: unknown;
  width: number;
  height: number;
  bars: ReadonlyArray<number>;
  position: VisualizerPosition;
  style: VisualizerStyle;
  colorMode: VisualizerColorMode;
  colors: VisualizerGradientColors;
  barSpacingPercent: number;
  cornerRadiusPercent: number;
  opacityPercent: number;
  fadeAlpha: number;
}

function drawStyledRect(
  cr: GjsCairoContext,
  x: number,
  y: number,
  width: number,
  height: number,
  cornerRadiusPercent: number
): void {
  if (width <= 0.5 || height <= 0.5) return;
  const radius = (Math.min(width, height) / 2) * (Math.max(0, Math.min(100, cornerRadiusPercent)) / 100);
  if (radius <= 0.35) {
    cr.rectangle(x, y, width, height);
    cr.fill();
    return;
  }
  cr.arc(x + radius, y + radius, radius, Math.PI, 1.5 * Math.PI);
  cr.arc(x + width - radius, y + radius, radius, 1.5 * Math.PI, 2 * Math.PI);
  cr.arc(x + width - radius, y + height - radius, radius, 0, 0.5 * Math.PI);
  cr.arc(x + radius, y + height - radius, radius, 0.5 * Math.PI, Math.PI);
  cr.closePath();
  cr.fill();
}

function paintWaveStyle(
  cr: GjsCairoContext,
  width: number,
  height: number,
  bars: ReadonlyArray<number>,
  position: VisualizerPosition
): void {
  const count = bars.length;
  const points: Point2D[] = [];
  for (let i = 0; i < count; i++) {
    const amp = Math.max(0.015, bars[i] ?? 0);
    const t = count > 1 ? i / (count - 1) : 0;
    if (position === 'bottom') points.push({ x: t * width, y: height - amp * height });
    else if (position === 'top') points.push({ x: t * width, y: amp * height });
    else if (position === 'left') points.push({ x: amp * width, y: t * height });
    else points.push({ x: width - amp * width, y: t * height });
  }

  if (position === 'bottom') drawSmoothWavePolygon(cr, points, { x: 0, y: height }, { x: width, y: height });
  else if (position === 'top') drawSmoothWavePolygon(cr, points, { x: 0, y: 0 }, { x: width, y: 0 });
  else if (position === 'left') drawSmoothWavePolygon(cr, points, { x: 0, y: 0 }, { x: 0, y: height });
  else drawSmoothWavePolygon(cr, points, { x: width, y: 0 }, { x: width, y: height });
}

function paintBarStyle(
  cr: GjsCairoContext,
  width: number,
  height: number,
  bars: ReadonlyArray<number>,
  position: VisualizerPosition,
  isMirrored: boolean,
  barSpacingPercent: number,
  cornerRadiusPercent: number
): void {
  const count = bars.length;
  const isHorizontal = position === 'bottom' || position === 'top';
  const span = isHorizontal ? width : height;
  const slot = span / count;
  const gapRatio = Math.max(0, Math.min(0.75, barSpacingPercent / 100));
  const barBreadth = Math.max(1.5, slot * (1 - gapRatio));
  const offset = (slot - barBreadth) / 2;

  for (let i = 0; i < count; i++) {
    const amp = Math.max(0.02, bars[i] ?? 0);
    const pos = i * slot + offset;

    if (isHorizontal) {
      const length = Math.max(MIN_BAR_LENGTH_PX, amp * height);
      const y = isMirrored ? (height - length) / 2 : position === 'bottom' ? height - length : 0;
      drawStyledRect(cr, pos, y, barBreadth, length, cornerRadiusPercent);
    } else {
      const length = Math.max(MIN_BAR_LENGTH_PX, amp * width);
      const x = isMirrored ? (width - length) / 2 : position === 'left' ? 0 : width - length;
      drawStyledRect(cr, x, pos, length, barBreadth, cornerRadiusPercent);
    }
  }
}

export function paintVisualizerBars(params: VisualizerPaintParams): void {
  const cr = params.context as GjsCairoContext;
  const { width, height, bars, position, style, colorMode, colors, opacityPercent, fadeAlpha } = params;
  if (width <= 0 || height <= 0 || fadeAlpha <= 0 || bars.length === 0) return;

  const alpha = (opacityPercent / 100) * fadeAlpha;
  applyVisualizerSource(cr, width, height, position, style, colorMode, colors, alpha);

  if (style === 'wave') {
    paintWaveStyle(cr, width, height, bars, position);
    return;
  }
  paintBarStyle(
    cr, width, height, bars, position, style === 'mirrored',
    params.barSpacingPercent, params.cornerRadiusPercent
  );
}
