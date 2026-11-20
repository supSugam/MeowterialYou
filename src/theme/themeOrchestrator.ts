/**
 * Theme application orchestrator connecting extraction, generation, and system reload.
 */

import Gio from 'gi://Gio';
import { extractColorsFromWallpaper, type ExtractionResult } from '../color/wallpaperExtractor.js';
import { generateMaterialScheme } from '../color/schemeGenerator.js';
import { writeGeneratedThemes } from './themeWriter.js';
import { applyGnomeSystemSettings } from './systemReload.js';
import { generateThemedIcons } from '../icons/iconGenerator.js';
import { getCurrentWallpaperPath } from '../wallpaper/wallpaperHelper.js';
import type { SchemeVariant, WindowButtonPosition } from '../types/theme.js';

export interface OrchestratorOptions {
  extensionDir: string;
  settings: Gio.Settings;
  onExtractionCompleted?: (extraction: ExtractionResult, isDark: boolean) => void;
}

export class ThemeOrchestrator {
  private _extensionDir: string;
  private _settings: Gio.Settings;
  private _interfaceSettings: Gio.Settings;
  private _onExtractionCompleted?: (extraction: ExtractionResult, isDark: boolean) => void;
  private _isApplying: boolean = false;
  private _systemSignalId: number | null = null;

  constructor(options: OrchestratorOptions) {
    this._extensionDir = options.extensionDir;
    this._settings = options.settings;
    this._onExtractionCompleted = options.onExtractionCompleted;
    this._interfaceSettings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' });
  }

  connectSystemModeListener(onModeChanged: () => void): void {
    this.disconnectSystemModeListener();
    this._systemSignalId = this._interfaceSettings.connect('changed::color-scheme', () => {
      const isSystemDark = this._interfaceSettings.get_string('color-scheme') === 'prefer-dark';
      const currentApplierDark = this.isDarkMode();
      if (isSystemDark === currentApplierDark) {
        return;
      }

      this._settings.set_string('theme-mode', isSystemDark ? 'dark' : 'light');
      onModeChanged();
    });
  }

  disconnectSystemModeListener(): void {
    if (this._systemSignalId !== null) {
      this._interfaceSettings.disconnect(this._systemSignalId);
      this._systemSignalId = null;
    }
  }

  destroy(): void {
    this.disconnectSystemModeListener();
  }

  isDarkMode(): boolean {
    return this._settings.get_string('theme-mode') === 'dark';
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
      this._onExtractionCompleted?.(extraction, isDark);
      const variant = this._settings.get_string('scheme-variant') as SchemeVariant;
      const scheme = generateMaterialScheme(
        extraction.seedArgb,
        isDark,
        variant,
        extraction.isTopDark
      );

      writeGeneratedThemes({
        extensionDir: this._extensionDir,
        scheme,
        isDark,
        wallpaperPath,
        isTopDark: extraction.isTopDark,
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
