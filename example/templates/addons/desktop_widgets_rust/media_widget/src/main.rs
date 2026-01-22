use gtk4::prelude::*;
use gtk4::{Application, ApplicationWindow};
use gtk4_layer_shell::LayerShell;
use glib; // Direct dependency import // Import LayerShell traits

mod styles;
mod config;
mod ui;
mod state;
mod mpris;
mod marquee;
mod image_loader;

fn main() {
    let app = Application::builder()
        .application_id("com.meowterialyou.mediawidget")
        .build();

    app.connect_startup(|_| {
        if let Err(e) = config::load() {
            eprintln!("Failed to load config: {}", e);
        }
        // Load styles with full config
        let conf = config::CONFIG.read().unwrap();
        styles::load_css(&conf);
    });
    app.connect_activate(build_ui);
    app.run();
}

fn build_ui(app: &Application) {
    let conf = config::CONFIG.read().unwrap();
    let scale = conf.layout.scale;
    drop(conf);

    // MPRIS Channels - async_channel for both, bridge to glib main thread
    let (ui_sender, ui_receiver) = async_channel::unbounded::<()>();
    let (cmd_sender, cmd_receiver) = async_channel::unbounded::<crate::mpris::MprisCommand>();

    // Read config & calculate scaled dimensions
    let (width, height, scale, decorated) = {
        let conf = config::CONFIG.read().unwrap();
        let s = conf.layout.scale;
        let w = (340.0_f64 * s).round() as i32;
        let h = (152.0_f64 * s).round() as i32;
        (w, h, s, false)
    };

    let window = ApplicationWindow::builder()
        .application(app)
        .title("MeowterialYou MediaWidget")
        .default_width(width)
        .default_height(height)
        .decorated(decorated)
        .build();

    // Pass sender to UI
    // Pass sender to UI - verify that we pass the config we read earlier
    // We need to re-read config or use the values... wait, ui::build signature change needed first.
    // Let's assume we update ui.rs next.
    let conf = config::CONFIG.read().unwrap();
    let widgets = ui::build(&window, cmd_sender, &conf);

    // Init Layer Shell
    window.init_layer_shell();
    window.set_layer(gtk4_layer_shell::Layer::Top);
    window.auto_exclusive_zone_enable();
    
    // Positioning based on config
    let pos = {
        let conf = config::CONFIG.read().unwrap();
        conf.layout.position.clone()
    };
    
    match pos.as_str() {
        "top_left" => {
            window.set_anchor(gtk4_layer_shell::Edge::Top, true);
            window.set_anchor(gtk4_layer_shell::Edge::Left, true);
            window.set_margin(gtk4_layer_shell::Edge::Top, 24);
            window.set_margin(gtk4_layer_shell::Edge::Left, 24);
        },
        "top_right" => {
            window.set_anchor(gtk4_layer_shell::Edge::Top, true);
            window.set_anchor(gtk4_layer_shell::Edge::Right, true);
            window.set_margin(gtk4_layer_shell::Edge::Top, 24);
            window.set_margin(gtk4_layer_shell::Edge::Right, 24);
        },
        "bottom_left" => {
            window.set_anchor(gtk4_layer_shell::Edge::Bottom, true);
            window.set_anchor(gtk4_layer_shell::Edge::Left, true);
            window.set_margin(gtk4_layer_shell::Edge::Bottom, 24);
            window.set_margin(gtk4_layer_shell::Edge::Left, 24);
        },
        "bottom_right" | _ => {
            window.set_anchor(gtk4_layer_shell::Edge::Bottom, true);
            window.set_anchor(gtk4_layer_shell::Edge::Right, true);
            window.set_margin(gtk4_layer_shell::Edge::Bottom, 24);
            window.set_margin(gtk4_layer_shell::Edge::Right, 24);
        }
    }

    window.set_keyboard_mode(gtk4_layer_shell::KeyboardMode::None); 

    window.present();
    
    // MPRIS & Update Loop
    use std::thread;
    thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");
        rt.block_on(async move {
            if let Err(e) = crate::mpris::init(ui_sender, cmd_receiver).await {
                eprintln!("MPRIS Init failed: {}", e);
            }
            // Keep runtime alive
            std::future::pending::<()>().await;
        });
    });

    // Clone widgets for marquee loop
    let widgets_marquee = widgets.clone();

    // Bridge async_channel to glib main thread using spawn_local
    glib::MainContext::default().spawn_local(async move {
        while let Ok(_) = ui_receiver.recv().await {
            ui::update(&widgets);
        }
    });

    // Marquee Tick Loop (approx 30 FPS)
    glib::timeout_add_local(std::time::Duration::from_millis(33), move || {
        widgets_marquee.title.tick();
        widgets_marquee.artist.tick();
        glib::ControlFlow::Continue
    });
}
