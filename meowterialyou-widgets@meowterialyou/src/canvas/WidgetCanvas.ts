/**
 * WidgetCanvas - Manages widget rendering on the desktop
 * Based on reference extension pattern: adds widgets to _backgroundGroup
 */

import St from 'gi://St';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { SettingsManager } from '../services/SettingsManager.js';
import { Logger } from '../utils/logger.js';
import { WeatherClockWidget } from '../widgets/WeatherClockWidget.js';
import { MediaWidget } from '../widgets/MediaWidget.js';
import { BaseWidget } from '../widgets/BaseWidget.js';

export class WidgetCanvas {
  private _settings: SettingsManager;
  private _logger: Logger;
  private _container: St.Widget | null = null;
  private _widgets: Map<string, BaseWidget> = new Map();
  private _settingsChangedId: number | null = null;

  constructor(settings: SettingsManager, logger: Logger) {
    this._settings = settings;
    this._logger = logger;
  }

  /**
   * Add the canvas to the desktop background group
   */
  addToDesktop(): void {
    const monitor = Main.layoutManager.primaryMonitor;
    if (!monitor) {
      this._logger.error('No primary monitor found');
      return;
    }

    // Create container spanning the primary monitor
    this._container = new St.Widget({
      name: 'MeowterialYouWidgetsCanvas',
      reactive: false,
      x: monitor.x,
      y: monitor.y,
      width: monitor.width,
      height: monitor.height,
    });

    // Add to background group (behind windows, on desktop)
    const bgGroup = Main.layoutManager._backgroundGroup;
    if (bgGroup) {
      bgGroup.add_child(this._container);
      this._logger.info('Canvas added to background group');
    } else {
      // Fallback to uiGroup if backgroundGroup not available
      Main.layoutManager.uiGroup.add_child(this._container);
      this._logger.warn('backgroundGroup not found, using uiGroup');
    }

    // Listen for settings changes
    this._settings.connect(() => this._onSettingsChanged());
  }

  /**
   * Render all enabled widgets
   */
  render(): void {
    if (!this._container) {
      this._logger.error('Canvas not initialized');
      return;
    }

    this._clearWidgets();

    const monitor = Main.layoutManager.primaryMonitor;
    if (!monitor) return;

    // Render WeatherClock widget if enabled
    const weatherConfig = this._settings.getWeatherClockConfig();
    if (weatherConfig.enabled) {
      try {
        const widget = new WeatherClockWidget(
          this._settings,
          this._logger,
          monitor
        );
        this._widgets.set('weatherclock', widget);
        this._container.add_child(widget.actor);
        this._logger.info('WeatherClock widget rendered');
      } catch (e) {
        this._logger.error(`Failed to create WeatherClock: ${e}`);
      }
    }

    // Render Media widget if enabled
    const mediaConfig = this._settings.getMediaConfig();
    if (mediaConfig.enabled) {
      try {
        const widget = new MediaWidget(
          this._settings,
          this._logger,
          monitor
        );
        this._widgets.set('media', widget);
        this._container.add_child(widget.actor);
        this._logger.info('Media widget rendered');
      } catch (e) {
        this._logger.error(`Failed to create MediaWidget: ${e}`);
      }
    }
  }

  /**
   * Handle settings changes
   */
  private _onSettingsChanged(): void {
    // Re-render widgets on settings change
    // Use a small delay to batch rapid changes
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
      this.render();
      return GLib.SOURCE_REMOVE;
    });
  }

  /**
   * Clear all widgets
   */
  private _clearWidgets(): void {
    for (const [, widget] of this._widgets) {
      try {
        widget.destroy();
      } catch (e) {
        this._logger.error(`Error destroying widget: ${e}`);
      }
    }
    this._widgets.clear();
  }

  /**
   * Destroy the canvas and all widgets
   */
  destroy(): void {
    this._clearWidgets();

    if (this._container) {
      this._container.destroy();
      this._container = null;
    }

    this._logger.info('Canvas destroyed');
  }
}
