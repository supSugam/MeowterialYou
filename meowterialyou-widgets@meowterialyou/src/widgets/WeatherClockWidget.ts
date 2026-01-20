/**
 * WeatherClockWidget - Exact port of GTK weatherclock UI to St widgets
 * Features: Date, Time (with AM/PM), Weather, System Metrics, Emoji
 */

import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import { BaseWidget, Monitor } from './BaseWidget.js';
import { SettingsManager, WeatherClockConfig } from '../services/SettingsManager.js';
import { Logger } from '../utils/logger.js';
import { WeatherService, WeatherData } from '../services/WeatherService.js';
import { SystemMetrics, SystemMetricsData } from '../services/SystemMetrics.js';

export class WeatherClockWidget extends BaseWidget {
  private _config: WeatherClockConfig;
  private _weatherService: WeatherService | null = null;
  private _systemMetrics: SystemMetrics | null = null;
  private _updateTimeoutId: number | null = null;

  // UI Elements
  private _dateLabel: St.Label | null = null;
  private _timeLabel: St.Label | null = null;
  private _ampmLabel: St.Label | null = null;
  private _emojiLabel: St.Label | null = null;
  private _weatherIcon: St.Label | null = null;
  private _weatherTemp: St.Label | null = null;
  private _weatherDesc: St.Label | null = null;
  private _weatherCity: St.Label | null = null;
  private _divider: St.Widget | null = null;
  private _metricsBox: St.BoxLayout | null = null;
  private _cpuLabel: St.Label | null = null;
  private _ramLabel: St.Label | null = null;
  private _netLabel: St.Label | null = null;
  private _tempLabel: St.Label | null = null;

  constructor(settings: SettingsManager, logger: Logger, monitor: Monitor) {
    super(settings, logger, monitor);
    
    this._config = settings.getWeatherClockConfig();
    this._buildUI();
    this._startServices();
  }

