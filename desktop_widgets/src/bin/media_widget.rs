use gtk4::prelude::*;
use gtk4::{Application, ApplicationWindow, gio};
use meowterialyou_widgets::common::{styles, x11_hints};
use meowterialyou_widgets::widgets::media_widget::{config, mpris, ui};
use glib;

fn main() {
    // UNCONDITIONALLY force X11 backend - this matches TypeScript widget behavior
    let use_layer_shell = {
        let force_wayland = std::env::var("MEOW_FORCE_WAYLAND").is_ok();
        let session = std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default().to_lowercase();
        let is_wlroots = session.contains("sway") 
            || session.contains("hyprland") 
            || session.contains("river")
            || session.contains("wayfire");
        force_wayland || is_wlroots
    };
    
    if !use_layer_shell {
        std::env::set_var("GDK_BACKEND", "x11");
        eprintln!("Forcing X11 backend for widget behavior (XWayland mode)");
    }
    let app = Application::builder()
        .application_id("com.meowterialyou.mediawidget")
        .flags(gio::ApplicationFlags::NON_UNIQUE)
        .build();

    app.connect_startup(|_| {
        if let Err(e) = config::load() {
            eprintln!("Failed to load config: {}", e);
        }
        let conf = config::CONFIG.read().unwrap();
        styles::load_css(&conf);
        
        let _monitor = styles::watch_theme(move || {
            if let Ok(conf) = config::CONFIG.read() {
                styles::load_css(&conf);
            }
        });
        std::mem::forget(_monitor);
    });
    app.connect_activate(build_ui);
    app.run();
}

