/**
 * Icon theme customization preferences page.
 */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

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
    subtitle: 'Generate Material You folder icons in ~/.local/share/icons/MeowterialYou',
  });
  settings.bind('themed-icons-enabled', enableRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  group.add(enableRow);

  // 2. Base Icon Theme Entry
  const baseThemeRow = new Adw.EntryRow({
    title: 'Base Icon Theme',
  });
  baseThemeRow.set_text(settings.get_string('base-icon-theme') || 'Adwaita');
  baseThemeRow.connect('apply', () => {
    const text = baseThemeRow.get_text().trim();
    if (text) {
      settings.set_string('base-icon-theme', text);
    }
  });
  group.add(baseThemeRow);

  return page;
}