  protected _buildUI(): void {
    // Add widget style class
    this._actor.add_style_class_name('meowterialyou-weatherclock');

    // Apply position and background
    this._applyPosition({
      x: this._config.x,
      y: this._config.y,
      width: this._config.width,
      height: this._config.height,
    });
    this._applyBackgroundStyle(this._config.cornerRadius, this._config.opacity);

    // Create content box with padding
    const content = new St.BoxLayout({
      vertical: true,
      x_expand: true,
      y_expand: true,
      style: `padding: ${this._config.padding}px;`,
    });
    this._actor.add_child(content);

    // === Date Row ===
    const dateRow = new St.BoxLayout({
      x_expand: true,
      x_align: Clutter.ActorAlign.START,
      y_align: Clutter.ActorAlign.CENTER,
    });
    content.add_child(dateRow);

    // Emoji in date row (if emojiRow === 1)
    if (this._config.emoji && this._config.emojiRow === 1) {
      this._emojiLabel = this._createEmojiLabel();
      dateRow.add_child(this._emojiLabel);
    }

    this._dateLabel = new St.Label({
      text: this._formatDate(),
      style_class: 'meowterialyou-weatherclock-date',
      y_align: Clutter.ActorAlign.CENTER,
    });
    this._dateLabel.clutter_text.set_line_wrap(true); // Allow wrap instead of truncate
    this._applyFontStyle(this._dateLabel, 14, 500);
    dateRow.add_child(this._dateLabel);

    // === Time Row ===
    const timeRow = new St.BoxLayout({
      x_expand: true,
      y_align: Clutter.ActorAlign.END,
      style: 'margin-top: 4px;',
    });
    content.add_child(timeRow);

    // Container for the time text (ensures it acts as a single block)
    const timeBox = new St.BoxLayout({
      y_align: Clutter.ActorAlign.END,
      x_align: Clutter.ActorAlign.START,
    });
    timeRow.add_child(timeBox);

    // Time Label (Combined Time + AM/PM using Pango Markup)
    this._timeLabel = new St.Label({
      text: '', // Set via markup
      style_class: 'meowterialyou-weatherclock-time',
      y_align: Clutter.ActorAlign.END,
    });
    this._timeLabel.clutter_text.set_use_markup(true);
    
    // Standard font style - no line-height hacks
    this._applyFontStyle(this._timeLabel, this._config.timeSize, 700);
    this._timeLabel.set_style(this._timeLabel.get_style() + `
      letter-spacing: -2px;
    `);
    timeBox.add_child(this._timeLabel);

    // Emoji in time row (if emojiRow === 2)
    if (this._config.emoji && this._config.emojiRow === 2) {
      // Responsive Spacer
      const spacer = new St.Widget({ x_expand: true });
      timeRow.add_child(spacer);

      this._emojiLabel = this._createEmojiLabel();
      timeRow.add_child(this._emojiLabel);
    }

    // === Weather Row ===
    // Layout: [Icon + Temp] <spacer> [Desc + City]
    if (this._config.showWeather) {
      const weatherRow = new St.BoxLayout({
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
        style: 'margin-top: 12px;',
      });
      content.add_child(weatherRow);

      // Left side: Icon + Temperature
      const tempBox = new St.BoxLayout({
        y_align: Clutter.ActorAlign.CENTER,
      });
      weatherRow.add_child(tempBox);

      // Weather icon (Nerd Font)
      this._weatherIcon = new St.Label({
        text: WeatherService.getWeatherIconChar('weather-clear-symbolic'),
        style_class: 'meowterialyou-weatherclock-weather-icon',
        y_align: Clutter.ActorAlign.CENTER,
      });
      this._weatherIcon.set_style(`
        font-family: "${this._config.iconFont}", monospace;
        font-size: 32px;
        margin-right: 8px;
      `);
      tempBox.add_child(this._weatherIcon);

      // Temperature
      this._weatherTemp = new St.Label({
        text: '--°',
        style_class: 'meowterialyou-weatherclock-weather-temp',
        y_align: Clutter.ActorAlign.CENTER,
      });
      this._applyFontStyle(this._weatherTemp, 24, 700);
      tempBox.add_child(this._weatherTemp);

      // Flexible spacer between temp and info
      const weatherSpacer = new St.Widget({ x_expand: true });
      weatherRow.add_child(weatherSpacer);

      // Right side: Description + City
      const infoBox = new St.BoxLayout({
        vertical: true,
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.END,
      });
      weatherRow.add_child(infoBox);

      // Condition description
      this._weatherDesc = new St.Label({
        text: 'Loading...',
        style_class: 'meowterialyou-weatherclock-weather-desc',
        x_align: Clutter.ActorAlign.END,
      });
      this._weatherDesc.clutter_text.set_line_wrap(false); 
      this._weatherDesc.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
      this._applyFontStyle(this._weatherDesc, 14, 500, true);
      infoBox.add_child(this._weatherDesc);

      // City name
      this._weatherCity = new St.Label({
        text: '',
        style_class: 'meowterialyou-weatherclock-weather-city',
        x_align: Clutter.ActorAlign.END,
      });
      this._weatherCity.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
      this._applyFontStyle(this._weatherCity, 14, 500, true);
      infoBox.add_child(this._weatherCity);
    }

    // === Divider ===
    if (this._config.showDivider && this._config.showMetrics) {
      this._divider = new St.Widget({
        style_class: 'meowterialyou-weatherclock-divider',
        style: `
          background-color: rgba(255, 255, 255, 0.15);
          height: 1px;
          margin-top: 12px;
          margin-bottom: 12px;
        `,
        x_expand: true,
      });
      content.add_child(this._divider);
    }

    // === Metrics Row ===
    if (this._config.showMetrics) {
      this._metricsBox = new St.BoxLayout({
        x_expand: true,
        x_align: Clutter.ActorAlign.FILL, 
        style: this._config.showDivider ? '' : 'margin-top: 12px;',
      });
      content.add_child(this._metricsBox);

      // Helper to add spacer (for space-between effect)
      const addSpacer = () => {
        this._metricsBox?.add_child(new St.Widget({ x_expand: true }));
      };
      
      // CPU
      this._cpuLabel = this._createMetricLabel('󰻠', '0%');
      this._metricsBox.add_child(this._cpuLabel);
      addSpacer();

      // RAM
      this._ramLabel = this._createMetricLabel('󰍛', '0%');
      this._metricsBox.add_child(this._ramLabel);
      addSpacer();

      // Network
      this._netLabel = this._createMetricLabel('󰛳', '0 KB/s');
      this._metricsBox.add_child(this._netLabel);
      addSpacer();

      // Temperature (Last item - NO spacer after this for true space-between)
      this._tempLabel = this._createMetricLabel('󰔏', '0°C');
      this._metricsBox.add_child(this._tempLabel);
    }
  }

  /**
   * Create emoji label with rotation
   */
  private _createEmojiLabel(): St.Label {
    const baseSize = this._config.emojiRow === 2 ? this._config.timeSize : 14;
    const fontSize = Math.round(baseSize * this._config.emojiScale);

    const label = new St.Label({
      text: this._config.emoji,
      style_class: 'meowterialyou-weatherclock-emoji',
      y_align: Clutter.ActorAlign.CENTER,
      style: `
        font-size: ${fontSize}px;
        margin-right: 8px;
      `,
    });

    // Apply rotation via Clutter transform
    if (this._config.emojiRotate !== 0) {
      label.set_pivot_point(0.5, 0.5);
      label.set_rotation_angle(Clutter.RotateAxis.Z_AXIS, -this._config.emojiRotate);
    }

    return label;
  }

