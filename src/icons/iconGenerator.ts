/**
 * Material You dynamic folder icon theme generator.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { darkenColorHex } from '../color/colorConverter.js';
import { getHomeDirectory, readTextFile, writeTextFile } from '../theme/fileHelper.js';
import type { MaterialSchemeColors } from '../types/theme.js';

export interface IconGenerateOptions {
  extensionDir: string;
  scheme: MaterialSchemeColors;
  isDark: boolean;
  baseIconTheme: string;
}

interface CalculatedFolderColors {
  back: string;
  front: string;
  shadow: string;
}

function calculateFolderColors(primaryHex: string, isDark: boolean): CalculatedFolderColors {
  return {
    back: darkenColorHex(primaryHex, 0.3),
    front: isDark ? primaryHex : darkenColorHex(primaryHex, -0.2),
    shadow: darkenColorHex(primaryHex, 0.5),
  };
}

function recolorFolderSvg(svgContent: string, colors: CalculatedFolderColors): string {
  // Replace back flap
  let result = svgContent.replace(
    /(d="[Mm]\s*21\.976562[,\s]12[^"]*"[^>]*?fill:)(#[0-9a-fA-F]{3,6})/g,
    `$1${colors.back}`
  );
  // Replace shadow flap
  result = result.replace(
    /(d="[Mm]\s*65\.976562[,\s]36[^"]*"[^>]*?fill:)(#[0-9a-fA-F]{3,6})/g,
    `$1${colors.shadow}`
  );
  // Replace front flap
  result = result.replace(
    /(d="[Mm]\s*65\.976562[,\s]32[^"]*"[^>]*?fill:)(#[0-9a-fA-F]{3,6})/g,
    `$1${colors.front}`
  );

  return result;
}

export function generateThemedIcons(options: IconGenerateOptions): void {
  const home = getHomeDirectory();
  const iconThemeDir = GLib.build_filenamev([home, '.local', 'share', 'icons', 'MeowterialYou']);
  const placesDestDir = GLib.build_filenamev([iconThemeDir, 'places', 'scalable']);

  // 1. Create index.theme
  const indexThemeContent = `[Icon Theme]
Name=MeowterialYou
Comment=Material You dynamic folder icon theme
Inherits=${options.baseIconTheme || 'Adwaita'}
Example=folder
Directories=places/scalable

[places/scalable]
Size=96
Context=Places
MinSize=16
MaxSize=128
Type=Scalable
`;
  writeTextFile(GLib.build_filenamev([iconThemeDir, 'index.theme']), indexThemeContent);

  // 2. Recolor SVGs
  const sourceIconsDir = GLib.build_filenamev([
    options.extensionDir,
    'data',
    'icons',
    'places',
    'scalable',
  ]);
  const sourceDir = Gio.File.new_for_path(sourceIconsDir);
  if (!sourceDir.query_exists(null)) {
    return;
  }

  const folderColors = calculateFolderColors(options.scheme.primary, options.isDark);
  const enumerator = sourceDir.enumerate_children(
    'standard::*',
    Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
    null
  );

  let fileInfo: Gio.FileInfo | null;
  while ((fileInfo = enumerator.next_file(null)) !== null) {
    const fileName = fileInfo.get_name();
    if (!fileName.endsWith('.svg')) {
      continue;
    }

    const sourcePath = GLib.build_filenamev([sourceIconsDir, fileName]);
    const targetPath = GLib.build_filenamev([placesDestDir, fileName]);
    const originalSvg = readTextFile(sourcePath);
    const recoloredSvg = recolorFolderSvg(originalSvg, folderColors);

    writeTextFile(targetPath, recoloredSvg);
  }

  // 3. Set GNOME icon theme
  const interfaceSettings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' });
  interfaceSettings.set_string('icon-theme', 'MeowterialYou');
}
