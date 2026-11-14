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
}

export function writeGeneratedThemes(options: ThemeWriteOptions): void {
  const home = getHomeDirectory();
  const themeSuffix = options.isDark ? 'dark' : 'light';
  const themeName = `MeowterialYou-${themeSuffix}`;
  const dataDir = GLib.build_filenamev([options.extensionDir, 'data']);

  // 1. GNOME Shell Theme
  if (options.isShellThemeEnabled) {
    const shellTemplateName = options.isDark ? 'gnome-shell-dark.css' : 'gnome-shell.css';
    const shellTemplatePath = GLib.build_filenamev([dataDir, 'templates', shellTemplateName]);
    const shellRaw = readTextFile(shellTemplatePath);
    let shellCss = substituteTemplate(shellRaw, options.scheme, options.wallpaperPath);

    if (options.isTransparentPanelEnabled) {
      const addonName = options.isDark ? 'shell_dark.css' : 'shell_light.css';
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

    const themeLocations = [
      GLib.build_filenamev([home, '.themes', themeName, 'gnome-shell']),
      GLib.build_filenamev([home, '.local', 'share', 'themes', themeName, 'gnome-shell']),
    ];

    for (const location of themeLocations) {
      writeTextFile(GLib.build_filenamev([location, 'gnome-shell.css']), shellCss);
      const assetsSrc = GLib.build_filenamev([dataDir, 'assets', themeName, 'gnome-shell']);
      copyDirectoryRecursive(assetsSrc, location);
    }
  }

  // 2. GTK4 Theme (writes both gtk.css and gtk-dark.css for Chrome Wayland theming)
  if (options.isGtk4Enabled) {
    const gtk4TemplateName = options.isDark ? 'gtk4-dark.css' : 'gtk4.css';
    const gtk4TemplatePath = GLib.build_filenamev([dataDir, 'templates', gtk4TemplateName]);
    let gtk4Css = substituteTemplate(readTextFile(gtk4TemplatePath), options.scheme);

    if (options.isMacButtonsEnabled) {
      const macGtk4Addon = options.isDark ? 'gtk_dark.css' : 'gtk_light.css';
      const macPath = GLib.build_filenamev([dataDir, 'templates', 'addons', 'macbuttons', macGtk4Addon]);
      gtk4Css += '\n' + readTextFile(macPath);
    }

    const gtk4Targets = [
      GLib.build_filenamev([home, '.config', 'gtk-4.0', 'gtk.css']),
      GLib.build_filenamev([home, '.config', 'gtk-4.0', 'gtk-dark.css']),
      GLib.build_filenamev([home, '.local', 'share', 'themes', themeName, 'gtk-4.0', 'gtk.css']),
      GLib.build_filenamev([home, '.local', 'share', 'themes', themeName, 'gtk-4.0', 'gtk-dark.css']),
    ];

    for (const target of gtk4Targets) {
      writeTextFile(target, gtk4Css);
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

    const gtk3Targets = [
      GLib.build_filenamev([home, '.config', 'gtk-3.0', 'gtk.css']),
      GLib.build_filenamev([home, '.config', 'gtk-3.0', 'gtk-dark.css']),
      GLib.build_filenamev([home, '.local', 'share', 'themes', themeName, 'gtk-3.0', 'gtk.css']),
      GLib.build_filenamev([home, '.local', 'share', 'themes', themeName, 'gtk-3.0', 'gtk-dark.css']),
    ];

    for (const target of gtk3Targets) {
      writeTextFile(target, gtk3Css);
    }
  }
}
