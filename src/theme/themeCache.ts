/**
 * Persistent theme cache to eliminate redundant wallpaper extractions and file I/O.
 */

import GLib from 'gi://GLib';
import type Gio from 'gi://Gio';
import { getHomeDirectory, readTextFile, writeTextFile } from './fileHelper.js';
import type { ExtractionResult } from '../color/wallpaperExtractor.js';
import type {
  SchemeVariant,
  WallpaperImageStats,
  WindowButtonPosition,
  WindowButtonStyle,
} from '../types/theme.js';

export interface ThemeCacheData {
  wallpaperPath: string;
  isDark: boolean;
  variant: SchemeVariant;
  seedArgb: number;
  paletteColorsArgb: number[];
  isTopDark: boolean;
  isBottomDark: boolean;
  imageStats?: WallpaperImageStats;
  windowButtonStyle: WindowButtonStyle;
  windowButtonPosition: WindowButtonPosition;
  transparentPanel: boolean;
  themedIconsEnabled: boolean;
  baseIconTheme: string;
  themedCursorsEnabled?: boolean;
  baseCursorTheme?: string;
  themedCursorStyle?: string;
  terminalThemingEnabled: boolean;
  ghosttyEnabled: boolean;
  vscodeEnabled: boolean;
  antigravityAppEnabled: boolean;
  obsidianEnabled: boolean;
  fastfetchEnabled: boolean;
  fastfetchManageLayout: boolean;
  fastfetchLogoCycle: boolean;
  fastfetchLogoDirectory: string;
  shellPromptEnabled: boolean;
}

export type ThemeMatchCriteria = Omit<
  ThemeCacheData,
  'seedArgb' | 'paletteColorsArgb' | 'isTopDark' | 'isBottomDark' | 'imageStats'
>;

export function getThemeCriteria(
  settings: Gio.Settings,
  wallpaperPath: string,
  isDark: boolean
): ThemeMatchCriteria {
  return {
    wallpaperPath,
    isDark,
    variant: settings.get_string('scheme-variant') as SchemeVariant,
    windowButtonStyle: settings.get_string('window-button-style') as WindowButtonStyle,
    windowButtonPosition: settings.get_string('window-button-position') as WindowButtonPosition,
    transparentPanel: settings.get_boolean('transparent-panel'),
    themedIconsEnabled: settings.get_boolean('themed-icons-enabled'),
    baseIconTheme: settings.get_string('base-icon-theme'),
    themedCursorsEnabled: settings.get_boolean('themed-cursors-enabled'),
    baseCursorTheme: settings.get_string('base-cursor-theme'),
    themedCursorStyle: settings.get_string('themed-cursor-style'),
    terminalThemingEnabled: settings.get_boolean('terminal-theming-enabled'),
    ghosttyEnabled: settings.get_boolean('ghostty-enabled'),
    vscodeEnabled: settings.get_boolean('vscode-enabled'),
    antigravityAppEnabled: settings.get_boolean('antigravity-app-enabled'),
    obsidianEnabled: settings.get_boolean('obsidian-enabled'),
    fastfetchEnabled: settings.get_boolean('fastfetch-enabled'),
    fastfetchManageLayout: settings.get_boolean('fastfetch-manage-layout'),
    fastfetchLogoCycle: settings.get_boolean('fastfetch-logo-cycle'),
    fastfetchLogoDirectory: settings.get_string('fastfetch-logo-directory'),
    shellPromptEnabled: settings.get_boolean('shell-prompt-enabled'),
  };
}

function getCacheFilePath(): string {
  return GLib.build_filenamev([getHomeDirectory(), '.config', 'meowterialyou', 'theme_cache.json']);
}

export function loadThemeCache(): ThemeCacheData | null {
  const path = getCacheFilePath();
  if (!GLib.file_test(path, GLib.FileTest.EXISTS)) {
    return null;
  }
  try {
    const raw = readTextFile(path);
    return JSON.parse(raw) as ThemeCacheData;
  } catch {
    return null;
  }
}

export function saveThemeCache(data: ThemeCacheData): void {
  try {
    const path = getCacheFilePath();
    writeTextFile(path, JSON.stringify(data, null, 2));
  } catch (error) {
    console.warn('MeowterialYou: Failed to save theme cache', error);
  }
}

export function isCacheUpToDate(cache: ThemeCacheData | null, current: ThemeMatchCriteria): boolean {
  if (!cache) return false;
  return (Object.keys(current) as Array<keyof ThemeMatchCriteria>).every(
    (key) => cache[key] === current[key]
  );
}

export function toExtractionResult(cache: ThemeCacheData): ExtractionResult {
  return {
    seedArgb: cache.seedArgb,
    paletteColorsArgb: cache.paletteColorsArgb ?? [],
    isTopDark: cache.isTopDark,
    isBottomDark: cache.isBottomDark,
    imageStats: cache.imageStats,
  };
}

export function doesThemeExistOnDisk(isDark: boolean): boolean {
  const themeName = `MeowterialYou-${isDark ? 'dark' : 'light'}`;
  const path = GLib.build_filenamev([
    getHomeDirectory(),
    '.local',
    'share',
    'themes',
    themeName,
    'gnome-shell',
    'gnome-shell.css',
  ]);
  return GLib.file_test(path, GLib.FileTest.EXISTS);
}
