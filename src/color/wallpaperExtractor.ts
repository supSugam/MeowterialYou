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
        for (let y = 0; y < height; y++) {
          const rowStart = y * rowstride;
          for (let x = 0; x < width; x++) {
            const offset = rowStart + x * nChannels;
            const r = rawPixels[offset] ?? 0;
            const g = rawPixels[offset + 1] ?? 0;
            const b = rawPixels[offset + 2] ?? 0;
            const a = nChannels >= 4 ? (rawPixels[offset + 3] ?? 255) : 255;

            // Only extract opaque pixels
            if (a >= 255) {
              pixels.push(((255 << 24) | (r << 16) | (g << 8) | b) >>> 0);
            }
          }
        }

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
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
      return GLib.SOURCE_REMOVE;
    });
  });
}
