/**
 * Template substitution engine for CSS templates.
 */

import { convertHexToHlsTuple, convertHexToRgbTuple } from '../color/colorConverter.js';
import type { MaterialSchemeColors } from '../types/theme.js';

export type AlphaFormat = 'rgba' | 'hex8';

export interface TemplateSubstituteOptions {
  wallpaperPath?: string;
  prefix?: string;
  alphaFormat?: AlphaFormat;
}

const ALPHA_TOKENS: ReadonlyArray<{ suffix: string; opacity: number; hexByte: string }> = [
  { suffix: 'rgba08', opacity: 0.08, hexByte: '14' },
  { suffix: 'rgba12', opacity: 0.12, hexByte: '1f' },
  { suffix: 'rgba16', opacity: 0.16, hexByte: '29' },
  { suffix: 'rgba24', opacity: 0.24, hexByte: '3d' },
  { suffix: 'rgba32', opacity: 0.32, hexByte: '52' },
  { suffix: 'rgba40', opacity: 0.4, hexByte: '66' },
  { suffix: 'rgba50', opacity: 0.5, hexByte: '80' },
  { suffix: 'rgba60', opacity: 0.6, hexByte: '99' },
  { suffix: 'rgba75', opacity: 0.75, hexByte: 'bf' },
  { suffix: 'rgba80', opacity: 0.8, hexByte: 'cc' },
  { suffix: 'rgba85', opacity: 0.85, hexByte: 'd9' },
];

export function substituteTemplate(
  templateContent: string,
  scheme: MaterialSchemeColors,
  options: TemplateSubstituteOptions = {}
): string {
  const { wallpaperPath = '', prefix = '', alphaFormat = 'rgba' } = options;
  let result = templateContent;

  if (wallpaperPath) {
    result = result.replaceAll('@{wallpaper}', wallpaperPath);
  }

  const tokenPrefix = prefix ? `${prefix}.` : '';

  for (const [key, hexValue] of Object.entries(scheme)) {
    if (!hexValue || !hexValue.startsWith('#')) {
      continue;
    }

    const hexStripped = hexValue.slice(1);
    const [r, g, b] = convertHexToRgbTuple(hexValue);
    const [h, l, s] = convertHexToHlsTuple(hexValue);

    result = result.replaceAll(`@{${tokenPrefix}${key}.hex}`, hexValue);
    result = result.replaceAll(`@{${tokenPrefix}${key}}`, hexStripped);
    result = result.replaceAll(`@{${tokenPrefix}${key}.rgb}`, `rgb(${r}, ${g}, ${b})`);
    result = result.replaceAll(`@{${tokenPrefix}${key}.rgbTuple}`, `${r}, ${g}, ${b}`);

    for (const token of ALPHA_TOKENS) {
      const replacement =
        alphaFormat === 'hex8'
          ? `#${hexStripped}${token.hexByte}`
          : `rgba(${r}, ${g}, ${b}, ${token.opacity})`;
      result = result.replaceAll(`@{${tokenPrefix}${key}.${token.suffix}}`, replacement);
    }

    result = result.replaceAll(`@{${tokenPrefix}${key}.hue}`, String(h));
    result = result.replaceAll(`@{${tokenPrefix}${key}.sat}`, String(s));
    result = result.replaceAll(`@{${tokenPrefix}${key}.light}`, String(l));
  }

  return result;
}
