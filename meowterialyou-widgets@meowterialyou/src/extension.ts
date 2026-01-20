/**
 * MeowterialYou Widgets - GNOME Shell Extension
 * Main extension entry point
 */

import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { WidgetCanvas } from './canvas/WidgetCanvas.js';
import { SettingsManager } from './services/SettingsManager.js';
import { Logger } from './utils/logger.js';

export default class MeowterialYouWidgetsExtension extends Extension {
  private _canvas: WidgetCanvas | null = null;
  private _settings: SettingsManager | null = null;
  private _logger: Logger | null = null;

  enable(): void {
    this._logger = new Logger('MeowterialYouWidgets');
    this._logger.info('Extension enabling...');

    try {
      // Initialize settings manager
      this._settings = new SettingsManager(this);

      // Create and add widget canvas to desktop
      this._canvas = new WidgetCanvas(this._settings, this._logger);
      this._canvas.addToDesktop();

      // Render widgets after a small delay to ensure shell is ready
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
        this._canvas?.render();
        return GLib.SOURCE_REMOVE;
      });

      this._logger.info('Extension enabled successfully');
    } catch (error) {
      this._logger?.error(`Failed to enable extension: ${error}`);
    }
  }

  disable(): void {
    this._logger?.info('Extension disabling...');

    try {
      if (this._canvas) {
        this._canvas.destroy();
        this._canvas = null;
      }

      if (this._settings) {
        this._settings.destroy();
        this._settings = null;
      }

      this._logger?.info('Extension disabled');
      this._logger = null;
    } catch (error) {
      console.error(`[MeowterialYouWidgets] Error disabling: ${error}`);
    }
  }
}
