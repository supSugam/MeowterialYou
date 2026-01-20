/**
 * Settings Manager - Wraps GSettings for widget configuration
 */

import Gio from 'gi://Gio';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export interface WeatherClockConfig {
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius: number;
  opacity: number;
  padding: number;
  timeFormat: '12h' | '24h';
  showAmpm: boolean;
  fontFamily: string;
  iconFont: string;
  timeSize: number;
  weatherUnit: 'C' | 'F';
  windUnit: 'km' | 'mi';
  refreshInterval: number;
  showWeather: boolean;
  showMetrics: boolean;
  showDivider: boolean;
  emoji: string;
  emojiScale: number;
  emojiRow: number;
  emojiRotate: number;
  dynamicRefresh: boolean;
  refreshNormalMs: number;
  refreshEcoMs: number;
}

export interface MediaConfig {
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius: number;
  opacity: number;
  showControls: boolean;
  showProgress: boolean;
}

export interface ThemeColors {
  primary: string;
  background: string;
  text: string;
  textSecondary: string;
}

type SettingsCallback = () => void;

export class SettingsManager {
  private _settings: Gio.Settings;
  private _handlers: Map<string, number> = new Map();
  private _callbacks: Set<SettingsCallback> = new Set();

  constructor(extension: Extension) {
    this._settings = extension.getSettings();
  }

  /**
   * Connect to settings changes
   */
  connect(callback: SettingsCallback): void {
    this._callbacks.add(callback);
    
    if (this._handlers.size === 0) {
      const id = this._settings.connect('changed', () => {
        for (const cb of this._callbacks) {
          try {
            cb();
          } catch (e) {
            console.error(`[SettingsManager] Callback error: ${e}`);
          }
        }
      });
      this._handlers.set('changed', id);
    }
  }

  /**
   * Disconnect callback
   */
  disconnect(callback: SettingsCallback): void {
    this._callbacks.delete(callback);
  }

  /**
   * Get WeatherClock widget configuration
   */
  getWeatherClockConfig(): WeatherClockConfig {
    return {
      enabled: this._settings.get_boolean('weatherclock-enabled'),
      x: this._settings.get_int('weatherclock-x'),
      y: this._settings.get_int('weatherclock-y'),
      width: this._settings.get_int('weatherclock-width'),
      height: this._settings.get_int('weatherclock-height'),
      cornerRadius: this._settings.get_int('weatherclock-corner-radius'),
      opacity: this._settings.get_int('weatherclock-opacity'),
      padding: this._settings.get_int('weatherclock-padding'),
      timeFormat: this._settings.get_string('weatherclock-time-format') as '12h' | '24h',
      showAmpm: this._settings.get_boolean('weatherclock-show-ampm'),
      fontFamily: this._settings.get_string('weatherclock-font-family'),
      iconFont: this._settings.get_string('weatherclock-icon-font'),
      timeSize: this._settings.get_int('weatherclock-time-size'),
      weatherUnit: this._settings.get_string('weatherclock-weather-unit') as 'C' | 'F',
      windUnit: this._settings.get_string('weatherclock-wind-unit') as 'km' | 'mi',
      refreshInterval: this._settings.get_int('weatherclock-refresh-interval'),
      showWeather: this._settings.get_boolean('weatherclock-show-weather'),
      showMetrics: this._settings.get_boolean('weatherclock-show-metrics'),
      showDivider: this._settings.get_boolean('weatherclock-show-divider'),
      emoji: this._settings.get_string('weatherclock-emoji'),
      emojiScale: this._settings.get_double('weatherclock-emoji-scale'),
      emojiRow: this._settings.get_int('weatherclock-emoji-row'),
      emojiRotate: this._settings.get_int('weatherclock-emoji-rotate'),
      dynamicRefresh: this._settings.get_boolean('weatherclock-dynamic-refresh'),
      refreshNormalMs: this._settings.get_int('weatherclock-refresh-normal-ms'),
      refreshEcoMs: this._settings.get_int('weatherclock-refresh-eco-ms'),
    };
  }

  /**
   * Get Media widget configuration
   */
  getMediaConfig(): MediaConfig {
    return {
      enabled: this._settings.get_boolean('media-enabled'),
      x: this._settings.get_int('media-x'),
      y: this._settings.get_int('media-y'),
      width: this._settings.get_int('media-width'),
      height: this._settings.get_int('media-height'),
      cornerRadius: this._settings.get_int('media-corner-radius'),
      opacity: this._settings.get_int('media-opacity'),
      showControls: this._settings.get_boolean('media-show-controls'),
      showProgress: this._settings.get_boolean('media-show-progress'),
    };
  }

  /**
   * Get theme colors
   */
  getThemeColors(): ThemeColors {
    return {
      primary: this._settings.get_string('theme-primary-color'),
      background: this._settings.get_string('theme-background-color'),
      text: this._settings.get_string('theme-text-color'),
      textSecondary: this._settings.get_string('theme-text-secondary-color'),
    };
  }

  /**
   * Get raw settings object for preferences UI
   */
  getSettings(): Gio.Settings {
    return this._settings;
  }

  /**
   * Clean up
   */
  destroy(): void {
    for (const [, id] of this._handlers) {
      this._settings.disconnect(id);
    }
    this._handlers.clear();
    this._callbacks.clear();
  }
}
