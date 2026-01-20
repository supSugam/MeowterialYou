/**
 * MeowterialYou Widgets - Extension Preferences
 * Settings UI using libadwaita
 */

import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class MeowterialYouWidgetsPreferences extends ExtensionPreferences {
  private _settings?: Gio.Settings;

  fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
    this._settings = this.getSettings();

    // === General Page ===
    const generalPage = new Adw.PreferencesPage({
      title: _('General'),
      icon_name: 'preferences-system-symbolic',
    });
    window.add(generalPage);

    // Widgets Group
    const widgetsGroup = new Adw.PreferencesGroup({
      title: _('Widgets'),
      description: _('Enable or disable widgets'),
    });
    generalPage.add(widgetsGroup);

    // WeatherClock toggle
    const weatherclockToggle = new Adw.SwitchRow({
      title: _('WeatherClock Widget'),
      subtitle: _('Show date, time, weather, and system metrics'),
    });
    widgetsGroup.add(weatherclockToggle);
    this._settings.bind('weatherclock-enabled', weatherclockToggle, 'active', Gio.SettingsBindFlags.DEFAULT);

    // Media toggle
    const mediaToggle = new Adw.SwitchRow({
      title: _('Media Widget'),
      subtitle: _('Show now playing media with controls'),
    });
    widgetsGroup.add(mediaToggle);
    this._settings.bind('media-enabled', mediaToggle, 'active', Gio.SettingsBindFlags.DEFAULT);

    // === WeatherClock Page ===
    const weatherclockPage = new Adw.PreferencesPage({
      title: _('WeatherClock'),
      icon_name: 'preferences-desktop-clock-symbolic',
    });
    window.add(weatherclockPage);

    // Position Group
    const wcPositionGroup = new Adw.PreferencesGroup({
      title: _('Position'),
      description: _('Negative values offset from right/bottom edge'),
    });
    weatherclockPage.add(wcPositionGroup);

    this._addSpinRow(wcPositionGroup, 'weatherclock-x', _('X Position'), -2000, 4000);
    this._addSpinRow(wcPositionGroup, 'weatherclock-y', _('Y Position'), -2000, 4000);
    this._addSpinRow(wcPositionGroup, 'weatherclock-width', _('Width'), 100, 800);
    this._addSpinRow(wcPositionGroup, 'weatherclock-height', _('Height'), 100, 800);

    // Appearance Group
    const wcAppearanceGroup = new Adw.PreferencesGroup({
      title: _('Appearance'),
    });
    weatherclockPage.add(wcAppearanceGroup);

    this._addSpinRow(wcAppearanceGroup, 'weatherclock-corner-radius', _('Corner Radius'), 0, 50);
    this._addSpinRow(wcAppearanceGroup, 'weatherclock-opacity', _('Background Opacity'), 0, 100);
    this._addSpinRow(wcAppearanceGroup, 'weatherclock-padding', _('Padding'), 0, 50);

    // Clock Group
    const wcClockGroup = new Adw.PreferencesGroup({
      title: _('Clock'),
    });
    weatherclockPage.add(wcClockGroup);

    this._addSpinRow(wcClockGroup, 'weatherclock-time-size', _('Time Font Size'), 24, 120);

    const timeFormatRow = new Adw.ComboRow({
      title: _('Time Format'),
    });
    timeFormatRow.set_model(Gtk.StringList.new(['12h', '24h']));
    wcClockGroup.add(timeFormatRow);
    const currentFormat = this._settings.get_string('weatherclock-time-format');
    timeFormatRow.set_selected(currentFormat === '24h' ? 1 : 0);
    timeFormatRow.connect('notify::selected', () => {
      this._settings?.set_string('weatherclock-time-format', timeFormatRow.selected === 1 ? '24h' : '12h');
    });

    const showAmpmRow = new Adw.SwitchRow({
      title: _('Show AM/PM'),
      subtitle: _('Only applies to 12h format'),
    });
    wcClockGroup.add(showAmpmRow);
    this._settings.bind('weatherclock-show-ampm', showAmpmRow, 'active', Gio.SettingsBindFlags.DEFAULT);

    // Weather Group
    const wcWeatherGroup = new Adw.PreferencesGroup({
      title: _('Weather'),
    });
    weatherclockPage.add(wcWeatherGroup);

    const showWeatherRow = new Adw.SwitchRow({
      title: _('Show Weather'),
    });
    wcWeatherGroup.add(showWeatherRow);
    this._settings.bind('weatherclock-show-weather', showWeatherRow, 'active', Gio.SettingsBindFlags.DEFAULT);

    const tempUnitRow = new Adw.ComboRow({
      title: _('Temperature Unit'),
    });
    tempUnitRow.set_model(Gtk.StringList.new(['Celsius (°C)', 'Fahrenheit (°F)']));
    wcWeatherGroup.add(tempUnitRow);
    const currentUnit = this._settings.get_string('weatherclock-weather-unit');
    tempUnitRow.set_selected(currentUnit === 'F' ? 1 : 0);
    tempUnitRow.connect('notify::selected', () => {
      this._settings?.set_string('weatherclock-weather-unit', tempUnitRow.selected === 1 ? 'F' : 'C');
    });

    this._addSpinRow(wcWeatherGroup, 'weatherclock-refresh-interval', _('Refresh Interval (min)'), 5, 60);

    // System Metrics Group
    const wcMetricsGroup = new Adw.PreferencesGroup({
      title: _('System Metrics'),
    });
    weatherclockPage.add(wcMetricsGroup);

    const showMetricsRow = new Adw.SwitchRow({
      title: _('Show System Metrics'),
      subtitle: _('CPU, RAM, Network, Temperature'),
    });
    wcMetricsGroup.add(showMetricsRow);
    this._settings.bind('weatherclock-show-metrics', showMetricsRow, 'active', Gio.SettingsBindFlags.DEFAULT);

    const showDividerRow = new Adw.SwitchRow({
      title: _('Show Divider'),
    });
    wcMetricsGroup.add(showDividerRow);
    this._settings.bind('weatherclock-show-divider', showDividerRow, 'active', Gio.SettingsBindFlags.DEFAULT);

    // Emoji Group
    const wcEmojiGroup = new Adw.PreferencesGroup({
      title: _('Emoji'),
    });
    weatherclockPage.add(wcEmojiGroup);

    const emojiEntry = new Adw.EntryRow({
      title: _('Emoji'),
    });
    wcEmojiGroup.add(emojiEntry);
    this._settings.bind('weatherclock-emoji', emojiEntry, 'text', Gio.SettingsBindFlags.DEFAULT);

    this._addSpinRowDouble(wcEmojiGroup, 'weatherclock-emoji-scale', _('Emoji Scale'), 0.1, 2.0, 0.1);
    this._addSpinRow(wcEmojiGroup, 'weatherclock-emoji-row', _('Emoji Row (1=date, 2=time)'), 1, 2);
    this._addSpinRow(wcEmojiGroup, 'weatherclock-emoji-rotate', _('Emoji Rotation (°)'), -180, 180);

    // === Media Page ===
    const mediaPage = new Adw.PreferencesPage({
      title: _('Media'),
      icon_name: 'audio-x-generic-symbolic',
    });
    window.add(mediaPage);

    // Position Group
    const mediaPositionGroup = new Adw.PreferencesGroup({
      title: _('Position'),
      description: _('Negative values offset from right/bottom edge'),
    });
    mediaPage.add(mediaPositionGroup);

    this._addSpinRow(mediaPositionGroup, 'media-x', _('X Position'), -2000, 4000);
    this._addSpinRow(mediaPositionGroup, 'media-y', _('Y Position'), -2000, 4000);
    this._addSpinRow(mediaPositionGroup, 'media-width', _('Width'), 200, 800);
    this._addSpinRow(mediaPositionGroup, 'media-height', _('Height'), 100, 400);

    // Appearance Group
    const mediaAppearanceGroup = new Adw.PreferencesGroup({
      title: _('Appearance'),
    });
    mediaPage.add(mediaAppearanceGroup);

    this._addSpinRow(mediaAppearanceGroup, 'media-corner-radius', _('Corner Radius'), 0, 50);
    this._addSpinRow(mediaAppearanceGroup, 'media-opacity', _('Background Opacity'), 0, 100);

    // Features Group
    const mediaFeaturesGroup = new Adw.PreferencesGroup({
      title: _('Features'),
    });
    mediaPage.add(mediaFeaturesGroup);

    const showControlsRow = new Adw.SwitchRow({
      title: _('Show Playback Controls'),
      subtitle: _('Previous, Play/Pause, Next buttons'),
    });
    mediaFeaturesGroup.add(showControlsRow);
    this._settings.bind('media-show-controls', showControlsRow, 'active', Gio.SettingsBindFlags.DEFAULT);

    const showProgressRow = new Adw.SwitchRow({
      title: _('Show Progress Bar'),
      subtitle: _('Seekable progress with time labels'),
    });
    mediaFeaturesGroup.add(showProgressRow);
    this._settings.bind('media-show-progress', showProgressRow, 'active', Gio.SettingsBindFlags.DEFAULT);

    return Promise.resolve();
  }

  private _addSpinRow(group: Adw.PreferencesGroup, key: string, title: string, min: number, max: number): void {
    const row = new Adw.SpinRow({
      title: _(title),
      adjustment: new Gtk.Adjustment({
        lower: min,
        upper: max,
        step_increment: 1,
      }),
    });
    group.add(row);
    this._settings?.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
  }

  private _addSpinRowDouble(group: Adw.PreferencesGroup, key: string, title: string, min: number, max: number, step: number): void {
    const row = new Adw.SpinRow({
      title: _(title),
      adjustment: new Gtk.Adjustment({
        lower: min,
        upper: max,
        step_increment: step,
      }),
      digits: 1,
    });
    group.add(row);
    this._settings?.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
  }
}
