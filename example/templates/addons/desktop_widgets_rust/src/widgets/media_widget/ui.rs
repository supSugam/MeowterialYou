use gtk4::prelude::*;
use gtk4::{Align, Box, Button, Image, Label, Orientation, Scale, Adjustment, Picture};
use gtk4::glib;
use crate::widgets::media_widget::config::Config;
use crate::common::marquee::{MarqueeLabel, Direction};
use std::sync::atomic::{AtomicBool, Ordering};
use once_cell::sync::Lazy;

// Shared flag to prevent slider updates during drag
static IS_DRAGGING: Lazy<AtomicBool> = Lazy::new(|| AtomicBool::new(false));

#[derive(Clone)]
pub struct Widgets {
    pub art_image: Picture,
    pub title: MarqueeLabel,
    pub artist: MarqueeLabel,
    pub play_btn: Button,
    pub scale: Scale,
    pub lbl_current: Label,
    pub lbl_total: Label,
    pub dots_box: Box,
    pub cmd_sender: async_channel::Sender<crate::widgets::media_widget::mpris::MprisCommand>,
    pub art_size: i32,
}

pub fn build(window: &gtk4::ApplicationWindow, cmd_sender: async_channel::Sender<crate::widgets::media_widget::mpris::MprisCommand>, config: &Config) -> Widgets {
    let scale = config.layout.scale;
    
    // Base dimensions (Pro Standard)
    let base_width = 400.0;
    
    // Scale helper
    let s = |v: f64| -> i32 { (v * scale).round() as i32 };
    
    // Calculated dimensions
    let widget_width = s(base_width);
    let padding_val = config.layout.padding as f64;
    
    // Internal heights (Base)
    let labels_height_base = 42.0;
    let controls_height_base = 38.0;
    let progress_height_base = 28.0;
    let details_spacing_base = 10.0;

    // Stack height = components + spacing
    let stack_height_base = labels_height_base + controls_height_base + progress_height_base + (2.0 * details_spacing_base);
    
    // Art size is 1.1x the details stack
    let art_size_base = stack_height_base * 1.15;
    let art_size = s(art_size_base);
    let art_spacing = s(0.0); // Consistent with CSS
    
    // Content width
    let content_width = widget_width - s(padding_val * 2.0) - art_size - art_spacing;
    
    // --- ROOT WRAPPER: Width fixed, Height AUTO ---
    let root_wrapper = Box::builder()
        .orientation(Orientation::Vertical)
        .width_request(widget_width)
        .spacing(0) // Ensure no implicit spacing
        .build();
    root_wrapper.add_css_class("view");

    // --- MAIN BOX: Width fixed, Height determined by largest child (art) ---
    let main_box = Box::builder()
        .orientation(Orientation::Horizontal)
        .spacing(art_spacing)
        .hexpand(false)
        .vexpand(false)
        .build();

    // --- ART SECTION: Fixed square ---
    let art_box = Box::builder()
        .orientation(Orientation::Vertical)
        .valign(Align::Center)
        .halign(Align::Start)
        .width_request(art_size)
        .height_request(art_size)
        .hexpand(false)
        .vexpand(false)
        .build();
    art_box.add_css_class("art-container");
    
    let art_image = Picture::builder()
        .width_request(art_size)
        .height_request(art_size)
        .content_fit(gtk4::ContentFit::Cover)
        .can_shrink(true)
        .halign(Align::Fill)
        .valign(Align::Fill)
        .build();
    art_image.add_css_class("art-image");
    
    art_box.set_overflow(gtk4::Overflow::Hidden);
    art_box.append(&art_image);

    // --- DETAILS SECTION: Fixed width, vertical layout ---
    let details_box = Box::builder()
        .orientation(Orientation::Vertical)
        .valign(Align::Center) // Center details relative to the larger album art
        .halign(Align::Fill)
        .width_request(content_width)
        .hexpand(false)
        .vexpand(false)
        .spacing(s(details_spacing_base))
        .build();

    // A. Labels (Marquee) - Fixed height
    let labels_height = s(labels_height_base);
    let labels_box = Box::builder()
        .orientation(Orientation::Vertical)
        .spacing(s(2.0))
        .height_request(labels_height)
        .vexpand(false)
        .build();
    labels_box.add_css_class("labels-container");

    let title_marquee = MarqueeLabel::new("title", Direction::Left);
    let artist_marquee = MarqueeLabel::new("artist", Direction::Right);

    labels_box.append(&title_marquee.container);
    labels_box.append(&artist_marquee.container);

    // B. Controls - Fixed height
    let controls_height = s(controls_height_base);
    let controls_box = Box::builder()
        .orientation(Orientation::Horizontal)
        .halign(Align::Start)
        .height_request(controls_height)
        .spacing(0)
        .vexpand(false)
        .build();
    controls_box.add_css_class("controls-box");

    let prev_sender = cmd_sender.clone();
    let prev_btn = create_control_btn("media-skip-backward-symbolic", s(18.0), move || {
        let _ = prev_sender.send_blocking(crate::widgets::media_widget::mpris::MprisCommand::Previous);
    });
    
    let play_sender = cmd_sender.clone();
    let play_btn = create_control_btn("media-playback-start-symbolic", s(28.0), move || {
         let _ = play_sender.send_blocking(crate::widgets::media_widget::mpris::MprisCommand::PlayPause);
    });
    play_btn.add_css_class("play-btn"); 
    
    let next_sender = cmd_sender.clone();
    let next_btn = create_control_btn("media-skip-forward-symbolic", s(18.0), move || {
         let _ = next_sender.send_blocking(crate::widgets::media_widget::mpris::MprisCommand::Next);
    });

    controls_box.append(&prev_btn);
    controls_box.append(&play_btn);
    controls_box.append(&next_btn);

    // C. Progress - Fixed height
    let progress_height = s(progress_height_base);
    let progress_box = Box::builder()
        .orientation(Orientation::Vertical)
        .spacing(0)
        .height_request(progress_height)
        .vexpand(false)
        .build();

    let scale_widget = Scale::builder()
        .orientation(Orientation::Horizontal)
        .draw_value(false)
        .adjustment(&Adjustment::new(0.0, 0.0, 100.0, 1.0, 10.0, 0.0))
        .hexpand(true)
        .build();
    scale_widget.add_css_class("progress-bar");

    let time_box = Box::builder()
        .orientation(Orientation::Horizontal)
        .build();
    
    // Fixed width for time labels to prevent jumping
    let time_width = s(36.0);
    let lbl_current = Label::builder()
        .label("0:00")
        .halign(Align::Start)
        .width_request(time_width)
        .build();
    lbl_current.add_css_class("time-label");
    
    let spacer = Label::builder().hexpand(true).build(); 
    
    let lbl_total = Label::builder()
        .label("0:00")
        .halign(Align::End)
        .width_request(time_width)
        .build();
    lbl_total.add_css_class("time-label");

    time_box.append(&lbl_current);
    time_box.append(&spacer);
    time_box.append(&lbl_total);

    progress_box.append(&scale_widget);
    progress_box.append(&time_box);

    // Assemble details
    details_box.append(&labels_box);
    details_box.append(&controls_box);
    details_box.append(&progress_box);

    // Assemble main
    main_box.append(&art_box);
    main_box.append(&details_box);
    
    root_wrapper.append(&main_box);
    
    // Dots - Natural height
    let dots_box = Box::builder()
        .orientation(Orientation::Horizontal)
        .halign(Align::Center)
        .hexpand(true)
        .vexpand(false)
        .build();
    dots_box.add_css_class("dots-box");
    
    root_wrapper.append(&dots_box);

    // Add Drag Controller to Root Wrapper to capture clicks
    let drag_controller = gtk4::GestureClick::new();
    drag_controller.set_button(0); // All buttons
    drag_controller.connect_pressed(move |_, n_press, _, _| {
        println!("Background clicked! Press: {}", n_press);
    });
    root_wrapper.add_controller(drag_controller);

    window.set_child(Some(&root_wrapper));
    
    // Use EventControllerLegacy to capture raw button events (not consumed by Scale's drag)
    let legacy = gtk4::EventControllerLegacy::new();
    let seek_sender = cmd_sender.clone();
    let scale_for_seek = scale_widget.clone();
    
    legacy.connect_event(move |_, event| {
        use gtk4::gdk::EventType;
        
        match event.event_type() {
            EventType::ButtonPress => {
                IS_DRAGGING.store(true, Ordering::SeqCst);
            }
            EventType::ButtonRelease => {
                // Read slider value and seek
                let val = scale_for_seek.value(); // percentage 0-100
                let length = crate::widgets::media_widget::state::STATE.read().unwrap().length;
                
                if length > 0 {
                    let target_pos = ((val / 100.0) * length as f64) as i64;
                    let _ = seek_sender.send_blocking(crate::widgets::media_widget::mpris::MprisCommand::SetPosition(target_pos));
                }
                
                // Delay resetting IS_DRAGGING to give MPRIS time to process seek
                // This prevents UI from briefly showing old position
                glib::timeout_add_local_once(std::time::Duration::from_millis(300), || {
                    IS_DRAGGING.store(false, Ordering::SeqCst);
                });
            }
            _ => {}
        }
        
        glib::Propagation::Proceed // Let Scale handle the event too
    });
    scale_widget.add_controller(legacy);
    
    // Live time preview during drag
    let lbl_for_preview = lbl_current.clone();
    scale_widget.connect_value_changed(move |scale| {
        if IS_DRAGGING.load(Ordering::SeqCst) {
            let val = scale.value(); // percentage 0-100
            let length = crate::widgets::media_widget::state::STATE.read().unwrap().length;
            if length > 0 {
                let preview_pos = ((val / 100.0) * length as f64) as u64;
                lbl_for_preview.set_label(&format_time(preview_pos));
            }
        }
    });

    Widgets {
        art_image,
        title: title_marquee,
        artist: artist_marquee,
        play_btn: play_btn.downcast().unwrap(), 
        scale: scale_widget,
        lbl_current,
        lbl_total,
        dots_box,
        cmd_sender,
        art_size,
    }
}

