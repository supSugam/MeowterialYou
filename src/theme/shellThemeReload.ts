/**
 * Safe GNOME Shell theme reload mechanisms bypassing the upstream loadTheme bug.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { getTargetHomeDirectories } from './fileHelper.js';

interface StTheme {
  default_stylesheet?: unknown;
  get_custom_stylesheets(): (Gio.File | null)[];
  load_stylesheet(f: Gio.File): void;
}

interface StThemeContext {
  get_theme(): StTheme | null;
  set_theme(theme: unknown): void;
}

interface StNamespace {
  ThemeContext: {
    get_for_stage(stage: unknown): StThemeContext;
  };
  Theme: new (options: {
    application_stylesheet?: Gio.File;
    default_stylesheet?: unknown;
  }) => StTheme;
}

let shellMain: { setThemeStylesheet(path: string | null): void } | null = null;
let StModule: StNamespace | null = null;

try {
  const Main = await import('resource:///org/gnome/shell/ui/main.js');
  shellMain = Main as unknown as { setThemeStylesheet(path: string | null): void };
} catch {
  // Not running inside GNOME Shell process
}

try {
  const StImport = (await import('gi://St')) as unknown as { default: StNamespace };
  StModule = StImport.default;
} catch {
  // Not in GNOME Shell environment with St typelib
}

export function resolveThemeStylesheet(themeName: string): string | null {
  const searchDirs: string[] = [];
  for (const home of getTargetHomeDirectories()) {
    searchDirs.push(GLib.build_filenamev([home, '.themes']));
    searchDirs.push(GLib.build_filenamev([home, '.local', 'share', 'themes']));
  }
  searchDirs.push(
    GLib.build_filenamev([GLib.get_user_data_dir(), 'themes']),
    ...GLib.get_system_data_dirs().map((dir: string) => GLib.build_filenamev([dir, 'themes']))
  );

  for (const dir of searchDirs) {
    const cssPath = GLib.build_filenamev([dir, themeName, 'gnome-shell', 'gnome-shell.css']);
    if (GLib.file_test(cssPath, GLib.FileTest.EXISTS)) {
      return cssPath;
    }
  }
  return null;
}

export function reloadShellThemeSafely(cssPath: string | null): void {
  shellMain?.setThemeStylesheet(cssPath);

  const shellGlobal = typeof global !== 'undefined' ? (global as { stage?: unknown }) : undefined;
  if (!shellGlobal?.stage || !StModule) {
    return;
  }

  try {
    const themeContext = StModule.ThemeContext.get_for_stage(shellGlobal.stage);
    const previousTheme = themeContext.get_theme();

    const defaultStylesheet = previousTheme?.default_stylesheet ?? undefined;
    const applicationStylesheet = cssPath ? Gio.File.new_for_path(cssPath) : undefined;

    const newTheme = new StModule.Theme({
      application_stylesheet: applicationStylesheet,
      default_stylesheet: defaultStylesheet,
    });

    if (previousTheme) {
      try {
        const customStylesheets = previousTheme.get_custom_stylesheets();
        for (const stylesheet of customStylesheets) {
          // Upstream GNOME Shell bug: unlinked stylesheets can return null entries
          if (!stylesheet) {
            continue;
          }
          try {
            newTheme.load_stylesheet(stylesheet);
          } catch (error) {
            console.warn('MeowterialYou: Skipping invalid custom stylesheet', error);
          }
        }
      } catch (error) {
        console.warn('MeowterialYou: Failed to query previous custom stylesheets', error);
      }
    }

    themeContext.set_theme(newTheme);
  } catch (error) {
    console.error('MeowterialYou: Failed to safely reload GNOME Shell theme', error);
  }
}
