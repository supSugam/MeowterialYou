/**
 * Wallpaper slideshow cycler supporting multiple sort orders and timer intervals.
 */

import GLib from 'gi://GLib';
import { setCurrentWallpaperPath } from './wallpaperHelper.js';
import { scanWallpaperDirectory } from './wallpaperSorter.js';
import type { WallpaperCycleOrder } from '../types/theme.js';

export class WallpaperCycler {
  private _directory: string = '';
  private _intervalMinutes: number = 30;
  private _order: WallpaperCycleOrder = 'random';
  private _isEnabled: boolean = false;
  private _timerId: number | null = null;
  private _playlist: string[] = [];
  private _currentIndex: number = 0;
  private _lastPlayedWallpaper: string = '';

  updateConfiguration(
    directory: string,
    intervalMinutes: number,
    order: WallpaperCycleOrder,
    isEnabled: boolean
  ): void {
    const directoryChanged = this._directory !== directory;
    const orderChanged = this._order !== order;
    this._directory = directory;
    this._intervalMinutes = Math.max(1, intervalMinutes);
    this._order = order;
    this._isEnabled = isEnabled;

    if (directoryChanged || orderChanged || this._playlist.length === 0) {
      this._reloadPlaylist();
    }

    this._restartTimer();
  }

  cycleToNext(): void {
    if (this._playlist.length === 0) {
      this._reloadPlaylist();
    }

    if (this._playlist.length === 0) {
      return;
    }

    if (this._currentIndex >= this._playlist.length) {
      this._currentIndex = 0;
      if (this._order === 'random') {
        this._reloadPlaylist();
      }
    }

    const nextWallpaper = this._playlist[this._currentIndex];
    this._currentIndex++;

    if (nextWallpaper) {
      this._lastPlayedWallpaper = nextWallpaper;
      setCurrentWallpaperPath(nextWallpaper);
    }
  }

  stop(): void {
    this._stopTimer();
  }

  destroy(): void {
    this._stopTimer();
    this._playlist = [];
  }

  private _restartTimer(): void {
    this._stopTimer();

    if (!this._isEnabled || !this._directory) {
      return;
    }

    const intervalSeconds = this._intervalMinutes * 60;
    this._timerId = GLib.timeout_add_seconds(
      GLib.PRIORITY_DEFAULT,
      intervalSeconds,
      () => {
        this.cycleToNext();
        return GLib.SOURCE_CONTINUE;
      }
    );
  }

  private _stopTimer(): void {
    if (this._timerId !== null) {
      GLib.source_remove(this._timerId);
      this._timerId = null;
    }
  }

  private _reloadPlaylist(): void {
    this._currentIndex = 0;
    this._playlist = scanWallpaperDirectory(
      this._directory,
      this._order,
      this._lastPlayedWallpaper
    );
  }
}
