/**
 * General preferences page for MeowterialYou.
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

export function createGeneralPage(settings: Gio.Settings): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({
    title: 'General',
    icon_name: 'preferences-desktop-theme-symbolic',
  });

  const group = new Adw.PreferencesGroup({
    title: 'Theme and Appearance',
    description: 'Configure system theme behavior and dynamic color variants',
  });
  page.add(group);

  // 1. Theme Mode Row
  const modeRow = new Adw.ComboRow({
    title: 'Theme Mode',
    subtitle: 'Follow GNOME system light/dark setting or force a mode',
    model: Gtk.StringList.new(['Follow System', 'Dark Mode', 'Light Mode']),
  });

  const modeValues = ['system', 'dark', 'light'];
  const currentMode = settings.get_string('theme-mode');
  const initialModeIndex = Math.max(0, modeValues.indexOf(currentMode));
  modeRow.set_selected(initialModeIndex);

  modeRow.connect('notify::selected', () => {
    const selectedMode = modeValues[modeRow.get_selected()] ?? 'system';
    settings.set_string('theme-mode', selectedMode);
  });
  group.add(modeRow);

  // 2. Scheme Variant Row
  const variantLabels = [
    'Tonal Spot (Default)',
    'Neutral',
    'Vibrant',
    'Expressive',
    'Rainbow',
    'Fruit Salad',
    'Content',
    'Monochrome',
    'Fidelity',
  ];
  const variantValues = [
    'tonal-spot',
    'neutral',
    'vibrant',
    'expressive',
    'rainbow',
    'fruit-salad',
    'content',
    'monochrome',
    'fidelity',
  ];

  const variantRow = new Adw.ComboRow({
    title: 'Scheme Variant',
    subtitle: 'Material You color generation algorithm variant',
    model: Gtk.StringList.new(variantLabels),
  });

  const currentVariant = settings.get_string('scheme-variant');
  const initialVariantIndex = Math.max(0, variantValues.indexOf(currentVariant));
  variantRow.set_selected(initialVariantIndex);

  variantRow.connect('notify::selected', () => {
    const selectedVariant = variantValues[variantRow.get_selected()] ?? 'tonal-spot';
    settings.set_string('scheme-variant', selectedVariant);
  });
  group.add(variantRow);

  // 3. Transparent Panel Switch
  const transparentRow = new Adw.SwitchRow({
    title: 'Transparent Top Bar',
    subtitle: 'Make the GNOME Shell top panel transparent',
  });
  settings.bind('transparent-panel', transparentRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  group.add(transparentRow);

  // 4. Show Top Bar Indicator Switch
  const indicatorRow = new Adw.SwitchRow({
    title: 'Show Top Bar Indicator',
    subtitle: 'Display quick actions icon in the GNOME Shell top panel',
  });
  settings.bind('show-indicator', indicatorRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  group.add(indicatorRow);

  return page;
}
