/**
 * Surface tonal and chroma tuning for Material You color schemes.
 * Enriches chromatic dark surfaces so GTK, Shell, and app canvases show clear
 * wallpaper hue harmony instead of near-neutral charcoal.
 */

import { Hct, type DynamicScheme } from '@material/material-color-utilities';
import { convertArgbToHex } from './colorConverter.js';
import type { MaterialSchemeColors, SchemeVariant } from '../types/theme.js';

const ACHROMATIC_VARIANTS = new Set<SchemeVariant>(['monochrome', 'neutral']);

interface SurfaceToneSpec {
  key: keyof Pick<
    MaterialSchemeColors,
    | 'background'
    | 'surface'
    | 'surfaceDim'
    | 'surfaceVariant'
    | 'surfaceContainerLowest'
    | 'surfaceContainerLow'
    | 'surfaceContainer'
    | 'surfaceContainerHigh'
    | 'surfaceContainerHighest'
    | 'surfaceBright'
  >;
  tone: number;
  chromaMultiplier: number;
}

const DARK_SURFACE_SPECS: ReadonlyArray<SurfaceToneSpec> = [
  { key: 'surfaceContainerLowest', tone: 4, chromaMultiplier: 0.85 },
  { key: 'background', tone: 6.5, chromaMultiplier: 0.9 },
  { key: 'surface', tone: 6.5, chromaMultiplier: 0.9 },
  { key: 'surfaceDim', tone: 6.5, chromaMultiplier: 0.9 },
  { key: 'surfaceContainerLow', tone: 9.5, chromaMultiplier: 1.0 },
  { key: 'surfaceContainer', tone: 12, chromaMultiplier: 1.05 },
  { key: 'surfaceContainerHigh', tone: 16.5, chromaMultiplier: 1.1 },
  { key: 'surfaceContainerHighest', tone: 21, chromaMultiplier: 1.15 },
  { key: 'surfaceBright', tone: 23, chromaMultiplier: 1.05 },
  { key: 'surfaceVariant', tone: 25, chromaMultiplier: 1.05 },
];

export function tuneDarkSurfaces(
  colors: MaterialSchemeColors,
  sourceColorHct: Hct,
  scheme: DynamicScheme,
  variant: SchemeVariant
): MaterialSchemeColors {
  if (ACHROMATIC_VARIANTS.has(variant)) {
    return colors;
  }

  const neutralHue = scheme.neutralPalette.hue;
  const baseChroma = Math.min(Math.max(sourceColorHct.chroma * 0.24, 9), 14);
  const existingNeutralChroma = scheme.neutralPalette.chroma;
  const effectiveChroma = Math.max(baseChroma, existingNeutralChroma);

  const tuned: MaterialSchemeColors = { ...colors };
  for (const spec of DARK_SURFACE_SPECS) {
    const targetChroma = Math.min(effectiveChroma * spec.chromaMultiplier, 15.5);
    tuned[spec.key] = convertArgbToHex(
      Hct.from(neutralHue, targetChroma, spec.tone).toInt()
    );
  }

  return tuned;
}
