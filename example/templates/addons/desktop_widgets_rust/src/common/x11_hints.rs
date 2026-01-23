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
    
    // 1. Set Window Type to NORMAL (Standard window, avoids "Always on Top" of Dock, avoids floating of Utility)
    let net_wm_window_type = conn.intern_atom(false, b"_NET_WM_WINDOW_TYPE")?.reply()?.atom;
    let net_wm_window_type_normal = conn.intern_atom(false, b"_NET_WM_WINDOW_TYPE_NORMAL")?.reply()?.atom;

    conn.change_property32(
        PropMode::REPLACE,
        window,
        net_wm_window_type,
        AtomEnum::ATOM,
        &[net_wm_window_type_normal],
    )?;

    // 2. Set EWMH States (NO _NET_WM_STATE_BELOW - blocks input on GNOME!)
    let net_wm_state = conn.intern_atom(false, b"_NET_WM_STATE")?.reply()?.atom;
    let net_wm_state_skip_taskbar = conn.intern_atom(false, b"_NET_WM_STATE_SKIP_TASKBAR")?.reply()?.atom;
    let net_wm_state_skip_pager = conn.intern_atom(false, b"_NET_WM_STATE_SKIP_PAGER")?.reply()?.atom;
    let net_wm_state_sticky = conn.intern_atom(false, b"_NET_WM_STATE_STICKY")?.reply()?.atom;
    
    let states = [
        net_wm_state_skip_taskbar,
        net_wm_state_skip_pager, 
        net_wm_state_sticky,
    ];
    
    conn.change_property32(
        PropMode::REPLACE,
        window,
        net_wm_state,
        AtomEnum::ATOM,
        &states,
    )?;

    // 3. Set Desktop to All (0xFFFFFFFF)
    let net_wm_desktop = conn.intern_atom(false, b"_NET_WM_DESKTOP")?.reply()?.atom;
    let all_desktops: u32 = 0xFFFFFFFF;
    
    conn.change_property32(
        PropMode::REPLACE,
        window,
        net_wm_desktop,
        AtomEnum::CARDINAL,
        &[all_desktops],
    )?;
    
    conn.flush()?;
    
    eprintln!("Set X11 widget hints: TYPE_DOCK + all_desktops + states");
    Ok(())
}

/// Sets the override_redirect flag on the window.
/// This tells the WM *not* to manage this window (no decorations, no auto-placement).
pub fn set_override_redirect(xid: u32, enabled: bool) -> Result<(), Box<dyn std::error::Error>> {
    let (conn, _screen_num) = RustConnection::connect(None)?;
    let window = xid;
    
    let value = if enabled { 1 } else { 0 };
    
    let values = ChangeWindowAttributesAux::new()
        .override_redirect(value);
        
    conn.change_window_attributes(window, &values)?;
    conn.flush()?;
    
    eprintln!("Set override_redirect to {}", enabled);
    Ok(())
}

/// Sets WM_NORMAL_HINTS to indicate a Program Specified Position and Size.
pub fn set_wm_normal_hints(xid: u32, x: i32, y: i32, width: i32, height: i32) -> Result<(), Box<dyn std::error::Error>> {
    let (conn, _screen_num) = RustConnection::connect(None)?;
    let window = xid;
    
    // Flags: PPosition (4) | PSize (8) = 12
    // Some WMs prefer USPosition (2). Let's use PPosition | USPosition | PSize = 14
    let flags: u32 = 2 | 4 | 8; 
    
    // WM_SIZE_HINTS structure (18 x 32-bit integers)
    // 0: flags
    // 1: x, 2: y
    // 3: width, 4: height
    // 5: min_width, 6: min_height
    // 7: max_width, 8: max_height
    // 9: width_inc, 10: height_inc
    // 11: min_aspect_n, 12: min_aspect_d
    // 13: max_aspect_n, 14: max_aspect_d
    // 15: base_width, 16: base_height
    // 17: win_gravity
    
    let mut hints = vec![0u32; 18];
    hints[0] = flags;
    hints[1] = x as u32;
    hints[2] = y as u32;
    hints[3] = width as u32;
    hints[4] = height as u32;
    
    conn.change_property32(
        PropMode::REPLACE,
        window,
        AtomEnum::WM_NORMAL_HINTS,
        AtomEnum::WM_SIZE_HINTS,
        &hints,
    )?;
    
    conn.flush()?;
    eprintln!("Set WM_NORMAL_HINTS: Pos({}, {}) Size({}x{})", x, y, width, height);
    Ok(())
}

