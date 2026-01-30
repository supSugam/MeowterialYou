use gtk4::{gdk, CssProvider, gio};
use gio::prelude::*;
use std::fs;
use std::path::Path;
use crate::widgets::media_widget::config::Config;

/// Load and apply CSS styles based on config
pub fn load_css(config: &Config) {
    let theme_content = load_theme_colors(Some("media_widget"));
    let scale = config.layout.scale;
    
    // Helper to scale values
    let s = |v: f64| -> i32 { (v * scale).round() as i32 };
    
    // Read config values
    let radius = s(config.appearance.corner_radius as f64);
    let border_width = s(config.appearance.border_width as f64).max(0);
    let opacity = config.background.opacity as f64 / 100.0;
    
    // Font sizes (scaled)
    let font_title = s(18.0);
    let font_artist = s(12.0);
    let font_time = s(11.0);
    
    // Button sizes (scaled)
    let btn_size = s(38.0);
    let btn_radius = s(14.0);
    let play_width = s(80.0);
    let play_radius = s(24.0);
    let icon_margin = s(2.0);
    let play_margin = s(6.0);
    let is_portrait = config.layout.mode == "portrait";
    let art_margin = if is_portrait { 0 } else { s(12.0) };
    let labels_height = 48.0;
    let controls_height = 40.0;
    let progress_height = 32.0;
    let spacing = 12.0;
    let stack_height_base = labels_height + controls_height + progress_height + (2.0 * spacing);
    let art_size = if is_portrait {
        let base_width = if let Some(w) = config.layout.width { w as f64 } else { 320.0 };
        let widget_width = s(base_width);
        let padding_val = config.layout.padding as f64;
        widget_width - (s(padding_val) * 2) 
    } else {
        s(stack_height_base * 1.0)
    };

    let css_data = format!(r#"
        {theme}
        
        window {{
            background-color: transparent;
        }}
        
        .view {{
            background-color: alpha(@widget_bg, {opacity});
            border-radius: {radius}px;
            border: {border_width}px solid alpha(@outline, 0.15);
        }}
        
        .art-container {{
            border-radius: {radius}px;
            background-color: @surfaceVariant;
            min-width: {art_size}px;
            min-height: {art_size}px;
            margin-right: {art_margin}px;
        }}
        
        .art-image {{
            border-radius: {radius}px;
            min-width: {art_size}px;
            min-height: {art_size}px;
        }}
        
        /* App Icon Overlay */
        .app-icon-btn {{
            border-radius: {radius}px;
            border: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            background-color: @surface;
            color: @widget_text;
            padding: 0;
            margin: 0;
            transition: background-image 100ms ease-out;
            min-width: 0;
            min-height: 0;
        }}
        .app-icon-btn:hover {{
            background-image: linear-gradient(rgba(255,255,255,0.15), rgba(255,255,255,0.1));
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        }}
        .app-icon-btn image {{
            -gtk-icon-style: regular;
            margin: 4px; /* Padding for the icon inside the button */
        }}
        
        .title {{ 
            font-weight: 700; 
            font-size: {font_title}px; 
            color: @widget_text; 
            margin-bottom: 0px; 
        }}
        
        .title-scroll {{
            background: transparent;
            border: none;
        }}
        
        .artist {{ 
            font-size: {font_artist}px; 
            color: @widget_text_secondary; 
            font-weight: 500; 
            opacity: 0.8; 
        }}
        
        /* Control Buttons */
        .control-btn {{ 
            background-color: @surfaceVariant; 
            background-image: linear-gradient(transparent, transparent);
            color: @widget_text; 
            min-width: {btn_size}px; 
            min-height: {btn_size}px; 
            padding: 0; 
            margin: 0 {icon_margin}px; 
            border-radius: {btn_radius}px;
            border: none;
            transition: background-image 100ms ease-out, background-color 100ms ease-out;
        }}
        .control-btn:hover {{ 
            background-image: linear-gradient(alpha(@widget_text, 0.12), alpha(@widget_text, 0.12));
        }}
        .control-btn:active {{ 
            background-image: linear-gradient(alpha(@widget_text, 0.24), alpha(@widget_text, 0.24));
        }}
        
        /* Play Button - Pill Shape */
        .play-btn {{
            background-color: @widget_primary;
            background-image: linear-gradient(transparent, transparent);
            color: @onPrimary; 
            min-width: {play_width}px;
            border-radius: {play_radius}px; 
            margin: 0 {play_margin}px;
            transition: background-image 100ms ease-out;
        }}
        .play-btn:hover {{ 
            background-image: linear-gradient(alpha(@onPrimary, 0.12), alpha(@onPrimary, 0.12));
        }}
        .play-btn:active {{
            background-image: linear-gradient(alpha(@onPrimary, 0.24), alpha(@onPrimary, 0.24));
        }}
    
        /* Material You Slider - Pill style without visible knob */
        scale {{
            margin: 4px 0; 
            padding: 0;
        }}
        scale trough {{
            min-height: 10px;
            border-radius: 5px;
            background: alpha(@widget_text, 0.15);
        }}
        scale highlight {{
            min-height: 10px;
            border-radius: 5px;
            background: @widget_primary;
        }}
        scale slider {{
            min-width: 1px; 
            min-height: 10px;
            background: transparent;
            border: none;
            box-shadow: none;
            margin: 0;
        }}
        
        .time-label {{ 
            font-size: {font_time}px; 
            font-weight: 600; 
            color: @widget_text_secondary; 
            margin-top: 0px; 
        }}
    
        /* Player Dots */
        .dot {{
            min-width: 8px; 
            min-height: 8px;
            border-radius: 50%;
            background-color: alpha(@widget_text, 0.3);
            margin: 4px;
            padding: 0;
            border: none;
            transition: all 200ms cubic-bezier(0.25, 1, 0.5, 1);
        }}
        .dot:hover {{
            transform: scale(1.2);
            background-color: alpha(@widget_text, 0.5);
        }}
        .dot.active {{
            background-color: @widget_primary;
            transform: scale(1.4);
        }}
        .dots-box {{
            margin-top: 0px;
            margin-bottom: 0px;
            min-height: 16px;
        }}
    "#, 
        theme = theme_content,
        opacity = opacity,
        radius = radius,
        art_size = art_size,
        art_margin = art_margin,
        font_title = font_title,
        font_artist = font_artist,
        font_time = font_time,
        btn_size = btn_size,
        btn_radius = btn_radius,
        icon_margin = icon_margin,
        play_width = play_width,
        play_radius = play_radius,
        play_margin = play_margin,
        border_width = border_width,
    );
    
    thread_local! {
        static PROVIDER: CssProvider = CssProvider::new();
    }

    PROVIDER.with(|provider| {
        provider.load_from_data(&css_data);

        // Add to display only once per display connection
        static ADDED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
        if !ADDED.swap(true, std::sync::atomic::Ordering::SeqCst) {
            if let Some(display) = gdk::Display::default() {
                gtk4::style_context_add_provider_for_display(
                    &display,
                    provider,
                    gtk4::STYLE_PROVIDER_PRIORITY_APPLICATION,
                );
            }
        }
    });
}


