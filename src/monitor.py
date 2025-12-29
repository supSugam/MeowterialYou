import os
import gi
from urllib.parse import unquote
from src.applier.domain import ApplierDomain

gi.require_version("Gio", "2.0")
from gi.repository import Gio, GLib

class Monitor:
    def __init__(self, applier_domain: ApplierDomain):
        self._applier_domain = applier_domain
        self._loop = GLib.MainLoop()
        self._current_file_monitor = None
        self._current_path = None

    def start(self):
        print("Starting headless wallpaper & color-scheme monitor...")
        print("Press Ctrl+C to stop.")

        # Initial setup: Get current wallpaper and start monitoring it
        initial_path = self._applier_domain._generation_options.wallpaper_path
        if initial_path:
            # Manually trigger initial watch setup
            self._update_file_monitor(initial_path)

        self._setup_settings_monitor()

        try:
            self._loop.run()
        except KeyboardInterrupt:
            print("\nStopping monitor...")
            self._loop.quit()

    def _setup_settings_monitor(self):
        # Watch for wallpaper changes
        bg_schema = "org.gnome.desktop.background"
        keys_to_watch = ["picture-uri", "picture-uri-dark"]

        try:
            self._bg_settings = Gio.Settings.new(bg_schema)
            for key in keys_to_watch:
                self._bg_settings.connect(f"changed::{key}", self._on_wallpaper_changed)
                print(f"Watching GSettings: {bg_schema} {key}")
        except Exception as e:
            print(f"Error setting up wallpaper GSettings monitor: {e}")
            self._loop.quit()
            return

        # Watch for color-scheme changes (dark/light mode switching)
        interface_schema = "org.gnome.desktop.interface"
        try:
            self._interface_settings = Gio.Settings.new(interface_schema)
            self._interface_settings.connect(
                "changed::color-scheme", self._on_color_scheme_changed
            )
            print(f"Watching GSettings: {interface_schema} color-scheme")
        except Exception as e:
            print(f"Error setting up color-scheme GSettings monitor: {e}")

    def _on_wallpaper_changed(self, settings, key):
        new_uri = settings.get_string(key)
        if not new_uri:
            return

        new_path = self._uri_to_path(new_uri)
        print(f"Wallpaper changed. New path: {new_path}")

        # Update theme AND update the file watcher to the new file
        self._update_theme(new_path)
        self._update_file_monitor(new_path)

    def _on_color_scheme_changed(self, settings, key):
        color_scheme = settings.get_string(key)
        # 'default' or 'prefer-light' = light mode, 'prefer-dark' = dark mode
        is_light_mode = color_scheme != "prefer-dark"
        current_light_mode = self._applier_domain._generation_options.lightmode_enabled

        if is_light_mode == current_light_mode:
            return  # No change needed

        mode_str = "light" if is_light_mode else "dark"
        print(f"Color scheme changed to: {color_scheme} (applying {mode_str} theme)")

        # Update the lightmode setting and regenerate the theme
        self._applier_domain._generation_options.lightmode_enabled = is_light_mode
        self._applier_domain.reset_scheme()
        self._applier_domain.apply_theme()
        print(f"{mode_str.capitalize()} theme applied successfully.")

    def _update_file_monitor(self, path):
        if self._current_path == path and self._current_file_monitor:
            return # Already watching this file

        self._current_path = path

        # Clean up old monitor
        if self._current_file_monitor:
            self._current_file_monitor.cancel()
            self._current_file_monitor = None

        if not path or not os.path.exists(path):
            print(f"Cannot monitor file: {path} (not found)")
            return

        try:
            gfile = Gio.File.new_for_path(path)
            self._current_file_monitor = gfile.monitor_file(Gio.FileMonitorFlags.NONE, None)
            self._current_file_monitor.connect("changed", self._on_file_changed)
            print(f"Watching File System: {path}")
        except Exception as e:
            print(f"Failed to create file monitor for {path}: {e}")

    def _on_file_changed(self, monitor, file, other_file, event_type):
        # We only care when the file is finished being written to avoid partial reads
        if event_type == Gio.FileMonitorEvent.CHANGES_DONE_HINT:
            path = file.get_path()
            print(f"File system change detected: {path}")
            self._update_theme(path)

    def _update_theme(self, new_path):
        try:
            # Add a small delay/debounce might be necessary if file is still locked,
            # but standard reads should be fine after CHANGES_DONE_HINT
            self._applier_domain.set_wallpaper_path(new_path)
            self._applier_domain.reset_scheme()
            self._applier_domain.apply_theme()
            print("Theme updated successfully.")
        except Exception as e:
            print(f"Error updating theme: {e}")

    def _uri_to_path(self, uri):
        if uri.startswith("file://"):
            path = uri.replace("file://", "")
        else:
            path = uri
        return unquote(path)
