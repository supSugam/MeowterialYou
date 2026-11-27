/**
 * Asynchronous wallpaper pixel extraction and Material color derivation.
 */

import GdkPixbuf from 'gi://GdkPixbuf';
import { QuantizerCelebi, Score } from '@material/material-color-utilities';
import type { WallpaperImageStats } from '../types/theme.js';

const TARGET_EXTRACTION_SIZE = 128;
const FALLBACK_SEED_COLOR_ARGB = 0xff4285f4; // Google Blue

export interface ExtractionResult {
  seedArgb: number;
  paletteColorsArgb: number[];
  isTopDark: boolean;
  isBottomDark: boolean;
  imageStats?: WallpaperImageStats;
}

export function extractColorsFromWallpaper(wallpaperPath: string): ExtractionResult {
  const pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(
    wallpaperPath,
    TARGET_EXTRACTION_SIZE,
    TARGET_EXTRACTION_SIZE,
    true
  );

  if (!pixbuf) {
    throw new Error(`Failed to load wallpaper at path: ${wallpaperPath}`);
  }

  const width = pixbuf.get_width();
  const height = pixbuf.get_height();
  const nChannels = pixbuf.get_n_channels();
  const rowstride = pixbuf.get_rowstride();
  const rawPixels = pixbuf.get_pixels();

  const pixels: number[] = [];
  const topLimit = Math.max(1, Math.floor(height * 0.05));
  const bottomStart = Math.min(height - 1, Math.floor(height * 0.95));
  let topLuminanceSum = 0;
  let topPixelCount = 0;
  let bottomLuminanceSum = 0;
  let bottomPixelCount = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let brightnessSum = 0;
  let brightnessSqSum = 0;
  let saturationSum = 0;
  let totalPixels = 0;

  for (let y = 0; y < height; y++) {
    const rowStart = y * rowstride;
    const isTopRow = y < topLimit;
    const isBottomRow = y >= bottomStart;
    for (let x = 0; x < width; x++) {
      const offset = rowStart + x * nChannels;
      const r = rawPixels[offset] ?? 0;
      const g = rawPixels[offset + 1] ?? 0;
      const b = rawPixels[offset + 2] ?? 0;
      const a = nChannels >= 4 ? (rawPixels[offset + 3] ?? 255) : 255;

      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (isTopRow) {
        topLuminanceSum += luminance;
        topPixelCount++;
      }
      if (isBottomRow) {
        bottomLuminanceSum += luminance;
        bottomPixelCount++;
      }

      const perceivedBrightness = 0.299 * r + 0.587 * g + 0.114 * b;
      const maxChannel = Math.max(r, g, b);
      const minChannel = Math.min(r, g, b);
      rSum += r;
      gSum += g;
      bSum += b;
      brightnessSum += perceivedBrightness;
      brightnessSqSum += perceivedBrightness * perceivedBrightness;
      saturationSum += maxChannel > 0 ? (maxChannel - minChannel) / maxChannel : 0;
      totalPixels++;

      // Only extract opaque pixels
      if (a >= 255) {
        pixels.push(((255 << 24) | (r << 16) | (g << 8) | b) >>> 0);
      }
    }
  }

  const avgTopLuminance = topPixelCount > 0 ? topLuminanceSum / topPixelCount : 128;
  const isTopDark = avgTopLuminance < 140;

  const avgBottomLuminance = bottomPixelCount > 0 ? bottomLuminanceSum / bottomPixelCount : 128;
  const isBottomDark = avgBottomLuminance < 140;

  const count = Math.max(1, totalPixels);
  const avgBrightness = brightnessSum / count;
  const rawVariance = Math.max(0, brightnessSqSum / count - avgBrightness * avgBrightness);
  const imageStats: WallpaperImageStats = {
    brightness: avgBrightness,
    variance: Math.min(rawVariance / 5000, 1.0),
    saturation: saturationSum / count,
    averageRgb: [Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count)],
  };

  const colorMap = QuantizerCelebi.quantize(pixels, 128);
  const rankedColors = Score.score(colorMap, {
    desired: 8,
    fallbackColorARGB: FALLBACK_SEED_COLOR_ARGB,
    filter: true,
  });

  const seedArgb = rankedColors[0] ?? FALLBACK_SEED_COLOR_ARGB;

  return {
    seedArgb,
    paletteColorsArgb: rankedColors,
    isTopDark,
    isBottomDark,
    imageStats,
  };
}
