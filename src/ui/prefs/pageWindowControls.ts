/**
 * Window control buttons preferences page.
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import type Gio from 'gi://Gio';

export function createWindowControlsPage(settings: Gio.Settings): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({
    title: 'Window Controls',
    icon_name: 'preferences-system-windows-symbolic',
  });

  const group = new Adw.PreferencesGroup({
    title: 'Window Buttons',
    description: 'Customize window control buttons and position',
  });
  page.add(group);

  // 1. Button Style Row
  const styleRow = new Adw.ComboRow({
    title: 'Button Style',
    subtitle: 'Standard GNOME buttons or macOS-style colored circles',
    model: Gtk.StringList.new(['Native', 'macOS Style']),
  });

  const styleValues = ['native', 'mac'];
  const currentStyle = settings.get_string('window-button-style');
  styleRow.set_selected(Math.max(0, styleValues.indexOf(currentStyle)));

  styleRow.connect('notify::selected', () => {
    const selectedStyle = styleValues[styleRow.get_selected()] ?? 'native';
    settings.set_string('window-button-style', selectedStyle);
  });
  group.add(styleRow);

  // 2. Button Position Row
  const posRow = new Adw.ComboRow({
    title: 'Button Position',
    subtitle: 'Side of window titlebar for controls',
    model: Gtk.StringList.new(['Right Side', 'Left Side']),
  });

  const posValues = ['right', 'left'];
  const currentPos = settings.get_string('window-button-position');
  posRow.set_selected(Math.max(0, posValues.indexOf(currentPos)));

  posRow.connect('notify::selected', () => {
    const selectedPos = posValues[posRow.get_selected()] ?? 'right';
    settings.set_string('window-button-position', selectedPos);
  });
  group.add(posRow);

  return page;
}
