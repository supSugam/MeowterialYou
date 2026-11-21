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
  darkScheme?: MaterialSchemeColors;
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

function loadMacAddon(dataDir: string, filename: string): string {
  const path = GLib.build_filenamev([dataDir, 'templates', 'addons', 'macbuttons', filename]);
  return GLib.file_test(path, GLib.FileTest.EXISTS) ? '\n' + readTextFile(path) : '';
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
  const darkScheme = options.darkScheme ?? options.scheme;

  // 1. GNOME Shell Theme
  if (options.isShellThemeEnabled) {
    const shellTemplateName = options.isDark ? 'gnome-shell-dark.css' : 'gnome-shell.css';
    const shellTemplatePath = GLib.build_filenamev([dataDir, 'templates', shellTemplateName]);
    const shellRaw = readTextFile(shellTemplatePath);
    let shellCss = substituteTemplate(shellRaw, options.scheme, options.wallpaperPath);

    if (options.isTransparentPanelEnabled) {
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
    const gtk4ActiveTemplate = options.isDark ? 'gtk4-dark.css' : 'gtk4.css';
    const gtk4ActivePath = GLib.build_filenamev([dataDir, 'templates', gtk4ActiveTemplate]);
    const gtk4DarkPath = GLib.build_filenamev([dataDir, 'templates', 'gtk4-dark.css']);

    const macActiveAddon = options.isMacButtonsEnabled
      ? loadMacAddon(dataDir, options.isDark ? 'gtk_dark.css' : 'gtk_light.css')
      : '';
    const macDarkAddon = options.isMacButtonsEnabled
      ? loadMacAddon(dataDir, 'gtk_dark.css')
      : '';

    const gtk4ActiveCss = substituteTemplate(readTextFile(gtk4ActivePath), options.scheme) + macActiveAddon;
    const gtk4DarkCss = substituteTemplate(readTextFile(gtk4DarkPath), darkScheme) + macDarkAddon;

    // In light mode, gtk.css is light and gtk-dark.css is dark. In dark mode, both are dark.
    writeTextFile(GLib.build_filenamev([home, '.config', 'gtk-4.0', 'gtk.css']), gtk4ActiveCss);
    writeTextFile(GLib.build_filenamev([home, '.config', 'gtk-4.0', 'gtk-dark.css']), gtk4DarkCss);

    // Chrome Wayland GTK4 theme
    const chromeTemplateName = options.isDark ? 'gtk_4_chrome_dark.css' : 'gtk_4_chrome_light.css';
    const chromePath = GLib.build_filenamev([dataDir, 'templates', 'addons', 'chrome_gtk4', chromeTemplateName]);
    if (GLib.file_test(chromePath, GLib.FileTest.EXISTS)) {
      const chromeCss = substituteTemplate(readTextFile(chromePath), options.scheme) + macActiveAddon;
      for (const base of themeBases) {
        const g4 = GLib.build_filenamev([base, 'gtk-4.0']);
        writeTextFile(GLib.build_filenamev([g4, 'gtk.css']), chromeCss);
        writeTextFile(GLib.build_filenamev([g4, 'gtk-dark.css']), chromeCss);
        copyDirectoryRecursive(gtkAssetsSrc, GLib.build_filenamev([g4, 'assets']));
      }
    }
  }

  // 3. GTK3 Theme (writes config override & theme folder)
  if (options.isGtk3Enabled) {
    const gtk3ActiveTemplate = options.isDark ? 'gtk3-dark.css' : 'gtk3.css';
    const gtk3ActivePath = GLib.build_filenamev([dataDir, 'templates', gtk3ActiveTemplate]);
    const gtk3DarkPath = GLib.build_filenamev([dataDir, 'templates', 'gtk3-dark.css']);

    const macGtk3Active = options.isMacButtonsEnabled
      ? loadMacAddon(dataDir, options.isDark ? 'gtk_3_dark.css' : 'gtk_3_light.css')
      : '';
    const macGtk3Dark = options.isMacButtonsEnabled
      ? loadMacAddon(dataDir, 'gtk_3_dark.css')
      : '';

    const gtk3ActiveCss = substituteTemplate(readTextFile(gtk3ActivePath), options.scheme) + macGtk3Active;
    const gtk3DarkCss = substituteTemplate(readTextFile(gtk3DarkPath), darkScheme) + macGtk3Dark;

    writeTextFile(GLib.build_filenamev([home, '.config', 'gtk-3.0', 'gtk.css']), gtk3ActiveCss);
    writeTextFile(GLib.build_filenamev([home, '.config', 'gtk-3.0', 'gtk-dark.css']), gtk3DarkCss);

    for (const base of themeBases) {
      const g3 = GLib.build_filenamev([base, 'gtk-3.0']);
      writeTextFile(GLib.build_filenamev([g3, 'gtk.css']), gtk3ActiveCss);
      writeTextFile(GLib.build_filenamev([g3, 'gtk-dark.css']), gtk3DarkCss);
      copyDirectoryRecursive(gtkAssetsSrc, GLib.build_filenamev([g3, 'assets']));
    }
  }
}
