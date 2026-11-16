/**
 * Live CSS hot-reloader for GTK4/Libadwaita preferences windows.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import type Adw from 'gi://Adw';
import type Gdk from 'gi://Gdk';

export class LiveCssManager {
  private _provider: Gtk.CssProvider | null = null;
  private _monitor: Gio.FileMonitor | null = null;
  private _monitorSignalId: number = 0;

  attach(window: Adw.PreferencesWindow): void {
    const display = window.get_display();
    if (!display) {
      return;
    }

    const gtkCssPath = GLib.build_filenamev([
      GLib.get_home_dir(),
      '.config',
      'gtk-4.0',
      'gtk.css',
    ]);
    const file = Gio.File.new_for_path(gtkCssPath);
    if (!file.query_exists(null)) {
      return;
    }

    this._provider = new Gtk.CssProvider();
    try {
      this._provider.load_from_path(gtkCssPath);
      Gtk.StyleContext.add_provider_for_display(
        display,
        this._provider,
        Gtk.STYLE_PROVIDER_PRIORITY_USER + 10
      );
    } catch (error) {
      console.warn('MeowterialYou Prefs: Could not initialize live CSS provider', error);
    }

    this._monitor = file.monitor_file(Gio.FileMonitorFlags.NONE, null);
    this._monitorSignalId = this._monitor.connect(
      'changed',
      (_mon, _file, _otherFile, eventType) => {
        if (
          eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
          eventType === Gio.FileMonitorEvent.CHANGED
        ) {
          try {
            this._provider?.load_from_path(gtkCssPath);
          } catch (error) {
            console.warn('MeowterialYou Prefs: Could not reload live CSS', error);
          }
        }
      }
    );

    window.connect('destroy', () => {
      this.destroy(display);
    });
  }

  destroy(display: Gdk.Display): void {
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
  }
}
