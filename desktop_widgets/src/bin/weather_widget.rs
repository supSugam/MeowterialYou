use gtk4::prelude::*;
use gtk4::{Application, ApplicationWindow, gio};
use meowterialyou_widgets::common::x11_hints;
use meowterialyou_widgets::widgets::weather_widget::{config, state, ui, system, weather};
use glib;
use std::time::Duration;
use async_channel;
use std::thread;
use tokio::runtime::Runtime;

fn main() {
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
    }
    
    let app = Application::builder()
        .application_id("com.meowterialyou.weatherwidget.rust.v6")
        .flags(gio::ApplicationFlags::NON_UNIQUE)
        .build();

    app.connect_startup(|_| {
        let _ = config::load();
        let conf = config::CONFIG.read().unwrap();
        ui::load_css(&conf);

        // Dynamic theme reload
        let _monitor = meowterialyou_widgets::common::styles::watch_theme(move || {
             if let Ok(conf) = config::CONFIG.read() {
                ui::load_css(&conf);
            }
        });
        std::mem::forget(_monitor);
    });
    
    app.connect_activate(build_ui);
    app.run();
}

fn build_ui(app: &Application) {
    let conf = config::CONFIG.read().unwrap();
    let scale = conf.layout.scale;
    let width = {
        let base = conf.layout.width.unwrap_or(380);
        (base as f64 * scale).round() as i32
    };

    let window = ApplicationWindow::builder()
        .application(app)
        .title("MeowterialYou WeatherWidget")
        .default_width(width)
        .decorated(false)
        .focusable(false)
        .can_focus(false)
        .opacity(0.0)
        .build();
    
    let widgets = ui::build(&window, &conf);

    // --- RUNTIME WIDTH SYNC ---
    let widget_name = "weather_widget".to_string();
    let pos_str = conf.layout.position.clone();
    
    // Measure natural width (including scale)
    let (_, nat_width, _, _) = widgets.root.measure(gtk4::Orientation::Horizontal, -1);
    let total_pixel_width = nat_width;
    
    let side = if pos_str.contains("left") { "left" } else { "right" };
    let (gx, gy) = (
        (conf.layout.gap[0] as f64 * scale).round() as i32,
        (conf.layout.gap[1] as f64 * scale).round() as i32
    );

    // Initial registration with height 0 (will be updated in loop)
    let _ = meowterialyou_widgets::common::layout_sync::update_layout(&widget_name, side, total_pixel_width, 0, gx, gy);
    
    let (layout_tx, layout_rx) = async_channel::bounded::<()>(1);
    let _layout_monitor = meowterialyou_widgets::common::layout_sync::watch_layout(move || {
        let _ = layout_tx.send_blocking(());
    });
    
    let root_sync = widgets.root.clone();
    let side_sync = side.to_string();
    let side_sync_watcher = side_sync.clone();
    glib::MainContext::default().spawn_local(async move {
        while let Ok(_) = layout_rx.recv().await {
            let max_w = meowterialyou_widgets::common::layout_sync::get_max_width(&side_sync_watcher);
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

    // --- SETUP UPDATE CHANNEL ---
    let (tx, rx) = async_channel::unbounded::<state::UpdateMessage>();
    
    // UI Update Listener (Main Thread)
    let widgets_recv = widgets.clone();
    let conf_recv = conf.clone();
    glib::MainContext::default().spawn_local(async move {
        while let Ok(msg) = rx.recv().await {
            ui::update_from_message(&widgets_recv, &msg, &conf_recv);
        }
    });

    // --- BACKGROUND WORKER ---
    let tx_worker = tx.clone();
    let conf_worker = conf.clone();
    thread::spawn(move || {
        let rt = Runtime::new().expect("Failed to create Tokio runtime");
        rt.block_on(async move {
            let clock_format = conf_worker.clock.format.clone();
            
            // Initial Sync/Immediate State
            let now = chrono::Local::now();
            let is_12h = clock_format != "24h";
            let _ = tx_worker.send(state::UpdateMessage::Time {
                time: now.format(if is_12h { "%I:%M" } else { "%H:%M" }).to_string(),
                ampm: now.format("%p").to_string(),
                date: now.format("%a, %b %d").to_string(),
            }).await;
            
            // Immediate Stats
            let _ = tx_worker.send(state::UpdateMessage::Stats(system::get_system_stats())).await;

            // Trigger Immediate Weather Fetch
            let tx_w_init = tx_worker.clone();
            let conf_w_init = conf_worker.clone();
            tokio::spawn(async move {
                if let Ok(data) = weather::fetch_weather(&conf_w_init).await {
                    let _ = tx_w_init.send(state::UpdateMessage::Weather(data)).await;
                }
            });

            // Loops
            let tx_time = tx_worker.clone();
            let tx_stats = tx_worker.clone();
            let tx_weather = tx_worker.clone();
            let conf_weather = conf_worker.clone();

            // Time Loop (1s)
            tokio::spawn(async move {
                loop {
                    let now = chrono::Local::now();
                    let is_12h = clock_format != "24h";
                    let _ = tx_time.send(state::UpdateMessage::Time {
                        time: now.format(if is_12h { "%I:%M" } else { "%H:%M" }).to_string(),
                        ampm: now.format("%p").to_string(),
                        date: now.format("%a, %b %d").to_string(),
                    }).await;
                    tokio::time::sleep(Duration::from_millis(1000)).await;
                }
            });

            // Stats Loop (2s as per original TS/GJS main.ts had 5s, but we use 2s for smoothness)
            tokio::spawn(async move {
                loop {
                    tokio::time::sleep(Duration::from_millis(2000)).await;
                    let stats = system::get_system_stats();
                    let _ = tx_stats.send(state::UpdateMessage::Stats(stats)).await;
                }
            });

            // Weather Loop (matching refresh_interval_min)
            let refresh_ms = (conf_weather.weather.refresh_interval_min as u64) * 60 * 1000;
            tokio::spawn(async move {
                loop {
                    tokio::time::sleep(Duration::from_millis(refresh_ms)).await;
                    match weather::fetch_weather(&conf_weather).await {
                        Ok(data) => {
                            let _ = tx_weather.send(state::UpdateMessage::Weather(data)).await;
                        }
                        Err(e) => eprintln!("Weather fetch failed: {}", e),
                    }
                }
            });

            std::future::pending::<()>().await;
        });
    });

    // --- POSITIONING ---
    let on_wayland = std::env::var("GDK_BACKEND").unwrap_or_default() != "x11";
    if on_wayland && gtk4_layer_shell::is_supported() {
        use gtk4_layer_shell::LayerShell;
        window.init_layer_shell();
        window.set_layer(gtk4_layer_shell::Layer::Bottom);
        let pos = conf.layout.position.clone();
        match pos.as_str() {
            "top_left" => {
                window.set_anchor(gtk4_layer_shell::Edge::Top, true);
                window.set_anchor(gtk4_layer_shell::Edge::Left, true);
            },
            "bottom_left" => {
                window.set_anchor(gtk4_layer_shell::Edge::Bottom, true);
                window.set_anchor(gtk4_layer_shell::Edge::Left, true);
            },
            _ => {
                window.set_anchor(gtk4_layer_shell::Edge::Bottom, true);
                window.set_anchor(gtk4_layer_shell::Edge::Right, true);
            }
        }

        // Stacking Loop for Wayland
        let window_loop = window.clone();
        let widget_name_loop = widget_name.clone();
        let side_sync_loop = side.to_string();
        let pos_str_loop = pos.clone();
        let spacing = std::env::var("MEOW_WIDGET_SPACING").ok().and_then(|s| s.parse::<i32>().ok()).unwrap_or(24);

        glib::timeout_add_local(std::time::Duration::from_millis(1000), move || {
            let (_, actual_w, _, _) = window_loop.measure(gtk4::Orientation::Horizontal, -1);
            let (_, actual_h, _, _) = window_loop.measure(gtk4::Orientation::Vertical, actual_w);
            
            let (gap_x, gap_y) = {
                let conf = config::CONFIG.read().unwrap();
                let scale = conf.layout.scale;
                let gx = (conf.layout.gap.get(0).copied().unwrap_or(24) as f64 * scale).round() as i32;
                let gy = (conf.layout.gap.get(1).copied().unwrap_or(24) as f64 * scale).round() as i32;
                (gx, gy)
            };

            let _ = meowterialyou_widgets::common::layout_sync::update_layout(&widget_name_loop, &side_sync_loop, actual_w, actual_h, gap_x, gap_y);
            let (anchor_gx, anchor_gy, y_offset) = meowterialyou_widgets::common::layout_sync::get_layout_offsets(&widget_name_loop, spacing);
            
            match pos_str_loop.as_str() {
                "top_left" => {
                    window_loop.set_margin(gtk4_layer_shell::Edge::Top, anchor_gy + y_offset);
                    window_loop.set_margin(gtk4_layer_shell::Edge::Left, anchor_gx);
                },
                "bottom_left" => {
                    window_loop.set_margin(gtk4_layer_shell::Edge::Bottom, anchor_gy + y_offset);
                    window_loop.set_margin(gtk4_layer_shell::Edge::Left, anchor_gx);
                },
                _ => {
                    window_loop.set_margin(gtk4_layer_shell::Edge::Bottom, anchor_gy + y_offset);
                    window_loop.set_margin(gtk4_layer_shell::Edge::Right, anchor_gx);
                }
            }
            glib::ControlFlow::Continue
        });

        window.present();
    } else {
        window.set_deletable(false);
        window.set_resizable(false);
        gtk4::prelude::WidgetExt::realize(&window);
        if let Some(surface) = window.surface() {
            if let Some(x11_surface) = surface.downcast_ref::<gdk4_x11::X11Surface>() {
                let xid = x11_surface.xid() as u32;
                
                let display = surface.display();
                let monitor = display.monitor_at_surface(&surface)
                    .or_else(|| display.monitors().item(0).and_then(|obj| obj.downcast::<gtk4::gdk::Monitor>().ok()));

                if let Some(monitor) = monitor {
                    let scale_factor = monitor.scale_factor();
                    let geo = monitor.geometry();
                    let monitor_w = geo.width();
                    let monitor_h = geo.height();

                    // Measure natural height
                    let (_, nat_height, _, _) = window.measure(gtk4::Orientation::Vertical, width);
                    let h = nat_height;
                    let w = width;

                    let (gx, gy) = (
                        (conf.layout.gap[0] as f64 * scale).round() as i32,
                        (conf.layout.gap[1] as f64 * scale).round() as i32
                    );
                    let pos_str = conf.layout.position.clone();

                    let (lx, ly) = match pos_str.as_str() {
                        "top_left" => (geo.x() + gx, geo.y() + gy),
                        "top_right" => (geo.x() + monitor_w - w - gx, geo.y() + gy),
                        "bottom_left" => (geo.x() + gx, geo.y() + monitor_h - h - gy),
                        _ => (geo.x() + monitor_w - w - gx, geo.y() + monitor_h - h - gy), // bottom_right
                    };

                    let x = lx * scale_factor;
                    let y = ly * scale_factor;
                    let w_phys = w * scale_factor;
                    let h_phys = h * scale_factor;

                    let _ = x11_hints::set_override_redirect(xid, false);
                    let _ = x11_hints::set_widget_hints(xid);
                    
                    // Initial positioning
                    let _ = x11_hints::set_wm_normal_hints(xid, x, y, w_phys, h_phys);
                    let _ = x11_hints::move_window(xid, x, y);


                    // RE-MEASURE and RE-POSITION loop to handle dynamic content (font loading, weather text)
                    // This ensures layout is correct even if initial measure was too small
                    let window_loop = window.clone();
                    let widget_name_loop = widget_name.clone();
                    let spacing = std::env::var("MEOW_WIDGET_SPACING").ok().and_then(|s| s.parse::<i32>().ok()).unwrap_or(24);

                    glib::timeout_add_local(Duration::from_millis(1000), move || {
                        // 1. Re-measure natural dimensions
                        let (_, nat_width, _, _) = window_loop.measure(gtk4::Orientation::Horizontal, -1);
                        let (_, nat_height, _, _) = window_loop.measure(gtk4::Orientation::Vertical, nat_width);
                        let actual_h = nat_height;
                        let actual_w = nat_width;

                        // 2. Register both width and height atomically
                        let _ = meowterialyou_widgets::common::layout_sync::update_layout(&widget_name_loop, &side_sync, actual_w, actual_h, gx, gy);
                        
                        // 3. Get positioning info from sync
                        let (anchor_gx, anchor_gy, y_offset) = meowterialyou_widgets::common::layout_sync::get_layout_offsets(&widget_name_loop, spacing);

                        // 4. Recalculate dimensions and position
                        let current_geo = monitor.geometry();
                        let (new_lx, new_ly) = match pos_str.as_str() {
                            "top_left" => (current_geo.x() + anchor_gx, current_geo.y() + anchor_gy + y_offset),
                            "top_right" => (current_geo.x() + monitor_w - actual_w - anchor_gx, current_geo.y() + anchor_gy + y_offset),
                            "bottom_left" => (current_geo.x() + anchor_gx, current_geo.y() + monitor_h - actual_h - anchor_gy - y_offset),
                            "bottom_right" | _ => (current_geo.x() + monitor_w - actual_w - anchor_gx, current_geo.y() + monitor_h - actual_h - anchor_gy - y_offset),
                        };
                        
                        let new_x = new_lx * scale_factor;
                        let new_y = new_ly * scale_factor;
                        let new_w_phys = actual_w * scale_factor;
                        let new_h_phys = actual_h * scale_factor;

                        // 5. Re-enforce position and size
                        let _ = x11_hints::set_wm_normal_hints(xid, new_x, new_y, new_w_phys, new_h_phys);
                        let _ = x11_hints::move_window(xid, new_x, new_y);
                        
                        // 6. Enforce widget state (sticky, skip_taskbar, below)
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
}
