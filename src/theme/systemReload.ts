/**
 * System theme apply and reload mechanisms via Gio.Settings.
 */

import Gio from 'gi://Gio';
import type { WindowButtonPosition } from '../types/theme.js';

export function applyGnomeSystemSettings(
  isDark: boolean,
  windowButtonPosition: WindowButtonPosition = 'right'
): void {
  const themeSuffix = isDark ? 'dark' : 'light';
  const themeName = `MeowterialYou-${themeSuffix}`;

  // 1. GTK Theme
  const interfaceSettings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' });
  interfaceSettings.set_string('gtk-theme', themeName);

  // 2. Window control layout
  const wmSettings = new Gio.Settings({ schema: 'org.gnome.desktop.wm.preferences' });
  const buttonLayout =
    windowButtonPosition === 'left' ? 'close,minimize,maximize:' : ':minimize,maximize,close';
  wmSettings.set_string('button-layout', buttonLayout);

  // 3. User Theme Extension (Shell Theme)
  try {
    const userThemeSchema = 'org.gnome.shell.extensions.user-theme';
    const defaultSource = Gio.SettingsSchemaSource.get_default();
    if (defaultSource && defaultSource.lookup(userThemeSchema, true)) {
      const userThemeSettings = new Gio.Settings({ schema: userThemeSchema });
      const currentShellTheme = userThemeSettings.get_string('name');

      if (currentShellTheme === themeName) {
        // Toggle briefly to force GNOME Shell reload
        userThemeSettings.set_string('name', '');
      }
      userThemeSettings.set_string('name', themeName);
    }
  } catch {
    // User Themes extension may not be installed
  }
}
