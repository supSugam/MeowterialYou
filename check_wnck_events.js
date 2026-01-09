#!/usr/bin/gjs
imports.gi.versions.Gtk = '3.0';
imports.gi.versions.Wnck = '3.0';
const { Gtk, Wnck, GLib } = imports.gi;

Gtk.init(null);
const loop = GLib.MainLoop.new(null, false);

print("Starting Wnck Event Listener Test...");

try {
    const screen = Wnck.Screen.get_default();
    screen.force_update();

    // 1. Listen for new windows
    screen.connect('window-opened', (s, win) => {
        print(`[EVENT] Window Opened: ${win.get_name()}`);
        connectWindow(win);
    });

    // 2. Listen for closed windows
    screen.connect('window-closed', (s, win) => {
        print(`[EVENT] Window Closed: ${win.get_name()}`);
    });

    // Helper to connect to window state changes
    function connectWindow(win) {
        win.connect('state-changed', (w, mask, state) => {
            if (mask & Wnck.WindowState.MAXIMIZED_HORIZ || mask & Wnck.WindowState.MAXIMIZED_VERT) {
                const isMax = w.is_maximized();
                print(`[EVENT] State Changed: ${w.get_name()} -> Maximized: ${isMax}`);
            }
        });
    }

    // Connect existing windows
    screen.get_windows().forEach(connectWindow);

    print("Listening for 10 seconds. Try maximizing/unmaximizing a window now.");

    GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 10, () => {
        print("Test finished.");
        loop.quit();
        return false;
    });

    loop.run();
} catch (e) {
    print(`Error: ${e}`);
}
