/**
 * System theme apply and reload mechanisms via Gio.Settings.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import type { WindowButtonPosition } from '../types/theme.js';

export function applyGnomeSystemSettings(
  isDark: boolean,
  windowButtonPosition: WindowButtonPosition = 'right'
): void {
  const themeSuffix = isDark ? 'dark' : 'light';
  const themeName = `MeowterialYou-${themeSuffix}`;

  // 1. Window control layout
  const wmSettings = new Gio.Settings({ schema: 'org.gnome.desktop.wm.preferences' });
  const buttonLayout =
    windowButtonPosition === 'left' ? 'close,minimize,maximize:' : ':minimize,maximize,close';
  wmSettings.set_string('button-layout', buttonLayout);

  // 2. Color scheme sync
  const interfaceSettings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' });
  const targetColorScheme = isDark ? 'prefer-dark' : 'default';
  if (interfaceSettings.get_string('color-scheme') !== targetColorScheme) {
    interfaceSettings.set_string('color-scheme', targetColorScheme);
    Gio.Settings.sync();
  }

  // 3. GTK Theme bounce to force running apps to reload ~/.config/gtk-4.0/gtk.css
  interfaceSettings.set_string('gtk-theme', 'Adwaita');
  Gio.Settings.sync();
  GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
    interfaceSettings.set_string('gtk-theme', themeName);
    Gio.Settings.sync();
    pulseChromiumWindowFocus();
    return GLib.SOURCE_REMOVE;
  });

  // 4. GNOME Shell Theme toggle via user-theme extension
  const defaultSource = Gio.SettingsSchemaSource.get_default();
  if (defaultSource && defaultSource.lookup('org.gnome.shell.extensions.user-theme', true)) {
    const userThemeSettings = new Gio.Settings({ schema: 'org.gnome.shell.extensions.user-theme' });
    if (userThemeSettings.get_string('name') === themeName) {
      userThemeSettings.set_string('name', '');
      Gio.Settings.sync();
      GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        userThemeSettings.set_string('name', themeName);
        Gio.Settings.sync();
        return GLib.SOURCE_REMOVE;
      });
    } else {
      userThemeSettings.set_string('name', themeName);
      Gio.Settings.sync();
    }
  }

  // 5. Terminate stale extensions daemon if preferences window is not open
  terminateStaleDaemons();
}

function terminateStaleDaemons(): void {
  if (isExtensionPrefsWindowOpen()) {
    return;
  }

  try {
    GLib.spawn_command_line_async('pkill -f org.gnome.Shell.Extensions');
  } catch (error) {
    console.warn('MeowterialYou: Failed to terminate stale extensions daemon', error);
  }
}

function isExtensionPrefsWindowOpen(): boolean {
  if (typeof global === 'undefined' || !global.display) {
    return false;
  }
  try {
    const display = global.display as unknown as {
      get_tab_list(mode: number, workspace: unknown): Array<{
        get_wm_class(): string | null;
        get_title(): string | null;
      }>;
    };
    if (typeof display.get_tab_list === 'function') {
      const windows = display.get_tab_list(3, null);
      return windows.some(window => {
        const wmClass = window.get_wm_class()?.toLowerCase() ?? '';
        return wmClass.includes('extensions');
      });
    }
  } catch (error) {
    console.warn('MeowterialYou: Could not inspect open windows', error);
  }
  return false;
}

function pulseChromiumWindowFocus(): void {
  // Wait for GTK theme toggle to finish settling in Chrome (~850ms)
  GLib.timeout_add(GLib.PRIORITY_DEFAULT, 850, () => {
    try {
      if (typeof global !== 'undefined' && global.display) {
        const focusWindow = global.display.focus_window;
        if (focusWindow) {
          const wmClass = focusWindow.get_wm_class()?.toLowerCase() ?? '';
          const isChromium =
            wmClass.includes('chrome') ||
            wmClass.includes('chromium') ||
            wmClass.includes('brave') ||
            wmClass.includes('vivaldi') ||
            wmClass.includes('edge');
          if (isChromium) {
            const timestamp = global.get_current_time();
            global.display.unset_input_focus(timestamp);
            global.display.set_input_focus(focusWindow, timestamp);
          }
        }
      }
    } catch (error) {
      console.warn('MeowterialYou: Could not pulse Chrome focus', error);
    }
    return GLib.SOURCE_REMOVE;
  });
}