fn build_ui(app: &Application) {
    let (ui_sender, ui_receiver) = async_channel::unbounded::<()>();
    let (cmd_sender, cmd_receiver) = async_channel::unbounded::<mpris::MprisCommand>();

    let width = {
        let conf = config::CONFIG.read().unwrap();
        let s = conf.layout.scale;
        let is_portrait = conf.layout.mode == "portrait";
        let base = if let Some(w) = conf.layout.width {
             w as f64
        } else {
             if is_portrait { 320.0 } else { 320.0 }
        };
        (base * s).round() as i32
    };

    let window = ApplicationWindow::builder()
        .application(app)
        .title("MeowterialYou MediaWidget")
        .default_width(width)
        .decorated(false)
        .focusable(true)
        .can_focus(true)
        .opacity(0.0) // Start invisible
        .build();
    
use meowterialyou_widgets::widgets::media_widget::pulse::PulseController; // Add import
use std::rc::Rc; // Ensure Rc is available

// ... inside build_ui ...

    let conf = config::CONFIG.read().unwrap();
    
    // Initialize PulseAudio Controller
    let pulse = PulseController::new().map(Rc::new);
    if pulse.is_none() {
        eprintln!("Warning: Failed to connect to PulseAudio directly. Falling back to slow pactl.");
    }

    let widgets = ui::build(&window, cmd_sender, &conf, pulse);

    // --- RUNTIME WIDTH SYNC ---
    let widget_name = "media_widget".to_string();
    let pos_str = conf.layout.position.clone();
    
    // Measure natural width (including scale)
    let (_, nat_width, _, _) = widgets.root.measure(gtk4::Orientation::Horizontal, -1);
    let total_pixel_width = nat_width;
    
    let side = if pos_str.contains("left") { "left" } else { "right" };
    let _ = meowterialyou_widgets::common::layout_sync::register_width(&widget_name, side, total_pixel_width);
    
    let (layout_tx, layout_rx) = async_channel::bounded::<()>(1);
    let _layout_monitor = meowterialyou_widgets::common::layout_sync::watch_layout(move || {
        let _ = layout_tx.send_blocking(());
    });
    
    let root_sync = widgets.root.clone();
    let side_sync = side.to_string();
    glib::MainContext::default().spawn_local(async move {
        while let Ok(_) = layout_rx.recv().await {
            let max_w = meowterialyou_widgets::common::layout_sync::get_max_width(&side_sync);
            if max_w > 0 {
                root_sync.set_width_request(max_w);
            }
        }
    });
    std::mem::forget(_layout_monitor);

    // Trigger initial sync
    let max_w = meowterialyou_widgets::common::layout_sync::get_max_width(side);
    if max_w > total_pixel_width {
        widgets.root.set_width_request(max_w);
    }

    let on_wayland = std::env::var("GDK_BACKEND").unwrap_or_default() != "x11";
    
    if on_wayland && gtk4_layer_shell::is_supported() {
        use gtk4_layer_shell::LayerShell;
        window.init_layer_shell();
        window.set_layer(gtk4_layer_shell::Layer::Bottom);
        window.auto_exclusive_zone_enable();
        
        let (pos, gap_x, gap_y) = {
            let conf = config::CONFIG.read().unwrap();
            let scale = conf.layout.scale;
            let gx = (conf.layout.gap.get(0).copied().unwrap_or(24) as f64 * scale).round() as i32;
            let gy = (conf.layout.gap.get(1).copied().unwrap_or(24) as f64 * scale).round() as i32;
            (conf.layout.position.clone(), gx, gy)
        };
        
        match pos.as_str() {
            "top_left" => {
                window.set_anchor(gtk4_layer_shell::Edge::Top, true);
                window.set_anchor(gtk4_layer_shell::Edge::Left, true);
                window.set_margin(gtk4_layer_shell::Edge::Top, gap_y);
                window.set_margin(gtk4_layer_shell::Edge::Left, gap_x);
            },
            "top_right" => {
                window.set_anchor(gtk4_layer_shell::Edge::Top, true);
                window.set_anchor(gtk4_layer_shell::Edge::Right, true);
                window.set_margin(gtk4_layer_shell::Edge::Top, gap_y);
                window.set_margin(gtk4_layer_shell::Edge::Right, gap_x);
            },
            "bottom_left" => {
                window.set_anchor(gtk4_layer_shell::Edge::Bottom, true);
                window.set_anchor(gtk4_layer_shell::Edge::Left, true);
                window.set_margin(gtk4_layer_shell::Edge::Bottom, gap_y);
                window.set_margin(gtk4_layer_shell::Edge::Left, gap_x);
            },
            "bottom_right" | _ => {
                window.set_anchor(gtk4_layer_shell::Edge::Bottom, true);
                window.set_anchor(gtk4_layer_shell::Edge::Right, true);
                window.set_margin(gtk4_layer_shell::Edge::Bottom, gap_y);
                window.set_margin(gtk4_layer_shell::Edge::Right, gap_x);
            }
        }

        window.set_keyboard_mode(gtk4_layer_shell::KeyboardMode::None);
        window.set_opacity(1.0); // Reveal immediately on Wayland
        window.present();
    } else {
        eprintln!("Using X11/XWayland mode with widget-like window hints.");
        
        window.set_deletable(false);
        window.set_resizable(false);
        
        // Realize the window to create the GdkSurface/XID
        gtk4::prelude::WidgetExt::realize(&window);

        if let Some(surface) = window.surface() {
            if let Some(x11_surface) = surface.downcast_ref::<gdk4_x11::X11Surface>() {
                let xid = x11_surface.xid() as u32;
                
                let _ = x11_hints::set_override_redirect(xid, false);
                let _ = x11_hints::set_widget_hints(xid);

                // 4. Calculate Position
                let display = surface.display();
                let monitor = display.monitor_at_surface(&surface)
                    .or_else(|| display.monitors().item(0).and_then(|obj| obj.downcast::<gtk4::gdk::Monitor>().ok()));

                if let Some(monitor) = monitor {
                    let scale_factor = monitor.scale_factor();
                    let geo = monitor.geometry();
                    let monitor_w = geo.width();
                    let monitor_h = geo.height();

                    // Measure required height
                    let (_, nat_height, _, _) = window.measure(gtk4::Orientation::Vertical, width);
                    let h = nat_height;
                    let w = width;

                    let (gap_x, gap_y) = {
                        let conf = config::CONFIG.read().unwrap();
                        let scale = conf.layout.scale;
                        let gx = (conf.layout.gap.get(0).copied().unwrap_or(24) as f64 * scale).round() as i32;
                        let gy = (conf.layout.gap.get(1).copied().unwrap_or(24) as f64 * scale).round() as i32;
                        (gx, gy)
                    };

                    let pos_str = {
                        let conf = config::CONFIG.read().unwrap();
                        conf.layout.position.clone()
                    };

                    let (lx, ly) = match pos_str.as_str() {
                        "top_left" => (gap_x, gap_y),
                        "top_right" => (monitor_w - w - gap_x, gap_y),
                        "bottom_left" => (gap_x, monitor_h - h - gap_y),
                        "bottom_right" | _ => (monitor_w - w - gap_x, monitor_h - h - gap_y),
                    };

                    let x = lx * scale_factor;
                    let y = ly * scale_factor;
                    let w_phys = w * scale_factor;
                    let h_phys = h * scale_factor;
                    
                    // 5. Set WM_NORMAL_HINTS (PPosition)
                    if let Err(e) = x11_hints::set_wm_normal_hints(xid, x, y, w_phys, h_phys) {
                        eprintln!("Failed to set WM_NORMAL_HINTS: {}", e);
                    }

                    // 6. Move Window (Physical pixels)
                    if let Err(e) = x11_hints::move_window(xid, x, y) {
                        eprintln!("Failed to move window: {}", e);
                    } else {
                        eprintln!("Positioned at {}, {} (Physical)", x, y);
                    }

                    // RE-MEASURE and RE-POSITION loop to handle dynamic content (music info wrapping)
                    // This ensures layout is correct even if initial measure was too small
                    // and handles the "Lower below windows" requirement reliably.
                    let window_loop = window.clone();
                    glib::timeout_add_local(std::time::Duration::from_millis(1000), move || {
                        // 1. Re-measure natural height
                        let (_, nat_height, _, _) = window_loop.measure(gtk4::Orientation::Vertical, width);
                        let actual_h = nat_height;
                        
                        // 2. Recalculate Y (Keep it pinned correctly regardless of height change)
                        let (_, new_ly) = match pos_str.as_str() {
                            "top_left" | "top_right" => (0, gap_y), // Y is fixed from top
                            "bottom_left" | "bottom_right" | _ => (0, monitor_h - actual_h - gap_y),
                        };
                        let new_y = new_ly * scale_factor;
                        let new_h_phys = actual_h * scale_factor;

                        // 3. Re-enforce position and size
                        let _ = x11_hints::set_wm_normal_hints(xid, x, new_y, w_phys, new_h_phys);
                        let _ = x11_hints::move_window(xid, x, new_y);
                        
                        // 4. Enforce widget state (sticky, skip_taskbar, below)
                        let _ = x11_hints::set_widget_state_via_message(xid);
                        let _ = x11_hints::lower_window(xid);
                        
                        glib::ControlFlow::Continue
                    });
                }
            }
        }
        
        window.set_opacity(1.0);
        window.present();
    }

    // MPRIS & Update Loop
    use std::thread;
    thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");
        rt.block_on(async move {
            if let Err(e) = mpris::init(ui_sender, cmd_receiver).await {
                eprintln!("MPRIS Init failed: {}", e);
            }
            std::future::pending::<()>().await;
        });
    });

    let widgets_marquee = widgets.clone();
    glib::MainContext::default().spawn_local(async move {
        while let Ok(_) = ui_receiver.recv().await {
            ui::update(&widgets);
        }
    });

    glib::timeout_add_local(std::time::Duration::from_millis(33), move || {
        widgets_marquee.view_1.title.tick();
        widgets_marquee.view_1.artist.tick();
        widgets_marquee.view_2.title.tick();
        widgets_marquee.view_2.artist.tick();
        glib::ControlFlow::Continue
    });
}
