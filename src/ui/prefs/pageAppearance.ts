/**
 * Appearance preferences page — window controls and icon theming.
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import { scanInstalledIconThemes } from '../../icons/iconScanner.js';
import { createCursorGroup } from './cursorGroup.js';

export function createAppearancePage(settings: Gio.Settings): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({
    title: 'Appearance',
    icon_name: 'applications-graphics-symbolic',
  });

  // ── Window Controls ───────────────────────────────────────────────────────
  const windowGroup = new Adw.PreferencesGroup({
    title: 'Window Controls',
    description: 'Customize window control button style and titlebar position',
  });
  page.add(windowGroup);

  const styleRow = new Adw.ComboRow({
    title: 'Button Style',
    subtitle: 'Standard GNOME buttons or macOS-style colored circles',
    model: Gtk.StringList.new(['Native', 'macOS Style']),
  });
  const styleValues = ['native', 'mac'];
  const currentStyle = settings.get_string('window-button-style');
  styleRow.set_selected(Math.max(0, styleValues.indexOf(currentStyle)));
  styleRow.connect('notify::selected', () => {
    settings.set_string('window-button-style', styleValues[styleRow.get_selected()] ?? 'native');
  });
  windowGroup.add(styleRow);

  const posRow = new Adw.ComboRow({
    title: 'Button Position',
    subtitle: 'Side of the window titlebar to place controls',
    model: Gtk.StringList.new(['Right Side', 'Left Side']),
  });
  const posValues = ['right', 'left'];
  const currentPos = settings.get_string('window-button-position');
  posRow.set_selected(Math.max(0, posValues.indexOf(currentPos)));
  posRow.connect('notify::selected', () => {
    settings.set_string('window-button-position', posValues[posRow.get_selected()] ?? 'right');
  });
  windowGroup.add(posRow);

  // ── Folder Icons ──────────────────────────────────────────────────────────
  const iconsGroup = new Adw.PreferencesGroup({
    title: 'Folder Icons',
    description: 'Dynamically recolor system folder icons to match the current wallpaper accent',
  });
  page.add(iconsGroup);

  const enableRow = new Adw.SwitchRow({
    title: 'Enable Themed Folder Icons',
    subtitle: 'Generate Material You folder icons in ~/.local/share/icons/Meowaita',
  });
  settings.bind('themed-icons-enabled', enableRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  iconsGroup.add(enableRow);

  const installedThemes = scanInstalledIconThemes();
  const themeNames = installedThemes.map((t) => t.name);
  const themeIds = installedThemes.map((t) => t.id);

  const baseThemeRow = new Adw.ComboRow({
    title: 'Icon Theme',
    subtitle: 'Base icon pack to recolor (Meowaita includes 200+ themed app icons)',
    model: Gtk.StringList.new(themeNames),
  });
  const currentThemeId = settings.get_string('base-icon-theme') || 'Meowaita';
  baseThemeRow.set_selected(Math.max(0, themeIds.indexOf(currentThemeId)));
  baseThemeRow.connect('notify::selected', () => {
    settings.set_string('base-icon-theme', themeIds[baseThemeRow.get_selected()] ?? 'Meowaita');
  });
  iconsGroup.add(baseThemeRow);

  page.add(createCursorGroup(settings));

  return page;
}
