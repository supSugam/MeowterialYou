/**
 * Fastfetch theming via direct ~/.config/fastfetch/config.jsonc updates (no wrapper scripts).
 */

import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { getTargetHomeDirectories, readTextFile, writeTextFile } from '../theme/fileHelper.js';
import {
  calculateLogoGeometry,
  countModuleLines,
  expandHomePath,
  pickFastfetchDirectoryLogo,
  readCachedCellRatio,
  resolveFastfetchHomeDirs,
} from './fastfetchGeometry.js';
import {
  buildDisplayColors,
  buildLogoColors,
  buildManagedModules,
  buildPercentColors,
  recolorCustomModules,
} from './fastfetchLayout.js';
import { syncFastfetchCycleConfigs } from './fastfetchCycleHelper.js';
import { parseJsonc } from './jsoncHelper.js';
import type { MaterialSchemeColors } from '../types/theme.js';

const FASTFETCH_SCHEMA_URL =
  'https://github.com/fastfetch-cli/fastfetch/raw/master/doc/json_schema.json';
const MANAGED_MODULE_COUNT = 15;

export interface FastfetchApplyOptions {
  settings: Gio.Settings;
  scheme: MaterialSchemeColors;
}

export function isFastfetchDetected(): boolean {
  if (GLib.find_program_in_path('fastfetch')) return true;
  return getTargetHomeDirectories().some((dir) =>
    GLib.file_test(GLib.build_filenamev([dir, '.config', 'fastfetch']), GLib.FileTest.IS_DIR)
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function buildUpdatedConfig(
  existing: Record<string, unknown>,
  options: FastfetchApplyOptions,
  fastfetchDir: string,
  homeDir: string,
  chosenDirLogo: string | null
): Record<string, unknown> {
  const { scheme, settings } = options;
  const config: Record<string, unknown> = { $schema: FASTFETCH_SCHEMA_URL, ...existing };
  const prevDisplay = asRecord(config.display);
  const prevPercent = asRecord(prevDisplay.percent);

  config.display = {
    key: { width: 10 },
    size: { binaryPrefix: 'jedec' },
    separator: '  ',
    ...prevDisplay,
    color: buildDisplayColors(scheme),
    percent: { ...prevPercent, color: buildPercentColors(scheme) },
  };

  const prevLogo = asRecord(config.logo);
  const logoSource =
    chosenDirLogo ?? (typeof prevLogo.source === 'string' ? prevLogo.source : '');
  const resolvedLogo = logoSource ? expandHomePath(logoSource, homeDir) : '';
  const hasImageFile =
    Boolean(resolvedLogo) &&
    prevLogo.type !== 'none' &&
    GLib.file_test(resolvedLogo, GLib.FileTest.EXISTS);

  const existingModules = Array.isArray(config.modules) ? config.modules : null;
  const usePreset = settings.get_boolean('fastfetch-manage-layout') || existingModules === null;
  const infoLines = usePreset ? MANAGED_MODULE_COUNT : countModuleLines(existingModules);
  const geometry = hasImageFile
    ? calculateLogoGeometry({
        logoPath: resolvedLogo,
        infoLineCount: infoLines,
        cellRatio: readCachedCellRatio(fastfetchDir),
      })
    : null;

  config.modules = usePreset
    ? buildManagedModules(scheme, geometry?.prependedBreaks ?? 0)
    : recolorCustomModules(existingModules, scheme);

  if (geometry && hasImageFile) {
    const prevPadding = asRecord(prevLogo.padding);
    config.logo = {
      ...prevLogo,
      type: resolvedLogo.toLowerCase().endsWith('.png') ? 'kitty-direct' : 'kitty',
      source: logoSource,
      width: geometry.width,
      height: geometry.height,
      padding: { left: 2, ...prevPadding, top: geometry.paddingTop },
    };
  } else {
    config.logo = { ...prevLogo, color: buildLogoColors(scheme) };
  }

  return config;
}

export function applyFastfetchTheme(options: FastfetchApplyOptions): void {
  if (!isFastfetchDetected()) return;

  const chosenDirLogo = pickFastfetchDirectoryLogo(options.settings);

  for (const homeDir of resolveFastfetchHomeDirs()) {
    const fastfetchDir = GLib.build_filenamev([homeDir, '.config', 'fastfetch']);
    const configPath = GLib.build_filenamev([fastfetchDir, 'config.jsonc']);
    const backupPath = `${configPath}.meowterialyou-bak`;

    const rawExisting = GLib.file_test(configPath, GLib.FileTest.EXISTS)
      ? readTextFile(configPath)
      : '';
    if (rawExisting && !GLib.file_test(backupPath, GLib.FileTest.EXISTS)) {
      writeTextFile(backupPath, rawExisting);
    }

    const parsed = rawExisting ? parseJsonc(rawExisting) ?? {} : {};
    const updated = buildUpdatedConfig(parsed, options, fastfetchDir, homeDir, chosenDirLogo);
    writeTextFile(configPath, JSON.stringify(updated, null, 2) + '\n');

    syncFastfetchCycleConfigs({
      homeDir,
      fastfetchDir,
      logoDir: options.settings.get_string('fastfetch-logo-directory').trim(),
      shouldCycle: options.settings.get_boolean('fastfetch-logo-cycle'),
      buildConfigForLogo: (logoPath) =>
        buildUpdatedConfig(parsed, options, fastfetchDir, homeDir, logoPath),
    });
  }
}
