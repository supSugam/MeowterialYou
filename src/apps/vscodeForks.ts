/**
 * Verification and discovery of genuine VS Code and VS Code fork installations.
 */

import GLib from 'gi://GLib';
import { getTargetHomeDirectories, readTextFile } from '../theme/fileHelper.js';
import { MAJOR_EDITORS, type EditorDescriptor } from './vscodeRegistry.js';

export interface VerifiedEditorInstall {
  id: string;
  name: string;
  extensionsDir: string;
  settingsFile: string;
}

function isValidVscodeProductJson(productPath: string): boolean {
  if (!GLib.file_test(productPath, GLib.FileTest.EXISTS)) return false;
  try {
    const parsed: unknown = JSON.parse(readTextFile(productPath));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false;
    const record = parsed as Record<string, unknown>;
    const hasAppName = typeof record.applicationName === 'string';
    const hasDataFolder = typeof record.dataFolderName === 'string';
    const hasVscodeMarker =
      typeof record.commit === 'string' ||
      typeof record.vscodeVersion === 'string' ||
      Array.isArray(record.extensionAllowedProposedApi);
    return hasAppName && hasDataFolder && hasVscodeMarker;
  } catch {
    return false;
  }
}

function hasVerifiedProductManifest(descriptor: EditorDescriptor): boolean {
  if (descriptor.productPaths.some(isValidVscodeProductJson)) {
    return true;
  }
  for (const bin of descriptor.binaries) {
    const found = GLib.find_program_in_path(bin);
    if (!found) continue;
    const binDir = GLib.path_get_dirname(GLib.canonicalize_filename(found, null));
    const appRoot = GLib.path_get_dirname(binDir);
    const candidate = GLib.build_filenamev([appRoot, 'resources', 'app', 'product.json']);
    if (isValidVscodeProductJson(candidate)) return true;
  }
  return false;
}

function hasVscodeProfileMarker(userDir: string, dotBaseDir: string): boolean {
  const hasUserState =
    GLib.file_test(GLib.build_filenamev([userDir, 'settings.json']), GLib.FileTest.EXISTS) ||
    GLib.file_test(GLib.build_filenamev([userDir, 'globalStorage']), GLib.FileTest.IS_DIR);
  const hasDotMarker =
    GLib.file_test(GLib.build_filenamev([dotBaseDir, 'argv.json']), GLib.FileTest.EXISTS) ||
    GLib.file_test(GLib.build_filenamev([dotBaseDir, 'extensions']), GLib.FileTest.IS_DIR);
  return hasUserState && hasDotMarker;
}

export function discoverVerifiedVscodeEditors(): VerifiedEditorInstall[] {
  const verified: VerifiedEditorInstall[] = [];
  const seenSettings = new Set<string>();

  for (const homeDir of getTargetHomeDirectories()) {
    for (const editor of MAJOR_EDITORS) {
      const userDir = GLib.build_filenamev([homeDir, '.config', editor.configDirName, 'User']);
      if (!GLib.file_test(userDir, GLib.FileTest.IS_DIR)) continue;

      const dotBaseDir = GLib.build_filenamev([homeDir, editor.dotDir]);
      if (!hasVscodeProfileMarker(userDir, dotBaseDir) && !hasVerifiedProductManifest(editor)) {
        continue;
      }

      const settingsFile = GLib.build_filenamev([userDir, 'settings.json']);
      if (seenSettings.has(settingsFile)) continue;
      seenSettings.add(settingsFile);

      verified.push({
        id: editor.id,
        name: editor.name,
        extensionsDir: GLib.build_filenamev([dotBaseDir, 'extensions']),
        settingsFile,
      });
    }
  }

  return verified;
}
