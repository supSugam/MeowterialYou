/**
 * File read, write, and directory utilities using Gio.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export function getHomeDirectory(): string {
  return GLib.get_home_dir();
}

export function getTargetHomeDirectories(): string[] {
  const dirs = [GLib.get_home_dir()];
  const username = GLib.get_user_name();
  const realHome = `/home/${username}`;
  if (!dirs.includes(realHome) && GLib.file_test(realHome, GLib.FileTest.IS_DIR)) {
    dirs.push(realHome);
  }
  return dirs;
}

export function readTextFile(filePath: string): string {
  const file = Gio.File.new_for_path(filePath);
  const [, contents] = file.load_contents(null);
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(contents);
}

export function writeTextFile(filePath: string, content: string): void {
  const file = Gio.File.new_for_path(filePath);
  const parent = file.get_parent();
  if (parent && !parent.query_exists(null)) {
    parent.make_directory_with_parents(null);
  }
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  file.replace_contents(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
}

export function deleteFile(filePath: string): void {
  const file = Gio.File.new_for_path(filePath);
  if (file.query_exists(null)) {
    try {
      file.delete(null);
    } catch {
      // Ignore errors if file was already removed
    }
  }
}

export function copyDirectoryRecursive(sourcePath: string, destinationPath: string): void {
  const sourceDir = Gio.File.new_for_path(sourcePath);
  if (!sourceDir.query_exists(null)) {
    return;
  }

  const destDir = Gio.File.new_for_path(destinationPath);
  if (!destDir.query_exists(null)) {
    destDir.make_directory_with_parents(null);
  }

  const enumerator = sourceDir.enumerate_children(
    'standard::*',
    Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
    null
  );

  let fileInfo: Gio.FileInfo | null;
  while ((fileInfo = enumerator.next_file(null)) !== null) {
    const fileName = fileInfo.get_name();
    const childSource = sourceDir.get_child(fileName);
    const childDest = destDir.get_child(fileName);

    if (fileInfo.get_file_type() === Gio.FileType.DIRECTORY) {
      copyDirectoryRecursive(childSource.get_path()!, childDest.get_path()!);
    } else {
      childSource.copy(childDest, Gio.FileCopyFlags.OVERWRITE, null, null);
    }
  }
}

export function updateGtkSettingsIni(iniPath: string, themeName: string, preferDark?: boolean): void {
  const keyFile = new GLib.KeyFile();
  if (GLib.file_test(iniPath, GLib.FileTest.EXISTS)) {
    try {
      keyFile.load_from_file(iniPath, GLib.KeyFileFlags.KEEP_COMMENTS);
    } catch {
      // Overwrite invalid ini
    }
  }
  keyFile.set_string('Settings', 'gtk-theme-name', themeName);
  if (typeof preferDark === 'boolean') {
    keyFile.set_integer('Settings', 'gtk-application-prefer-dark-theme', preferDark ? 1 : 0);
  } else {
    try {
      keyFile.remove_key('Settings', 'gtk-application-prefer-dark-theme');
    } catch {
      // Key was not present
    }
  }
  const [content] = keyFile.to_data();
  if (content) writeTextFile(iniPath, content);
}
