/**
 * Reusable Adwaita row factories for the Desktop Widgets preferences page.
 */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

export interface SpinRowSpec {
  key: string;
  title: string;
  subtitle: string;
  min: number;
  max: number;
  step: number;
  pageStep: number;
}

export interface ComboRowSpec {
  key: string;
  title: string;
  subtitle: string;
  labels: ReadonlyArray<string>;
  values: ReadonlyArray<string>;
}

export function createSpinRow(settings: Gio.Settings, spec: SpinRowSpec): Adw.SpinRow {
  const row = new Adw.SpinRow({
    title: spec.title,
    subtitle: spec.subtitle,
    adjustment: new Gtk.Adjustment({
      lower: spec.min,
      upper: spec.max,
      step_increment: spec.step,
      page_increment: spec.pageStep,
      value: settings.get_int(spec.key),
    }),
  });
  settings.bind(spec.key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
  return row;
}

export function createComboRow(settings: Gio.Settings, spec: ComboRowSpec): Adw.ComboRow {
  const row = new Adw.ComboRow({
    title: spec.title,
    subtitle: spec.subtitle,
    model: Gtk.StringList.new(spec.labels as string[]),
  });
  const current = settings.get_string(spec.key);
  row.set_selected(Math.max(0, spec.values.indexOf(current)));
  row.connect('notify::selected', () => {
    const selected = spec.values[row.get_selected()] ?? spec.values[0];
    if (selected) settings.set_string(spec.key, selected);
  });
  return row;
}
