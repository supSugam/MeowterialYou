/**
 * Theme generator and file writer for GNOME Shell, GTK3, and GTK4.
 */

import GLib from 'gi://GLib';
import {
  copyDirectoryRecursive,
  getHomeDirectory,
  readTextFile,
  writeTextFile,
} from './fileHelper.js';
import { substituteTemplate } from './templateEngine.js';
import type { MaterialSchemeColors } from '../types/theme.js';

export interface ThemeWriteOptions {
  extensionDir: string;
  scheme: MaterialSchemeColors;
  isDark: boolean;
  wallpaperPath: string;
  isShellThemeEnabled: boolean;
  isGtk3Enabled: boolean;
  isGtk4Enabled: boolean;
  isMacButtonsEnabled: boolean;
  isTransparentPanelEnabled: boolean;
  /** Wallpaper brightness under the panel — drives transparent panel overlay colors,
   *  independent of the GNOME theme mode. Falls back to `isDark` when not provided. */
  isTopDark?: boolean;
}

export function writeGeneratedThemes(options: ThemeWriteOptions): void {
  const home = getHomeDirectory();
  const themeSuffix = options.isDark ? 'dark' : 'light';
  const themeName = `MeowterialYou-${themeSuffix}`;
  const dataDir = GLib.build_filenamev([options.extensionDir, 'data']);
  const themeBases = [
    GLib.build_filenamev([home, '.local', 'share', 'themes', themeName]),
    GLib.build_filenamev([home, '.themes', themeName]),
  ];
  const gtkAssetsSrc = GLib.build_filenamev([dataDir, 'assets', themeName, 'gtk-3.0', 'assets']);

  // 1. GNOME Shell Theme
  if (options.isShellThemeEnabled) {
    const shellTemplateName = options.isDark ? 'gnome-shell-dark.css' : 'gnome-shell.css';
    const shellTemplatePath = GLib.build_filenamev([dataDir, 'templates', shellTemplateName]);
    const shellRaw = readTextFile(shellTemplatePath);
    let shellCss = substituteTemplate(shellRaw, options.scheme, options.wallpaperPath);

    if (options.isTransparentPanelEnabled) {
      // Use wallpaper brightness (not GNOME theme mode) to pick overlay colors.
      // e.g. light theme + dark wallpaper → shell_dark.css (white borders/icons).
      const isPanelRegionDark = options.isTopDark ?? options.isDark;
      const addonName = isPanelRegionDark ? 'shell_dark.css' : 'shell_light.css';
      const addonPath = GLib.build_filenamev([
        dataDir,
        'templates',
        'addons',
        'transparent_panel',
        addonName,
      ]);
      if (GLib.file_test(addonPath, GLib.FileTest.EXISTS)) {
        const addonRaw = readTextFile(addonPath);
        shellCss += '\n' + substituteTemplate(addonRaw, options.scheme, options.wallpaperPath);
      }
    }

    const shellAssetsSrc = GLib.build_filenamev([dataDir, 'assets', themeName, 'gnome-shell']);
    for (const base of themeBases) {
      const shellDir = GLib.build_filenamev([base, 'gnome-shell']);
      writeTextFile(GLib.build_filenamev([shellDir, 'gnome-shell.css']), shellCss);
      copyDirectoryRecursive(shellAssetsSrc, shellDir);
    }
  }

  // 2. GTK4 Theme (writes config override for Libadwaita & theme folder for Chrome Wayland)
  if (options.isGtk4Enabled) {
    const gtk4TemplateName = options.isDark ? 'gtk4-dark.css' : 'gtk4.css';
    const gtk4TemplatePath = GLib.build_filenamev([dataDir, 'templates', gtk4TemplateName]);
    let gtk4Css = substituteTemplate(readTextFile(gtk4TemplatePath), options.scheme);

    if (options.isMacButtonsEnabled) {
      const macAddon = options.isDark ? 'gtk_dark.css' : 'gtk_light.css';
      const macPath = GLib.build_filenamev([dataDir, 'templates', 'addons', 'macbuttons', macAddon]);
      if (GLib.file_test(macPath, GLib.FileTest.EXISTS)) {
        gtk4Css += '\n' + readTextFile(macPath);
      }
    }

    // Libadwaita config override — applies to all native GTK4/Libadwaita apps
    writeTextFile(GLib.build_filenamev([home, '.config', 'gtk-4.0', 'gtk.css']), gtk4Css);
    writeTextFile(GLib.build_filenamev([home, '.config', 'gtk-4.0', 'gtk-dark.css']), gtk4Css);

    // Chrome Wayland GTK4 theme from original addon template
    const chromeTemplateName = options.isDark ? 'gtk_4_chrome_dark.css' : 'gtk_4_chrome_light.css';
    const chromePath = GLib.build_filenamev([dataDir, 'templates', 'addons', 'chrome_gtk4', chromeTemplateName]);
    if (GLib.file_test(chromePath, GLib.FileTest.EXISTS)) {
      let chromeCss = substituteTemplate(readTextFile(chromePath), options.scheme);
      if (options.isMacButtonsEnabled) {
        const macAddon = options.isDark ? 'gtk_dark.css' : 'gtk_light.css';
        const macPath = GLib.build_filenamev([dataDir, 'templates', 'addons', 'macbuttons', macAddon]);
        if (GLib.file_test(macPath, GLib.FileTest.EXISTS)) {
          chromeCss += '\n' + readTextFile(macPath);
        }
      }

      for (const base of themeBases) {
        const g4 = GLib.build_filenamev([base, 'gtk-4.0']);
        writeTextFile(GLib.build_filenamev([g4, 'gtk.css']), chromeCss);
        writeTextFile(GLib.build_filenamev([g4, 'gtk-dark.css']), chromeCss);
        copyDirectoryRecursive(gtkAssetsSrc, GLib.build_filenamev([g4, 'assets']));
      }
    }
  }

  // 3. GTK3 Theme (writes both gtk.css and gtk-dark.css)
  if (options.isGtk3Enabled) {
    const gtk3TemplateName = options.isDark ? 'gtk3-dark.css' : 'gtk3.css';
    const gtk3TemplatePath = GLib.build_filenamev([dataDir, 'templates', gtk3TemplateName]);
    let gtk3Css = substituteTemplate(readTextFile(gtk3TemplatePath), options.scheme);

    if (options.isMacButtonsEnabled) {
      const macGtk3Addon = options.isDark ? 'gtk_3_dark.css' : 'gtk_3_light.css';
      const macPath = GLib.build_filenamev([dataDir, 'templates', 'addons', 'macbuttons', macGtk3Addon]);
      gtk3Css += '\n' + readTextFile(macPath);
    }

    writeTextFile(GLib.build_filenamev([home, '.config', 'gtk-3.0', 'gtk.css']), gtk3Css);
    writeTextFile(GLib.build_filenamev([home, '.config', 'gtk-3.0', 'gtk-dark.css']), gtk3Css);

    for (const base of themeBases) {
      const g3 = GLib.build_filenamev([base, 'gtk-3.0']);
      writeTextFile(GLib.build_filenamev([g3, 'gtk.css']), gtk3Css);
      writeTextFile(GLib.build_filenamev([g3, 'gtk-dark.css']), gtk3Css);
      copyDirectoryRecursive(gtkAssetsSrc, GLib.build_filenamev([g3, 'assets']));
    }
  }
}
