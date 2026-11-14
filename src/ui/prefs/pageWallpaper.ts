/**
 * Wallpaper cycling and slideshow preferences page.
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

export function createWallpaperPage(
  settings: Gio.Settings,
  parentWindow?: Gtk.Window
): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({
    title: 'Wallpaper',
    icon_name: 'preferences-desktop-wallpaper-symbolic',
  });

  const group = new Adw.PreferencesGroup({
    title: 'Automatic Wallpaper Changer',
    description: 'Automatically change your desktop wallpaper from a chosen folder on a timer',
  });
  page.add(group);

  // 1. Enable Auto-Changer Switch
  const enableRow = new Adw.SwitchRow({
    title: 'Enable Automatic Wallpaper Changer',
    subtitle: 'Rotate through wallpapers in a folder and dynamically reapply colors',
  });
  settings.bind('wallpaper-cycle-enabled', enableRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  group.add(enableRow);

  // 2. Wallpaper Directory Row with Folder Chooser
  const dirRow = new Adw.ActionRow({
    title: 'Wallpaper Folder',
    subtitle: settings.get_string('wallpaper-cycle-directory') || 'No folder selected',
  });

  const browseButton = new Gtk.Button({
    label: 'Browse…',
    valign: Gtk.Align.CENTER,
  });

  browseButton.connect('clicked', () => {
    const dialog = new Gtk.FileDialog({
      title: 'Select Wallpaper Folder',
    });

    dialog.select_folder(parentWindow ?? null, null, (_source, result) => {
      try {
        const folder = dialog.select_folder_finish(result);
        if (folder) {
          const path = folder.get_path();
          if (path) {
            settings.set_string('wallpaper-cycle-directory', path);
            dirRow.set_subtitle(path);
          }
        }
      } catch {
        // User cancelled dialog
      }
    });
  });

  dirRow.add_suffix(browseButton);
  group.add(dirRow);

  // 3. Wallpaper Cycle Order ComboRow
  const orderLabels = [
    'Randomize',
    'A to Z',
    'Z to A',
    'Newest First',
    'Oldest First',
  ];
  const orderValues = [
    'random',
    'alphabetical-asc',
    'alphabetical-desc',
    'date-newest',
    'date-oldest',
  ];

  const orderRow = new Adw.ComboRow({
    title: 'Cycle Order',
    subtitle: 'How wallpapers are sequenced from the folder',
    model: Gtk.StringList.new(orderLabels),
  });

  const currentOrder = settings.get_string('wallpaper-cycle-order');
  const initialIndex = Math.max(0, orderValues.indexOf(currentOrder));
  orderRow.set_selected(initialIndex);

  orderRow.connect('notify::selected', () => {
    const selected = orderValues[orderRow.get_selected()] ?? 'random';
    settings.set_string('wallpaper-cycle-order', selected);
  });
  group.add(orderRow);

  // 4. Change Interval (minutes)
  const intervalRow = new Adw.SpinRow({
    title: 'Change Interval (Minutes)',
    subtitle: 'Frequency of wallpaper rotation',
    adjustment: new Gtk.Adjustment({
      lower: 1,
      upper: 1440,
      step_increment: 5,
      page_increment: 30,
      value: settings.get_int('wallpaper-cycle-interval'),
    }),
  });
  settings.bind('wallpaper-cycle-interval', intervalRow, 'value', Gio.SettingsBindFlags.DEFAULT);
  group.add(intervalRow);

  return page;
}