pub fn watch_theme<F>(callback: F) -> Option<gio::FileMonitor>
where F: Fn() + 'static {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    // Monitor the DIRECTORY, not the file, to handle atomic replacements (rename over)
    let config_dir_path = format!("{}/.config/meowterialyou-widgets", home);
    let dir = gio::File::for_path(&config_dir_path);
    
    if let Ok(monitor) = dir.monitor_directory(gio::FileMonitorFlags::WATCH_MOVES, gio::Cancellable::NONE) {
        monitor.connect_changed(move |_, file, _, event_type| {
             // Only react to theme.css changes
             use gio::FileMonitorEvent;
             let filename = file.basename().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
             
             if filename == "theme.css" {
                 match event_type {
                     FileMonitorEvent::Created | FileMonitorEvent::Changed | FileMonitorEvent::ChangesDoneHint => {
                         callback();
                     },
                     _ => {}
                 }
             }
        });
        Some(monitor)
    } else {
        None
    }
}

pub fn load_theme_colors(widget_name: Option<&str>) -> String {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let mut theme_css = String::new();
    
    // 1. Load base from meta.json (to ensure all variables are defined)
    let meta_path = format!("{}/.config/meowterialyou-widgets/meta.json", home);
    if let Ok(content) = fs::read_to_string(&meta_path) {
        if let Ok(meta) = serde_json::from_str::<serde_json::Value>(&content) {
            println!("Base Theme variables from: {}", meta_path);
            theme_css.push_str(&generate_css_from_meta(&meta));
        }
    }
    
    // 2. Overlay with theme.css if available
    let mut paths = vec![];
    if let Some(name) = widget_name {
        paths.push(format!("{}/.config/meowterialyou-widgets/{}/theme.css", home, name));
        // Add legacy names too
        if name == "media_widget" {
            paths.push(format!("{}/.config/meowterialyou-widgets/mediawidget/theme.css", home));
        }
        if name == "weather_widget" {
            paths.push(format!("{}/.config/meowterialyou-widgets/weatherclock/theme.css", home));
        }
    }
    paths.push(format!("{}/.config/meowterialyou-widgets/theme.css", home));
    paths.push("theme.css".to_string());
    paths.push("MaterialYouColors.theme.css".to_string());
    
    for path_str in paths {
        let path = Path::new(&path_str);
        if path.exists() {
            println!("Overlaying Theme variables from: {:?}", path);
            if let Ok(content) = fs::read_to_string(path) {
                theme_css.push_str("\n/* Overlay from theme.css */\n");
                theme_css.push_str(&content);
                break; // Use the most specific theme.css found
            }
        }
    }
    
    if theme_css.is_empty() {
        // Fallback colors
        println!("Theme files not found, using fallback colors.");
        return r#"
            @define-color primary #4ddea6;
            @define-color onPrimary #003824;
            @define-color primaryContainer #005237;
            @define-color onPrimaryContainer #6efbc1;
            @define-color secondary #b3ccbd;
            /* ... truncated for brevity ... */
            @define-color widget_bg rgb(25, 28, 26);
            @define-color widget_text #e1e3df;
            @define-color widget_text_secondary #c0c9c2;
            @define-color widget_primary #4ddea6;
        "#.to_string();
    }
    
    theme_css
}

