// X11 Window Manager Hints for Widget Behavior
// Sets EWMH properties: _NET_WM_STATE_SKIP_TASKBAR, _NET_WM_STATE_BELOW, _NET_WM_STATE_STICKY

use x11rb::connection::Connection;
use x11rb::protocol::xproto::*;
use x11rb::wrapper::ConnectionExt as _;
use x11rb::rust_connection::RustConnection;

/// Sets X11 window manager hints to make the window behave like a desktop widget
/// This replicates GTK3's skip_taskbar_hint, keep_below, and stick() functionality
#[allow(dead_code)]
pub fn set_widget_hints(xid: u32) -> Result<(), Box<dyn std::error::Error>> {
    let (conn, _screen_num) = RustConnection::connect(None)?;
    let window = xid;
    
    // Get atoms for EWMH properties
    let net_wm_state = conn.intern_atom(false, b"_NET_WM_STATE")?.reply()?.atom;
    let net_wm_state_skip_taskbar = conn.intern_atom(false, b"_NET_WM_STATE_SKIP_TASKBAR")?.reply()?.atom;
    let net_wm_state_skip_pager = conn.intern_atom(false, b"_NET_WM_STATE_SKIP_PAGER")?.reply()?.atom;
    let net_wm_state_below = conn.intern_atom(false, b"_NET_WM_STATE_BELOW")?.reply()?.atom;
    let net_wm_state_sticky = conn.intern_atom(false, b"_NET_WM_STATE_STICKY")?.reply()?.atom;
    
    // Set all widget-like states
    let states = [
        net_wm_state_skip_taskbar,
        net_wm_state_skip_pager, 
        net_wm_state_below,
        net_wm_state_sticky,
    ];
    
    // Change the _NET_WM_STATE property
    conn.change_property32(
        PropMode::REPLACE,
        window,
        net_wm_state,
        AtomEnum::ATOM,
        &states,
    )?;
    
    conn.flush()?;
    
    eprintln!("Set X11 widget hints: skip_taskbar, skip_pager, below, sticky");
    Ok(())
}

/// Alternative: Use client messages to set window state (for already mapped windows)
pub fn set_widget_state_via_message(xid: u32) -> Result<(), Box<dyn std::error::Error>> {
    let (conn, screen_num) = RustConnection::connect(None)?;
    let screen = &conn.setup().roots[screen_num];
    let root = screen.root;
    let window = xid;
    
    // Get atoms for window type
    let net_wm_window_type = conn.intern_atom(false, b"_NET_WM_WINDOW_TYPE")?.reply()?.atom;
    let net_wm_window_type_utility = conn.intern_atom(false, b"_NET_WM_WINDOW_TYPE_UTILITY")?.reply()?.atom;
    
    // Set window type to UTILITY - keeps it clickable/interactive
    conn.change_property32(
        PropMode::REPLACE,
        window,
        net_wm_window_type,
        AtomEnum::ATOM,
        &[net_wm_window_type_utility],
    )?;
    eprintln!("Set _NET_WM_WINDOW_TYPE_UTILITY");
    
    // Get atoms for state
    let net_wm_state = conn.intern_atom(false, b"_NET_WM_STATE")?.reply()?.atom;
    let net_wm_state_skip_taskbar = conn.intern_atom(false, b"_NET_WM_STATE_SKIP_TASKBAR")?.reply()?.atom;
    let net_wm_state_skip_pager = conn.intern_atom(false, b"_NET_WM_STATE_SKIP_PAGER")?.reply()?.atom;
    let net_wm_state_below = conn.intern_atom(false, b"_NET_WM_STATE_BELOW")?.reply()?.atom;
    let net_wm_state_sticky = conn.intern_atom(false, b"_NET_WM_STATE_STICKY")?.reply()?.atom;
    
    // _NET_WM_STATE_ADD = 1
    const NET_WM_STATE_ADD: u32 = 1;
    
    // Send client messages for each state
    for state_atom in [net_wm_state_skip_taskbar, net_wm_state_skip_pager, net_wm_state_below, net_wm_state_sticky] {
        let event = ClientMessageEvent::new(
            32,
            window,
            net_wm_state,
            [NET_WM_STATE_ADD, state_atom, 0, 1, 0], // action, first property, second property, source indication
        );
        
        conn.send_event(
            false,
            root,
            EventMask::SUBSTRUCTURE_REDIRECT | EventMask::SUBSTRUCTURE_NOTIFY,
            event,
        )?;
    }
    
    conn.flush()?;
    
    eprintln!("Sent X11 widget state messages: skip_taskbar, skip_pager, below, sticky");
    Ok(())
}

/// Precisely positions an X11 window at the given coordinates
/// Uses ConfigureWindow to bypass GTK's lack of window.move() in GTK4
pub fn move_window(xid: u32, x: i32, y: i32) -> Result<(), Box<dyn std::error::Error>> {
    let (conn, _screen_num) = RustConnection::connect(None)?;
    let window = xid;
    
    let values = ConfigureWindowAux::new()
        .x(x)
        .y(y);
    
    conn.configure_window(window, &values)?;
    conn.flush()?;
    
    eprintln!("Moved X11 window {} to ({}, {})", xid, x, y);
    Ok(())
}
