use gtk4::prelude::*;
use gtk4::{Align, Box, Label, Orientation};
use gtk4::pango::EllipsizeMode;
use crate::widgets::weather_widget::config::Config;
use crate::widgets::weather_widget::state::UpdateMessage;

#[derive(Clone)]
pub struct Widgets {
    pub date: Label,
    pub time: Label,
    pub ampm: Label,
    pub emoji: Label,
    pub w_icon: Label,
    pub w_temp: Label,
    pub w_desc: Label,
    pub w_city: Label,
    pub wind: Label,
    pub humidity: Label,
    pub cpu: Label,
    pub ram: Label,
    pub net: Label,
    pub temp: Label,
    pub w_row: Box,
    pub d_row: Box,
    pub divider: Box,
    pub sys_row: Box,
    pub root: Box,
}

pub fn build(window: &gtk4::ApplicationWindow, config: &Config) -> Widgets {
    let scale = config.layout.scale;
    let s = move |v: f64| -> i32 { (v * scale).round() as i32 };
    let sp = |v: f64| -> i32 { (v * scale).round() as i32 }; // Spacing helper

    let align_right = config.layout.alignment == "right" || (config.layout.alignment == "auto" && config.layout.position.contains("right"));
    let h_align = if align_right { Align::End } else { Align::Start };

    // Calculate border width early for root wrapper sizing
    let border_x = s(config.layout.border_width as f64) * 2;

    // --- ROOT ---
    let root = Box::builder()
        .orientation(Orientation::Vertical)
        // Request width MINUS border width, because GTK/CSS adds border to the requested size
        .width_request(s(config.layout.width as f64) - border_x)
        .build();
    root.add_css_class("view");

    let content = Box::builder()
        .orientation(Orientation::Vertical)
        .spacing(0)
        .valign(Align::Fill)
        .halign(Align::Fill)
        .hexpand(true)
        .vexpand(true)
        .build();
    content.add_css_class("content-box");
    root.append(&content);

    let padding = s(config.layout.padding as f64);
    content.set_margin_start(padding);
    content.set_margin_end(padding);
    content.set_margin_top(padding);
    // TWEAK: Reduce bottom margin to compensate for visual "phantom" space 
    // from icons/labels in sys_row, restoring visual symmetry.
    content.set_margin_bottom(padding - s(6.0));

    // --- Row 1: Date & Emoji ---
    let date_row = Box::builder()
        .orientation(Orientation::Horizontal)
        .spacing(sp(16.0))
        .build();
    
    let date_label = Label::builder()
        .label("...")
        .ellipsize(EllipsizeMode::End)
        .halign(h_align)
        .build();
    date_label.add_css_class("date");

    let emoji = Label::builder()
        .valign(Align::Center)
        .build();
    emoji.add_css_class("emoji-custom");
    
    if config.emoji.row == 1 {
        if align_right {
            date_row.append(&date_label);
            date_row.append(&emoji);
        } else {
            date_row.append(&date_label);
            date_row.append(&Box::builder().hexpand(true).build());
            date_row.append(&emoji);
        }
    } else {
        if align_right {
            date_row.append(&Box::builder().hexpand(true).build());
            date_row.append(&date_label);
        } else {
            date_row.append(&date_label);
        }
    }
    content.append(&date_row);

    content.append(&Box::builder().vexpand(true).build());

    // --- Row 2: Time ---
    let time_row = Box::builder()
        .orientation(Orientation::Horizontal)
        .build();
    
    let time_group = Box::builder()
        .orientation(Orientation::Horizontal)
        .spacing(sp(8.0))
        .halign(h_align)
        .build();

    let time_label = Label::builder()
        .label("...")
        .ellipsize(EllipsizeMode::End)
        .build();
    time_label.add_css_class("time");

    let ampm_label = Label::builder()
        .label("AM")
        .valign(Align::End)
        .margin_bottom(s(8.0))
        .build();
    ampm_label.add_css_class("ampm");

    time_group.append(&time_label);
    time_group.append(&ampm_label);
    
    if config.emoji.row == 2 {
        if align_right {
            time_row.append(&time_group);
            time_row.append(&emoji);
        } else {
            time_row.append(&time_group);
            time_row.append(&Box::builder().hexpand(true).build());
            time_row.append(&emoji);
        }
    } else {
        if align_right {
            time_row.append(&Box::builder().hexpand(true).build());
            time_row.append(&time_group);
        } else {
            time_row.append(&time_group);
        }
    }
    content.append(&time_row);

    content.append(&Box::builder().vexpand(true).build());

    // --- Row 3: Weather ---
    let weather_row = Box::builder()
        .orientation(Orientation::Horizontal)
        .visible(config.visibility.show_weather)
        .margin_top(sp(4.0))
        .build();

    let temp_box = Box::builder()
        .orientation(Orientation::Horizontal)
        .valign(Align::Center)
        .build();
    
    let w_icon = Label::builder().label("").build();
    w_icon.add_css_class("weather-icon");
    let w_temp = Label::builder().label("--").build();
    w_temp.add_css_class("weather-temp");
    
    temp_box.append(&w_icon);
    temp_box.append(&w_temp);
    w_temp.set_margin_start(s(6.0));

    let info_box = Box::builder()
        .orientation(Orientation::Vertical)
        .valign(Align::Center)
        .build();
    
    let w_desc = Label::builder()
        .label("Unknown")
        .halign(Align::End)
        .ellipsize(EllipsizeMode::End)
        .build();
    w_desc.add_css_class("weather-desc");
    
    let w_city = Label::builder()
        .label("Location")
        .halign(Align::End)
        .ellipsize(EllipsizeMode::End)
        .build();
    w_city.add_css_class("weather-city");

    info_box.append(&w_desc);
    info_box.append(&w_city);

    weather_row.append(&temp_box);
    weather_row.append(&Box::builder().hexpand(true).build());
    weather_row.append(&info_box);
    content.append(&weather_row);

    if config.visibility.show_weather {
        content.append(&Box::builder().vexpand(true).build());
    }

    // --- Row 4: Details ---
    let detail_row = Box::builder()
        .orientation(Orientation::Horizontal)
        .margin_top(sp(8.0))
        .visible(config.visibility.show_weather)
        .build();
    
    let wind_stat = create_stat("󰖝", "--", s);
    let humid_stat = create_stat("󰖎", "--%", s);
    humid_stat.0.set_margin_start(s(16.0));

    detail_row.append(&wind_stat.0);
    detail_row.append(&humid_stat.0);
    content.append(&detail_row);

    if config.visibility.show_weather {
        content.append(&Box::builder().vexpand(true).build());
    }

    // --- Row 5: Divider ---
    let divider = Box::builder()
        .orientation(Orientation::Horizontal)
        .height_request(1)
        .margin_top(sp(4.0))
        .visible(config.visibility.show_divider && config.visibility.show_computer_metrics)
        .build();
    divider.add_css_class("divider");
    content.append(&divider);

    if config.visibility.show_divider && config.visibility.show_computer_metrics {
        content.append(&Box::builder().vexpand(true).build());
    }

    // --- Row 6: Stats ---
    let sys_row = Box::builder()
        .orientation(Orientation::Horizontal)
        .visible(config.visibility.show_computer_metrics)
        .hexpand(true)
        .build();

    let cpu = create_stat("", "0%", s);
    let ram = create_stat("", "0%", s);
    let net = create_stat("", "0 K", s);
    let temp_label_stat = create_stat("", "0°C", s);

    sys_row.append(&cpu.0);
    sys_row.append(&Box::builder().hexpand(true).build());
    sys_row.append(&ram.0);
    sys_row.append(&Box::builder().hexpand(true).build());
    sys_row.append(&net.0);
    sys_row.append(&Box::builder().hexpand(true).build());
    sys_row.append(&temp_label_stat.0);
    content.append(&sys_row);

    window.set_child(Some(&root));

    let widgets = Widgets {
        date: date_label,
        time: time_label,
        ampm: ampm_label,
        emoji,
        w_icon,
        w_temp,
        w_desc,
        w_city,
        wind: wind_stat.1,
        humidity: humid_stat.1,
        cpu: cpu.1,
        ram: ram.1,
        net: net.1,
        temp: temp_label_stat.1,
        w_row: weather_row,
        d_row: detail_row,
        divider,
        sys_row,
        root: root,
    };

    update_from_message(&widgets, &UpdateMessage::Time { 
        time: "00:00".to_string(), 
        ampm: "AM".to_string(), 
        date: "Mon, Jan 01".to_string() 
    }, config);

    widgets
}

