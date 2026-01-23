// use gtk4::prelude::*; // Unused
use gtk4::{gdk, CssProvider};
use std::fs;
use std::path::Path;
use crate::widgets::media_widget::config::Config;

/// Load and apply CSS styles based on config
pub fn load_css(config: &Config) {
    let theme_content = load_theme_colors();
    let scale = config.layout.scale;
    
    // Helper to scale values
    let s = |v: f64| -> i32 { (v * scale).round() as i32 };
    
    // Read config values
    let padding = s(config.layout.padding as f64);
    let radius = s(config.appearance.corner_radius as f64);
    let opacity = config.background.opacity as f64 / 100.0;
    
    // Calculate art size from base height 152.0 (Pro Standard)
    let base_height = 152.0;
    // We use the configured padding (or default 16) for calculation
    let art_padding = config.layout.padding as f64; 
    let art_size = s(base_height - (art_padding * 2.0));
    
    // Font sizes (scaled)
    let font_title = s(20.0);
    let font_artist = s(13.0);
    let font_time = s(11.0);
    
    // Button sizes (scaled)
    let btn_size = s(38.0);
    let btn_radius = s(14.0);
    let play_width = s(80.0);
    let play_radius = s(24.0);
    let icon_margin = s(2.0);
    let play_margin = s(6.0);
    
    // Spacing (scaled)
    let art_spacing = s(16.0); // Tighter 16px gap for pro look

    let css_data = format!(r#"
        {theme}
        
        window {{
            background-color: transparent;
        }}
        
        .view {{
            background-color: alpha(@widget_bg, {opacity});
            border-radius: {radius}px;
            padding: {padding}px;
            padding-bottom: 12px;
        }}
        
        .art-container {{
            border-radius: {radius}px;
            background-color: @surfaceVariant;
            min-width: {art_size}px;
            min-height: {art_size}px;
            margin-right: {art_spacing}px;
        }}
        
        .art-image {{
            border-radius: {radius}px;
            min-width: {art_size}px;
            min-height: {art_size}px;
        }}
        
        .title {{ 
            font-weight: 800; 
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
            font-weight: 600; 
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
            transition: background-image 200ms ease-out, background-color 200ms ease-out;
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
            transition: background-image 200ms ease-out;
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
        }}
        .dot.active {{
            background-color: @widget_primary;
        }}
        .dots-box {{
            margin-top: 4px;
            margin-bottom: 0px;
        }}
    "#, 
        theme = theme_content,
        opacity = opacity,
        radius = radius,
        padding = padding,
        art_size = art_size,
        art_spacing = art_spacing,
        font_title = font_title,
        font_artist = font_artist,
        font_time = font_time,
        btn_size = btn_size,
        btn_radius = btn_radius,
        icon_margin = icon_margin,
        play_width = play_width,
        play_radius = play_radius,
        play_margin = play_margin,
    );

    let provider = CssProvider::new();
    provider.load_from_data(&css_data);

    gtk4::style_context_add_provider_for_display(
        &gdk::Display::default().expect("Could not connect to a display."),
        &provider,
        gtk4::STYLE_PROVIDER_PRIORITY_APPLICATION,
    );
}

fn load_theme_colors() -> String {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let runtime_theme = format!("{}/.config/meowterialyou-widgets/mediawidget/theme.css", home);
    
    let paths = [
        runtime_theme.as_str(),
        "theme.css",
        "MaterialYouColors.theme.css",
    ];
    
    for path in paths.iter() {
        if Path::new(path).exists() {
            println!("Loading Theme variables from: {}", path);
            if let Ok(content) = fs::read_to_string(path) {
                return content;
            }
        }
    }
    
    // Try meta.json if theme.css is missing
    let meta_path = format!("{}/.config/meowterialyou-widgets/meta.json", home);
    if let Ok(content) = fs::read_to_string(&meta_path) {
        if let Ok(meta) = serde_json::from_str::<serde_json::Value>(&content) {
            println!("Generating Theme variables from: {}", meta_path);
            return generate_css_from_meta(&meta);
        }
    }
    
    // Fallback colors
    println!("Theme file not found, using fallback colors.");
    r#"
    @define-color primary #4ddea6;
    @define-color onPrimary #003824;
    @define-color primaryContainer #005237;
    @define-color onPrimaryContainer #6efbc1;
    @define-color secondary #b3ccbd;
    @define-color onSecondary #1f352a;
    @define-color secondaryContainer #354b40;
    @define-color onSecondaryContainer #cfe9d9;
    @define-color tertiary #a4ccde;
    @define-color onTertiary #073543;
    @define-color tertiaryContainer #254c5b;
    @define-color onTertiaryContainer #c0e8fb;
    @define-color error #ffb4a9;
    @define-color onError #680003;
    @define-color errorContainer #930006;
    @define-color onErrorContainer #ffb4a9;
    @define-color background #191c1a;
    @define-color onBackground #e1e3df;
    @define-color surface #191c1a;
    @define-color onSurface #e1e3df;
    @define-color surfaceVariant #404943;
    @define-color onSurfaceVariant #c0c9c2;
    @define-color outline #89938c;
    @define-color outlineVariant #404943;
    @define-color shadow #000000;
    @define-color scrim #000000;
    @define-color inverseSurface #e1e3df;
    @define-color inverseOnSurface #2d312e;
    @define-color inversePrimary #006c4a;
    @define-color surfaceDim #111412;
    @define-color surfaceBright #363a37;
    @define-color surfaceContainerLowest #0c0f0d;
    @define-color surfaceContainerLow #191c1a;
    @define-color surfaceContainer #1d201e;
    @define-color surfaceContainerHigh #282b29;
    @define-color surfaceContainerHighest #323633;
    @define-color widget_bg rgb(25, 28, 26);
    @define-color widget_text #e1e3df;
    @define-color widget_text_secondary #c0c9c2;
    @define-color widget_primary #4ddea6;
    "#.to_string()
}

fn generate_css_from_meta(meta: &serde_json::Value) -> String {
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
