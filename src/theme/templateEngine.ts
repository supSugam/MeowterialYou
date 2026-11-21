/**
 * Template substitution engine for CSS templates.
 */

import { convertHexToHlsTuple, convertHexToRgbTuple } from '../color/colorConverter.js';
import type { MaterialSchemeColors } from '../types/theme.js';

export function substituteTemplate(
  templateContent: string,
  scheme: MaterialSchemeColors,
  wallpaperPath: string = '',
  prefix: string = ''
): string {
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

    // Replacements
    result = result.replaceAll(`@{${tokenPrefix}${key}.hex}`, hexValue);
    result = result.replaceAll(`@{${tokenPrefix}${key}}`, hexStripped);
    result = result.replaceAll(`@{${tokenPrefix}${key}.rgb}`, `rgb(${r}, ${g}, ${b})`);

    // Alpha variants (using standard rgba() because St / libcroco rejects 8-digit hex #rrggbbaa)
    result = result.replaceAll(`@{${tokenPrefix}${key}.rgba08}`, `rgba(${r}, ${g}, ${b}, 0.08)`);
    result = result.replaceAll(`@{${tokenPrefix}${key}.rgba12}`, `rgba(${r}, ${g}, ${b}, 0.12)`);
    result = result.replaceAll(`@{${tokenPrefix}${key}.rgba16}`, `rgba(${r}, ${g}, ${b}, 0.16)`);
    result = result.replaceAll(`@{${tokenPrefix}${key}.rgba24}`, `rgba(${r}, ${g}, ${b}, 0.24)`);
    result = result.replaceAll(`@{${tokenPrefix}${key}.rgba32}`, `rgba(${r}, ${g}, ${b}, 0.32)`);
    result = result.replaceAll(`@{${tokenPrefix}${key}.rgba50}`, `rgba(${r}, ${g}, ${b}, 0.5)`);

    // HLS components
    result = result.replaceAll(`@{${tokenPrefix}${key}.hue}`, String(h));
    result = result.replaceAll(`@{${tokenPrefix}${key}.sat}`, String(s));
    result = result.replaceAll(`@{${tokenPrefix}${key}.light}`, String(l));
  }

  return result;
}
