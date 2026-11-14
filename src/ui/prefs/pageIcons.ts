/**
 * Icon theme customization preferences page.
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import { scanInstalledIconThemes } from '../../icons/iconScanner.js';

export function createIconsPage(settings: Gio.Settings): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({
    title: 'Icons',
    icon_name: 'folder-symbolic',
  });

  const group = new Adw.PreferencesGroup({
    title: 'Folder Icon Recoloring',
    description: 'Dynamically recolor system folder icons to match current wallpaper accent',
  });
  page.add(group);

  // 1. Enable Themed Icons Switch
  const enableRow = new Adw.SwitchRow({
    title: 'Enable Themed Folder Icons',
    subtitle: 'Generate Material You folder icons in ~/.local/share/icons/Meowaita',
  });
  settings.bind('themed-icons-enabled', enableRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  group.add(enableRow);

  // 2. Base Icon Theme Dropdown
  const installedThemes = scanInstalledIconThemes();
  const themeNames = installedThemes.map((t) => t.name);
  const themeIds = installedThemes.map((t) => t.id);

  const baseThemeRow = new Adw.ComboRow({
    title: 'Icon Theme',
    subtitle: 'Select icon pack to use and recolor (Meowaita includes 200+ themed app icons)',
    model: Gtk.StringList.new(themeNames),
  });

  const currentThemeId = settings.get_string('base-icon-theme') || 'Meowaita';
  const initialIndex = Math.max(0, themeIds.indexOf(currentThemeId));
  baseThemeRow.set_selected(initialIndex);

  baseThemeRow.connect('notify::selected', () => {
    const selectedId = themeIds[baseThemeRow.get_selected()] ?? 'Meowaita';
    settings.set_string('base-icon-theme', selectedId);
  });
  group.add(baseThemeRow);

  return page;
}
