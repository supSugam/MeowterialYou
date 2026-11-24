/**
 * MeowterialYou GNOME Shell Extension Entry Point (GNOME 45+ ESM).
 */

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type Gio from 'gi://Gio';
import { SessionStateManager } from './state/sessionState.js';
import { ThemeOrchestrator } from './theme/themeOrchestrator.js';
import { WallpaperMonitor } from './wallpaper/wallpaperMonitor.js';
import { WallpaperCycler } from './wallpaper/wallpaperCycler.js';
import { MeowterialIndicator, type MeowterialIndicatorType } from './ui/indicator.js';
import { TweaksManager } from './tweaks/tweaksManager.js';

export default class MeowterialYouExtension extends Extension {
  private _settings!: Gio.Settings;
  private _sessionState!: SessionStateManager;
  private _orchestrator!: ThemeOrchestrator;
  private _monitor!: WallpaperMonitor;
  private _cycler!: WallpaperCycler;
  private _indicator: MeowterialIndicatorType | null = null;
  private _tweaksManager!: TweaksManager;
  private _signalIds: number[] = [];

  enable(): void {
    this._settings = this.getSettings();
    this._sessionState = new SessionStateManager();
    this._sessionState.captureInitialState();

    this._tweaksManager = new TweaksManager(this._settings);
    this._tweaksManager.enable();

    this._orchestrator = new ThemeOrchestrator({
      extensionDir: this.path,
      settings: this._settings,
      onExtractionCompleted: (_ext, isDark) => {
        this._tweaksManager.syncBlurMyShell(isDark);
      },
    });

    this._setupIndicator();
    this._setupCycler();
    this._setupMonitor();
    this._setupSettingsListeners();

    this._orchestrator.connectSystemModeListener(() => void this._triggerThemeUpdate(true));
    this._triggerThemeUpdate();
  }

  disable(): void {
    for (const signalId of this._signalIds) this._settings.disconnect(signalId);
    this._signalIds = [];

    this._orchestrator?.destroy();
    this._tweaksManager?.destroy();
    this._monitor.stop();
    this._cycler.stop();

    this._indicator?.destroy();
    this._indicator = null;

    try {
      this._sessionState?.restoreOriginalState();
    } catch (error) {
      console.warn('MeowterialYou: Error during restoreOriginalState', error);
    }
  }

  private _setupIndicator(): void {
    const updateIndicatorState = () => {
      const shouldShow = this._settings.get_boolean('show-indicator');
      if (shouldShow && !this._indicator) {
        const existing = (Main.panel.statusArea as Record<string, { destroy(): void } | undefined>)[this.uuid];
        if (existing) {
          existing.destroy();
        }
        this._indicator = new MeowterialIndicator();
        this._indicator.initialize(
          this._settings,
          {
            onReapplyTheme: () => void this._triggerThemeUpdate(true),
            onCycleNext: () => this._cycler.cycleToNext(),
            onOpenPreferences: () => this.openPreferences(),
          },
          this.path
        );
        Main.panel.addToStatusArea(this.uuid, this._indicator, 1, 'right');
      } else if (!shouldShow && this._indicator) {
        this._indicator.destroy();
        this._indicator = null;
      }
    };

    this._signalIds.push(this._settings.connect('changed::show-indicator', updateIndicatorState));
    updateIndicatorState();
  }

  private _setupCycler(): void {
    this._cycler = new WallpaperCycler();
    const updateCyclerConfig = () => {
      this._cycler.updateConfiguration(
        this._settings.get_string('wallpaper-cycle-directory'),
        this._settings.get_int('wallpaper-cycle-interval'),
        this._settings.get_string('wallpaper-cycle-order') as import('./types/theme.js').WallpaperCycleOrder,
        this._settings.get_boolean('wallpaper-cycle-enabled')
      );
    };

    const cyclerKeys = [
      'wallpaper-cycle-directory', 'wallpaper-cycle-interval',
      'wallpaper-cycle-order', 'wallpaper-cycle-enabled',
    ];
    for (const key of cyclerKeys) {
      this._signalIds.push(this._settings.connect(`changed::${key}`, updateCyclerConfig));
    }
    updateCyclerConfig();
  }

  private _setupMonitor(): void {
    this._monitor = new WallpaperMonitor(() => this._triggerThemeUpdate());
    this._monitor.start();
  }

  private _setupSettingsListeners(): void {
    const themeReapplyKeys = [
      'theme-mode', 'scheme-variant', 'window-button-style',
      'window-button-position', 'themed-icons-enabled', 'base-icon-theme',
      'gtk3-enabled', 'gtk4-enabled', 'shell-theme-enabled', 'paused',
      'transparent-panel',
    ];

    for (const key of themeReapplyKeys) {
      this._signalIds.push(
        this._settings.connect(`changed::${key}`, () => void this._triggerThemeUpdate(true))
      );
    }
  }

  private async _triggerThemeUpdate(force: boolean = false): Promise<void> {
    await this._orchestrator.applyTheme(force);
    if (this._indicator) {
      this._indicator.updateDisplay(this._orchestrator.isDarkMode());
    }
  }
}