pub fn generate_css_from_meta(meta: &serde_json::Value) -> String {
    let mut css = String::new();
    
    if let Some(scheme) = meta.get("scheme").and_then(|s| s.as_object()) {
        for (k, v) in scheme {
            if let Some(hex) = v.as_str() {
                css.push_str(&format!("@define-color {} {};\n", k, hex));
            }
        }
    }
    
    if let Some(ws) = meta.get("widget_scheme").and_then(|s| s.as_object()) {
        let dark_bg = ws.get("surface").and_then(|v| v.as_str()).unwrap_or("#1a1a1a");
        let light_text = ws.get("onSurface").and_then(|v| v.as_str()).unwrap_or("#ffffff");
        let light_text_secondary = ws.get("onSurfaceVariant").and_then(|v| v.as_str()).unwrap_or("#c0c0c0");
        let primary = ws.get("primary").and_then(|v| v.as_str()).unwrap_or("#00ff00");
        
        // RGB for widget_bg
        let hex = dark_bg.trim_start_matches('#');
        if hex.len() == 6 {
            let r = i32::from_str_radix(&hex[0..2], 16).unwrap_or(26);
            let g = i32::from_str_radix(&hex[2..4], 16).unwrap_or(26);
            let b = i32::from_str_radix(&hex[4..6], 16).unwrap_or(26);
            css.push_str(&format!("@define-color widget_bg rgb({}, {}, {});\n", r, g, b));
        } else {
            css.push_str("@define-color widget_bg rgb(26, 26, 26);\n");
        }
        
        css.push_str(&format!("@define-color widget_text {};\n", light_text));
        css.push_str(&format!("@define-color widget_text_secondary {};\n", light_text_secondary));
        css.push_str(&format!("@define-color widget_primary {};\n", primary));
    }
    
    css
}
