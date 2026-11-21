/**
 * Theme generator and file writer for GNOME Shell, GTK3, and GTK4.
 */

import GLib from 'gi://GLib';
import {
  copyDirectoryRecursive,
  deleteFile,
  getTargetHomeDirectories,
  readTextFile,
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

const MAC_DARK_OVERRIDE = `
@media (prefers-color-scheme: dark) {
  windowcontrols > button.minimize:backdrop:not(.suggested-action):not(.destructive-action) > image,
  windowcontrols > button.maximize:backdrop:not(.suggested-action):not(.destructive-action) > image,
  windowcontrols > button.close:backdrop:not(.suggested-action):not(.destructive-action) > image {
    background-color: rgba(250, 244, 237, 0.3);
  }
  button.titlebutton:backdrop:not(.suggested-action):not(.destructive-action) {
    background-color: rgba(250, 244, 237, 0.3);
  }
}`;

export function writeGeneratedThemes(options: ThemeWriteOptions): void {
  const themeSuffix = options.isDark ? 'dark' : 'light';
  const themeName = `MeowterialYou-${themeSuffix}`;
  const dataDir = GLib.build_filenamev([options.extensionDir, 'data']);
  const themeBases: string[] = [];
  for (const dir of getTargetHomeDirectories()) {
    themeBases.push(GLib.build_filenamev([dir, '.local', 'share', 'themes', themeName]));
    themeBases.push(GLib.build_filenamev([dir, '.themes', themeName]));
  }
  const gtkAssetsSrc = GLib.build_filenamev([dataDir, 'assets', themeName, 'gtk-3.0', 'assets']);

  // 1. GNOME Shell Theme
  if (options.isShellThemeEnabled) {
    const shellTemplate = options.isDark ? 'gnome-shell-dark.css' : 'gnome-shell.css';
    const shellRaw = readTextFile(GLib.build_filenamev([dataDir, 'templates', shellTemplate]));
    let shellCss = substituteTemplate(shellRaw, options.scheme, options.wallpaperPath);

    if (options.isTransparentPanelEnabled) {
      const isPanelDark = options.isTopDark ?? options.isDark;
      const addon = isPanelDark ? 'shell_dark.css' : 'shell_light.css';
      const addonPath = GLib.build_filenamev([dataDir, 'templates', 'addons', 'transparent_panel', addon]);
      if (GLib.file_test(addonPath, GLib.FileTest.EXISTS)) {
        shellCss += '\n' + substituteTemplate(readTextFile(addonPath), options.scheme, options.wallpaperPath);
      }
    }

    const shellAssetsSrc = GLib.build_filenamev([dataDir, 'assets', themeName, 'gnome-shell']);
    for (const base of themeBases) {
      const shellDir = GLib.build_filenamev([base, 'gnome-shell']);
      writeTextFile(GLib.build_filenamev([shellDir, 'gnome-shell.css']), shellCss);
      copyDirectoryRecursive(shellAssetsSrc, shellDir);
    }
  }

  // 2. GTK4 Theme (unified light + dark prefers-color-scheme stylesheet)
  if (options.isGtk4Enabled) {
    const gtk4Raw = readTextFile(GLib.build_filenamev([dataDir, 'templates', 'gtk4.css']));
    let gtk4Css = substituteTemplate(gtk4Raw, options.lightScheme, '', 'light');
    gtk4Css = substituteTemplate(gtk4Css, options.darkScheme, '', 'dark');

    if (options.isMacButtonsEnabled) {
      gtk4Css += loadMacAddon(dataDir, 'gtk_light.css') + MAC_DARK_OVERRIDE;
    }

    for (const targetDir of getTargetHomeDirectories()) {
      const g4Dir = GLib.build_filenamev([targetDir, '.config', 'gtk-4.0']);
      writeTextFile(GLib.build_filenamev([g4Dir, 'gtk.css']), gtk4Css);
      deleteFile(GLib.build_filenamev([g4Dir, 'gtk-dark.css']));
    }

    const chromeTmpl = options.isDark ? 'gtk_4_chrome_dark.css' : 'gtk_4_chrome_light.css';
    const chromePath = GLib.build_filenamev([dataDir, 'templates', 'addons', 'chrome_gtk4', chromeTmpl]);
    if (GLib.file_test(chromePath, GLib.FileTest.EXISTS)) {
      const macAddon = options.isMacButtonsEnabled ? loadMacAddon(dataDir, options.isDark ? 'gtk_dark.css' : 'gtk_light.css') : '';
      const chromeCss = substituteTemplate(readTextFile(chromePath), options.scheme) + macAddon;
      for (const base of themeBases) {
        const g4 = GLib.build_filenamev([base, 'gtk-4.0']);
        writeTextFile(GLib.build_filenamev([g4, 'gtk.css']), chromeCss);
        writeTextFile(GLib.build_filenamev([g4, 'gtk-dark.css']), chromeCss);
        copyDirectoryRecursive(gtkAssetsSrc, GLib.build_filenamev([g4, 'assets']));
      }
    }
  }

  // 3. GTK3 Theme (light gtk.css and dark gtk-dark.css)
  if (options.isGtk3Enabled) {
    const g3LightRaw = readTextFile(GLib.build_filenamev([dataDir, 'templates', 'gtk3.css']));
    const g3DarkRaw = readTextFile(GLib.build_filenamev([dataDir, 'templates', 'gtk3-dark.css']));
    const macLight = options.isMacButtonsEnabled ? loadMacAddon(dataDir, 'gtk_3_light.css') : '';
    const macDark = options.isMacButtonsEnabled ? loadMacAddon(dataDir, 'gtk_3_dark.css') : '';
    const g3LightCss = substituteTemplate(g3LightRaw, options.lightScheme) + macLight;
    const g3DarkCss = substituteTemplate(g3DarkRaw, options.darkScheme) + macDark;

    for (const targetDir of getTargetHomeDirectories()) {
      const g3Dir = GLib.build_filenamev([targetDir, '.config', 'gtk-3.0']);
      writeTextFile(GLib.build_filenamev([g3Dir, 'gtk.css']), g3LightCss);
      writeTextFile(GLib.build_filenamev([g3Dir, 'gtk-dark.css']), g3DarkCss);
    }

    for (const base of themeBases) {
      const g3 = GLib.build_filenamev([base, 'gtk-3.0']);
      const activeCss = options.isDark ? g3DarkCss : g3LightCss;
      writeTextFile(GLib.build_filenamev([g3, 'gtk.css']), activeCss);
      writeTextFile(GLib.build_filenamev([g3, 'gtk-dark.css']), activeCss);
      copyDirectoryRecursive(gtkAssetsSrc, GLib.build_filenamev([g3, 'assets']));
    }
  }
}
