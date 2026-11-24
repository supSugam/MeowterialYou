/**
 * Material You dynamic icon theme generator and SVG recolorer.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { darkenColorHex } from '../color/colorConverter.js';
import {
  copyDirectoryRecursive,
  getTargetHomeDirectories,
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
  const targetDirs = getTargetHomeDirectories().map(home =>
    GLib.build_filenamev([home, '.local', 'share', 'icons', 'Meowaita'])
  );

  // 1. Create index.theme with multi-theme fallback hierarchy
  const baseTheme =
    options.baseIconTheme && options.baseIconTheme !== 'Meowaita' ? options.baseIconTheme : null;
  const fallbacks = [baseTheme, 'Yaru', 'Adwaita', 'hicolor'].filter(
    (theme): theme is string => Boolean(theme) && theme !== 'Meowaita'
  );
  const uniqueInherits = Array.from(new Set(fallbacks)).join(',');
  const indexThemeContent = `[Icon Theme]\nName=Meowaita\nComment=Material You dynamic icon theme\nInherits=${uniqueInherits}\nExample=folder\nDirectories=apps/scalable,places/scalable\n\n[apps/scalable]\nSize=96\nContext=Applications\nMinSize=16\nMaxSize=128\nType=Scalable\n\n[places/scalable]\nSize=96\nContext=Places\nMinSize=16\nMaxSize=128\nType=Scalable\n`;

  const sourceAppsDir = GLib.build_filenamev([options.extensionDir, 'data', 'icons', 'apps', 'scalable']);
  const sourceIconsDir = GLib.build_filenamev([options.extensionDir, 'data', 'icons', 'places', 'scalable']);
  const folderColors = calculateFolderColors(options.scheme.primary, options.isDark);

  for (const iconThemeDir of targetDirs) {
    writeTextFile(GLib.build_filenamev([iconThemeDir, 'index.theme']), indexThemeContent);
    copyDirectoryRecursive(sourceAppsDir, GLib.build_filenamev([iconThemeDir, 'apps', 'scalable']));

    const placesDestDir = GLib.build_filenamev([iconThemeDir, 'places', 'scalable']);
    const sourceDir = Gio.File.new_for_path(sourceIconsDir);
    if (sourceDir.query_exists(null)) {
      const enumerator = sourceDir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
      let fileInfo: Gio.FileInfo | null;
      while ((fileInfo = enumerator.next_file(null)) !== null) {
        const fileName = fileInfo.get_name();
        if (!fileName.endsWith('.svg')) continue;
        const sourcePath = GLib.build_filenamev([sourceIconsDir, fileName]);
        const targetPath = GLib.build_filenamev([placesDestDir, fileName]);
        writeTextFile(targetPath, recolorFolderSvg(readTextFile(sourcePath), folderColors));
      }
    }

    try {
      GLib.spawn_command_line_async(`gtk-update-icon-cache -f -t "${iconThemeDir}"`);
    } catch {
      // Ignore cache update failure
    }
  }

  // 4. Apply & pulse icon-theme so running GTK apps reload cached SVG pixbufs
  const interfaceSettings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' });
  if (interfaceSettings.get_string('icon-theme') === 'Meowaita') {
    const fallbackTheme = baseTheme ?? 'Adwaita';
    interfaceSettings.set_string('icon-theme', fallbackTheme);
    Gio.Settings.sync();
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
      interfaceSettings.set_string('icon-theme', 'Meowaita');
      Gio.Settings.sync();
      return GLib.SOURCE_REMOVE;
    });
  } else {
    interfaceSettings.set_string('icon-theme', 'Meowaita');
    Gio.Settings.sync();
  }
}
