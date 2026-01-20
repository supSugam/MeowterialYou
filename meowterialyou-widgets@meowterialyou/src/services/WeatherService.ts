/**
 * WeatherService - Provides weather data using GNOME Weather client
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import { WeatherClient } from 'resource:///org/gnome/shell/misc/weather.js';
import { Logger } from '../utils/logger.js';

export interface WeatherData {
  temperature: string;
  condition: string;
  iconName: string;
  city: string;
  windSpeed: string;
  humidity: string;
  isLoading: boolean;
  hasError: boolean;
  errorMessage: string;
}

export class WeatherService {
  private _client: WeatherClient;
  private _logger: Logger;
  private _unit: 'C' | 'F';
  private _windUnit: 'km' | 'mi';
  private _refreshTimeoutId: number | null = null;
  private _callbacks: Set<(data: WeatherData) => void> = new Set();
  private _lastData: WeatherData | null = null;

  constructor(logger: Logger, unit: 'C' | 'F' = 'C', windUnit: 'km' | 'mi' = 'km') {
    this._logger = logger;
    this._unit = unit;
    this._windUnit = windUnit;
    this._client = new WeatherClient();

    // Connect to weather changes
    this._client.connect('changed', () => this._onWeatherChanged());
  }

  /**
   * Subscribe to weather updates
   */
  subscribe(callback: (data: WeatherData) => void): void {
    this._callbacks.add(callback);
    
    // Send last known data immediately if available
    if (this._lastData) {
      callback(this._lastData);
    }
  }

  /**
   * Unsubscribe from weather updates
   */
  unsubscribe(callback: (data: WeatherData) => void): void {
    this._callbacks.delete(callback);
  }

  /**
   * Start periodic weather updates
   */
  start(refreshIntervalMinutes: number): void {
    // Initial update
    this._client.update();

    // Periodic refresh
    const intervalMs = refreshIntervalMinutes * 60 * 1000;
    this._refreshTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, intervalMs, () => {
      this._client.update();
      return GLib.SOURCE_CONTINUE;
    });
  }

  /**
   * Force an immediate update
   */
  update(): void {
    this._client.update();
  }

  /**
   * Handle weather data changes
   */
  private _onWeatherChanged(): void {
    const data = this._getCurrentWeatherData();
    this._lastData = data;

    for (const callback of this._callbacks) {
      try {
        callback(data);
      } catch (e) {
        this._logger.error(`Weather callback error: ${e}`);
      }
    }
  }

  /**
   * Get current weather data from the client
   */
  private _getCurrentWeatherData(): WeatherData {
    const defaultData: WeatherData = {
      temperature: '--',
      condition: 'Unknown',
      iconName: 'weather-clear-symbolic',
      city: '',
      windSpeed: '--',
      humidity: '--',
      isLoading: false,
      hasError: false,
      errorMessage: '',
    };

    try {
      if (!this._client.available) {
        return {
          ...defaultData,
          hasError: true,
          errorMessage: 'Weather unavailable',
        };
      }

      if (!this._client.hasLocation) {
        return {
          ...defaultData,
          hasError: true,
          errorMessage: 'Location not set',
        };
      }

      if (this._client.loading) {
        return {
          ...defaultData,
          isLoading: true,
        };
      }

      const info = this._client.info;
      if (!info) {
        return {
          ...defaultData,
          hasError: true,
          errorMessage: 'No weather info',
        };
      }

      // Get temperature - try multiple methods
      let temperature = '--';
      try {
        // Try get_temp_summary first
        const tempSummary = (info as any).get_temp_summary?.();
        if (tempSummary && tempSummary !== '--') {
          temperature = tempSummary;
        } else {
          // Try get_temp
          // get_temp returns [ok, value_in_kelvin]
          const tempResult = (info as any).get_temp?.();
          if (Array.isArray(tempResult) && tempResult.length >= 2) {
             const [ok, tempKelvin] = tempResult;
             if (ok && typeof tempKelvin === 'number' && !isNaN(tempKelvin)) {
                 const tempC = tempKelvin - 273.15;
                 temperature = `${Math.round(tempC)}°C`;
             }
          }
        }
      } catch (e) {
        this._logger.debug(`Temp fetch error: ${e}`);
      }
      
      // Get condition - try multiple methods
      let condition = '';
      const isValid = (s: string) => s && s !== 'Unknown' && s !== '-' && !/^\s*-+\s*$/.test(s);

      try {
        // Try get_conditions first (returns user-readable string)
        const cond = (info as any).get_conditions?.();
        if (isValid(cond)) condition = cond;
        
        // Fallback to get_sky
        if (!isValid(condition)) {
          const sky = (info as any).get_sky?.();
          if (isValid(sky)) condition = sky;
        }
      } catch (e) {
        this._logger.debug(`Condition fetch error: ${e}`);
      }
      // Final fallback
      if (!isValid(condition)) condition = 'Unknown';

      // Get icon - try multiple methods
      let iconName = 'weather-clear-symbolic';
      try {
        const symbolicIcon = (info as any).get_symbolic_icon_name?.();
        if (symbolicIcon) {
          iconName = symbolicIcon;
        } else {
          const icon = (info as any).get_icon_name?.();
          if (icon) {
            iconName = icon;
          }
        }
      } catch (e) {
        this._logger.debug(`Icon fetch error: ${e}`);
      }

      // Get location name
      let city = '';
      try {
        const location = (info as any).get_location?.();
        city = location?.get_name?.() || '';
      } catch (e) {
        this._logger.debug(`Location fetch error: ${e}`);
      }

      this._logger.debug(`Weather data: temp=${temperature}, cond=${condition}, icon=${iconName}, city=${city}`);

      return {
        temperature,
        condition,
        iconName,
        city,
        windSpeed: '--',
        humidity: '--',
        isLoading: false,
        hasError: false,
        errorMessage: '',
      };
    } catch (e) {
      this._logger.error(`Error getting weather: ${e}`);
      return {
        ...defaultData,
        hasError: true,
        errorMessage: String(e),
      };
    }
  }

  /**
   * Get weather icon character for Nerd Font display
   */
  /**
   * Get weather icon character for Nerd Font display
   */
  static getWeatherIconChar(iconName: string): string {
    if (!iconName) return '󰖙';
    
    const lower = iconName.toLowerCase();
    
    // Clear / Sunny
    if (lower.includes('clear') && lower.includes('night')) return '󰖔'; 
    if (lower.includes('clear') || lower.includes('sunny')) return '󰖙';
    
    // Clouds
    if (lower.includes('few-clouds') && lower.includes('night')) return '󰖕';
    if (lower.includes('few-clouds') || lower.includes('partly')) return '󰖕';
    if (lower.includes('overcast') || lower.includes('cloud')) return '󰖐';
    
    // Mist / Fog
    if (lower.includes('fog') || lower.includes('mist')) return '󰖑';
    
    // Rain / Showers
    if (lower.includes('shower') && lower.includes('scattered')) return '󰖖';
    if (lower.includes('shower')) return '󰖖';
    if (lower.includes('rain')) return '󰖗';
    
    // Snow
    if (lower.includes('snow') || lower.includes('ice')) return '󰖘';
    
    // Storm
    if (lower.includes('storm') || lower.includes('thunder')) return '󰖓';
    if (lower.includes('severe') || lower.includes('tornado')) return '󰼸';
    
    // Windy
    if (lower.includes('wind') || lower.includes('breeze')) return '󰖝';

    // Fallback
    return '󰖙';
  }

  /**
   * Destroy the service
   */
  destroy(): void {
    if (this._refreshTimeoutId) {
      GLib.source_remove(this._refreshTimeoutId);
      this._refreshTimeoutId = null;
    }
    this._callbacks.clear();
  }
}