  /**
   * Create a metric label (icon + value)
   */
  private _createMetricLabel(icon: string, value: string): St.Label {
    // Add a space between icon and value for readability
    const label = new St.Label({
      text: `${icon}  ${value}`,  // Double space for icon-value gap
      style_class: 'meowterialyou-weatherclock-metric',
      style: `
        font-family: "${this._config.iconFont}", "${this._config.fontFamily}", monospace;
        font-size: 14px;
        opacity: 0.9;
      `,
    });
    return label;
  }

  /**
   * Apply font styling to a label
   */
  private _applyFontStyle(label: St.Label, size: number, weight: number, secondary: boolean = false): void {
    const colorStyle = secondary ? 'opacity: 0.8;' : '';
    label.set_style(`
      font-family: "${this._config.fontFamily}", sans-serif;
      font-size: ${size}px;
      font-weight: ${weight};
      ${colorStyle}
    `);
  }

  /**
   * Format current date
   */
  private _formatDate(): string {
    const now = GLib.DateTime.new_now_local();
    // Format: "Monday, January 20"
    return now.format('%A, %B %e') || '';
  }

  /**
   * Format current time
   */
  private _formatTime(): string {
    const now = GLib.DateTime.new_now_local();
    if (this._config.timeFormat === '24h') {
      return now.format('%H:%M') || '';
    } else {
      return now.format('%l:%M')?.trim() || '';
    }
  }

  /**
   * Get AM/PM string
   */
  private _getAmPm(): string {
    const now = GLib.DateTime.new_now_local();
    return now.format('%p') || '';
  }

  /**
   * Start background services
   */
  private _startServices(): void {
    // Start time updates
    this._updateTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
      this._updateTime();
      return GLib.SOURCE_CONTINUE;
    });

    // Start weather service
    if (this._config.showWeather) {
      this._weatherService = new WeatherService(
        this._logger,
        this._config.weatherUnit,
        this._config.windUnit
      );
      this._weatherService.subscribe((data) => this._updateWeather(data));
      this._weatherService.start(this._config.refreshInterval);
    }

    // Start system metrics
    if (this._config.showMetrics) {
      this._systemMetrics = new SystemMetrics(this._logger);
      this._systemMetrics.subscribe((data) => this._updateMetrics(data));
      this._systemMetrics.start(this._config.refreshNormalMs);
    }
  }

  /**
   * Update time display
   */
  private _updateTime(): void {
    if (this._destroyed) return;

    if (this._dateLabel) {
      this._dateLabel.set_text(this._formatDate());
    }
    if (this._timeLabel) {
      const timeStr = this._formatTime(); // e.g. "8:06"
      
      if (this._config.timeFormat === '12h' && this._config.showAmpm) {
        const ampm = this._getAmPm(); // e.g. "PM"
        
        // Use Pango markup for baseline alignment
        // 'size' attribute in Pango markup expects 1024ths of a point.
        // Assuming timeSize corresponds roughly to points or close enough scale.
        // 0.45 scale factor = 45% size.
        // 1024 * 0.45 * timeSize.
        const pangoSize = Math.round(this._config.timeSize * 0.25 * 1024);
        
        // Use standard 'size' attribute with integer value
        this._timeLabel.clutter_text.set_markup(
          `${timeStr}<span size="${pangoSize}"> ${ampm}</span>`
        );
      } else {
        this._timeLabel.set_text(timeStr);
      }
    }
  }

  /**
   * Update weather display
   */
  private _updateWeather(data: WeatherData): void {
    if (this._destroyed) return;

    if (this._weatherIcon) {
      this._weatherIcon.set_text(WeatherService.getWeatherIconChar(data.iconName));
    }
    if (this._weatherTemp) {
      this._weatherTemp.set_text(data.temperature || '--°');
    }
    if (this._weatherDesc) {
      this._weatherDesc.set_text(data.condition || 'Unknown');
    }
    if (this._weatherCity && data.city) {
      this._weatherCity.set_text(data.city); // Removed bullet point
    }
  }

  /**
   * Update system metrics display
   */
  private _updateMetrics(data: SystemMetricsData): void {
    if (this._destroyed) return;

    if (this._cpuLabel) {
      this._cpuLabel.set_text(`󰻠  ${data.cpu}%`);
    }
    if (this._ramLabel) {
      this._ramLabel.set_text(`󰍛  ${data.ram}%`);
    }
    if (this._netLabel) {
      this._netLabel.set_text(`󰛳  ${data.network}`);
    }
    if (this._tempLabel) {
      this._tempLabel.set_text(`󰔏  ${data.temperature}°C`);
    }
  }

  protected _onDestroy(): void {
    if (this._updateTimeoutId) {
      GLib.source_remove(this._updateTimeoutId);
      this._updateTimeoutId = null;
    }

    if (this._weatherService) {
      this._weatherService.destroy();
      this._weatherService = null;
    }

    if (this._systemMetrics) {
      this._systemMetrics.destroy();
      this._systemMetrics = null;
    }
  }
}
