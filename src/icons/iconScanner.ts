/**
 * System icon theme discovery and parsing.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { getHomeDirectory, readTextFile } from '../theme/fileHelper.js';

export interface DiscoveredIconTheme {
  id: string;
  name: string;
}

const IGNORED_THEMES = new Set([
  'default',
  'hicolor',
  'HighContrast',
  'DMZ-Black',
  'DMZ-White',
  'Bibata-Modern-Amber',
  'Bibata-Modern-Classic',
]);

function parseThemeNameFromIndex(themeDirPath: string, fallbackId: string): string | null {
  const indexPath = GLib.build_filenamev([themeDirPath, 'index.theme']);
  const file = Gio.File.new_for_path(indexPath);
  if (!file.query_exists(null)) {
    return null;
  }

  try {
    const content = readTextFile(indexPath);
    // Exclude cursor-only themes that lack directory contexts
    if (!content.includes('Directories=') && !content.includes('Directories =')) {
      return null;
    }

    const nameMatch = content.match(/^Name\s*=\s*(.+)$/m);
    if (nameMatch && nameMatch[1]) {
      return nameMatch[1].trim();
    }
  } catch {
    // If unreadable, fallback to ID
  }

  return fallbackId;
}

export function scanInstalledIconThemes(): DiscoveredIconTheme[] {
  const searchPaths = [
    GLib.build_filenamev([getHomeDirectory(), '.local', 'share', 'icons']),
    '/usr/share/icons',
  ];

  const themeMap = new Map<string, string>();

  // Always ensure Meowaita (Material You) is first
  themeMap.set('Meowaita', 'Meowaita (Material You Bundled)');

  for (const basePath of searchPaths) {
    const dir = Gio.File.new_for_path(basePath);
    if (!dir.query_exists(null)) {
      continue;
    }

    try {
      const enumerator = dir.enumerate_children(
        'standard::name,standard::type',
        Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
        null
      );

      let info: Gio.FileInfo | null;
      while ((info = enumerator.next_file(null)) !== null) {
        if (info.get_file_type() !== Gio.FileType.DIRECTORY) {
          continue;
        }

        const id = info.get_name();
        if (IGNORED_THEMES.has(id) || themeMap.has(id)) {
          continue;
        }

        const fullPath = GLib.build_filenamev([basePath, id]);
        const displayName = parseThemeNameFromIndex(fullPath, id);
        if (displayName) {
          themeMap.set(id, displayName);
        }
      }
    } catch {
      // Continue to next path
    }
  }

  const results: DiscoveredIconTheme[] = [];
  for (const [id, name] of themeMap.entries()) {
    results.push({ id, name });
  }

  return results;
}
