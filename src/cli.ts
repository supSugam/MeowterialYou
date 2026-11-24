/**
 * Standalone CLI entry point to apply MeowterialYou theme synchronously.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { extractColorsFromWallpaper } from './color/wallpaperExtractor.js';
import { generateMaterialScheme } from './color/schemeGenerator.js';
import { writeGeneratedThemes } from './theme/themeWriter.js';
import { applyGnomeSystemSettings } from './theme/systemReload.js';
import { getCurrentWallpaperPath } from './wallpaper/wallpaperHelper.js';
import { getThemeCriteria, saveThemeCache } from './theme/themeCache.js';

function main(): void {
  const schemaSource = Gio.SettingsSchemaSource.get_default();
  let settings: Gio.Settings;
  if (schemaSource && schemaSource.lookup('org.gnome.shell.extensions.meowterialyou', true)) {
    settings = new Gio.Settings({ schema: 'org.gnome.shell.extensions.meowterialyou' });
  } else {
    const cwd = GLib.get_current_dir();
    const schemaPath = GLib.build_filenamev([cwd, 'schemas']);
    const source = Gio.SettingsSchemaSource.new_from_directory(schemaPath, null, false);
    const schema = source.lookup('org.gnome.shell.extensions.meowterialyou', false);
    if (!schema) {
      throw new Error('Could not find meowterialyou schema');
    }
    settings = new Gio.Settings({ settings_schema: schema });
  }

  const args = typeof ARGV !== 'undefined' ? (ARGV as string[]) : [];
  let isDark = settings.get_string('theme-mode') === 'dark';
  if (args.includes('light')) {
    isDark = false;
  } else if (args.includes('dark')) {
    isDark = true;
  }
  const wallpaperPath = getCurrentWallpaperPath(isDark);
  if (!wallpaperPath) {
    console.error('MeowterialYou CLI: No wallpaper found');
    return;
  }

  print(`Starting CLI: isDark=${isDark}, wallpaper=${wallpaperPath}`);
  const criteria = getThemeCriteria(settings, wallpaperPath, isDark);
  print('Extracting colors...');
  const extraction = extractColorsFromWallpaper(wallpaperPath);
  print(`Extracted seed: ${extraction.seedArgb}`);
  const { seedArgb, isTopDark } = extraction;

  const lightScheme = generateMaterialScheme(seedArgb, false, criteria.variant, isTopDark);
  const darkScheme = generateMaterialScheme(seedArgb, true, criteria.variant, isTopDark);
  const scheme = isDark ? darkScheme : lightScheme;

  const scriptPath = GLib.path_get_dirname(import.meta.url.replace('file://', ''));
  const extDir = GLib.path_get_dirname(scriptPath);

  writeGeneratedThemes({
    extensionDir: extDir,
    scheme,
    lightScheme,
    darkScheme,
    isDark,
    wallpaperPath,
    isTopDark,
    isShellThemeEnabled: settings.get_boolean('shell-theme-enabled'),
    isGtk3Enabled: settings.get_boolean('gtk3-enabled'),
    isGtk4Enabled: settings.get_boolean('gtk4-enabled'),
    isMacButtonsEnabled: criteria.windowButtonStyle === 'mac',
    isTransparentPanelEnabled: criteria.transparentPanel,
  });

  applyGnomeSystemSettings(isDark, criteria.windowButtonPosition, true);
  saveThemeCache({ ...criteria, ...extraction });
  print(`Applied MeowterialYou theme (${isDark ? 'dark' : 'light'})`);
}

try {
  main();
} catch (err: unknown) {
  print(`MeowterialYou CLI error: ${String(err)}`);
}
