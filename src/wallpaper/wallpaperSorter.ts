/**
 * Wallpaper playlist scanning and sorting algorithms.
 */

import Gio from 'gi://Gio';
import type { WallpaperCycleOrder } from '../types/theme.js';

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);

export interface WallpaperEntry {
  path: string;
  name: string;
  modifiedTime: number;
}

export function sortWallpaperEntries(
  entries: WallpaperEntry[],
  order: WallpaperCycleOrder,
  lastPlayedWallpaper?: string
): void {
  switch (order) {
    case 'alphabetical-asc':
      entries.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'alphabetical-desc':
      entries.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case 'date-newest':
      entries.sort((a, b) => b.modifiedTime - a.modifiedTime);
      break;
    case 'date-oldest':
      entries.sort((a, b) => a.modifiedTime - b.modifiedTime);
      break;
    case 'random':
    default:
      for (let i = entries.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [entries[i], entries[j]] = [entries[j]!, entries[i]!];
      }
      if (lastPlayedWallpaper && entries.length > 1 && entries[0]?.path === lastPlayedWallpaper) {
        const lastIndex = entries.length - 1;
        [entries[0], entries[lastIndex]] = [entries[lastIndex]!, entries[0]!];
      }
      break;
  }
}

export function scanWallpaperDirectory(
  directoryPath: string,
  order: WallpaperCycleOrder,
  lastPlayedWallpaper?: string
): string[] {
  try {
    const dir = Gio.File.new_for_path(directoryPath);
    if (!dir.query_exists(null)) {
      return [];
    }

    const enumerator = dir.enumerate_children(
      'standard::name,time::modified',
      Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
      null
    );

    const entries: WallpaperEntry[] = [];
    let fileInfo: Gio.FileInfo | null;
    while ((fileInfo = enumerator.next_file(null)) !== null) {
      const name = fileInfo.get_name();
      const dotIndex = name.lastIndexOf('.');
      if (dotIndex === -1) {
        continue;
      }
      const extension = name.slice(dotIndex).toLowerCase();
      if (SUPPORTED_EXTENSIONS.has(extension)) {
        const modificationDateTime = fileInfo.get_modification_date_time();
        const modifiedTime = modificationDateTime ? modificationDateTime.to_unix() : 0;
        entries.push({
          path: dir.get_child(name).get_path()!,
          name,
          modifiedTime,
        });
      }
    }

    sortWallpaperEntries(entries, order, lastPlayedWallpaper);
    return entries.map((entry) => entry.path);
  } catch {
    return [];
  }
}
