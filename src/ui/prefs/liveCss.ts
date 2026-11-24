/**
 * Live CSS hot-reloader for GTK4/Libadwaita preferences windows.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw';
import type Gdk from 'gi://Gdk';

export class LiveCssManager {
  private _provider: Gtk.CssProvider | null = null;
  private _monitor: Gio.FileMonitor | null = null;
  private _monitorSignalId: number = 0;
  private _settingsSignalIds: number[] = [];
  private _settings: Gio.Settings | null = null;

  attach(window: Adw.PreferencesWindow, settings: Gio.Settings): void {
    const display = window.get_display();
    if (!display) {
      return;
    }

    this._settings = settings;

    const gtkCssPath = GLib.build_filenamev([
      GLib.get_home_dir(),
      '.config',
      'gtk-4.0',
      'gtk.css',
    ]);
    const file = Gio.File.new_for_path(gtkCssPath);

    const reloadCss = (): void => {
      if (!file.query_exists(null)) {
        return;
      }
      try {
        const newProvider = new Gtk.CssProvider();
        newProvider.load_from_path(gtkCssPath);
        if (this._provider) {
          try {
            Gtk.StyleContext.remove_provider_for_display(display, this._provider);
          } catch {
            // Ignored if provider was already detached
          }
        }
        Gtk.StyleContext.add_provider_for_display(
          display,
          newProvider,
          Gtk.STYLE_PROVIDER_PRIORITY_USER + 10
        );
        this._provider = newProvider;
      } catch (error) {
        console.warn('MeowterialYou Prefs: Could not reload live CSS', error);
      }
    };

    const syncTheme = (): void => {
      const isDark = settings.get_string('theme-mode') === 'dark';
      try {
        Adw.StyleManager.get_default().set_color_scheme(
          isDark ? Adw.ColorScheme.FORCE_DARK : Adw.ColorScheme.FORCE_LIGHT
        );
      } catch (error) {
        console.warn('MeowterialYou Prefs: Failed to sync Adw style manager', error);
      }
      reloadCss();
    };

    syncTheme();

    if (file.query_exists(null)) {
      this._monitor = file.monitor_file(Gio.FileMonitorFlags.NONE, null);
      this._monitorSignalId = this._monitor.connect(
        'changed',
        (_mon, _file, _otherFile, eventType) => {
          if (
            eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
            eventType === Gio.FileMonitorEvent.CHANGED ||
            eventType === Gio.FileMonitorEvent.CREATED
          ) {
            reloadCss();
          }
        }
      );
    }

    this._settingsSignalIds.push(
      settings.connect('changed::theme-mode', () => {
        syncTheme();
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
          reloadCss();
          return GLib.SOURCE_REMOVE;
        });
      }),
      settings.connect('changed::scheme-variant', () => reloadCss()),
      settings.connect('changed::window-button-style', () => reloadCss())
    );

    window.connect('destroy', () => {
      this.destroy(display);
    });
  }

  destroy(display: Gdk.Display): void {
    if (this._settings) {
      for (const id of this._settingsSignalIds) {
        this._settings.disconnect(id);
      }
      this._settingsSignalIds = [];
      this._settings = null;
    }

    if (this._monitor && this._monitorSignalId) {
      this._monitor.disconnect(this._monitorSignalId);
      this._monitorSignalId = 0;
    }
    this._monitor = null;

    if (this._provider) {
      try {
        Gtk.StyleContext.remove_provider_for_display(display, this._provider);
      } catch {
        // Ignored if display already disposed
      }
      this._provider = null;
    }

    try {
      Adw.StyleManager.get_default().set_color_scheme(Adw.ColorScheme.DEFAULT);
    } catch {
      // Ignored if already disposed
    }
  }
}
