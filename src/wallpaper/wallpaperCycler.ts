/**
 * Wallpaper slideshow manager with non-repeating shuffle.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { setCurrentWallpaperPath } from './wallpaperHelper.js';

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);

export class WallpaperCycler {
  private _directory: string = '';
  private _intervalMinutes: number = 30;
  private _isShuffleEnabled: boolean = true;
  private _timerSourceId: number | null = null;
  private _playlist: string[] = [];
  private _lastPlayedWallpaper: string | null = null;

  updateConfiguration(
    directory: string,
    intervalMinutes: number,
    isShuffle: boolean,
    isEnabled: boolean
  ): void {
    const directoryChanged = this._directory !== directory;
    this._directory = directory;
    this._intervalMinutes = Math.max(1, intervalMinutes);
    this._isShuffleEnabled = isShuffle;

    if (directoryChanged) {
      this._reloadPlaylist();
    }

    if (isEnabled && this._directory) {
      this.start();
    } else {
      this.stop();
    }
  }

  start(): void {
    this.stop();
    if (!this._directory || this._playlist.length === 0) {
      this._reloadPlaylist();
    }

    const intervalSeconds = this._intervalMinutes * 60;
    this._timerSourceId = GLib.timeout_add_seconds(
      GLib.PRIORITY_DEFAULT,
      intervalSeconds,
      () => {
        this.cycleToNext();
        return GLib.SOURCE_CONTINUE;
      }
    );
  }

  stop(): void {
    if (this._timerSourceId !== null) {
      GLib.source_remove(this._timerSourceId);
      this._timerSourceId = null;
    }
  }

  cycleToNext(): boolean {
    if (this._playlist.length === 0) {
      this._reloadPlaylist();
    }

    if (this._playlist.length === 0) {
      return false;
    }

    const nextWallpaper = this._playlist.shift();
    if (!nextWallpaper) {
      return false;
    }

    this._lastPlayedWallpaper = nextWallpaper;
    setCurrentWallpaperPath(nextWallpaper);
    return true;
  }

  private _reloadPlaylist(): void {
    this._playlist = [];
    if (!this._directory) {
      return;
    }

    try {
      const dir = Gio.File.new_for_path(this._directory);
      if (!dir.query_exists(null)) {
        return;
      }

      const enumerator = dir.enumerate_children(
        'standard::*',
        Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
        null
      );

      let fileInfo: Gio.FileInfo | null;
      while ((fileInfo = enumerator.next_file(null)) !== null) {
        const name = fileInfo.get_name();
        const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          this._playlist.push(dir.get_child(name).get_path()!);
        }
      }

      if (this._isShuffleEnabled) {
        this._shufflePlaylist();
      } else {
        this._playlist.sort();
      }
    } catch {
      this._playlist = [];
    }
  }

  private _shufflePlaylist(): void {
    for (let i = this._playlist.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this._playlist[i], this._playlist[j]] = [this._playlist[j]!, this._playlist[i]!];
    }

    // Ensure we don't repeat the very last played wallpaper immediately
    if (
      this._lastPlayedWallpaper &&
      this._playlist.length > 1 &&
      this._playlist[0] === this._lastPlayedWallpaper
    ) {
      const lastIndex = this._playlist.length - 1;
      [this._playlist[0], this._playlist[lastIndex]] = [
        this._playlist[lastIndex]!,
        this._playlist[0]!,
      ];
    }
  }
}
