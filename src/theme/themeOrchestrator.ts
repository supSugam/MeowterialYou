/**
 * Theme application orchestrator connecting extraction, generation, and system reload.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { extractColorsFromWallpaper, type ExtractionResult } from '../color/wallpaperExtractor.js';
import { generateMaterialScheme } from '../color/schemeGenerator.js';
import { writeGeneratedThemes } from './themeWriter.js';
import { applyGnomeSystemSettings, isColorSchemePulsing } from './systemReload.js';
import { generateThemedIcons } from '../icons/iconGenerator.js';
import { getCurrentWallpaperPath } from '../wallpaper/wallpaperHelper.js';
import {
  doesThemeExistOnDisk, getThemeCriteria, isCacheUpToDate,
  loadThemeCache, saveThemeCache, toExtractionResult,
} from './themeCache.js';

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
  private _isApplying = false;
  private _reapplyPending = false;
  private _pendingForce = false;
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
      if (this._isApplying || isColorSchemePulsing()) return;
      const isSysDark = this._interfaceSettings.get_string('color-scheme') === 'prefer-dark';
      if (isSysDark === this.isDarkMode()) return;
      this._settings.set_string('theme-mode', isSysDark ? 'dark' : 'light');
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
    if (this._isApplying) {
      this._reapplyPending = true;
      this._pendingForce = this._pendingForce || force;
      return false;
    }
    if (!force && this._settings.get_boolean('paused')) return false;

    this._isApplying = true;
    try {
      const isDark = this.isDarkMode();
      const wallpaperPath = getCurrentWallpaperPath(isDark);
      if (!wallpaperPath) return false;

      const criteria = getThemeCriteria(this._settings, wallpaperPath, isDark);
      const cache = loadThemeCache();

      if (!force && isCacheUpToDate(cache, criteria) && doesThemeExistOnDisk(isDark)) {
        this._onExtractionCompleted?.(toExtractionResult(cache!), isDark);
        try {
          applyGnomeSystemSettings(isDark, criteria.windowButtonPosition, false);
        } catch (error) {
          console.warn('MeowterialYou: Warning applying cached system settings', error);
        }
        return true;
      }

      const extraction = await extractColorsFromWallpaper(wallpaperPath);
      this._onExtractionCompleted?.(extraction, isDark);
      const { seedArgb, isTopDark } = extraction;
      const lightScheme = generateMaterialScheme(seedArgb, false, criteria.variant, isTopDark);
      const darkScheme = generateMaterialScheme(seedArgb, true, criteria.variant, isTopDark);
      const scheme = isDark ? darkScheme : lightScheme;

      writeGeneratedThemes({
        extensionDir: this._extensionDir,
        scheme, lightScheme, darkScheme,
        isDark, wallpaperPath, isTopDark,
        isShellThemeEnabled: this._settings.get_boolean('shell-theme-enabled'),
        isGtk3Enabled: this._settings.get_boolean('gtk3-enabled'),
        isGtk4Enabled: this._settings.get_boolean('gtk4-enabled'),
        isMacButtonsEnabled: criteria.windowButtonStyle === 'mac',
        isTransparentPanelEnabled: criteria.transparentPanel,
      });

      try {
        applyGnomeSystemSettings(isDark, criteria.windowButtonPosition, true);
      } catch (error) {
        console.warn('MeowterialYou: Warning applying system settings', error);
      }

      if (criteria.themedIconsEnabled) {
        try {
          generateThemedIcons({
            extensionDir: this._extensionDir,
            scheme, isDark,
            baseIconTheme: criteria.baseIconTheme,
          });
        } catch (error) {
          console.warn('MeowterialYou: Warning generating themed icons', error);
        }
      }

      saveThemeCache({ ...criteria, ...extraction });
      return true;
    } catch (error) {
      console.error('MeowterialYou: Failed to apply theme', error);
      return false;
    } finally {
      this._isApplying = false;
      if (this._reapplyPending) {
        this._reapplyPending = false;
        const pendingForce = this._pendingForce;
        this._pendingForce = false;
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
          void this.applyTheme(pendingForce);
          return GLib.SOURCE_REMOVE;
        });
      }
    }
  }
}
