/**
 * Fastfetch preferences group for the Apps settings page.
 */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { isFastfetchDetected } from '../../apps/fastfetchTheme.js';

export function createFastfetchGroup(
  settings: Gio.Settings,
  parentWindow?: Gtk.Window
): Adw.PreferencesGroup {
  const group = new Adw.PreferencesGroup({
    title: 'Fastfetch',
    description:
      'Apply wallpaper Material You colors and auto-calculated logo geometry to ~/.config/fastfetch/config.jsonc',
  });

  const enableRow = new Adw.SwitchRow({
    title: 'Fastfetch Theming',
    subtitle: isFastfetchDetected()
      ? 'Detected — updates config.jsonc colors and image logo sizing directly (no scripts)'
      : 'Fastfetch not detected — applies automatically once installed',
  });
  settings.bind('fastfetch-enabled', enableRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  group.add(enableRow);

  const layoutRow = new Adw.SwitchRow({
    title: 'Use MeowterialYou Preset Layout',
    subtitle:
      'Apply the 3-section grouped module layout (disable to keep your existing modules)',
  });
  settings.bind('fastfetch-manage-layout', layoutRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  settings.bind('fastfetch-enabled', layoutRow, 'sensitive', Gio.SettingsBindFlags.GET);
  group.add(layoutRow);

  const cycleRow = new Adw.SwitchRow({
    title: 'Cycle Fastfetch Logo',
    subtitle: 'Rotate logo image from the Fastfetch logo folder on every Fastfetch launch',
  });
  settings.bind('fastfetch-logo-cycle', cycleRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  settings.bind('fastfetch-enabled', cycleRow, 'sensitive', Gio.SettingsBindFlags.GET);
  group.add(cycleRow);

  const currentDir = settings.get_string('fastfetch-logo-directory');
  const dirRow = new Adw.ActionRow({
    title: 'Fastfetch Logo Folder',
    subtitle: currentDir || 'No folder selected (uses existing config.jsonc logo)',
  });
  settings.bind('fastfetch-enabled', dirRow, 'sensitive', Gio.SettingsBindFlags.GET);

  const clearButton = new Gtk.Button({
    icon_name: 'edit-clear-symbolic',
    tooltip_text: 'Clear Fastfetch logo folder',
    valign: Gtk.Align.CENTER,
    visible: Boolean(currentDir),
  });
  clearButton.connect('clicked', () => {
    settings.set_string('fastfetch-logo-directory', '');
    settings.set_string('fastfetch-last-logo', '');
    dirRow.set_subtitle('No folder selected (uses existing config.jsonc logo)');
    clearButton.set_visible(false);
  });

  const browseButton = new Gtk.Button({
    label: 'Browse…',
    valign: Gtk.Align.CENTER,
  });
  browseButton.connect('clicked', () => {
    const dialog = new Gtk.FileDialog({
      title: 'Select Fastfetch Logo Folder',
    });
    dialog.select_folder(parentWindow ?? null, null, (_source, result) => {
      try {
        const folder = dialog.select_folder_finish(result);
        const path = folder?.get_path();
        if (path) {
          settings.set_string('fastfetch-logo-directory', path);
          dirRow.set_subtitle(path);
          clearButton.set_visible(true);
        }
      } catch {
        // User cancelled dialog
      }
    });
  });

  dirRow.add_suffix(clearButton);
  dirRow.add_suffix(browseButton);
  group.add(dirRow);

  return group;
}
