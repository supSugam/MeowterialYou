/**
 * Advanced preferences page for toolkit and target toggles.
 */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

export function createAdvancedPage(settings: Gio.Settings): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({
    title: 'Advanced',
    icon_name: 'preferences-other-symbolic',
  });

  const group = new Adw.PreferencesGroup({
    title: 'Toolkit Targets',
    description: 'Enable or disable CSS theme generation per system component',
  });
  page.add(group);

  // 1. GNOME Shell Theme Switch
  const shellRow = new Adw.SwitchRow({
    title: 'GNOME Shell Theme',
    subtitle: 'Generate stylesheet for top bar, popups, and shell UI (~/.themes)',
  });
  settings.bind('shell-theme-enabled', shellRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  group.add(shellRow);

  // 2. GTK4 Theme Switch
  const gtk4Row = new Adw.SwitchRow({
    title: 'GTK4 Theming',
    subtitle: 'Generate theme for modern GNOME applications (~/.config/gtk-4.0)',
  });
  settings.bind('gtk4-enabled', gtk4Row, 'active', Gio.SettingsBindFlags.DEFAULT);
  group.add(gtk4Row);

  // 3. GTK3 Theme Switch
  const gtk3Row = new Adw.SwitchRow({
    title: 'GTK3 Theming',
    subtitle: 'Generate theme for classic GTK3 applications (~/.config/gtk-3.0)',
  });
  settings.bind('gtk3-enabled', gtk3Row, 'active', Gio.SettingsBindFlags.DEFAULT);
  group.add(gtk3Row);

  return page;
}
