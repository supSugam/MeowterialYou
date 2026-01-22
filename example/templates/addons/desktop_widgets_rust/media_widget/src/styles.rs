use gtk4::prelude::*;
use gtk4::{gdk, CssProvider};
use std::fs;
use std::path::Path;
use crate::config::Config;

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
    let font_title = s(16.0);
    let font_artist = s(13.0);
    let font_time = s(11.0);
    
    // Button sizes (scaled)
    let btn_size = s(38.0);
    let btn_radius = s(14.0);
    let play_width = s(60.0);
    let play_radius = s(24.0);
    let icon_margin = s(2.0);
    let play_margin = s(6.0);
    
    // Slider sizes (scaled)
    let slider_height = s(6.0);
    let slider_radius = s(3.0);
    let slider_knob = s(16.0);
    let slider_margin = s(-5.0);
    
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
            background: @surfaceVariant; 
            color: @widget_text; 
            min-width: {btn_size}px; 
            min-height: {btn_size}px; 
            padding: 0; 
            margin: 0 {icon_margin}px; 
            border-radius: {btn_radius}px;
            border: none;
        }}
        .control-btn:hover {{ 
            background: alpha(@widget_text, 0.1); 
        }}
        .control-btn:active {{ 
            background: alpha(@widget_text, 0.2); 
        }}
        
        /* Play Button - Pill Shape */
        .play-btn {{
            background: @widget_primary; 
            color: @onPrimary; 
            min-width: {play_width}px;
            border-radius: {play_radius}px; 
            margin: 0 {play_margin}px;
        }}
        .play-btn:hover {{ 
            background: alpha(@widget_primary, 0.9); 
        }}
    
        /* Modern Slider */
        scale {{
            margin: 0; 
            padding: 0;
        }}
        scale trough {{
            min-height: {slider_height}px;
            border-radius: {slider_radius}px;
            background: alpha(@widget_text, 0.1);
        }}
        scale highlight {{
            min-height: {slider_height}px;
            border-radius: {slider_radius}px;
            background: @widget_primary;
        }}
        scale slider {{
            min-width: {slider_knob}px; 
            min-height: {slider_knob}px;
            border-radius: 50%;
            background: @widget_primary;
            margin: {slider_margin}px 0;
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
            margin-top: 8px;
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
        slider_height = slider_height,
        slider_radius = slider_radius,
        slider_knob = slider_knob,
        slider_margin = slider_margin,
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
    let paths = [
        "../../../MaterialYouColors.theme.css",
        "../../MaterialYouColors.theme.css",
        "MaterialYouColors.theme.css",
        "theme.css"
    ];
    
    for path in paths.iter() {
        if Path::new(path).exists() {
            println!("Loading Theme variables from: {}", path);
            if let Ok(content) = fs::read_to_string(path) {
                return content;
            }
        }
    }
    
    // Fallback colors
    println!("Theme file not found, using fallback colors.");
    r#"
    @define-color widget_bg rgba(30, 30, 30, 1);
    @define-color widget_text #ffffff;
    @define-color widget_text_secondary #aaaaaa;
    @define-color widget_primary #7dd3fc;
    @define-color onPrimary #000000;
    @define-color surfaceVariant rgba(255, 255, 255, 0.1);
    @define-color outline rgba(255, 255, 255, 0.2);
    "#.to_string()
}
