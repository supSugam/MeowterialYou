/**
 * Material You dynamic icon theme generator and SVG recolorer.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { darkenColorHex } from '../color/colorConverter.js';
import {
  copyDirectoryRecursive,
  getHomeDirectory,
  readTextFile,
  writeTextFile,
} from '../theme/fileHelper.js';
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
  emblem: string;
}

function calculateFolderColors(primaryHex: string, isDark: boolean): CalculatedFolderColors {
  return {
    back: darkenColorHex(primaryHex, 0.3),
    front: isDark ? primaryHex : darkenColorHex(primaryHex, -0.2),
    shadow: darkenColorHex(primaryHex, 0.5),
    emblem: darkenColorHex(primaryHex, 0.35),
  };
}

function recolorFolderSvg(svgContent: string, colors: CalculatedFolderColors): string {
  // 1. Recolor gradient stops
  let result = svgContent.replace(/stop-color="#[0-9a-fA-F]{3,6}"/g, `stop-color="${colors.front}"`);

  // 2. Recolor paths by specific flap geometry
  result = result.replace(/<path\b[^>]*>/g, (pathTag) => {
    let targetColor = colors.emblem; // Default for emblems/symbols

    if (/d="[Mm]\s*21\.976562[,\s]12/.test(pathTag)) {
      targetColor = colors.back;
    } else if (/d="[Mm]\s*65\.976562[,\s]36/.test(pathTag)) {
      targetColor = colors.shadow;
    } else if (/d="[Mm]\s*65\.976562[,\s]32/.test(pathTag)) {
      targetColor = colors.front;
    }

    let modified = pathTag.replace(/fill:#[0-9a-fA-F]{3,6}/g, `fill:${targetColor}`);
    modified = modified.replace(/fill="#[0-9a-fA-F]{3,6}"/g, `fill="${targetColor}"`);
    return modified;
  });

  return result;
}

export function generateThemedIcons(options: IconGenerateOptions): void {
  const home = getHomeDirectory();
  const iconThemeDir = GLib.build_filenamev([home, '.local', 'share', 'icons', 'Meowaita']);
  const placesDestDir = GLib.build_filenamev([iconThemeDir, 'places', 'scalable']);
  const appsDestDir = GLib.build_filenamev([iconThemeDir, 'apps', 'scalable']);

  // 1. Create index.theme with multi-theme fallback hierarchy
  const baseTheme =
    options.baseIconTheme && options.baseIconTheme !== 'Meowaita' ? options.baseIconTheme : null;
  const fallbacks = [baseTheme, 'Yaru', 'Adwaita', 'hicolor'].filter(
    (theme): theme is string => Boolean(theme) && theme !== 'Meowaita'
  );
  const uniqueInherits = Array.from(new Set(fallbacks)).join(',');
  const indexThemeContent = `[Icon Theme]
Name=Meowaita
Comment=Material You dynamic icon theme
Inherits=${uniqueInherits}
Example=folder
Directories=apps/scalable,places/scalable

[apps/scalable]
Size=96
Context=Applications
MinSize=16
MaxSize=128
Type=Scalable

[places/scalable]
Size=96
Context=Places
MinSize=16
MaxSize=128
Type=Scalable
`;
  writeTextFile(GLib.build_filenamev([iconThemeDir, 'index.theme']), indexThemeContent);

  // 2. Copy bundled custom app icons (200+ icons)
  const sourceAppsDir = GLib.build_filenamev([options.extensionDir, 'data', 'icons', 'apps', 'scalable']);
  copyDirectoryRecursive(sourceAppsDir, appsDestDir);

  // 3. Recolor folder SVGs
  const sourceIconsDir = GLib.build_filenamev([options.extensionDir, 'data', 'icons', 'places', 'scalable']);
  const sourceDir = Gio.File.new_for_path(sourceIconsDir);
  if (sourceDir.query_exists(null)) {
    const folderColors = calculateFolderColors(options.scheme.primary, options.isDark);
    const enumerator = sourceDir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);

    let fileInfo: Gio.FileInfo | null;
    while ((fileInfo = enumerator.next_file(null)) !== null) {
      const fileName = fileInfo.get_name();
      if (!fileName.endsWith('.svg')) continue;

      const sourcePath = GLib.build_filenamev([sourceIconsDir, fileName]);
      const targetPath = GLib.build_filenamev([placesDestDir, fileName]);
      const recoloredSvg = recolorFolderSvg(readTextFile(sourcePath), folderColors);
      writeTextFile(targetPath, recoloredSvg);
    }
  }

  // 4. Update GTK icon cache & apply
  try {
    GLib.spawn_command_line_async(`gtk-update-icon-cache -f -t "${iconThemeDir}"`);
  } catch {
    // Ignore cache update failure
  }

  const interfaceSettings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' });
  interfaceSettings.set_string('icon-theme', 'Meowaita');
}
