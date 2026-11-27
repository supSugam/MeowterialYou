/**
 * Fastfetch image-logo geometry and path resolution helpers.
 */

import GdkPixbuf from 'gi://GdkPixbuf';
import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { getTargetHomeDirectories, readTextFile } from '../theme/fileHelper.js';
import { scanWallpaperDirectory } from '../wallpaper/wallpaperSorter.js';

const LOGO_HEIGHT_RATIO = 1.0;
const MAX_LOGO_HEIGHT_ROWS = 16;
const MAX_LOGO_WIDTH_COLS = 32;
const DEFAULT_CELL_RATIO = 2.0;

export interface LogoGeometry {
  width: number;
  height: number;
  paddingTop: number;
  prependedBreaks: number;
}

export interface LogoGeometryOptions {
  logoPath: string;
  infoLineCount: number;
  cellRatio?: number;
}

export function expandHomePath(rawPath: string, homeDir: string): string {
  return rawPath.startsWith('~/') ? GLib.build_filenamev([homeDir, rawPath.slice(2)]) : rawPath;
}

export function readCachedCellRatio(fastfetchDir: string): number | undefined {
  const ratioPath = GLib.build_filenamev([fastfetchDir, '.cell_ratio']);
  if (!GLib.file_test(ratioPath, GLib.FileTest.EXISTS)) return undefined;
  const parsed = Number.parseFloat(readTextFile(ratioPath).trim());
  return Number.isFinite(parsed) && parsed > 0.5 && parsed < 5.0 ? parsed : undefined;
}

export function countModuleLines(modules: unknown[]): number {
  const lines = modules.filter((item) => typeof item !== 'string' || item === 'break').length;
  return Math.max(6, lines);
}

export function calculateLogoGeometry(options: LogoGeometryOptions): LogoGeometry {
  const { logoPath, infoLineCount, cellRatio = DEFAULT_CELL_RATIO } = options;
  let imgWidth = 1;
  let imgHeight = 1;

  if (logoPath && GLib.file_test(logoPath, GLib.FileTest.EXISTS)) {
    try {
      const [, width, height] = GdkPixbuf.Pixbuf.get_file_info(logoPath);
      if (width > 0 && height > 0) {
        imgWidth = width;
        imgHeight = height;
      }
    } catch {
      // Fallback to 1:1 aspect ratio if image metadata cannot be parsed
    }
  }

  const rows = Math.max(4, infoLineCount);
  let targetHeight = Math.max(
    4,
    Math.min(MAX_LOGO_HEIGHT_ROWS, Math.round(rows * LOGO_HEIGHT_RATIO))
  );
  let targetWidth = Math.max(
    1,
    Math.round((targetHeight * imgWidth * cellRatio) / Math.max(1, imgHeight))
  );

  if (targetWidth > MAX_LOGO_WIDTH_COLS) {
    targetWidth = MAX_LOGO_WIDTH_COLS;
    targetHeight = Math.max(
      4,
      Math.round((targetWidth * imgHeight) / Math.max(1, imgWidth * cellRatio))
    );
  }

  return {
    width: targetWidth,
    height: targetHeight,
    paddingTop: rows > targetHeight ? Math.floor((rows - targetHeight) / 2) : 0,
    prependedBreaks: targetHeight > rows ? Math.floor((targetHeight - rows) / 2) : 0,
  };
}

export function resolveFastfetchHomeDirs(): string[] {
  const realHome = `/home/${GLib.get_user_name()}`;
  return getTargetHomeDirectories().filter((dir) => {
    if (dir === realHome) return true;
    return GLib.file_test(
      GLib.build_filenamev([dir, '.config', 'fastfetch', 'config.jsonc']),
      GLib.FileTest.EXISTS
    );
  });
}

export function pickFastfetchDirectoryLogo(settings: Gio.Settings): string | null {
  const logoDir = settings.get_string('fastfetch-logo-directory').trim();
  if (!logoDir || !GLib.file_test(logoDir, GLib.FileTest.IS_DIR)) return null;

  const lastLogo = settings.get_string('fastfetch-last-logo');
  const images = scanWallpaperDirectory(logoDir, 'random', lastLogo);
  if (images.length === 0) return null;

  const shouldCycle = settings.get_boolean('fastfetch-logo-cycle');
  const chosen = !shouldCycle && lastLogo && images.includes(lastLogo) ? lastLogo : images[0]!;
  if (chosen !== lastLogo) {
    settings.set_string('fastfetch-last-logo', chosen);
  }
  return chosen;
}
