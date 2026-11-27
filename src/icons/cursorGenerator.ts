/**
 * Material You dynamic Xcursor theme generator and async repacker.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { getTargetHomeDirectories } from '../theme/fileHelper.js';
import type { MaterialSchemeColors } from '../types/theme.js';
import {
  detectCurrentCursorTheme,
  MEOWTERIAL_CURSOR_THEME,
  resolveCursorThemeDir,
} from './cursorScanner.js';

export type CursorStyleMode = 'tinted-fill' | 'accent-fill' | 'accent-outline';

export interface CursorGenerateOptions {
  extensionDir: string;
  settings: Gio.Settings;
  scheme: MaterialSchemeColors;
  darkScheme: MaterialSchemeColors;
  baseCursorTheme: string;
  style: CursorStyleMode;
  runSync?: boolean;
}

function resolveCursorColors(
  scheme: MaterialSchemeColors,
  darkScheme: MaterialSchemeColors,
  style: CursorStyleMode
): { fillHex: string; outlineHex: string; preserveShadow: string } {
  if (style === 'accent-fill') {
    return { fillHex: scheme.primary, outlineHex: scheme.onPrimary, preserveShadow: '1' };
  }
  if (style === 'accent-outline') {
    return {
      fillHex: darkScheme.surfaceContainerLowest,
      outlineHex: scheme.primary,
      preserveShadow: '0',
    };
  }
  return {
    fillHex: darkScheme.primaryContainer,
    outlineHex: darkScheme.onPrimaryContainer,
    preserveShadow: '1',
  };
}

function applyAndPulseCursorTheme(fallbackTheme: string): void {
  const interfaceSettings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' });
  if (interfaceSettings.get_string('cursor-theme') === MEOWTERIAL_CURSOR_THEME) {
    const tempTheme = fallbackTheme || 'Adwaita';
    interfaceSettings.set_string('cursor-theme', tempTheme);
    Gio.Settings.sync();
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60, () => {
      interfaceSettings.set_string('cursor-theme', MEOWTERIAL_CURSOR_THEME);
      Gio.Settings.sync();
      return GLib.SOURCE_REMOVE;
    });
    return;
  }
  interfaceSettings.set_string('cursor-theme', MEOWTERIAL_CURSOR_THEME);
  Gio.Settings.sync();
}

export function resolveEffectiveBaseCursorTheme(settings: Gio.Settings): string {
  const configured = settings.get_string('base-cursor-theme').trim();
  if (configured && configured !== MEOWTERIAL_CURSOR_THEME && resolveCursorThemeDir(configured)) {
    return configured;
  }
  const detected = detectCurrentCursorTheme();
  if (detected) {
    settings.set_string('base-cursor-theme', detected);
  }
  return detected;
}

export function restoreOriginalCursorTheme(settings: Gio.Settings): void {
  const interfaceSettings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' });
  if (interfaceSettings.get_string('cursor-theme') !== MEOWTERIAL_CURSOR_THEME) return;

  const fallback = resolveEffectiveBaseCursorTheme(settings) || 'Adwaita';
  interfaceSettings.set_string('cursor-theme', fallback);
  Gio.Settings.sync();
}

export function generateThemedCursors(options: CursorGenerateOptions): void {
  const baseId = options.baseCursorTheme || resolveEffectiveBaseCursorTheme(options.settings);
  const srcDir = resolveCursorThemeDir(baseId);
  if (!srcDir) {
    console.warn(`MeowterialYou: Base cursor theme "${baseId}" not found`);
    return;
  }

  const scriptPath = GLib.build_filenamev([options.extensionDir, 'data', 'scripts', 'recolor_cursors.py']);
  if (!GLib.file_test(scriptPath, GLib.FileTest.EXISTS)) {
    console.warn(`MeowterialYou: Cursor recolor script missing at ${scriptPath}`);
    return;
  }

  const { fillHex, outlineHex, preserveShadow } = resolveCursorColors(options.scheme, options.darkScheme, options.style);

  for (const home of getTargetHomeDirectories()) {
    const destDir = GLib.build_filenamev([home, '.local', 'share', 'icons', MEOWTERIAL_CURSOR_THEME]);
    const argv = ['python3', scriptPath, srcDir, destDir, fillHex, outlineHex, preserveShadow];

    try {
      const proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDERR_PIPE);
      if (options.runSync) {
        proc.wait_check(null);
        applyAndPulseCursorTheme(baseId);
      } else {
        proc.wait_check_async(null, (_source, result) => {
          try {
            if (proc.wait_check_finish(result) && options.settings.get_boolean('themed-cursors-enabled')) {
              applyAndPulseCursorTheme(baseId);
            }
          } catch (error) {
            console.warn('MeowterialYou: Cursor repack failed', error);
          }
        });
      }
    } catch (error) {
      console.warn('MeowterialYou: Failed to spawn cursor repacker', error);
    }
  }
}

export interface CursorSyncOptions {
  extensionDir: string;
  settings: Gio.Settings;
  scheme: MaterialSchemeColors;
  darkScheme: MaterialSchemeColors;
  runSync?: boolean;
}

export function syncThemedCursors(options: CursorSyncOptions): void {
  const { extensionDir, settings, scheme, darkScheme, runSync } = options;
  if (!settings.get_boolean('themed-cursors-enabled')) {
    restoreOriginalCursorTheme(settings);
    return;
  }
  generateThemedCursors({
    extensionDir, settings, scheme, darkScheme, runSync,
    baseCursorTheme: resolveEffectiveBaseCursorTheme(settings),
    style: settings.get_string('themed-cursor-style') as CursorStyleMode,
  });
}
