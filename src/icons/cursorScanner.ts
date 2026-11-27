/**
 * System Xcursor pack discovery and path resolution helpers.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { getHomeDirectory, getTargetHomeDirectories, readTextFile } from '../theme/fileHelper.js';
import type { DiscoveredIconTheme } from './iconScanner.js';

export const MEOWTERIAL_CURSOR_THEME = 'MeowterialYou-Cursor';

const IGNORED_CURSOR_THEMES = new Set([MEOWTERIAL_CURSOR_THEME, 'default']);

function getCursorSearchPaths(): string[] {
  const dirs = new Set<string>();
  for (const home of [getHomeDirectory(), ...getTargetHomeDirectories()]) {
    dirs.add(GLib.build_filenamev([home, '.local', 'share', 'icons']));
    dirs.add(GLib.build_filenamev([home, '.icons']));
  }
  dirs.add('/usr/share/icons');
  return Array.from(dirs);
}

function parseCursorDisplayName(themeDir: string, fallbackId: string): string {
  for (const fileName of ['cursor.theme', 'index.theme']) {
    const filePath = GLib.build_filenamev([themeDir, fileName]);
    if (!GLib.file_test(filePath, GLib.FileTest.EXISTS)) continue;
    try {
      const match = readTextFile(filePath).match(/^Name\s*=\s*(.+)$/m);
      if (match?.[1]) return match[1].trim();
    } catch {
      // Fallback to folder ID
    }
  }
  return fallbackId;
}

export function resolveCursorThemeDir(themeId: string): string | null {
  if (!themeId || themeId === MEOWTERIAL_CURSOR_THEME) return null;
  for (const basePath of getCursorSearchPaths()) {
    const themeDir = GLib.build_filenamev([basePath, themeId]);
    if (GLib.file_test(GLib.build_filenamev([themeDir, 'cursors']), GLib.FileTest.IS_DIR)) {
      return themeDir;
    }
  }
  return null;
}

export function detectCurrentCursorTheme(): string {
  try {
    const settings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' });
    const current = settings.get_string('cursor-theme');
    if (current && current !== MEOWTERIAL_CURSOR_THEME && resolveCursorThemeDir(current)) {
      return current;
    }
  } catch {
    // Ignore schema lookup errors
  }
  return resolveCursorThemeDir('Adwaita') ? 'Adwaita' : '';
}

export function scanInstalledCursorThemes(): DiscoveredIconTheme[] {
  const themeMap = new Map<string, string>();
  for (const basePath of getCursorSearchPaths()) {
    const dir = Gio.File.new_for_path(basePath);
    if (!dir.query_exists(null)) continue;

    try {
      const enumerator = dir.enumerate_children(
        'standard::name,standard::type',
        Gio.FileQueryInfoFlags.NONE,
        null
      );
      let info: Gio.FileInfo | null;
      while ((info = enumerator.next_file(null)) !== null) {
        if (info.get_file_type() !== Gio.FileType.DIRECTORY) continue;
        const id = info.get_name();
        if (IGNORED_CURSOR_THEMES.has(id) || themeMap.has(id)) continue;
        const themeDir = GLib.build_filenamev([basePath, id]);
        if (!GLib.file_test(GLib.build_filenamev([themeDir, 'cursors']), GLib.FileTest.IS_DIR)) {
          continue;
        }
        themeMap.set(id, parseCursorDisplayName(themeDir, id));
      }
    } catch {
      // Ignore unreadable directories
    }
  }

  return Array.from(themeMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
