/**
 * Material You theme extension generation and mode sync for VS Code & verified forks.
 */

import GLib from 'gi://GLib';
import { readTextFile, writeTextFile } from '../theme/fileHelper.js';
import { substituteTemplate } from '../theme/templateEngine.js';
import { parseJsonc, updateJsoncProperties } from './jsoncHelper.js';
import { discoverVerifiedVscodeEditors } from './vscodeForks.js';
import type { MaterialSchemeColors } from '../types/theme.js';

const EXTENSION_FOLDER = 'meowterialyou-theme';
const DARK_THEME_LABEL = 'MeowterialYou Dark';
const LIGHT_THEME_LABEL = 'MeowterialYou Light';

export interface VscodeApplyOptions {
  extensionDir: string;
  lightScheme: MaterialSchemeColors;
  darkScheme: MaterialSchemeColors;
}

export function applyVscodeThemes(options: VscodeApplyOptions): void {
  const editors = discoverVerifiedVscodeEditors();
  if (editors.length === 0) return;

  const vscodeTemplatesDir = GLib.build_filenamev([
    options.extensionDir,
    'data',
    'templates',
    'apps',
    'vscode',
  ]);
  const pkgPath = GLib.build_filenamev([vscodeTemplatesDir, 'package.json']);
  const darkTmplPath = GLib.build_filenamev([
    vscodeTemplatesDir,
    'themes',
    'meowterialyou-dark-color-theme.json',
  ]);
  const lightTmplPath = GLib.build_filenamev([
    vscodeTemplatesDir,
    'themes',
    'meowterialyou-light-color-theme.json',
  ]);

  if (
    !GLib.file_test(pkgPath, GLib.FileTest.EXISTS) ||
    !GLib.file_test(darkTmplPath, GLib.FileTest.EXISTS) ||
    !GLib.file_test(lightTmplPath, GLib.FileTest.EXISTS)
  ) {
    console.warn('MeowterialYou: VS Code templates missing under data/templates/apps/vscode');
    return;
  }

  const packageJson = readTextFile(pkgPath);
  const darkThemeJson = substituteTemplate(readTextFile(darkTmplPath), options.darkScheme, {
    alphaFormat: 'hex8',
  });
  const lightThemeJson = substituteTemplate(readTextFile(lightTmplPath), options.lightScheme, {
    alphaFormat: 'hex8',
  });

  const writtenExtensionDirs = new Set<string>();
  for (const editor of editors) {
    if (!writtenExtensionDirs.has(editor.extensionsDir)) {
      writtenExtensionDirs.add(editor.extensionsDir);
      const targetRoot = GLib.build_filenamev([editor.extensionsDir, EXTENSION_FOLDER]);
      writeTextFile(GLib.build_filenamev([targetRoot, 'package.json']), packageJson);
      writeTextFile(
        GLib.build_filenamev([targetRoot, 'themes', 'meowterialyou-dark-color-theme.json']),
        darkThemeJson
      );
      writeTextFile(
        GLib.build_filenamev([targetRoot, 'themes', 'meowterialyou-light-color-theme.json']),
        lightThemeJson
      );
    }

    ensureEditorThemeDefaults(editor.settingsFile);
  }
}

function ensureEditorThemeDefaults(settingsFile: string): void {
  try {
    const existing = GLib.file_test(settingsFile, GLib.FileTest.EXISTS)
      ? readTextFile(settingsFile)
      : '{\n}\n';
    const parsed = parseJsonc(existing);
    if (!parsed) return;

    const updates: Record<string, string | boolean> = {};
    if (parsed['window.autoDetectColorScheme'] === undefined) {
      updates['window.autoDetectColorScheme'] = true;
    }
    if (parsed['workbench.preferredDarkColorTheme'] === undefined) {
      updates['workbench.preferredDarkColorTheme'] = DARK_THEME_LABEL;
    }
    if (parsed['workbench.preferredLightColorTheme'] === undefined) {
      updates['workbench.preferredLightColorTheme'] = LIGHT_THEME_LABEL;
    }
    if (parsed['workbench.colorTheme'] === undefined) {
      updates['workbench.colorTheme'] = DARK_THEME_LABEL;
    }

    if (Object.keys(updates).length === 0) return;
    const updated = updateJsoncProperties(existing, updates);
    if (updated !== existing) {
      writeTextFile(settingsFile, updated);
    }
  } catch (error) {
    console.warn(`MeowterialYou: Could not update settings at ${settingsFile}`, error);
  }
}
