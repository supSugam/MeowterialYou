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
    title: 'Wallpaper Slideshow',
    description: 'Periodically rotate wallpapers from a folder and auto-update themes',
  });
  page.add(group);

  // 1. Enable Slideshow Switch
  const enableRow = new Adw.SwitchRow({
    title: 'Enable Slideshow Cycling',
    subtitle: 'Rotate desktop wallpaper automatically on a schedule',
  });
  settings.bind('wallpaper-cycle-enabled', enableRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  group.add(enableRow);

  // 2. Wallpaper Directory Row with Folder Chooser
  const dirRow = new Adw.ActionRow({
    title: 'Wallpaper Directory',
    subtitle: settings.get_string('wallpaper-cycle-directory') || 'No directory selected',
  });

  const browseButton = new Gtk.Button({
    label: 'Browse…',
    valign: Gtk.Align.CENTER,
  });

  browseButton.connect('clicked', () => {
    const dialog = new Gtk.FileDialog({
      title: 'Select Wallpaper Directory',
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

  // 3. Cycle Interval (minutes)
  const intervalRow = new Adw.SpinRow({
    title: 'Cycle Interval (Minutes)',
    subtitle: 'Time between wallpaper transitions',
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

  // 4. Shuffle Order Switch
  const shuffleRow = new Adw.SwitchRow({
    title: 'Shuffle Wallpapers',
    subtitle: 'Randomize sequence without repeating until all are shown',
  });
  settings.bind('wallpaper-cycle-shuffle', shuffleRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  group.add(shuffleRow);

  return page;
}
