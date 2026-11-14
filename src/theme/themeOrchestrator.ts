/**
 * Theme application orchestrator connecting extraction, generation, and system reload.
 */

import Gio from 'gi://Gio';
import { extractColorsFromWallpaper } from '../color/wallpaperExtractor.js';
import { generateMaterialScheme } from '../color/schemeGenerator.js';
import { writeGeneratedThemes } from './themeWriter.js';
import { applyGnomeSystemSettings } from './systemReload.js';
import { generateThemedIcons } from '../icons/iconGenerator.js';
import { getCurrentWallpaperPath } from '../wallpaper/wallpaperHelper.js';
import type { SchemeVariant, WindowButtonPosition } from '../types/theme.js';

export interface OrchestratorOptions {
  extensionDir: string;
  settings: Gio.Settings;
}

export class ThemeOrchestrator {
  private _extensionDir: string;
  private _settings: Gio.Settings;
  private _interfaceSettings: Gio.Settings;
  private _isApplying: boolean = false;

  constructor(options: OrchestratorOptions) {
    this._extensionDir = options.extensionDir;
    this._settings = options.settings;
    this._interfaceSettings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' });
  }

  isDarkMode(): boolean {
    const mode = this._settings.get_string('theme-mode');
    if (mode === 'dark') {
      return true;
    }
    if (mode === 'light') {
      return false;
    }
    const colorScheme = this._interfaceSettings.get_string('color-scheme');
    return colorScheme === 'prefer-dark';
  }

  async applyTheme(force: boolean = false): Promise<boolean> {
    if (this._isApplying || (!force && this._settings.get_boolean('paused'))) {
      return false;
    }

    this._isApplying = true;
    try {
      const isDark = this.isDarkMode();
      const wallpaperPath = getCurrentWallpaperPath(isDark);
      if (!wallpaperPath) {
        return false;
      }

      const extraction = await extractColorsFromWallpaper(wallpaperPath);
      const variant = this._settings.get_string('scheme-variant') as SchemeVariant;
      const scheme = generateMaterialScheme(extraction.seedArgb, isDark, variant);

      writeGeneratedThemes({
        extensionDir: this._extensionDir,
        scheme,
        isDark,
        wallpaperPath,
        isShellThemeEnabled: this._settings.get_boolean('shell-theme-enabled'),
        isGtk3Enabled: this._settings.get_boolean('gtk3-enabled'),
        isGtk4Enabled: this._settings.get_boolean('gtk4-enabled'),
        isMacButtonsEnabled: this._settings.get_string('window-button-style') === 'mac',
        isTransparentPanelEnabled: this._settings.get_boolean('transparent-panel'),
      });

      const position = this._settings.get_string('window-button-position') as WindowButtonPosition;
      applyGnomeSystemSettings(isDark, position);

      if (this._settings.get_boolean('themed-icons-enabled')) {
        generateThemedIcons({
          extensionDir: this._extensionDir,
          scheme,
          isDark,
          baseIconTheme: this._settings.get_string('base-icon-theme'),
        });
      }

      return true;
    } catch (error) {
      console.error('MeowterialYou: Failed to apply theme', error);
      return false;
    } finally {
      this._isApplying = false;
    }
  }
}