pub fn update(widgets: &Widgets) {
    use crate::widgets::media_widget::state::STATE;
    let state = STATE.read().unwrap();
    
    widgets.title.set_text(&state.title);
    widgets.artist.set_text(&state.artist);
    
    let play_icon_name = if state.is_playing { "media-playback-pause-symbolic" } else { "media-playback-start-symbolic" };
    if let Some(child) = widgets.play_btn.child() {
        if let Ok(img) = child.downcast::<Image>() {
             img.set_icon_name(Some(play_icon_name));
        }
    }
    
    // Only update slider if not currently being dragged by user
    if !IS_DRAGGING.load(Ordering::SeqCst) {
        if state.length > 0 {
             let pct = (state.position as f64 / state.length as f64) * 100.0;
             widgets.scale.set_value(pct);
        } else {
            widgets.scale.set_value(0.0);
        }
    }
    
    // Only update current time label if not during drag (user sees preview instead)
    if !IS_DRAGGING.load(Ordering::SeqCst) {
        widgets.lbl_current.set_label(&format_time(state.position));
    }
    widgets.lbl_total.set_label(&format_time(state.length));

    // Art Loading
    use std::sync::Mutex;
    use once_cell::sync::Lazy;
    static LAST_ART_URL: Lazy<Mutex<String>> = Lazy::new(|| Mutex::new(String::new()));
    
    let should_load = {
        let mut last = LAST_ART_URL.lock().unwrap();
        if *last != state.art_url {
            *last = state.art_url.clone();
            true
        } else {
            false
        }
    };
    
    if !state.art_url.is_empty() && should_load {
        let (sender, receiver) = async_channel::bounded(1);
        crate::common::image_loader::load_art(&state.art_url, widgets.art_size, sender);
        
        let img_weak = widgets.art_image.downgrade();
        gtk4::glib::MainContext::default().spawn_local(async move {
            let res = receiver.recv().await;
            if let Some(img) = img_weak.upgrade() {
                match res {
                    Ok(Some(texture)) => {
                        img.set_paintable(Some(&texture));
                    }
                    _ => {
                        img.set_paintable(None::<&gtk4::gdk::Texture>);
                    }
                }
            }
        });
    } else if state.art_url.is_empty() {
         widgets.art_image.set_paintable(None::<&gtk4::gdk::Texture>);
    }
    
    while let Some(child) = widgets.dots_box.first_child() {
        widgets.dots_box.remove(&child);
    }
    
    for player_bus in &state.players {
        let dot = Button::builder().build();
        dot.add_css_class("dot");
        
        if let Some(current) = &state.current_bus_name {
            if current == player_bus {
                dot.add_css_class("active");
            }
        }
        
        let sender = widgets.cmd_sender.clone();
        let bus_name = player_bus.clone();
        dot.connect_clicked(move |_| {
            let _ = sender.send_blocking(crate::widgets::media_widget::mpris::MprisCommand::SwitchPlayer(bus_name.clone()));
        });
        
        widgets.dots_box.append(&dot);
    }
}

fn format_time(micros: u64) -> String {
    let seconds = micros / 1_000_000;
    let mins = seconds / 60;
    let secs = seconds % 60;
    format!("{}:{:02}", mins, secs)
}

fn create_control_btn<F>(icon: &str, size: i32, on_click: F) -> Button 
where F: Fn() + 'static {
    let btn = Button::builder().build();
    let image = Image::builder()
        .icon_name(icon)
        .pixel_size(size)
        .build();
    btn.set_child(Some(&image));
    btn.add_css_class("control-btn");
    btn.connect_clicked(move |_| on_click());
    btn
}
