/**
 * Theme generator and file writer for GNOME Shell, GTK3, and GTK4.
 */

import GLib from 'gi://GLib';
import {
  copyDirectoryRecursive,
  getTargetHomeDirectories,
  readTextFile,
  updateGtkSettingsIni,
  writeTextFile,
} from './fileHelper.js';
import { substituteTemplate } from './templateEngine.js';
import type { MaterialSchemeColors } from '../types/theme.js';

export interface ThemeWriteOptions {
  extensionDir: string;
  scheme: MaterialSchemeColors;
  lightScheme: MaterialSchemeColors;
  darkScheme: MaterialSchemeColors;
  isDark: boolean;
  wallpaperPath: string;
  isShellThemeEnabled: boolean;
  isGtk3Enabled: boolean;
  isGtk4Enabled: boolean;
  isMacButtonsEnabled: boolean;
  isTransparentPanelEnabled: boolean;
  isTopDark?: boolean;
}

function loadMacAddon(dataDir: string, filename: string): string {
  const path = GLib.build_filenamev([dataDir, 'templates', 'addons', 'macbuttons', filename]);
  return GLib.file_test(path, GLib.FileTest.EXISTS) ? '\n' + readTextFile(path) : '';
}

export function writeGeneratedThemes(options: ThemeWriteOptions): void {
  const themeSuffix = options.isDark ? 'dark' : 'light';
  const themeName = `MeowterialYou-${themeSuffix}`;
  const dataDir = GLib.build_filenamev([options.extensionDir, 'data']);
  const themeBases: string[] = [];
  for (const dir of getTargetHomeDirectories()) {
    themeBases.push(GLib.build_filenamev([dir, '.local', 'share', 'themes', themeName]));
    themeBases.push(GLib.build_filenamev([dir, '.themes', themeName]));
    themeBases.push(GLib.build_filenamev([dir, '.local', 'share', 'themes', 'MeowterialYou']));
    themeBases.push(GLib.build_filenamev([dir, '.themes', 'MeowterialYou']));
  }
  const gtkAssetsSrc = GLib.build_filenamev([dataDir, 'assets', themeName, 'gtk-3.0', 'assets']);

  // 1. GNOME Shell Theme
  if (options.isShellThemeEnabled) {
    const shellTemplate = options.isDark ? 'gnome-shell-dark.css' : 'gnome-shell.css';
    const shellRaw = readTextFile(GLib.build_filenamev([dataDir, 'templates', shellTemplate]));
    let shellCss = substituteTemplate(shellRaw, options.scheme, { wallpaperPath: options.wallpaperPath });

    if (options.isTransparentPanelEnabled) {
      const isPanelDark = options.isTopDark ?? options.isDark;
      const addon = isPanelDark ? 'shell_dark.css' : 'shell_light.css';
      const addonPath = GLib.build_filenamev([dataDir, 'templates', 'addons', 'transparent_panel', addon]);
      if (GLib.file_test(addonPath, GLib.FileTest.EXISTS)) {
        shellCss +=
          '\n' +
          substituteTemplate(readTextFile(addonPath), options.scheme, { wallpaperPath: options.wallpaperPath });
      }
    }

    const shellAssetsSrc = GLib.build_filenamev([dataDir, 'assets', themeName, 'gnome-shell']);
    for (const base of themeBases) {
      const shellDir = GLib.build_filenamev([base, 'gnome-shell']);
      writeTextFile(GLib.build_filenamev([shellDir, 'gnome-shell.css']), shellCss);
      copyDirectoryRecursive(shellAssetsSrc, shellDir);
    }
  }

  // 2. GTK4 Theme (unified mode-matching stylesheets)
  if (options.isGtk4Enabled) {
    const g4LightRaw = readTextFile(GLib.build_filenamev([dataDir, 'templates', 'gtk4.css']));
    const g4DarkRaw = readTextFile(GLib.build_filenamev([dataDir, 'templates', 'gtk4-dark.css']));
    const macLight = options.isMacButtonsEnabled ? loadMacAddon(dataDir, 'gtk_light.css') : '';
    const macDark = options.isMacButtonsEnabled ? loadMacAddon(dataDir, 'gtk_dark.css') : '';
    let g4LightCss = substituteTemplate(g4LightRaw, options.lightScheme, { prefix: 'light' });
    g4LightCss = substituteTemplate(g4LightCss, options.lightScheme) + macLight;
    let g4DarkCss = substituteTemplate(g4DarkRaw, options.darkScheme, { prefix: 'dark' });
    g4DarkCss = substituteTemplate(g4DarkCss, options.darkScheme) + macDark;
    const activeG4Css = options.isDark ? g4DarkCss : g4LightCss;

    for (const targetDir of getTargetHomeDirectories()) {
      const g4Dir = GLib.build_filenamev([targetDir, '.config', 'gtk-4.0']);
      writeTextFile(GLib.build_filenamev([g4Dir, 'gtk.css']), activeG4Css);
      writeTextFile(GLib.build_filenamev([g4Dir, 'gtk-dark.css']), g4DarkCss);
      updateGtkSettingsIni(GLib.build_filenamev([g4Dir, 'settings.ini']), themeName);
    }

    const chromeTmpl = options.isDark ? 'gtk_4_chrome_dark.css' : 'gtk_4_chrome_light.css';
    const chromePath = GLib.build_filenamev([dataDir, 'templates', 'addons', 'chrome_gtk4', chromeTmpl]);
    if (GLib.file_test(chromePath, GLib.FileTest.EXISTS)) {
      const macChrome = options.isMacButtonsEnabled ? (options.isDark ? macDark : macLight) : '';
      const chromeCss = substituteTemplate(readTextFile(chromePath), options.scheme) + macChrome;
      for (const base of themeBases) {
        const g4 = GLib.build_filenamev([base, 'gtk-4.0']);
        writeTextFile(GLib.build_filenamev([g4, 'gtk.css']), chromeCss);
        writeTextFile(GLib.build_filenamev([g4, 'gtk-dark.css']), chromeCss);
        copyDirectoryRecursive(gtkAssetsSrc, GLib.build_filenamev([g4, 'assets']));
      }
    }
  }

  // 3. GTK3 Theme (unified mode-matching stylesheets)
  if (options.isGtk3Enabled) {
    const g3LightRaw = readTextFile(GLib.build_filenamev([dataDir, 'templates', 'gtk3.css']));
    const g3DarkRaw = readTextFile(GLib.build_filenamev([dataDir, 'templates', 'gtk3-dark.css']));
    const macLight = options.isMacButtonsEnabled ? loadMacAddon(dataDir, 'gtk_3_light.css') : '';
    const macDark = options.isMacButtonsEnabled ? loadMacAddon(dataDir, 'gtk_3_dark.css') : '';
    const g3LightCss = substituteTemplate(g3LightRaw, options.lightScheme) + macLight;
    const g3DarkCss = substituteTemplate(g3DarkRaw, options.darkScheme) + macDark;
    const activeG3Css = options.isDark ? g3DarkCss : g3LightCss;

    for (const targetDir of getTargetHomeDirectories()) {
      const g3Dir = GLib.build_filenamev([targetDir, '.config', 'gtk-3.0']);
      writeTextFile(GLib.build_filenamev([g3Dir, 'gtk.css']), activeG3Css);
      writeTextFile(GLib.build_filenamev([g3Dir, 'gtk-dark.css']), g3DarkCss);
      updateGtkSettingsIni(GLib.build_filenamev([g3Dir, 'settings.ini']), themeName, options.isDark);
    }

    for (const base of themeBases) {
      const g3 = GLib.build_filenamev([base, 'gtk-3.0']);
      writeTextFile(GLib.build_filenamev([g3, 'gtk.css']), activeG3Css);
      writeTextFile(GLib.build_filenamev([g3, 'gtk-dark.css']), activeG3Css);
      copyDirectoryRecursive(gtkAssetsSrc, GLib.build_filenamev([g3, 'assets']));
    }
  }
}
