/**
 * Asynchronous wallpaper pixel extraction and Material color derivation.
 */

import GdkPixbuf from 'gi://GdkPixbuf';
import GLib from 'gi://GLib';
import { QuantizerCelebi, Score } from '@material/material-color-utilities';

const TARGET_EXTRACTION_SIZE = 128;
const FALLBACK_SEED_COLOR_ARGB = 0xff4285f4; // Google Blue

export interface ExtractionResult {
  seedArgb: number;
  paletteColorsArgb: number[];
  isTopDark: boolean;
  isBottomDark: boolean;
}

export function extractColorsFromWallpaper(wallpaperPath: string): Promise<ExtractionResult> {
  return new Promise((resolve, reject) => {
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      try {
        const pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(
          wallpaperPath,
          TARGET_EXTRACTION_SIZE,
          TARGET_EXTRACTION_SIZE,
          true
        );

        if (!pixbuf) {
          reject(new Error(`Failed to load wallpaper at path: ${wallpaperPath}`));
          return GLib.SOURCE_REMOVE;
        }

        const width = pixbuf.get_width();
        const height = pixbuf.get_height();
        const nChannels = pixbuf.get_n_channels();
        const rowstride = pixbuf.get_rowstride();
        const rawPixels = pixbuf.get_pixels();

        const pixels: number[] = [];
        const topLimit = Math.max(1, Math.floor(height * 0.15));
        const bottomStart = Math.min(height - 1, Math.floor(height * 0.85));
        let topLuminanceSum = 0;
        let topPixelCount = 0;
        let bottomLuminanceSum = 0;
        let bottomPixelCount = 0;

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

        const colorMap = QuantizerCelebi.quantize(pixels, 128);
        const rankedColors = Score.score(colorMap, {
          desired: 8,
          fallbackColorARGB: FALLBACK_SEED_COLOR_ARGB,
          filter: true,
        });

        const seedArgb = rankedColors[0] ?? FALLBACK_SEED_COLOR_ARGB;

        resolve({
          seedArgb,
          paletteColorsArgb: rankedColors,
          isTopDark,
          isBottomDark,
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
      return GLib.SOURCE_REMOVE;
    });
  });
}
