use gtk4::prelude::*;
use gtk4::{Application, ApplicationWindow};
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
        .build();

    app.connect_startup(|_| {
        if let Err(e) = config::load() {
            eprintln!("Failed to load config: {}", e);
        }
        let conf = config::CONFIG.read().unwrap();
        styles::load_css(&conf);
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
        (400.0_f64 * s).round() as i32
    };

    let window = ApplicationWindow::builder()
        .application(app)
        .title("MeowterialYou MediaWidget")
        .default_width(width)
        .decorated(false)
        .focusable(false)
        .can_focus(false)
        .build();

    let conf = config::CONFIG.read().unwrap();
    let widgets = ui::build(&window, cmd_sender, &conf);

    let on_wayland = std::env::var("GDK_BACKEND").unwrap_or_default() != "x11";
    
    if on_wayland && gtk4_layer_shell::is_supported() {
        use gtk4_layer_shell::LayerShell;
        window.init_layer_shell();
        window.set_layer(gtk4_layer_shell::Layer::Top);
        window.auto_exclusive_zone_enable();
        
        let (pos, gap_x, gap_y) = {
            let conf = config::CONFIG.read().unwrap();
            let gx = conf.layout.gap.get(0).copied().unwrap_or(24);
            let gy = conf.layout.gap.get(1).copied().unwrap_or(24);
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
        window.present();
    } else {
        eprintln!("Using X11/XWayland mode with widget-like window hints.");
        
        window.set_deletable(false);
        window.set_resizable(false);
        
        let pos = {
            let conf = config::CONFIG.read().unwrap();
            conf.layout.position.clone()
        };
        
        let window_for_realize = window.clone();
        let width_val = width;
        let pos_clone = pos.clone();
        
        window.connect_realize(move |_| {
            if let Some(surface) = window_for_realize.surface() {
                if let Some(x11_surface) = surface.downcast_ref::<gdk4_x11::X11Surface>() {
                    let xid = x11_surface.xid() as u32;
                    
                    // 1. Set widget hints
                    let _ = x11_hints::set_widget_state_via_message(xid);
                    
                    // 2. Delayed Positioning - query geometry INSIDE the timeout
                    let win_clone = window_for_realize.clone();
                    let pos_for_timeout = pos_clone.clone();
                    glib::timeout_add_local(std::time::Duration::from_millis(150), move || {
                        if let Some(surface) = win_clone.surface() {
                            let display = surface.display();
                            
                            // Get the monitor where the window currently is
                            if let Some(monitor) = display.monitor_at_surface(&surface) {
                                let scale_factor = monitor.scale_factor();
                                let geo = monitor.geometry();
                                let monitor_w = geo.width();
                                let monitor_h = geo.height();
                                
                                // Query allocation NOW when it's valid (logical pixels)
                                let alloc = win_clone.allocation();
                                let w = if alloc.width() > 0 { alloc.width() } else { width_val };
                                let h = if alloc.height() > 0 { alloc.height() } else { 180 };
                                
                                // Read gap from config
                                let (gap_x, gap_y) = {
                                    let conf = config::CONFIG.read().unwrap();
                                    let gx = conf.layout.gap.get(0).copied().unwrap_or(24);
                                    let gy = conf.layout.gap.get(1).copied().unwrap_or(24);
                                    (gx, gy)
                                };
                                
                                let (lx, ly) = match pos_for_timeout.as_str() {
                                    "top_left" => (gap_x, gap_y),
                                    "top_right" => (monitor_w - w - gap_x, gap_y),
                                    "bottom_left" => (gap_x, monitor_h - h - gap_y),
                                    "bottom_right" | _ => (monitor_w - w - gap_x, monitor_h - h - gap_y),
                                };
                                
                                // X11 expects physical pixels, multiply logical coords by scale factor
                                let x = lx * scale_factor;
                                let y = ly * scale_factor;
                                
                                let _ = x11_hints::move_window(xid, x, y);
                            }
                        }
                        glib::ControlFlow::Break
                    });
                }
            }
        });
        
        eprintln!("Configured position: {}.", pos);
    } 

    window.present();

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
        widgets_marquee.title.tick();
        widgets_marquee.artist.tick();
        glib::ControlFlow::Continue
    });
}
