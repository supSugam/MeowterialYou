/**
 * Wallpaper-harmonized semantic accents and Material 3 base tone ladders for Obsidian.
 */

import { Blend, Hct } from '@material/material-color-utilities';
import { convertArgbToHex, convertHexToArgb } from '../color/colorConverter.js';
import type { MaterialSchemeColors } from '../types/theme.js';

interface SemanticSeedSpec {
  token: string;
  argb: number;
}

const OBSIDIAN_SEMANTIC_SEEDS: ReadonlyArray<SemanticSeedSpec> = [
  { token: 'semRed', argb: 0xffe05252 },
  { token: 'semOrange', argb: 0xffe88c48 },
  { token: 'semYellow', argb: 0xffdeb44a },
  { token: 'semGreen', argb: 0xff58bd6d },
  { token: 'semTeal', argb: 0xff3bb89e },
  { token: 'semCyan', argb: 0xff46b6cc },
  { token: 'semBlue', argb: 0xff5b9cf2 },
  { token: 'semPurple', argb: 0xffa77ee6 },
  { token: 'semPink', argb: 0xffde70ab },
];

function harmonizeAccent(
  seedArgb: number,
  primaryArgb: number,
  tone: number,
  minChroma: number
): string {
  const blended = Hct.fromInt(Blend.harmonize(seedArgb, primaryArgb));
  const targetChroma = Math.max(minChroma, blended.chroma);
  return convertArgbToHex(Hct.from(blended.hue, targetChroma, tone).toInt());
}

export function buildObsidianTokenMap(
  scheme: MaterialSchemeColors,
  isDark: boolean
): MaterialSchemeColors {
  const primaryArgb = convertHexToArgb(scheme.primary || (isDark ? '#8ab4f8' : '#1a73e8'));
  const surfaceHct = Hct.fromInt(convertHexToArgb(scheme.surface));
  const neutralHue = surfaceHct.hue;
  const baseScaleChroma = Math.min(Math.max(surfaceHct.chroma, isDark ? 8 : 5), isDark ? 14 : 9);

  const toneSteps: ReadonlyArray<[string, number]> = isDark
    ? [
        ['base35', 26],
        ['base40', 33],
        ['base50', 44],
        ['base60', 56],
        ['base70', 72],
        ['highlightTint', 19],
      ]
    : [
        ['base35', 84],
        ['base40', 76],
        ['base50', 62],
        ['base60', 48],
        ['base70', 34],
        ['highlightTint', 91],
      ];

  const tokens: MaterialSchemeColors = { ...scheme };
  const semanticTone = isDark ? 76 : 42;
  const semanticMinChroma = isDark ? 42 : 46;

  for (const spec of OBSIDIAN_SEMANTIC_SEEDS) {
    tokens[spec.token] = harmonizeAccent(
      spec.argb,
      primaryArgb,
      semanticTone,
      semanticMinChroma
    );
  }

  for (const [key, tone] of toneSteps) {
    tokens[key] = convertArgbToHex(Hct.from(neutralHue, baseScaleChroma, tone).toInt());
  }

  return tokens;
}
