/**
 * Material You theming for GNOME Terminal and GNOME Console (kgx).
 */

import Gio from 'gi://Gio';
import { calculateTerminalTransparency, getTerminalAnsiPalette } from './terminalPalette.js';
import type { MaterialSchemeColors, WallpaperImageStats } from '../types/theme.js';

export interface TerminalApplyOptions {
  scheme: MaterialSchemeColors;
  isDark: boolean;
  imageStats?: WallpaperImageStats;
}

export function applyTerminalThemes(options: TerminalApplyOptions): void {
  const schemaSource = Gio.SettingsSchemaSource.get_default();
  if (!schemaSource) return;

  applyGnomeTerminalTheme(schemaSource, options);
  applyGnomeConsoleTheme(schemaSource, options.isDark);
}

function applyGnomeTerminalTheme(
  schemaSource: Gio.SettingsSchemaSource,
  options: TerminalApplyOptions
): void {
  const listSchema = schemaSource.lookup('org.gnome.Terminal.ProfilesList', true);
  const profileSchema = schemaSource.lookup('org.gnome.Terminal.Legacy.Profile', true);
  if (!listSchema || !profileSchema) return;

  try {
    const profilesList = new Gio.Settings({ settings_schema: listSchema });
    const uuid = profilesList.get_string('default');
    if (!uuid) return;

    const profilePath = `/org/gnome/terminal/legacy/profiles:/:${uuid}/`;
    const profile = new Gio.Settings({ settings_schema: profileSchema, path: profilePath });
    const { scheme, isDark } = options;

    const background = scheme.surface || (isDark ? '#1a1c1a' : '#fdfdf5');
    const foreground = scheme.onSurface || (isDark ? '#e2e2e6' : '#1a1c18');
    const transparency = calculateTerminalTransparency(options);

    profile.set_boolean('use-theme-colors', false);
    profile.set_string('background-color', background);
    profile.set_string('foreground-color', foreground);
    profile.set_boolean('bold-color-same-as-fg', false);
    profile.set_string('bold-color', scheme.primary || foreground);
    profile.set_boolean('cursor-colors-set', true);
    profile.set_string('cursor-background-color', scheme.primary || foreground);
    profile.set_string('cursor-foreground-color', scheme.onPrimary || background);
    profile.set_boolean('highlight-colors-set', true);
    profile.set_string('highlight-background-color', scheme.primaryContainer || foreground);
    profile.set_string('highlight-foreground-color', scheme.onPrimaryContainer || background);
    profile.set_strv('palette', getTerminalAnsiPalette({ scheme, isDark }));

    if (profileSchema.has_key('use-transparent-background')) {
      profile.set_boolean('use-transparent-background', true);
    }
    if (profileSchema.has_key('background-transparency-percent')) {
      profile.set_int('background-transparency-percent', transparency);
    }
    Gio.Settings.sync();
  } catch (error) {
    console.warn('MeowterialYou: Failed to apply GNOME Terminal theme', error);
  }
}

function applyGnomeConsoleTheme(schemaSource: Gio.SettingsSchemaSource, isDark: boolean): void {
  const consoleSchema = schemaSource.lookup('org.gnome.Console', true);
  if (!consoleSchema || !consoleSchema.has_key('theme')) return;

  try {
    const consoleSettings = new Gio.Settings({ settings_schema: consoleSchema });
    const targetTheme = isDark ? 'night' : 'day';
    if (consoleSettings.get_string('theme') !== targetTheme) {
      consoleSettings.set_string('theme', targetTheme);
      Gio.Settings.sync();
    }
  } catch (error) {
    console.warn('MeowterialYou: Failed to sync GNOME Console theme', error);
  }
}