fn create_stat<F>(icon: &str, val: &str, s: F) -> (Box, Label) 
where F: Fn(f64) -> i32 {
    let b = Box::builder()
        .orientation(Orientation::Horizontal)
        .spacing(s(6.0))
        .build();
    let i = Label::builder().label(icon).build();
    i.add_css_class("sys-icon");
    let l = Label::builder().label(val).build();
    l.add_css_class("detail");
    b.append(&i);
    b.append(&l);
    (b, l)
}

pub fn update_from_message(widgets: &Widgets, msg: &UpdateMessage, config: &Config) {
    match msg {
        UpdateMessage::Time { time, ampm, date } => {
            widgets.date.set_label(date);
            widgets.time.set_label(time);
            widgets.ampm.set_label(ampm);
            widgets.ampm.set_visible(config.clock.show_ampm && config.clock.format != "24h");
            
            let target_row = config.emoji.row;
            let base_size = if target_row == 2 { 48.0 } else { 14.0 };
            let raw_size = base_size * config.emoji.scale;
            let pango_size = (raw_size * 1024.0 * 0.75).round() as i32;
            widgets.emoji.set_markup(&format!("<span size='{}'>{}</span>", pango_size, config.emoji.value));
        },
        UpdateMessage::Weather(w) => {
            widgets.w_icon.set_label(&w.icon_char);
            widgets.w_temp.set_label(&w.temp);
            widgets.w_desc.set_label(&w.desc);
            widgets.w_city.set_label(&w.city);
            widgets.wind.set_label(&format!("{} {}", w.wind, w.wind_direction));
            widgets.humidity.set_label(&w.humidity);
        },
        UpdateMessage::Stats(s) => {
            widgets.cpu.set_label(&s.load);
            widgets.ram.set_label(&s.mem);
            widgets.net.set_label(&s.net);
            widgets.temp.set_label(&s.temp);
        }
    }
}

