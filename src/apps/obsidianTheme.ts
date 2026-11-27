/**
 * Material You theming and appearance sync for discovered Obsidian vaults.
 */

import GLib from 'gi://GLib';
import { convertHexToHlsTuple, convertHexToRgbTuple } from '../color/colorConverter.js';
import { getTargetHomeDirectories, readTextFile, writeTextFile } from '../theme/fileHelper.js';
import type { MaterialSchemeColors } from '../types/theme.js';
import { buildObsidianTokenMap } from './obsidianPalette.js';

export interface ObsidianApplyOptions {
  extensionDir: string;
  lightScheme: MaterialSchemeColors;
  darkScheme: MaterialSchemeColors;
  isDark: boolean;
}

const OBSIDIAN_THEME_NAME = 'MeowterialYou';
const OBSIDIAN_CONFIG_SUFFIXES: ReadonlyArray<string[]> = [
  ['.config', 'obsidian', 'obsidian.json'],
  ['.var', 'app', 'md.obsidian.Obsidian', 'config', 'obsidian', 'obsidian.json'],
  ['snap', 'obsidian', 'current', '.config', 'obsidian', 'obsidian.json'],
];

export function discoverObsidianVaults(): string[] {
  const vaults = new Set<string>();

  for (const homeDir of getTargetHomeDirectories()) {
    for (const segments of OBSIDIAN_CONFIG_SUFFIXES) {
      const configPath = GLib.build_filenamev([homeDir, ...segments]);
      if (!GLib.file_test(configPath, GLib.FileTest.EXISTS)) continue;

      try {
        const parsed: unknown = JSON.parse(readTextFile(configPath));
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) continue;
        const rawVaults = (parsed as Record<string, unknown>).vaults;
        if (typeof rawVaults !== 'object' || rawVaults === null || Array.isArray(rawVaults)) continue;

        for (const entry of Object.values(rawVaults as Record<string, unknown>)) {
          if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
          const vaultPath = (entry as Record<string, unknown>).path;
          if (typeof vaultPath === 'string' && GLib.file_test(vaultPath, GLib.FileTest.IS_DIR)) {
            vaults.add(vaultPath);
          }
        }
      } catch {
        // Ignore malformed obsidian.json
      }
    }
  }

  return Array.from(vaults);
}

function substituteObsidianTokens(
  content: string,
  tokens: MaterialSchemeColors,
  prefix: 'light' | 'dark'
): string {
  let result = content;
  const keys = Object.keys(tokens).sort((a, b) => b.length - a.length);

  for (const key of keys) {
    const hexValue = tokens[key];
    if (!hexValue || !hexValue.startsWith('#')) continue;

    const hexStripped = hexValue.slice(1);
    const [r, g, b] = convertHexToRgbTuple(hexValue);
    const [h, l, s] = convertHexToHlsTuple(hexValue);
    const token = `@${prefix}:${key}`;

    result = result.replaceAll(`${token}.hex`, hexValue);
    result = result.replaceAll(`${token}.rgb`, `${r}, ${g}, ${b}`);
    result = result.replaceAll(`${token}.hue`, String(h));
    result = result.replaceAll(`${token}.sat`, String(s));
    result = result.replaceAll(`${token}.light`, String(l));
    result = result.replaceAll(token, hexStripped);
  }

  return result;
}

function syncVaultAppearanceDefaults(vaultPath: string, accentHex: string): void {
  const appearancePath = GLib.build_filenamev([vaultPath, '.obsidian', 'appearance.json']);
  let current: Record<string, unknown> = {};

  if (GLib.file_test(appearancePath, GLib.FileTest.EXISTS)) {
    try {
      const parsed: unknown = JSON.parse(readTextFile(appearancePath));
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        current = parsed as Record<string, unknown>;
      }
    } catch {
      return;
    }
  }

  const nextCssTheme = typeof current.cssTheme === 'string' && current.cssTheme ? current.cssTheme : OBSIDIAN_THEME_NAME;
  const nextThemeMode = typeof current.theme === 'string' && current.theme ? current.theme : 'system';
  const nextAccent = nextCssTheme === OBSIDIAN_THEME_NAME ? accentHex : current.accentColor;

  if (current.cssTheme === nextCssTheme && current.theme === nextThemeMode && current.accentColor === nextAccent) {
    return;
  }

  const updated: Record<string, unknown> = { ...current, cssTheme: nextCssTheme, theme: nextThemeMode };
  if (typeof nextAccent === 'string') {
    updated.accentColor = nextAccent;
  }
  writeTextFile(appearancePath, `${JSON.stringify(updated, null, 2)}\n`);
}

export function applyObsidianThemes(options: ObsidianApplyOptions): void {
  const vaults = discoverObsidianVaults();
  if (vaults.length === 0) return;

  const obsidianTmplDir = GLib.build_filenamev([
    options.extensionDir,
    'data',
    'templates',
    'apps',
    'obsidian',
  ]);
  const cssPath = GLib.build_filenamev([obsidianTmplDir, 'theme.css']);
  const manifestPath = GLib.build_filenamev([obsidianTmplDir, 'manifest.json']);
  if (!GLib.file_test(cssPath, GLib.FileTest.EXISTS) || !GLib.file_test(manifestPath, GLib.FileTest.EXISTS)) {
    return;
  }

  const lightTokens = buildObsidianTokenMap(options.lightScheme, false);
  const darkTokens = buildObsidianTokenMap(options.darkScheme, true);
  let cssOutput = substituteObsidianTokens(readTextFile(cssPath), lightTokens, 'light');
  cssOutput = substituteObsidianTokens(cssOutput, darkTokens, 'dark');
  const manifestOutput = readTextFile(manifestPath);
  const activeAccentHex = options.isDark ? options.darkScheme.primary : options.lightScheme.primary;

  for (const vaultPath of vaults) {
    const themeDir = GLib.build_filenamev([vaultPath, '.obsidian', 'themes', OBSIDIAN_THEME_NAME]);
    writeTextFile(GLib.build_filenamev([themeDir, 'theme.css']), cssOutput);
    writeTextFile(GLib.build_filenamev([themeDir, 'manifest.json']), manifestOutput);
    syncVaultAppearanceDefaults(vaultPath, activeAccentHex);
  }
}
