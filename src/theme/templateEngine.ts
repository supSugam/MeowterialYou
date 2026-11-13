/**
 * Template substitution engine for CSS templates.
 */

import { convertHexToHlsTuple, convertHexToRgbTuple } from '../color/colorConverter.js';
import type { MaterialSchemeColors } from '../types/theme.js';

export function substituteTemplate(
  templateContent: string,
  scheme: MaterialSchemeColors,
  wallpaperPath: string = ''
): string {
  let result = templateContent;

  if (wallpaperPath) {
    result = result.replaceAll('@{wallpaper}', wallpaperPath);
  }

  for (const [key, hexValue] of Object.entries(scheme)) {
    if (!hexValue || !hexValue.startsWith('#')) {
      continue;
    }

    const hexStripped = hexValue.slice(1);
    const [r, g, b] = convertHexToRgbTuple(hexValue);
    const [h, l, s] = convertHexToHlsTuple(hexValue);

    // Replacements
    result = result.replaceAll(`@{${key}.hex}`, hexValue);
    result = result.replaceAll(`@{${key}}`, hexStripped);
    result = result.replaceAll(`@{${key}.rgb}`, `rgb(${r}, ${g}, ${b})`);

    // Alpha variants
    result = result.replaceAll(`@{${key}.rgba08}`, `#${hexStripped}14`);
    result = result.replaceAll(`@{${key}.rgba12}`, `#${hexStripped}1f`);
    result = result.replaceAll(`@{${key}.rgba16}`, `#${hexStripped}29`);
    result = result.replaceAll(`@{${key}.rgba24}`, `#${hexStripped}3d`);
    result = result.replaceAll(`@{${key}.rgba32}`, `#${hexStripped}52`);
    result = result.replaceAll(`@{${key}.rgba50}`, `#${hexStripped}80`);

    // HLS components
    result = result.replaceAll(`@{${key}.hue}`, String(h));
    result = result.replaceAll(`@{${key}.sat}`, String(s));
    result = result.replaceAll(`@{${key}.light}`, String(l));
  }

  return result;
}