pub fn load_css(config: &Config) {
    let theme_content = crate::common::styles::load_theme_colors(Some("weather_widget"));
    let bg_opacity = config.background.opacity as f64 / 100.0;
    let scale = config.layout.scale;
    let s = move |v: f64| -> i32 { (v * scale).round() as i32 };
    
    let font = &config.typography.font_family;
    let icon_font = &config.typography.icon_font;
    let time_size = s(config.typography.time_size as f64);

    let css_data = format!(r#"
        {theme}
        
        window {{ background-color: transparent; }}

        .view {{
            background-color: alpha(@widget_bg, {bg_opacity});
            border-radius: {radius}px;
            border: {border_width}px solid alpha(@outline, 0.15);
        }}
        
        .date {{
            font-family: "{font}", sans-serif;
            font-size: {date_size}px;
            font-weight: 500;
            color: @widget_text;
        }}

        .emoji-custom {{
            transform: rotate({rotate}deg);
        }}

        .time {{
            font-family: "{font}", sans-serif;
            font-size: {time_size}px;
            font-weight: bold;
            color: @widget_primary;
            letter-spacing: -{time_spacing}px;
        }}

        .ampm {{
            font-family: "{font}", sans-serif;
            font-size: {ampm_size}px;
            font-weight: 500;
            color: @widget_text_secondary;
        }}

        .weather-icon {{
            font-family: "{icon_font}", monospace;
            font-size: {w_icon_size}px;
            color: @widget_primary;
        }}

        .weather-temp {{
            font-family: "{font}", sans-serif;
            font-size: {w_temp_size}px;
            font-weight: bold;
            color: @widget_text;
        }}

        .weather-desc {{
            font-family: "{font}", sans-serif;
            font-size: {w_desc_size}px;
            font-weight: 500;
            color: @widget_text_secondary;
        }}

        .weather-city {{
            font-family: "{font}", sans-serif;
            font-size: {w_city_size}px;
            color: @widget_text_secondary;
            opacity: 1.0;
            font-weight: 500;
        }}

        .detail {{
            font-family: "{icon_font}", "{font}", monospace;
            font-size: {detail_size}px;
            color: @widget_text_secondary;
            opacity: 0.9;
        }}
        
        .sys-icon {{
            font-family: "{icon_font}", monospace;
            font-size: {sys_icon_size}px;
            color: @widget_primary;
        }}
        
        .divider {{
            background-color: @widget_text_secondary;
            min-height: 1px;
            opacity: 0.15;
            margin-top: {divider_margin}px;
            margin-bottom: {divider_margin}px;
        }}
    "#,
        theme = theme_content,
        bg_opacity = bg_opacity,
        radius = s(config.layout.corner_radius as f64).max(0),
        border_width = s(config.layout.border_width as f64).max(0),
        font = font,
        icon_font = icon_font,
        date_size = s(14.0),
        time_size = time_size,
        time_spacing = s(1.0).max(0),
        ampm_size = s(16.0),
        w_icon_size = s(32.0),
        w_temp_size = s(24.0),
        w_desc_size = s(14.0),
        w_city_size = s(14.0),
        detail_size = s(14.0),
        sys_icon_size = s(18.0),
        divider_margin = s(8.0),
        rotate = config.emoji.rotate
    );
    
    thread_local! {
        static PROVIDER: gtk4::CssProvider = gtk4::CssProvider::new();
    }

    PROVIDER.with(|provider| {
        provider.load_from_data(&css_data);

        // Add to display only once per display connection
        static ADDED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
        if !ADDED.swap(true, std::sync::atomic::Ordering::SeqCst) {
            if let Some(display) = gtk4::gdk::Display::default() {
                gtk4::style_context_add_provider_for_display(
                    &display,
                    provider,
                    gtk4::STYLE_PROVIDER_PRIORITY_APPLICATION,
                );
            }
        }
    });
}
