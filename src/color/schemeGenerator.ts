/**
 * Generator for Material You dynamic schemes based on Google Material Color Utilities.
 */

import {
  Hct,
  MaterialDynamicColors,
  SchemeContent,
  SchemeExpressive,
  SchemeFidelity,
  SchemeFruitSalad,
  SchemeMonochrome,
  SchemeNeutral,
  SchemeRainbow,
  SchemeTonalSpot,
  SchemeVibrant,
  type DynamicScheme,
} from '@material/material-color-utilities';
import { convertArgbToHex } from './colorConverter.js';
import type { MaterialSchemeColors, SchemeVariant } from '../types/theme.js';

function createDynamicScheme(
  sourceColorHct: Hct,
  isDark: boolean,
  variant: SchemeVariant,
  contrastLevel: number = 0.0
): DynamicScheme {
  switch (variant) {
    case 'tonal-spot':
      return new SchemeTonalSpot(sourceColorHct, isDark, contrastLevel);
    case 'neutral':
      return new SchemeNeutral(sourceColorHct, isDark, contrastLevel);
    case 'vibrant':
      return new SchemeVibrant(sourceColorHct, isDark, contrastLevel);
    case 'expressive':
      return new SchemeExpressive(sourceColorHct, isDark, contrastLevel);
    case 'rainbow':
      return new SchemeRainbow(sourceColorHct, isDark, contrastLevel);
    case 'fruit-salad':
      return new SchemeFruitSalad(sourceColorHct, isDark, contrastLevel);
    case 'content':
      return new SchemeContent(sourceColorHct, isDark, contrastLevel);
    case 'monochrome':
      return new SchemeMonochrome(sourceColorHct, isDark, contrastLevel);
    case 'fidelity':
      return new SchemeFidelity(sourceColorHct, isDark, contrastLevel);
  }
}

export function generateMaterialScheme(
  seedArgb: number,
  isDark: boolean,
  variant: SchemeVariant = 'tonal-spot',
  isTopDark?: boolean
): MaterialSchemeColors {
  const hct = Hct.fromInt(seedArgb);
  const scheme = createDynamicScheme(hct, isDark, variant);

  const getHex = (dynamicColor: { getArgb(s: DynamicScheme): number }): string =>
    convertArgbToHex(dynamicColor.getArgb(scheme));

  const panelScheme =
    isTopDark !== undefined && isTopDark !== isDark
      ? createDynamicScheme(hct, isTopDark, variant)
      : scheme;
  const panelTextColor = convertArgbToHex(
    MaterialDynamicColors.onSurface.getArgb(panelScheme)
  );

  return {
    primary: getHex(MaterialDynamicColors.primary),
    onPrimary: getHex(MaterialDynamicColors.onPrimary),
    primaryContainer: getHex(MaterialDynamicColors.primaryContainer),
    onPrimaryContainer: getHex(MaterialDynamicColors.onPrimaryContainer),
    secondary: getHex(MaterialDynamicColors.secondary),
    onSecondary: getHex(MaterialDynamicColors.onSecondary),
    secondaryContainer: getHex(MaterialDynamicColors.secondaryContainer),
    onSecondaryContainer: getHex(MaterialDynamicColors.onSecondaryContainer),
    tertiary: getHex(MaterialDynamicColors.tertiary),
    onTertiary: getHex(MaterialDynamicColors.onTertiary),
    tertiaryContainer: getHex(MaterialDynamicColors.tertiaryContainer),
    onTertiaryContainer: getHex(MaterialDynamicColors.onTertiaryContainer),
    error: getHex(MaterialDynamicColors.error),
    onError: getHex(MaterialDynamicColors.onError),
    errorContainer: getHex(MaterialDynamicColors.errorContainer),
    onErrorContainer: getHex(MaterialDynamicColors.onErrorContainer),
    background: getHex(MaterialDynamicColors.background),
    onBackground: getHex(MaterialDynamicColors.onBackground),
    surface: getHex(MaterialDynamicColors.surface),
    onSurface: getHex(MaterialDynamicColors.onSurface),
    surfaceVariant: getHex(MaterialDynamicColors.surfaceVariant),
    onSurfaceVariant: getHex(MaterialDynamicColors.onSurfaceVariant),
    outline: getHex(MaterialDynamicColors.outline),
    outlineVariant: getHex(MaterialDynamicColors.outlineVariant),
    shadow: getHex(MaterialDynamicColors.shadow),
    scrim: getHex(MaterialDynamicColors.scrim),
    inverseSurface: getHex(MaterialDynamicColors.inverseSurface),
    inverseOnSurface: getHex(MaterialDynamicColors.inverseOnSurface),
    inversePrimary: getHex(MaterialDynamicColors.inversePrimary),
    surfaceDim: getHex(MaterialDynamicColors.surfaceDim),
    surfaceBright: getHex(MaterialDynamicColors.surfaceBright),
    surfaceContainerLowest: getHex(MaterialDynamicColors.surfaceContainerLowest),
    surfaceContainerLow: getHex(MaterialDynamicColors.surfaceContainerLow),
    surfaceContainer: getHex(MaterialDynamicColors.surfaceContainer),
    surfaceContainerHigh: getHex(MaterialDynamicColors.surfaceContainerHigh),
    surfaceContainerHighest: getHex(MaterialDynamicColors.surfaceContainerHighest),
    panelTextColor,
  };
}
