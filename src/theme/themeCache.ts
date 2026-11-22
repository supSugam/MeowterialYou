/**
 * Persistent theme cache to eliminate redundant wallpaper extractions and file I/O.
 */

import GLib from 'gi://GLib';
import type Gio from 'gi://Gio';
import { getHomeDirectory, readTextFile, writeTextFile } from './fileHelper.js';
import type { ExtractionResult } from '../color/wallpaperExtractor.js';
import type { SchemeVariant, WindowButtonPosition, WindowButtonStyle } from '../types/theme.js';

export interface ThemeCacheData {
  wallpaperPath: string;
  isDark: boolean;
  variant: SchemeVariant;
  seedArgb: number;
  paletteColorsArgb: number[];
  isTopDark: boolean;
  isBottomDark: boolean;
  windowButtonStyle: WindowButtonStyle;
  windowButtonPosition: WindowButtonPosition;
  transparentPanel: boolean;
  themedIconsEnabled: boolean;
  baseIconTheme: string;
}

export type ThemeMatchCriteria = Omit<
  ThemeCacheData,
  'seedArgb' | 'paletteColorsArgb' | 'isTopDark' | 'isBottomDark'
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
  return (
    cache.wallpaperPath === current.wallpaperPath &&
    cache.isDark === current.isDark &&
    cache.variant === current.variant &&
    cache.windowButtonStyle === current.windowButtonStyle &&
    cache.windowButtonPosition === current.windowButtonPosition &&
    cache.transparentPanel === current.transparentPanel &&
    cache.themedIconsEnabled === current.themedIconsEnabled &&
    cache.baseIconTheme === current.baseIconTheme
  );
}

export function toExtractionResult(cache: ThemeCacheData): ExtractionResult {
  return {
    seedArgb: cache.seedArgb,
    paletteColorsArgb: cache.paletteColorsArgb ?? [],
    isTopDark: cache.isTopDark,
    isBottomDark: cache.isBottomDark,
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
