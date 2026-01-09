#!/usr/bin/gjs
imports.gi.versions.Gtk = '3.0';
imports.gi.versions.Wnck = '3.0';
const { Gtk, Wnck, GLib } = imports.gi;

Gtk.init(null);
const loop = GLib.MainLoop.new(null, false);

try {
    const screen = Wnck.Screen.get_default();
    screen.force_update();

    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
        const active = screen.get_active_workspace();
        const windows = screen.get_windows();
        
        print(`Active Workspace: ${active ? active.get_name() : 'null'}`);
        
        windows.forEach(w => {
            const ws = w.get_workspace();
            const pinned = w.is_pinned();
            const max = w.is_maximized();
            const min = w.is_minimized();
            
            print(`Win: ${w.get_name()}`);
            print(` - Max: ${max}, Min: ${min}`);
            print(` - Pinned: ${pinned}`);
            print(` - Workspace: ${ws ? ws.get_name() : 'null (pinned/all)'}`);
            
            const isOnCurrent = (ws === active) || pinned;
            print(` - Is On Current: ${isOnCurrent}`);
            print('---');
        });
        
        loop.quit();
        return false;
    });
    
    loop.run();
} catch (e) {
    print(`Error: ${e}`);
}
