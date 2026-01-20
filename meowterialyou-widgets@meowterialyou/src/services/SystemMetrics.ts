/**
 * SystemMetrics - Provides CPU, RAM, Network, and Temperature data
 * Reads from /proc filesystem for system stats
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { Logger } from '../utils/logger.js';

export interface SystemMetricsData {
  cpu: number;
  ram: number;
  network: string;
  temperature: number;
}

export class SystemMetrics {
  private _logger: Logger;
  private _cpuPrev = { total: 0, idle: 0 };
  private _netPrev = { rx: 0, tx: 0, time: 0 };
  private _currentData: SystemMetricsData = {
    cpu: 0,
    ram: 0,
    network: '0 KB/s',
    temperature: 0,
  };
  private _tempPath: string | null = null;
  private _refreshTimeoutId: number | null = null;
  private _callbacks: Set<(data: SystemMetricsData) => void> = new Set();

  constructor(logger: Logger) {
    this._logger = logger;
    this._netPrev.time = GLib.get_monotonic_time();
    this._detectTempSensor();
  }

  /**
   * Subscribe to metrics updates
   */
  subscribe(callback: (data: SystemMetricsData) => void): void {
    this._callbacks.add(callback);
    callback(this._currentData);
  }

  /**
   * Unsubscribe from updates
   */
  unsubscribe(callback: (data: SystemMetricsData) => void): void {
    this._callbacks.delete(callback);
  }

  /**
   * Start periodic updates
   */
  start(intervalMs: number): void {
    this._refresh();
    
    this._refreshTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, intervalMs, () => {
      this._refresh();
      return GLib.SOURCE_CONTINUE;
    });
  }

  /**
   * Refresh all metrics
   */
  private _refresh(): void {
    this._updateCpu();
    this._updateRam();
    this._updateNetwork();
    this._updateTemperature();

    for (const callback of this._callbacks) {
      try {
        callback(this._currentData);
      } catch (e) {
        this._logger.error(`Metrics callback error: ${e}`);
      }
    }
  }

  /**
   * Read file contents synchronously
   */
  private _readFile(path: string): string | null {
    try {
      const file = Gio.File.new_for_path(path);
      const [success, contents] = file.load_contents(null);
      if (success) {
        return new TextDecoder().decode(contents);
      }
    } catch (e) {
      // Silently fail for missing files
    }
    return null;
  }

  /**
   * Update CPU usage from /proc/stat
   */
  private _updateCpu(): void {
    const data = this._readFile('/proc/stat');
    if (!data) return;

    const line = data.split('\n')[0];
    const parts = line.split(/\s+/).slice(1).map(Number);
    
    const idle = parts[3];
    const total = parts.reduce((a, b) => a + b, 0);

    const diffIdle = idle - this._cpuPrev.idle;
    const diffTotal = total - this._cpuPrev.total;

    if (diffTotal > 0) {
      this._currentData.cpu = Math.round(((diffTotal - diffIdle) / diffTotal) * 100);
    }

    this._cpuPrev = { total, idle };
  }

  /**
   * Update RAM usage from /proc/meminfo
   */
  private _updateRam(): void {
    const data = this._readFile('/proc/meminfo');
    if (!data) return;

    const totalMatch = data.match(/MemTotal:\s+(\d+)/);
    const availMatch = data.match(/MemAvailable:\s+(\d+)/);

    if (totalMatch && availMatch) {
      const total = parseInt(totalMatch[1]);
      const avail = parseInt(availMatch[1]);
      const used = total - avail;
      this._currentData.ram = Math.round((used / total) * 100);
    }
  }

  /**
   * Update network speed from /proc/net/dev
   */
  private _updateNetwork(): void {
    const data = this._readFile('/proc/net/dev');
    if (!data) return;

    const lines = data.split('\n').slice(2);
    let totalRx = 0;
    let totalTx = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('lo:')) continue;

      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;

      const columns = trimmed.substring(colonIdx + 1).trim().split(/\s+/).map(Number);
      if (columns.length >= 9) {
        totalRx += columns[0];
        totalTx += columns[8];
      }
    }

    const now = GLib.get_monotonic_time();
    const deltaSec = (now - this._netPrev.time) / 1000000;

    if (deltaSec > 0) {
      const speedRx = (totalRx - this._netPrev.rx) / deltaSec;
      const speedTx = (totalTx - this._netPrev.tx) / deltaSec;
      const totalSpeed = speedRx + speedTx;

      // Format with appropriate units and minimal decimals
      if (totalSpeed >= 1024 * 1024) {
        // MB/s for > 1MB/s
        this._currentData.network = `${(totalSpeed / (1024 * 1024)).toFixed(1)} MB/s`;
      } else if (totalSpeed >= 1024) {
        // KB/s for > 1KB/s
        this._currentData.network = `${Math.round(totalSpeed / 1024)} KB/s`;
      } else {
        // B/s for very low speeds
        this._currentData.network = `${Math.round(totalSpeed)} B/s`;
      }
    }

    this._netPrev = { rx: totalRx, tx: totalTx, time: now };
  }

  /**
   * Detect temperature sensor path
   */
  private _detectTempSensor(): void {
    const PRIORITY = ['coretemp', 'k10temp', 'zenpower', 'asus_ec'];
    
    try {
      const baseDir = Gio.File.new_for_path('/sys/class/hwmon');
      const enumerator = baseDir.enumerate_children(
        'standard::name',
        Gio.FileQueryInfoFlags.NONE,
        null
      );

      let info;
      while ((info = enumerator.next_file(null))) {
        const name = info.get_name();
        if (!name.startsWith('hwmon')) continue;

        const hwmonPath = `/sys/class/hwmon/${name}`;
        const sensorName = this._readFile(`${hwmonPath}/name`)?.trim();

        if (sensorName && PRIORITY.includes(sensorName)) {
          const inputPath = `${hwmonPath}/temp1_input`;
          if (Gio.File.new_for_path(inputPath).query_exists(null)) {
            this._tempPath = inputPath;
            return;
          }
        }
      }
    } catch (e) {
      this._logger.debug(`Temp sensor detection error: ${e}`);
    }

    // Fallback to thermal zone
    const fallback = '/sys/class/thermal/thermal_zone0/temp';
    if (Gio.File.new_for_path(fallback).query_exists(null)) {
      this._tempPath = fallback;
    }
  }

  /**
   * Update temperature
   */
  private _updateTemperature(): void {
    if (!this._tempPath) return;

    const data = this._readFile(this._tempPath);
    if (data) {
      const val = parseInt(data.trim());
      if (val > 0) {
        this._currentData.temperature = Math.round(val / 1000);
      }
    }
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
