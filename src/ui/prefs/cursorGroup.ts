/**
 * Material You cursor preferences group for the Appearance settings page.
 */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {
  detectCurrentCursorTheme,
  scanInstalledCursorThemes,
} from '../../icons/cursorScanner.js';
import { createComboRow } from './visualizerRows.js';

export function createCursorGroup(settings: Gio.Settings): Adw.PreferencesGroup {
  const group = new Adw.PreferencesGroup({
    title: 'Cursor',
    description: 'Repack your current Xcursor pack with live Material You colors',
  });

  const enableRow = new Adw.SwitchRow({
    title: 'Use MeowterialYou Cursor',
    subtitle: 'Generates and activates ~/.local/share/icons/MeowterialYou-Cursor',
  });
  settings.bind('themed-cursors-enabled', enableRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  group.add(enableRow);

  const cursorThemes = scanInstalledCursorThemes();
  const names = cursorThemes.map((t) => t.name);
  const ids = cursorThemes.map((t) => t.id);

  const detected = detectCurrentCursorTheme();
  const stored = settings.get_string('base-cursor-theme');
  const activeBase = stored && ids.includes(stored) ? stored : detected || ids[0] || '';
  if (activeBase && activeBase !== stored) {
    settings.set_string('base-cursor-theme', activeBase);
  }

  const baseRow = new Adw.ComboRow({
    title: 'Base Cursor Pack',
    subtitle: 'Source cursor theme to recolor and restore when disabled',
    model: Gtk.StringList.new(names.length > 0 ? names : ['Adwaita']),
  });
  baseRow.set_selected(Math.max(0, ids.indexOf(activeBase)));
  baseRow.connect('notify::selected', () => {
    const selectedId = ids[baseRow.get_selected()];
    if (selectedId) settings.set_string('base-cursor-theme', selectedId);
  });
  baseRow.sensitive = ids.length > 0 && settings.get_boolean('themed-cursors-enabled');
  group.add(baseRow);

  const styleRow = createComboRow(settings, {
    key: 'themed-cursor-style',
    title: 'Cursor Style',
    subtitle: 'Color mapping between cursor body fill and outline',
    labels: ['Tinted Fill + Crisp Outline', 'Vibrant Accent Fill', 'Dark Body + Accent Outline'],
    values: ['tinted-fill', 'accent-fill', 'accent-outline'],
  });
  styleRow.sensitive = settings.get_boolean('themed-cursors-enabled');
  group.add(styleRow);

  settings.connect('changed::themed-cursors-enabled', () => {
    const enabled = settings.get_boolean('themed-cursors-enabled');
    baseRow.sensitive = ids.length > 0 && enabled;
    styleRow.sensitive = enabled;
  });

  return group;
}
