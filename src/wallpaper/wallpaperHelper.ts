/**
 * Utilities for retrieving and setting GNOME desktop wallpaper.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export function getDesktopBackgroundSettings(): Gio.Settings {
  return new Gio.Settings({ schema: 'org.gnome.desktop.background' });
}

export function getCurrentWallpaperPath(isDark?: boolean): string | null {
  const settings = getDesktopBackgroundSettings();
  const effectiveIsDark =
    isDark ??
    new Gio.Settings({ schema: 'org.gnome.desktop.interface' }).get_string('color-scheme') ===
      'prefer-dark';
  const key = effectiveIsDark ? 'picture-uri-dark' : 'picture-uri';
  let uri = settings.get_string(key);

  if (!uri && effectiveIsDark) {
    uri = settings.get_string('picture-uri');
  }

  if (!uri) {
    return null;
  }

  try {
    const [filePath] = GLib.filename_from_uri(uri);
    return filePath;
  } catch {
    // If it's already a raw path
    return uri.replace('file://', '');
  }
}

export function setCurrentWallpaperPath(filePath: string): void {
  const settings = getDesktopBackgroundSettings();
  const uri = GLib.filename_to_uri(filePath, null);

  // Synchronously update both light and dark keys to prevent desync
  settings.set_string('picture-uri', uri);
  settings.set_string('picture-uri-dark', uri);
}
