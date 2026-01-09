#!/usr/bin/gjs
imports.gi.versions.Gtk = '3.0';
imports.gi.versions.Wnck = '3.0';
const { Gtk, Wnck, GLib } = imports.gi;

Gtk.init(null);

const loop = GLib.MainLoop.new(null, false);

try {
    const screen = Wnck.Screen.get_default();
    screen.force_update(); // Essential to populate
    
    // Give it a moment to sync
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
        const windows = screen.get_windows();
        print(`Window Count: ${windows.length}`);
        
        let hasMaximized = false;
        windows.forEach(w => {
            const name = w.get_name();
            const max = w.is_maximized();
            if (max) hasMaximized = true;
            print(`- [${max ? 'MAX' : '   '}] ${name}`);
        });

        if (windows.length === 0) {
            print("No windows detected. Likely Wayland restriction.");
        }

        loop.quit();
        return false;
    });

    loop.run();
} catch (e) {
    print(`Error: ${e}`);
}
