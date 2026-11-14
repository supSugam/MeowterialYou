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

  // 2. GTK Theme toggle to trigger live hot-reload in apps (Chrome, etc.)
  const interfaceSettings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' });
  const currentGtkTheme = interfaceSettings.get_string('gtk-theme');

  if (currentGtkTheme === themeName) {
    interfaceSettings.set_string('gtk-theme', 'Adwaita');
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
      interfaceSettings.set_string('gtk-theme', themeName);
      return GLib.SOURCE_REMOVE;
    });
  } else {
    interfaceSettings.set_string('gtk-theme', themeName);
  }

  // 3. User Theme Extension (GNOME Shell Theme)
  try {
    const userThemeSchema = 'org.gnome.shell.extensions.user-theme';
    const defaultSource = Gio.SettingsSchemaSource.get_default();
    if (defaultSource && defaultSource.lookup(userThemeSchema, true)) {
      const userThemeSettings = new Gio.Settings({ schema: userThemeSchema });
      const currentShellTheme = userThemeSettings.get_string('name');

      if (currentShellTheme === themeName) {
        userThemeSettings.set_string('name', '');
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
          userThemeSettings.set_string('name', themeName);
          return GLib.SOURCE_REMOVE;
        });
      } else {
        userThemeSettings.set_string('name', themeName);
      }
    }
  } catch {
    // User Themes extension may not be installed
  }
}
