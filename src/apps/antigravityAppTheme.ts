/**
 * Material You theming injection for the standalone Antigravity desktop app.
 */

import { Hct } from '@material/material-color-utilities';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { convertArgbToHex, convertHexToArgb } from '../color/colorConverter.js';
import { getTargetHomeDirectories, readTextFile, writeTextFile } from '../theme/fileHelper.js';
import type { MaterialSchemeColors } from '../types/theme.js';

export interface AntigravityAppApplyOptions {
  lightScheme: MaterialSchemeColors;
  darkScheme: MaterialSchemeColors;
}

interface CustomThemeSeeds {
  background: string;
  primary: string;
  foregroundOverride: string;
  primaryForegroundOverride: string;
  codeForegroundOverride: string;
}

const ANTIGRAVITY_APP_BINARIES: ReadonlyArray<string> = [
  '/opt/antigravity/antigravity',
  '/usr/share/antigravity/antigravity',
];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getFileIdentityKey(filePath: string): string {
  try {
    const file = Gio.File.new_for_path(filePath);
    if (!file.query_exists(null)) return filePath;
    const info = file.query_info('id::file', Gio.FileQueryInfoFlags.NONE, null);
    return info.get_attribute_string('id::file') ?? filePath;
  } catch {
    return filePath;
  }
}

function writeJsonIfChanged(filePath: string, payload: unknown): void {
  const nextRaw = `${JSON.stringify(payload, null, 2)}\n`;
  if (GLib.file_test(filePath, GLib.FileTest.EXISTS) && readTextFile(filePath) === nextRaw) {
    return;
  }
  writeTextFile(filePath, nextRaw);
}

function hasInstalledBinary(): boolean {
  return ANTIGRAVITY_APP_BINARIES.some((path) => GLib.file_test(path, GLib.FileTest.EXISTS));
}

function buildDeepTintedBackground(scheme: MaterialSchemeColors, isDark: boolean): string {
  if (!isDark) {
    const primaryHct = Hct.fromInt(convertHexToArgb(scheme.primary));
    const chroma = Math.min(8, Math.max(3, primaryHct.chroma * 0.14));
    return convertArgbToHex(Hct.from(primaryHct.hue, chroma, 97.5).toInt());
  }

  // Antigravity mixes +2.5%..12% white into --background for sidebar/card/secondary;
  // starting at tone 5.5 with stronger hue chroma prevents washed-out gray surfaces.
  const primaryHct = Hct.fromInt(convertHexToArgb(scheme.primary));
  const chroma = Math.min(18, Math.max(10, primaryHct.chroma * 0.3));
  return convertArgbToHex(Hct.from(primaryHct.hue, chroma, 5.5).toInt());
}

function buildCustomThemeSeeds(
  scheme: MaterialSchemeColors,
  isDark: boolean
): CustomThemeSeeds {
  return {
    background: buildDeepTintedBackground(scheme, isDark),
    primary: scheme.primary,
    foregroundOverride: scheme.onSurface,
    primaryForegroundOverride: scheme.onPrimary,
    codeForegroundOverride: scheme.tertiary,
  };
}

export function discoverAntigravityConfigDirs(): string[] {
  const dirs: string[] = [];
  const seenIds = new Set<string>();
  const binaryInstalled = hasInstalledBinary();

  for (const homeDir of getTargetHomeDirectories()) {
    const gemConfigDir = GLib.build_filenamev([homeDir, '.gemini', 'config']);
    const configFile = GLib.build_filenamev([gemConfigDir, 'config.json']);
    if (!GLib.file_test(configFile, GLib.FileTest.EXISTS) && !binaryInstalled) continue;

    const dirKey = getFileIdentityKey(gemConfigDir);
    if (seenIds.has(dirKey)) continue;
    seenIds.add(dirKey);
    dirs.push(gemConfigDir);
  }

  return dirs;
}

export function isAntigravityAppDetected(): boolean {
  if (hasInstalledBinary()) return true;
  return discoverAntigravityConfigDirs().some((dir) =>
    GLib.file_test(GLib.build_filenamev([dir, 'config.json']), GLib.FileTest.EXISTS)
  );
}

function updateAntigravityConfig(
  configPath: string,
  options: AntigravityAppApplyOptions
): void {
  let root: Record<string, unknown> = {};
  if (GLib.file_test(configPath, GLib.FileTest.EXISTS)) {
    const raw = readTextFile(configPath);
    if (raw.trim().length > 0) {
      const parsed: unknown = JSON.parse(raw);
      if (!isPlainRecord(parsed)) return;
      root = parsed;
    }
  }

  const userSettings = isPlainRecord(root.userSettings) ? { ...root.userSettings } : {};
  userSettings.customThemeSeedsDark = buildCustomThemeSeeds(options.darkScheme, true);
  userSettings.customThemeSeedsLight = buildCustomThemeSeeds(options.lightScheme, false);
  if (typeof userSettings.themeMode !== 'string') {
    userSettings.themeMode = 'THEME_MODE_SYSTEM';
  }

  writeJsonIfChanged(configPath, { ...root, userSettings });
}

export function applyAntigravityAppTheme(options: AntigravityAppApplyOptions): void {
  if (!isAntigravityAppDetected()) return;

  for (const gemConfigDir of discoverAntigravityConfigDirs()) {
    try {
      updateAntigravityConfig(GLib.build_filenamev([gemConfigDir, 'config.json']), options);
    } catch (error) {
      console.warn(`MeowterialYou: Failed updating Antigravity App at ${gemConfigDir}`, error);
    }
  }
}
