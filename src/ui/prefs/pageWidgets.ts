/**
 * Widgets preferences page — desktop audio visualizer and future desktop widgets.
 */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { isCavaInstalled } from '../../widgets/cavaRunner.js';
import { createComboRow, createSpinRow } from './visualizerRows.js';

export function createWidgetsPage(settings: Gio.Settings): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({
    title: 'Widgets',
    icon_name: 'preferences-desktop-display-symbolic',
  });

  const cavaAvailable = isCavaInstalled();
  const mainGroup = new Adw.PreferencesGroup({
    title: 'Audio Visualizer',
    description:
      'Transparent Material You CAVA visualizer embedded on your desktop behind open windows',
  });
  page.add(mainGroup);

  const enableRow = new Adw.SwitchRow({
    title: 'Desktop Audio Visualizer',
    subtitle: cavaAvailable
      ? 'Uses CAVA audio capture with live Material You colors'
      : 'Requires cava (install the cava package to enable)',
  });
  enableRow.sensitive = cavaAvailable;
  settings.bind('visualizer-enabled', enableRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  mainGroup.add(enableRow);

  const positionRow = createComboRow(settings, {
    key: 'visualizer-position',
    title: 'Screen Position',
    subtitle: 'Desktop side where the visualizer is anchored',
    labels: ['Bottom', 'Top', 'Left', 'Right'],
    values: ['bottom', 'top', 'left', 'right'],
  });
  const styleRow = createComboRow(settings, {
    key: 'visualizer-style',
    title: 'Visual Style',
    subtitle: 'Bars, center-mirrored bars, or smooth filled wave',
    labels: ['Bars', 'Mirrored', 'Wave'],
    values: ['bars', 'mirrored', 'wave'],
  });
  const colorRow = createComboRow(settings, {
    key: 'visualizer-color-mode',
    title: 'Color Mode',
    subtitle: 'How Material You palette colors flow across the visualizer',
    labels: ['Base to Tip', 'Across Spectrum', 'Solid Accent'],
    values: ['vertical', 'spectrum', 'solid'],
  });
  const pauseFullscreenRow = new Adw.SwitchRow({
    title: 'Pause in Fullscreen',
    subtitle: 'Hide the visualizer and suspend CAVA when a fullscreen window is active',
  });
  settings.bind('visualizer-pause-fullscreen', pauseFullscreenRow, 'active', Gio.SettingsBindFlags.DEFAULT);

  for (const row of [positionRow, styleRow, colorRow, pauseFullscreenRow]) {
    mainGroup.add(row);
  }

  const geometryGroup = new Adw.PreferencesGroup({
    title: 'Padding & Geometry',
  });
  page.add(geometryGroup);

  const basePaddingRow = createSpinRow(settings, {
    key: 'visualizer-base-padding', title: 'Base Padding (px)',
    subtitle: 'Gap between the anchored screen edge and the visualizer base',
    min: 0, max: 240, step: 4, pageStep: 16,
  });
  const sidePaddingRow = createSpinRow(settings, {
    key: 'visualizer-side-padding', title: 'Side Padding (px)',
    subtitle: 'Gap between both ends of the visualizer and the perpendicular screen edges',
    min: 0, max: 480, step: 8, pageStep: 32,
  });
  const thicknessRow = createSpinRow(settings, {
    key: 'visualizer-thickness', title: 'Visualizer Size (px)',
    subtitle: 'Maximum height or width perpendicular to the anchored edge',
    min: 40, max: 400, step: 10, pageStep: 40,
  });
  const barCountRow = createSpinRow(settings, {
    key: 'visualizer-bar-count', title: 'Bar Count',
    subtitle: 'Number of CAVA frequency bands sampled across the span',
    min: 12, max: 96, step: 4, pageStep: 12,
  });
  const barSpacingRow = createSpinRow(settings, {
    key: 'visualizer-bar-spacing', title: 'Bar Spacing (%)',
    subtitle: 'Gap ratio between adjacent bars',
    min: 0, max: 70, step: 2, pageStep: 10,
  });
  const cornerRadiusRow = createSpinRow(settings, {
    key: 'visualizer-corner-radius', title: 'Corner Radius (%)',
    subtitle: 'Bar roundness from sharp corners (0%) to capsule ends (100%)',
    min: 0, max: 100, step: 5, pageStep: 20,
  });
  const opacityRow = createSpinRow(settings, {
    key: 'visualizer-opacity', title: 'Opacity (%)',
    subtitle: 'Maximum visualizer opacity percentage',
    min: 15, max: 100, step: 5, pageStep: 15,
  });

  const barOnlyRows: Gtk.Widget[] = [barSpacingRow, cornerRadiusRow];
  const allRows: Gtk.Widget[] = [
    positionRow, styleRow, colorRow, pauseFullscreenRow,
    basePaddingRow, sidePaddingRow, thicknessRow, barCountRow,
    barSpacingRow, cornerRadiusRow, opacityRow,
  ];
  for (const row of [
    basePaddingRow, sidePaddingRow, thicknessRow, barCountRow,
    barSpacingRow, cornerRadiusRow, opacityRow,
  ]) {
    geometryGroup.add(row);
  }

  const syncSensitivity = (): void => {
    const active = cavaAvailable && settings.get_boolean('visualizer-enabled');
    const isWave = settings.get_string('visualizer-style') === 'wave';
    for (const control of allRows) {
      control.sensitive = active && !(isWave && barOnlyRows.includes(control));
    }
  };
  syncSensitivity();
  settings.connect('changed::visualizer-enabled', syncSensitivity);
  settings.connect('changed::visualizer-style', syncSensitivity);

  return page;
}
