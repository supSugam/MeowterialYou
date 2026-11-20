/**
 * General preferences page — theme engine and toolkit configuration.
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

export function createGeneralPage(settings: Gio.Settings): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({
    title: 'General',
    icon_name: 'preferences-desktop-theme-symbolic',
  });

  // ── Theme and Appearance ──────────────────────────────────────────────────
  const themeGroup = new Adw.PreferencesGroup({
    title: 'Theme and Appearance',
    description: 'Dynamic color generation and top bar display options',
  });
  page.add(themeGroup);

  const modeRow = new Adw.ComboRow({
    title: 'Theme Mode',
    subtitle: 'Force dark or light mode — the extension always syncs with system automatically',
    model: Gtk.StringList.new(['Dark Mode', 'Light Mode']),
  });
  const modeValues = ['dark', 'light'];
  const currentMode = settings.get_string('theme-mode');
  modeRow.set_selected(Math.max(0, modeValues.indexOf(currentMode)));
  modeRow.connect('notify::selected', () => {
    settings.set_string('theme-mode', modeValues[modeRow.get_selected()] ?? 'dark');
  });
  themeGroup.add(modeRow);

  const variantLabels = [
    'Tonal Spot (Default)', 'Neutral', 'Vibrant', 'Expressive',
    'Rainbow', 'Fruit Salad', 'Content', 'Monochrome', 'Fidelity',
  ];
  const variantValues = [
    'tonal-spot', 'neutral', 'vibrant', 'expressive',
    'rainbow', 'fruit-salad', 'content', 'monochrome', 'fidelity',
  ];
  const variantRow = new Adw.ComboRow({
    title: 'Scheme Variant',
    subtitle: 'Material You color generation algorithm variant',
    model: Gtk.StringList.new(variantLabels),
  });
  const currentVariant = settings.get_string('scheme-variant');
  variantRow.set_selected(Math.max(0, variantValues.indexOf(currentVariant)));
  variantRow.connect('notify::selected', () => {
    settings.set_string('scheme-variant', variantValues[variantRow.get_selected()] ?? 'tonal-spot');
  });
  themeGroup.add(variantRow);

  const transparentRow = new Adw.SwitchRow({
    title: 'Transparent Top Bar',
    subtitle: 'Make the GNOME Shell top panel transparent with wallpaper-aware contrast',
  });
  settings.bind('transparent-panel', transparentRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  themeGroup.add(transparentRow);

  const indicatorRow = new Adw.SwitchRow({
    title: 'Show Top Bar Indicator',
    subtitle: 'Display the MeowterialYou quick-actions icon in the top panel',
  });
  settings.bind('show-indicator', indicatorRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  themeGroup.add(indicatorRow);

  // ── Toolkit Targets ───────────────────────────────────────────────────────
  const toolkitGroup = new Adw.PreferencesGroup({
    title: 'Toolkit Targets',
    description: 'Enable or disable CSS theme generation per system component',
  });
  page.add(toolkitGroup);

  const shellRow = new Adw.SwitchRow({
    title: 'GNOME Shell Theme',
    subtitle: 'Generate stylesheet for the top bar, popups, and shell UI',
  });
  settings.bind('shell-theme-enabled', shellRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  toolkitGroup.add(shellRow);

  const gtk4Row = new Adw.SwitchRow({
    title: 'GTK4 Theming',
    subtitle: 'Generate theme for modern GNOME apps (Libadwaita / ~/.config/gtk-4.0)',
  });
  settings.bind('gtk4-enabled', gtk4Row, 'active', Gio.SettingsBindFlags.DEFAULT);
  toolkitGroup.add(gtk4Row);

  const gtk3Row = new Adw.SwitchRow({
    title: 'GTK3 Theming',
    subtitle: 'Generate theme for classic GTK3 apps (~/.config/gtk-3.0)',
  });
  settings.bind('gtk3-enabled', gtk3Row, 'active', Gio.SettingsBindFlags.DEFAULT);
  toolkitGroup.add(gtk3Row);

  return page;
}

