/**
 * Maps Material You seed colors to GNOME 47 system accent colors.
 */

import { Hct } from '@material/material-color-utilities';

export type GnomeAccentColor =
  | 'blue'
  | 'teal'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'pink'
  | 'purple'
  | 'slate';

/**
 * Returns the closest GNOME 47 system accent color corresponding to an ARGB integer.
 */
export function mapArgbToGnomeAccent(argb: number): GnomeAccentColor {
  const hct = Hct.fromInt(argb);
  if (hct.chroma < 12) {
    return 'slate';
  }
  const hue = hct.hue;
  if (hue >= 18 && hue < 45) return 'orange';
  if (hue >= 45 && hue < 70) return 'yellow';
  if (hue >= 70 && hue < 165) return 'green';
  if (hue >= 165 && hue < 200) return 'teal';
  if (hue >= 200 && hue < 260) return 'blue';
  if (hue >= 260 && hue < 305) return 'purple';
  if (hue >= 305 && hue < 345) return 'pink';
  return 'red';
}
