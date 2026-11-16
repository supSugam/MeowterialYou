/**
 * Multi-source wallpaper change monitor with debouncing.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { getCurrentWallpaperPath, getDesktopBackgroundSettings } from './wallpaperHelper.js';

export type WallpaperChangeCallback = (newWallpaperPath: string) => void;

export class WallpaperMonitor {
  private _backgroundSettings: Gio.Settings;
  private _callback: WallpaperChangeCallback;
  private _signalIds: number[] = [];
  private _debounceSourceId: number | null = null;
  private _lastWallpaperPath: string | null = null;
  private _fileMonitor: Gio.FileMonitor | null = null;
  private _fileMonitorSignalId: number | null = null;

  constructor(callback: WallpaperChangeCallback) {
    this._callback = callback;
    this._backgroundSettings = getDesktopBackgroundSettings();
  }

  start(): void {
    const onSignalTriggered = () => this._handlePotentialChange();

    this._signalIds.push(
      this._backgroundSettings.connect('changed::picture-uri', onSignalTriggered),
      this._backgroundSettings.connect('changed::picture-uri-dark', onSignalTriggered)
    );

    this._setupFileMonitor();
  }

  stop(): void {
    if (this._debounceSourceId !== null) {
      GLib.source_remove(this._debounceSourceId);
      this._debounceSourceId = null;
    }

    for (const signalId of this._signalIds) {
      this._backgroundSettings.disconnect(signalId);
    }
    this._signalIds = [];

    this._teardownFileMonitor();
  }

  private _setupFileMonitor(): void {
    this._teardownFileMonitor();
    const currentPath = getCurrentWallpaperPath();
    if (!currentPath) {
      return;
    }

    try {
      const file = Gio.File.new_for_path(currentPath);
      this._fileMonitor = file.monitor_file(Gio.FileMonitorFlags.NONE, null);
      this._fileMonitorSignalId = this._fileMonitor.connect('changed', () => {
        this._handlePotentialChange();
      });
    } catch {
      // Ignore if file doesn't exist yet
    }
  }

  private _teardownFileMonitor(): void {
    if (this._fileMonitor && this._fileMonitorSignalId !== null) {
      this._fileMonitor.disconnect(this._fileMonitorSignalId);
      this._fileMonitor.cancel();
      this._fileMonitor = null;
      this._fileMonitorSignalId = null;
    }
  }

  private _handlePotentialChange(): void {
    if (this._debounceSourceId !== null) {
      GLib.source_remove(this._debounceSourceId);
    }

    this._debounceSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
      this._debounceSourceId = null;
      const currentPath = getCurrentWallpaperPath();
      if (currentPath && currentPath !== this._lastWallpaperPath) {
        this._lastWallpaperPath = currentPath;
        this._setupFileMonitor();
        this._callback(currentPath);
      }
      return GLib.SOURCE_REMOVE;
    });
  }
}
