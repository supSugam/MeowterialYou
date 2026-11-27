/**
 * Coordinator for optional third-party app and terminal theme integrations.
 */

import type Gio from 'gi://Gio';
import { applyAntigravityAppTheme } from './antigravityAppTheme.js';
import { clearFastfetchCycleConfigs } from './fastfetchCycleHelper.js';
import { applyFastfetchTheme } from './fastfetchTheme.js';
import { applyGhosttyTheme } from './ghosttyTheme.js';
import { applyObsidianThemes } from './obsidianTheme.js';
import { applyShellPromptTheme, clearShellPromptTheme } from './shellPromptTheme.js';
import { applyTerminalThemes } from './terminalTheme.js';
import { applyVscodeThemes } from './vscodeTheme.js';
import type { MaterialSchemeColors, WallpaperImageStats } from '../types/theme.js';

export interface AppThemingOptions {
  extensionDir: string;
  settings: Gio.Settings;
  scheme: MaterialSchemeColors;
  lightScheme: MaterialSchemeColors;
  darkScheme: MaterialSchemeColors;
  isDark: boolean;
  imageStats?: WallpaperImageStats;
}

export function applyAppThemes(options: AppThemingOptions): void {
  const { settings } = options;

  if (settings.get_boolean('terminal-theming-enabled')) {
    try {
      applyTerminalThemes({
        scheme: options.scheme,
        isDark: options.isDark,
        imageStats: options.imageStats,
      });
    } catch (error) {
      console.warn('MeowterialYou: Warning applying GNOME terminal/console theme', error);
    }
  }

  if (settings.get_boolean('ghostty-enabled')) {
    try {
      applyGhosttyTheme({
        extensionDir: options.extensionDir,
        lightScheme: options.lightScheme,
        darkScheme: options.darkScheme,
        imageStats: options.imageStats,
      });
    } catch (error) {
      console.warn('MeowterialYou: Warning applying Ghostty theme', error);
    }
  }

  if (settings.get_boolean('vscode-enabled')) {
    try {
      applyVscodeThemes({
        extensionDir: options.extensionDir,
        lightScheme: options.lightScheme,
        darkScheme: options.darkScheme,
      });
    } catch (error) {
      console.warn('MeowterialYou: Warning applying VS Code theme', error);
    }
  }

  if (settings.get_boolean('antigravity-app-enabled')) {
    try {
      applyAntigravityAppTheme({
        lightScheme: options.lightScheme,
        darkScheme: options.darkScheme,
      });
    } catch (error) {
      console.warn('MeowterialYou: Warning applying Antigravity App theme', error);
    }
  }

  if (settings.get_boolean('obsidian-enabled')) {
    try {
      applyObsidianThemes({
        extensionDir: options.extensionDir,
        lightScheme: options.lightScheme,
        darkScheme: options.darkScheme,
        isDark: options.isDark,
      });
    } catch (error) {
      console.warn('MeowterialYou: Warning applying Obsidian theme', error);
    }
  }

  if (settings.get_boolean('fastfetch-enabled')) {
    try {
      applyFastfetchTheme({
        settings,
        scheme: options.scheme,
      });
    } catch (error) {
      console.warn('MeowterialYou: Warning applying Fastfetch theme', error);
    }
  } else {
    try {
      clearFastfetchCycleConfigs();
    } catch (error) {
      console.warn('MeowterialYou: Warning clearing Fastfetch cycle configs', error);
    }
  }

  try {
    if (settings.get_boolean('shell-prompt-enabled')) {
      applyShellPromptTheme({ scheme: options.scheme, isDark: options.isDark });
    } else {
      clearShellPromptTheme();
    }
  } catch (error) {
    console.warn('MeowterialYou: Warning applying shell prompt theme', error);
  }
}
