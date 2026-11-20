/**
 * Top Bar preferences page — panel element visibility, indicators, and overview tweaks.
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

export function createTweaksPage(settings: Gio.Settings): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({
    title: 'Top Bar',
    icon_name: 'view-app-grid-symbolic',
  });

  // ── Panel Element Visibility ──────────────────────────────────────────────
  const topBarGroup = new Adw.PreferencesGroup({
    title: 'Panel Element Visibility',
    description: 'Toggle individual icons and indicators in the top bar',
  });
  page.add(topBarGroup);

  const workspaceRow = new Adw.SwitchRow({
    title: 'Hide Workspace Indicator',
    subtitle: 'Remove the Activities button and workspace dots from the top bar',
  });
  settings.bind('hide-workspace-indicator', workspaceRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  topBarGroup.add(workspaceRow);

  const a11yRow = new Adw.SwitchRow({
    title: 'Hide Accessibility Menu',
    subtitle: 'Remove the accessibility (a11y) icon from the top bar',
  });
  settings.bind('hide-a11y-indicator', a11yRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  topBarGroup.add(a11yRow);

  const keyboardRow = new Adw.SwitchRow({
    title: 'Hide Keyboard Layout Indicator',
    subtitle: 'Remove the input source badge from the top bar',
  });
  settings.bind('hide-keyboard-indicator', keyboardRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  topBarGroup.add(keyboardRow);

  const notificationDotRow = new Adw.SwitchRow({
    title: 'Hide Clock Notification Dot',
    subtitle: 'Remove the notification dot and bell icon from the date display',
  });
  settings.bind('hide-notification-dot', notificationDotRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  topBarGroup.add(notificationDotRow);

  // ── App Indicators ────────────────────────────────────────────────────────
  const spacingGroup = new Adw.PreferencesGroup({
    title: 'App Indicators',
    description: 'Fine-tune spacing and density for status tray icons',
  });
  page.add(spacingGroup);

  const spacingLabels = [
    'Default (12px)',
    'Relaxed (8px)',
    'Compact (4px)',
    'Ultra-Compact (1px)',
  ];
  const spacingValues = ['default', 'relaxed', 'compact', 'ultra-compact'];

  const spacingRow = new Adw.ComboRow({
    title: 'Indicator Gap',
    subtitle: 'Horizontal spacing between status tray app indicators',
    model: Gtk.StringList.new(spacingLabels),
  });
  const currentSpacing = settings.get_string('indicator-spacing');
  spacingRow.set_selected(Math.max(0, spacingValues.indexOf(currentSpacing)));
  spacingRow.connect('notify::selected', () => {
    settings.set_string('indicator-spacing', spacingValues[spacingRow.get_selected()] ?? 'default');
  });
  spacingGroup.add(spacingRow);

  // ── Overview and Windows ──────────────────────────────────────────────────
  const overviewGroup = new Adw.PreferencesGroup({
    title: 'Overview and Windows',
    description: 'Refine desktop overview appearance and interactions',
  });
  page.add(overviewGroup);

  const typeToSearchRow = new Adw.SwitchRow({
    title: 'Type to Search',
    subtitle: 'Hide the search entry in overview until typing begins',
  });
  settings.bind('type-to-search', typeToSearchRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  overviewGroup.add(typeToSearchRow);

  const closeButtonRow = new Adw.SwitchRow({
    title: 'Hide Window Close Buttons',
    subtitle: 'Remove the floating close button on window thumbnails in overview',
  });
  settings.bind('hide-window-close-button', closeButtonRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  overviewGroup.add(closeButtonRow);

  return page;
}