/// Sets WM_HINTS to force Input = True.
/// This ensures the window manager knows the window expects input (clicks/keys).
pub fn set_wm_hints_input(xid: u32, enabled: bool) -> Result<(), Box<dyn std::error::Error>> {
    let (conn, _screen_num) = RustConnection::connect(None)?;
    let window = xid;
    
    // WM_HINTS struct layout (partial):
    // flags (u32), input (u32), initial_state (u32), ...
    // Input Hint Flag = 1 << 0
    
    let flags: u32 = 1 << 0; // Input Hint
    let input: u32 = if enabled { 1 } else { 0 };
    
    // We construct a simplified vector. X11 usually expects more fields but flags determine what is read.
    // 9 fields is standard for XWMHints in x11rb/protocol?
    // Let's assume standard 32-bit formatting.
    // flags, input, initial_state, icon_pixmap, icon_window, icon_x, icon_y, icon_mask, window_group
    
    let mut hints = vec![0u32; 9];
    hints[0] = flags;
    hints[1] = input;
    
    conn.change_property32(
        PropMode::REPLACE,
        window,
        AtomEnum::WM_HINTS,
        AtomEnum::WM_HINTS,
        &hints,
    )?;
    
    conn.flush()?;
    eprintln!("Set WM_HINTS: Input={}", enabled);
    Ok(())
}

/// Lowers the window to the bottom of the X11 stacking order.
pub fn lower_window(xid: u32) -> Result<(), Box<dyn std::error::Error>> {
    let (conn, _screen_num) = RustConnection::connect(None)?;
    let window = xid;
    
    let values = ConfigureWindowAux::new()
        .stack_mode(StackMode::BELOW);
        
    conn.configure_window(window, &values)?;
    conn.flush()?;
    
    eprintln!("Lowered window {} to bottom", xid);
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
    
    // Get atoms for state (NO _NET_WM_STATE_BELOW - blocks input on GNOME!)
    let net_wm_state = conn.intern_atom(false, b"_NET_WM_STATE")?.reply()?.atom;
    let net_wm_state_skip_taskbar = conn.intern_atom(false, b"_NET_WM_STATE_SKIP_TASKBAR")?.reply()?.atom;
    let net_wm_state_skip_pager = conn.intern_atom(false, b"_NET_WM_STATE_SKIP_PAGER")?.reply()?.atom;
    let net_wm_state_sticky = conn.intern_atom(false, b"_NET_WM_STATE_STICKY")?.reply()?.atom;
    
    // _NET_WM_STATE_ADD = 1
    const NET_WM_STATE_ADD: u32 = 1;
    
    // Send client messages for each state
    for state_atom in [net_wm_state_skip_taskbar, net_wm_state_skip_pager, net_wm_state_sticky] {
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

/// Sets the X11 event_mask on the window to ensure input is received.
/// This is critical when setting window properties before the window is mapped.
pub fn set_event_mask(xid: u32) -> Result<(), Box<dyn std::error::Error>> {
    let (conn, _screen_num) = RustConnection::connect(None)?;
    let window = xid;
    
    // Include events needed for interactivity
    let event_mask = EventMask::BUTTON_PRESS 
        | EventMask::BUTTON_RELEASE 
        | EventMask::POINTER_MOTION
        | EventMask::ENTER_WINDOW
        | EventMask::LEAVE_WINDOW
        | EventMask::EXPOSURE
        | EventMask::STRUCTURE_NOTIFY;
    
    let values = ChangeWindowAttributesAux::new()
        .event_mask(event_mask);
        
    conn.change_window_attributes(window, &values)?;
    conn.flush()?;
    
    eprintln!("Set X11 event_mask for interactivity on window {}", xid);
    Ok(())
}
