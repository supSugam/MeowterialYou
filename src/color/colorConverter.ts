/**
 * Utilities for color formatting and conversions.
 */

export function convertArgbToHex(argb: number): string {
  const r = ((argb >>> 16) & 255).toString(16).padStart(2, '0');
  const g = ((argb >>> 8) & 255).toString(16).padStart(2, '0');
  const b = (argb & 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

export function convertHexToArgb(hexString: string): number {
  const sanitized = hexString.replace('#', '').trim();
  const integer = parseInt(sanitized, 16);
  if (sanitized.length === 6) {
    return ((255 << 24) | integer) >>> 0;
  }
  return integer >>> 0;
}

export function convertHexToRgbTuple(hexString: string): [number, number, number] {
  const sanitized = hexString.replace('#', '').trim();
  const r = parseInt(sanitized.slice(0, 2), 16);
  const g = parseInt(sanitized.slice(2, 4), 16);
  const b = parseInt(sanitized.slice(4, 6), 16);
  return [r, g, b];
}

export function convertHexToHlsTuple(hexString: string): [number, number, number] {
  const [rNorm, gNorm, bNorm] = convertHexToRgbTuple(hexString).map(c => c / 255.0);
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2.0;

  if (max !== min) {
    const delta = max - min;
    s = l > 0.5 ? delta / (2.0 - max - min) : delta / (max + min);
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / delta + (gNorm < bNorm ? 6.0 : 0.0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / delta + 2.0;
        break;
      case bNorm:
        h = (rNorm - gNorm) / delta + 4.0;
        break;
    }
    h /= 6.0;
  }

  return [Math.round(h * 360), Math.round(l * 100), Math.round(s * 100)];
}

export function darkenColorHex(hexColor: string, factor: number): string {
  const [r, g, b] = convertHexToRgbTuple(hexColor);
  let newR: number;
  let newG: number;
  let newB: number;

  if (factor >= 0) {
    newR = Math.round(r * (1.0 - factor));
    newG = Math.round(g * (1.0 - factor));
    newB = Math.round(b * (1.0 - factor));
  } else {
    const positiveFactor = -factor;
    newR = Math.round(r + (255 - r) * positiveFactor);
    newG = Math.round(g + (255 - g) * positiveFactor);
    newB = Math.round(b + (255 - b) * positiveFactor);
  }

  const clamp = (val: number) => Math.max(0, Math.min(255, val)).toString(16).padStart(2, '0');
  return `#${clamp(newR)}${clamp(newG)}${clamp(newB)}`;
}
