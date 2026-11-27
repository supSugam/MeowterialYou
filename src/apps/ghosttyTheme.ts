/**
 * Styling-only Ghostty theme integration via themes/ directory and theme = directive.
 */

import GLib from 'gi://GLib';
import { getTargetHomeDirectories, readTextFile, writeTextFile } from '../theme/fileHelper.js';
import { substituteTemplate } from '../theme/templateEngine.js';
import { calculateTerminalTransparency, getTerminalAnsiPalette } from './terminalPalette.js';
import type { MaterialSchemeColors, WallpaperImageStats } from '../types/theme.js';

const THEME_DIRECTIVE = 'theme = light:MeowterialYou-light,dark:MeowterialYou-dark';
const WINDOW_THEME_DIRECTIVE = 'window-theme = ghostty';
const LEGACY_HEADER = '# Ghostty Material You Theme';
const LEGACY_COLOR_LINE_RE =
  /^(foreground|background|cursor-color|cursor-text|selection-background|selection-foreground|palette|background-opacity)\s*=/;

export interface GhosttyApplyOptions {
  extensionDir: string;
  lightScheme: MaterialSchemeColors;
  darkScheme: MaterialSchemeColors;
  imageStats?: WallpaperImageStats;
}

export function isGhosttyDetected(): boolean {
  if (GLib.find_program_in_path('ghostty')) {
    return true;
  }
  return getTargetHomeDirectories().some((dir) =>
    GLib.file_test(GLib.build_filenamev([dir, '.config', 'ghostty']), GLib.FileTest.IS_DIR)
  );
}

function buildGhosttyThemeContent(
  template: string,
  scheme: MaterialSchemeColors,
  isDark: boolean,
  imageStats?: WallpaperImageStats
): string {
  const palette = getTerminalAnsiPalette({ scheme, isDark });
  const transparency = calculateTerminalTransparency({ scheme, isDark, imageStats });
  const opacity = ((100 - transparency) / 100).toFixed(2);

  const termKeys: Record<string, string> = {
    term_black: palette[0] ?? '#000000',
    term_red: palette[1] ?? '#ff0000',
    term_green: palette[2] ?? '#00ff00',
    term_yellow: palette[3] ?? '#ffff00',
    term_blue: palette[4] ?? '#0000ff',
    term_magenta: palette[5] ?? '#ff00ff',
    term_cyan: palette[6] ?? '#00ffff',
    term_white: palette[7] ?? '#ffffff',
    term_bright_black: palette[8] ?? '#555555',
    term_bright_red: palette[9] ?? '#ff5555',
    term_bright_green: palette[10] ?? '#55ff55',
    term_bright_yellow: palette[11] ?? '#ffff55',
    term_bright_blue: palette[12] ?? '#5555ff',
    term_bright_magenta: palette[13] ?? '#ff55ff',
    term_bright_cyan: palette[14] ?? '#55ffff',
    term_bright_white: palette[15] ?? '#ffffff',
  };

  let output = substituteTemplate(template, scheme);
  for (const [token, hex] of Object.entries(termKeys)) {
    output = output.replaceAll(`@{${token}}`, hex);
  }
  return output.replaceAll('@{opacity}', opacity);
}

function mergeThemeDirective(existingContent: string): string {
  const lines = existingContent.split(/\r?\n/);
  const isLegacyGenerated = lines[0]?.trim() === LEGACY_HEADER;

  const filtered = isLegacyGenerated
    ? lines.filter((line) => !LEGACY_COLOR_LINE_RE.test(line.trim()))
    : lines;

  let replacedTheme = false;
  let hasWindowTheme = false;
  const updated = filtered.map((line) => {
    if (/^\s*theme\s*=/.test(line)) {
      replacedTheme = true;
      return THEME_DIRECTIVE;
    }
    const windowThemeMatch = line.match(/^\s*window-theme\s*=\s*(.+)$/);
    if (windowThemeMatch) {
      hasWindowTheme = true;
      const value = windowThemeMatch[1]?.trim();
      return value === 'auto' || value === 'system' ? WINDOW_THEME_DIRECTIVE : line;
    }
    return line;
  });

  if (!replacedTheme || !hasWindowTheme) {
    while (updated.length > 0 && updated[updated.length - 1] === '') {
      updated.pop();
    }
    if (updated.length > 0) {
      updated.push('');
    }
    if (!hasWindowTheme) {
      updated.push(WINDOW_THEME_DIRECTIVE);
    }
    if (!replacedTheme) {
      updated.push('# MeowterialYou dynamic theme');
      updated.push(THEME_DIRECTIVE);
    }
  }

  return updated.join('\n').trimEnd() + '\n';
}

export function applyGhosttyTheme(options: GhosttyApplyOptions): void {
  if (!isGhosttyDetected()) return;

  const templatePath = GLib.build_filenamev([
    options.extensionDir,
    'data',
    'templates',
    'apps',
    'ghostty',
    'ghostty.config',
  ]);
  if (!GLib.file_test(templatePath, GLib.FileTest.EXISTS)) return;

  const template = readTextFile(templatePath);
  const darkContent = buildGhosttyThemeContent(template, options.darkScheme, true, options.imageStats);
  const lightContent = buildGhosttyThemeContent(template, options.lightScheme, false, options.imageStats);

  for (const homeDir of getTargetHomeDirectories()) {
    const ghosttyDir = GLib.build_filenamev([homeDir, '.config', 'ghostty']);
    const themesDir = GLib.build_filenamev([ghosttyDir, 'themes']);
    writeTextFile(GLib.build_filenamev([themesDir, 'MeowterialYou-dark']), darkContent);
    writeTextFile(GLib.build_filenamev([themesDir, 'MeowterialYou-light']), lightContent);

    const configPath = GLib.build_filenamev([ghosttyDir, 'config']);
    const existing = GLib.file_test(configPath, GLib.FileTest.EXISTS) ? readTextFile(configPath) : '';
    const merged = mergeThemeDirective(existing);
    if (merged !== existing) {
      writeTextFile(configPath, merged);
    }
  }

  try {
    GLib.spawn_command_line_async('pkill -SIGUSR2 ghostty');
  } catch {
    // Ghostty reload signal is best-effort
  }
}
