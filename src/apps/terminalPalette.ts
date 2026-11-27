/**
 * Material You ANSI 16-color palette and contrast-based terminal transparency helpers.
 */

import { Blend, Contrast, Hct } from '@material/material-color-utilities';
import { convertArgbToHex, convertHexToArgb } from '../color/colorConverter.js';
import type { MaterialSchemeColors, WallpaperImageStats } from '../types/theme.js';

export interface TerminalPaletteOptions {
  scheme: MaterialSchemeColors;
  isDark: boolean;
}

export interface TerminalOpacityOptions {
  scheme: MaterialSchemeColors;
  isDark: boolean;
  imageStats?: WallpaperImageStats;
}

const ANSI_SEMANTIC_SEEDS: ReadonlyArray<number> = [
  0xffe05252, // Red
  0xff5ec269, // Green
  0xffe0b24a, // Yellow
  0xff5a9ef5, // Blue
  0xffc678dd, // Magenta
  0xff4db8c4, // Cyan
];

function harmonizeAnsiColor(seedArgb: number, primaryArgb: number, tone: number, minChroma: number): string {
  const blended = Hct.fromInt(Blend.harmonize(seedArgb, primaryArgb));
  return convertArgbToHex(Hct.from(blended.hue, Math.max(minChroma, blended.chroma), tone).toInt());
}

export function getTerminalAnsiPalette({ scheme, isDark }: TerminalPaletteOptions): string[] {
  const primaryArgb = convertHexToArgb(scheme.primary || (isDark ? '#8ab4f8' : '#1a73e8'));
  const primaryHue = Hct.fromInt(primaryArgb).hue;

  const normalTone = isDark ? 74 : 38;
  const brightTone = isDark ? 84 : 46;
  const normalAccents = ANSI_SEMANTIC_SEEDS.map((seed) =>
    harmonizeAnsiColor(seed, primaryArgb, normalTone, isDark ? 36 : 42)
  );
  const brightAccents = ANSI_SEMANTIC_SEEDS.map((seed) =>
    harmonizeAnsiColor(seed, primaryArgb, brightTone, isDark ? 42 : 48)
  );

  const black = isDark ? scheme.surfaceContainerHighest || '#313539' : scheme.onSurface || '#1a1c18';
  const brightBlack = isDark ? scheme.outline || '#8d9199' : scheme.onSurfaceVariant || '#44474f';
  const white = isDark ? scheme.onSurface || '#e1e2e8' : scheme.outline || '#74777f';
  const brightWhite = isDark
    ? convertArgbToHex(Hct.from(primaryHue, 4, 97).toInt())
    : scheme.onSurface || '#1a1c18';

  return [black, ...normalAccents, white, brightBlack, ...brightAccents, brightWhite];
}

export function calculateTerminalTransparency(options: TerminalOpacityOptions): number {
  const { scheme, isDark, imageStats } = options;
  if (!imageStats) {
    return isDark ? 25 : 10;
  }

  const [avgR, avgG, avgB] = imageStats.averageRgb;
  const avgArgb = ((255 << 24) | (avgR << 16) | (avgG << 8) | avgB) >>> 0;
  const surfaceHex = scheme.surface || (isDark ? '#1a1c1a' : '#fdfdf5');
  const contrast = Contrast.ratioOfTones(
    Hct.fromInt(convertHexToArgb(surfaceHex)).tone,
    Hct.fromInt(avgArgb).tone
  );

  const normalizedBrightness = imageStats.brightness / 255.0;
  const contrastFactor = Math.min(contrast / 21.0, 1.0);

  let base = isDark
    ? 20 + contrastFactor * 45 * 0.7 - (normalizedBrightness > 0.6 ? 15 : 0)
    : 5 + contrastFactor * 30 * 0.6 + (normalizedBrightness < 0.4 ? 10 : 0);

  base -= imageStats.variance * 20;
  base -= imageStats.saturation * 8;

  return isDark ? Math.max(15, Math.min(70, Math.round(base))) : Math.max(0, Math.min(40, Math.round(base)));
}
