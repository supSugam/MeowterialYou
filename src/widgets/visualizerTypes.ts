/**
 * Shared types, bounds math, and Material You color helpers for the desktop audio visualizer.
 */

import { convertHexToRgbTuple } from '../color/colorConverter.js';
import type { MaterialSchemeColors } from '../types/theme.js';

export type VisualizerPosition = 'bottom' | 'top' | 'left' | 'right';
export type VisualizerStyle = 'bars' | 'mirrored' | 'wave';
export type VisualizerColorMode = 'vertical' | 'spectrum' | 'solid';

export type RgbUnitTuple = [number, number, number];

export interface VisualizerGradientColors {
  startRgb: RgbUnitTuple;
  midRgb: RgbUnitTuple;
  endRgb: RgbUnitTuple;
}

export interface VisualizerConfig {
  enabled: boolean;
  position: VisualizerPosition;
  style: VisualizerStyle;
  colorMode: VisualizerColorMode;
  barCount: number;
  barSpacing: number;
  cornerRadius: number;
  thickness: number;
  basePadding: number;
  sidePadding: number;
  opacity: number;
  pauseFullscreen: boolean;
}

export interface RectBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_SPAN_PX = 80;

export function computeVisualizerBounds(workArea: RectBounds, config: VisualizerConfig): RectBounds {
  const { basePadding, sidePadding, thickness, position } = config;
  if (position === 'bottom' || position === 'top') {
    const safeSide = Math.min(sidePadding, Math.max(0, Math.floor((workArea.width - MIN_SPAN_PX) / 2)));
    return {
      x: workArea.x + safeSide,
      y: position === 'bottom' ? workArea.y + workArea.height - thickness - basePadding : workArea.y + basePadding,
      width: Math.max(MIN_SPAN_PX, workArea.width - safeSide * 2),
      height: thickness,
    };
  }

  const safeSide = Math.min(sidePadding, Math.max(0, Math.floor((workArea.height - MIN_SPAN_PX) / 2)));
  return {
    x: position === 'left' ? workArea.x + basePadding : workArea.x + workArea.width - thickness - basePadding,
    y: workArea.y + safeSide,
    width: thickness,
    height: Math.max(MIN_SPAN_PX, workArea.height - safeSide * 2),
  };
}

export const DEFAULT_VISUALIZER_COLORS: VisualizerGradientColors = {
  startRgb: [0.54, 0.71, 0.97],
  midRgb: [0.72, 0.78, 0.85],
  endRgb: [0.83, 0.75, 0.9],
};

function hexToUnitRgb(hexColor: string, fallback: RgbUnitTuple): RgbUnitTuple {
  if (!hexColor || !hexColor.startsWith('#') || hexColor.length < 7) {
    return fallback;
  }
  const [r, g, b] = convertHexToRgbTuple(hexColor);
  return [r / 255, g / 255, b / 255];
}

export function buildVisualizerColors(scheme: MaterialSchemeColors): VisualizerGradientColors {
  return {
    startRgb: hexToUnitRgb(scheme.primary, DEFAULT_VISUALIZER_COLORS.startRgb),
    midRgb: hexToUnitRgb(scheme.secondary, DEFAULT_VISUALIZER_COLORS.midRgb),
    endRgb: hexToUnitRgb(scheme.tertiary, DEFAULT_VISUALIZER_COLORS.endRgb),
  };
}
