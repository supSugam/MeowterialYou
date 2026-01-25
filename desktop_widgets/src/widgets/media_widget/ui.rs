use gtk4::prelude::*;
use gtk4::{Align, Box, Button, Image, Label, Orientation, Scale, Adjustment, Picture, Stack, StackTransitionType, Overlay, AspectFrame};
use gtk4::glib;
use crate::widgets::media_widget::config::Config;
use crate::common::marquee::{MarqueeLabel, Direction};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use once_cell::sync::Lazy;

// Shared flag to prevent slider updates during drag
static IS_DRAGGING: Lazy<AtomicBool> = Lazy::new(|| AtomicBool::new(false));
// Track which bus name is currently displayed to detect changes
static CURRENT_DISPLAYED_BUS: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));

#[derive(Clone)]
pub struct PlayerView {
    pub container: Box,
    pub art_image: Picture,
    pub app_icon_image: Image, 
    pub title: MarqueeLabel,
    pub artist: MarqueeLabel,
    pub loop_btn: Button,
    pub prev_btn: Button,
    pub play_btn: Button,
    pub next_btn: Button,
    pub shuffle_btn: Button,
    pub scale: Scale,
    pub lbl_current: Label,
    pub lbl_total: Label,
    pub art_size: i32,
}

#[derive(Clone)]
pub struct Widgets {
    pub stack: Stack,
    pub view_1: PlayerView,
    pub view_2: PlayerView,
    pub dots_box: Box,
    pub cmd_sender: async_channel::Sender<crate::widgets::media_widget::mpris::MprisCommand>,
}

pub fn build(window: &gtk4::ApplicationWindow, cmd_sender: async_channel::Sender<crate::widgets::media_widget::mpris::MprisCommand>, config: &Config) -> Widgets {
    let scale = config.layout.scale;
    
    // Base dimensions (Pro Standard)
    // Detect Mode
    let is_portrait = config.layout.mode == "portrait";
    let base_width = if let Some(w) = config.layout.width {
        w as f64
    } else {
        if is_portrait { 320.0 } else { 320.0 } // Default fallback
    };
    
    // Scale helper
    let s = move |v: f64| -> i32 { (v * scale).round() as i32 };
    
    // Calculated dimensions
    let widget_width = s(base_width);
    let padding_val = config.layout.padding as f64;
    
    // Calculate border width early for root wrapper sizing
    let border_x = s(config.appearance.border_width as f64) * 2;
    
    
    // --- ROOT WRAPPER ---
    let root_wrapper = Box::builder()
        .orientation(Orientation::Vertical)
        // Request width MINUS border width, because GTK/CSS adds border to the requested size
        .width_request(widget_width - border_x)
        .spacing(0)
        .build();
    root_wrapper.add_css_class("view");

    // --- CONTENT WRAPPER (Handles Padding) ---
    // Similar to weather_widget, we wrap inner content to apply margins uniformly
    let content_wrapper = Box::builder()
        .orientation(Orientation::Vertical)
        .halign(Align::Fill)
        .valign(Align::Fill)
        .hexpand(true)
        .vexpand(true)
        .build();
    
    // Apply padding via Gtk Margins to the wrapper
    // TWEAK: Reduce bottom margin to account for Dots presence, restoring visual symmetry
    // We want Total Bottom Space (Dots + Margin) = Padding
    let dots_height = s(12.0); 
    let padding_bottom = (s(padding_val) - dots_height).max(0);

    content_wrapper.set_margin_start(s(padding_val));
    content_wrapper.set_margin_end(s(padding_val));
    content_wrapper.set_margin_top(s(padding_val));
    content_wrapper.set_margin_bottom(padding_bottom);

    root_wrapper.append(&content_wrapper);

    // --- STACK (The Carousel) ---
    let stack = Stack::builder()
        .transition_type(StackTransitionType::SlideLeftRight)
        .transition_duration(400) // 400ms smooth slide
        .interpolate_size(false) // Fixed size
        .build();

    // Create two identical views for ping-pong buffering
    let view_1 = build_player_view(cmd_sender.clone(), config, s);
    let view_2 = build_player_view(cmd_sender.clone(), config, s);

    stack.add_named(&view_1.container, Some("view_1"));
    stack.add_named(&view_2.container, Some("view_2"));

    content_wrapper.append(&stack);

    // Dots - Fixed height
    let dots_box = Box::builder()
        .orientation(Orientation::Horizontal)
        .halign(Align::Center)
        .hexpand(true)
        .vexpand(false)
        .height_request(dots_height)
        .build();
    dots_box.add_css_class("dots-box");
    
    content_wrapper.append(&dots_box);

    // Add Drag Controller to Root Wrapper to capture clicks
    let drag_controller = gtk4::GestureClick::new();
    drag_controller.set_button(0); // All buttons
    drag_controller.connect_pressed(move |_, n_press, _, _| {
        println!("Background clicked! Press: {}", n_press);
    });
    root_wrapper.add_controller(drag_controller);

    window.set_child(Some(&root_wrapper));

    Widgets {
        stack,
        view_1,
        view_2,
        dots_box,
        cmd_sender,
    }
}

fn build_player_view<F>(cmd_sender: async_channel::Sender<crate::widgets::media_widget::mpris::MprisCommand>, config: &Config, s: F) -> PlayerView 
where F: Fn(f64) -> i32 + Copy {
    let is_portrait = config.layout.mode == "portrait";
    let padding_val = config.layout.padding as f64;
    
    // Internal heights (Base)
    // Reduce label container height in portrait to reduce gap to controls
    let labels_height_base = if is_portrait { 52.0 } else { 54.0 };
    let controls_height_base = 38.0;
    let progress_height_base = 28.0;
    let details_spacing_base = 12.0;

    // Stack height = components + spacing
    let stack_height_base = labels_height_base + controls_height_base + progress_height_base + (2.0 * details_spacing_base);
    
    // In Portrait, spacing between art and content is larger
    // Reduced from 16.0 to 10.0 to match the visual gap between artist and controls
    let art_spacing = if is_portrait { s(10.0) } else { s(0.0) };
    
    let base_width = if let Some(w) = config.layout.width {
        w as f64
    } else {
        if is_portrait { 320.0 } else { 320.0 }
    };
    let widget_width = s(base_width);
    let border_x = s(config.appearance.border_width as f64) * 2;
    
    // Intermediate content width for portrait
    // MUST subtract border so that Art Size (which fills this) + Margins + Border <= Widget Width
    let port_content_width = widget_width - s(padding_val * 2.0) - border_x;
    
    // Art size logic
    let art_size = if is_portrait {
         port_content_width // 1:1 aspect ratio matching content width
    } else {
         let art_size_base = stack_height_base * 1.1;
         s(art_size_base)
    };
    // Since we now use Gtk Margins for padding (applied to container), we don't need to subtract padding manually here
    // But we DO need to account for space taken by art.
    // Available space inside main_box depends on orientation.
    // Horizontal: Available = widget_width - margins - art_size - spacing
    // Vertical: Available = widget_width - margins

    // We pass padding via margins to containers later, effectively reducing available space.
    // BUT since we set width_request on inner boxes, we must be careful.
    // If we request too much, we blow up.
    // Let's assume widget_width accounts for margins?
    // In weather_widget: root(320) -> child(margin=20). Child gets 280. Matches.
    // So 'content_width' here refers to the width of the DETAILS box.
    // subtract border width (2 sides) so we don't push the parent out.

    // The padding is now applied to the content_wrapper in the build function,
    // so the PlayerView's internal calculations should consider the full available width
    // within that padded area.
    // The widget_width here is the original base_width scaled.
    // The actual available width for the PlayerView container is `widget_width - border_x - s(padding_val * 2.0)`.
    // However, since main_box itself doesn't have margins anymore, its children should sum up to this available width.
    // The `content_width` here refers to the width of the DETAILS box.
    let content_width = if is_portrait {
         widget_width - s(padding_val * 2.0) - border_x
    } else {
         widget_width - s(padding_val * 2.0) - art_size - art_spacing - border_x
    };

    // --- MAIN BOX ---
    let main_box = Box::builder()
        .orientation(if is_portrait { Orientation::Vertical } else { Orientation::Horizontal })
        .spacing(art_spacing)
        .hexpand(false)
        .vexpand(false)
        .halign(Align::Fill)
        .build();
    
    // Apply padding via Gtk Margins (matching weather_widget logic)
    // REMOVED - Applied to wrapper now

    // --- ART SECTION ---
    let art_box = Box::builder()
        .orientation(Orientation::Vertical)
        .valign(Align::Center)
        // Ensure Fill in portrait to stretch image
        .halign(if is_portrait { Align::Fill } else { Align::Start })
        .width_request(art_size)
        .height_request(art_size)
        .hexpand(false)
        .vexpand(false)
        .build();
    art_box.add_css_class("art-container");
    
    // --- ART OVERLAY ---
    let art_overlay = Overlay::builder()
        .width_request(art_size)
        .height_request(art_size)
        .build();
    art_overlay.add_css_class("art-overlay");
    
    // Use AspectFrame to enforce 1:1 ratio
    let aspect_frame = AspectFrame::builder()
        .xalign(0.5)
        .yalign(0.5)
        .ratio(1.0)
        .obey_child(false)
        .child(&art_overlay)
        .build();
    
    let art_image = Picture::builder()
        .width_request(art_size)
        .height_request(art_size)
        .content_fit(gtk4::ContentFit::Cover)
        .can_shrink(true)
        .halign(Align::Fill)
        .valign(Align::Fill)
        .build();
    art_image.add_css_class("art-image");
    
    // --- APP ICON OVERLAY ---
    let app_icon_size = s(24.0);
    // Button for interaction + icon
    let app_icon_btn = Button::builder()
        .halign(Align::Start)
        .valign(Align::End)
        .margin_start(s(8.0))
        .margin_bottom(s(8.0))
        .width_request(app_icon_size)
        .height_request(app_icon_size)
        .build();
    app_icon_btn.add_css_class("app-icon-btn");
    
    let app_icon_image = Image::builder()
        .icon_name("audio-x-generic") // Default fallback
        .pixel_size(app_icon_size)
        .build();
    app_icon_btn.set_child(Some(&app_icon_image));
    
    let raise_sender = cmd_sender.clone();
    app_icon_btn.connect_clicked(move |_| {
         let _ = raise_sender.send_blocking(crate::widgets::media_widget::mpris::MprisCommand::Raise);
    });
    
    // Setup Overlay
    art_overlay.set_child(Some(&art_image));
    art_overlay.add_overlay(&app_icon_btn);
    
    art_box.set_overflow(gtk4::Overflow::Hidden);
    art_box.append(&aspect_frame);

    // Details spacing
    // Match art_spacing (10.0) for consistency
    let details_spacing = if is_portrait { s(10.0) } else { s(details_spacing_base) };

    // --- DETAILS SECTION ---
    let details_box = Box::builder()
        .orientation(Orientation::Vertical)
        .valign(Align::Center)
        .halign(Align::Fill)
        .width_request(content_width)
        .hexpand(false)
        .vexpand(false)
        .spacing(details_spacing)
        .build();

    // A. Labels
    let labels_box = Box::builder()
        .orientation(Orientation::Vertical)
        .spacing(s(2.0))
        .vexpand(false)
        .halign(Align::Fill) // Fill needed for Marquee to measure width properly
        .build();
    labels_box.add_css_class("labels-container");

    let label_align = if is_portrait { Align::Center } else { Align::Start };
    let title_marquee = MarqueeLabel::new("title", Direction::Left, label_align);
    let artist_marquee = MarqueeLabel::new("artist", Direction::Right, label_align);

    labels_box.append(&title_marquee.container);
    labels_box.append(&artist_marquee.container);

    // B. Controls
    let controls_height = s(controls_height_base);
    let controls_box = Box::builder()
        .orientation(Orientation::Horizontal)
        .halign(Align::Fill)
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
    play_btn.set_hexpand(true);
    
    let next_sender = cmd_sender.clone();
    let next_btn = create_control_btn("media-skip-forward-symbolic", s(18.0), move || {
         let _ = next_sender.send_blocking(crate::widgets::media_widget::mpris::MprisCommand::Next);
    });

    let loop_sender = cmd_sender.clone();
    let loop_btn = create_control_btn("media-playlist-repeat-symbolic", s(16.0), move || {
         let _ = loop_sender.send_blocking(crate::widgets::media_widget::mpris::MprisCommand::ToggleLoop);
    });
    
    let shuffle_sender = cmd_sender.clone();
    let shuffle_btn = create_control_btn("media-playlist-shuffle-symbolic", s(16.0), move || {
         let _ = shuffle_sender.send_blocking(crate::widgets::media_widget::mpris::MprisCommand::ToggleShuffle);
    });

    controls_box.append(&loop_btn);
    controls_box.append(&prev_btn);
    controls_box.append(&play_btn);
    controls_box.append(&next_btn);
    controls_box.append(&shuffle_btn);

    // C. Progress
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

    details_box.append(&labels_box);
    details_box.append(&controls_box);
    details_box.append(&progress_box);

    main_box.append(&art_box);
    main_box.append(&details_box);
    
    // Scale Logic
    let legacy = gtk4::EventControllerLegacy::new();
    let seek_sender = cmd_sender.clone();
    let scale_for_seek = scale_widget.clone();
    
    legacy.connect_event(move |_, event| {
        use gtk4::gdk::EventType;
        match event.event_type() {
            EventType::ButtonPress => { IS_DRAGGING.store(true, Ordering::SeqCst); }
            EventType::ButtonRelease => {
                let val = scale_for_seek.value();
                let length = crate::widgets::media_widget::state::STATE.read().unwrap().length;
                if length > 0 {
                    let target_pos = ((val / 100.0) * length as f64) as i64;
                    let _ = seek_sender.send_blocking(crate::widgets::media_widget::mpris::MprisCommand::SetPosition(target_pos));
                }
                glib::timeout_add_local_once(std::time::Duration::from_millis(300), || {
                    IS_DRAGGING.store(false, Ordering::SeqCst);
                });
            }
            _ => {}
        }
        glib::Propagation::Proceed
    });
    scale_widget.add_controller(legacy);
    
    let lbl_for_preview = lbl_current.clone();
    scale_widget.connect_value_changed(move |scale| {
        if IS_DRAGGING.load(Ordering::SeqCst) {
            let val = scale.value();
            let length = crate::widgets::media_widget::state::STATE.read().unwrap().length;
            if length > 0 {
                let preview_pos = ((val / 100.0) * length as f64) as u64;
                lbl_for_preview.set_label(&format_time(preview_pos));
            }
        }
    });

    PlayerView {
        container: main_box,
        art_image,
        app_icon_image,
        title: title_marquee,
        artist: artist_marquee,
        loop_btn,
        prev_btn,
        play_btn: play_btn.downcast().unwrap(), 
        next_btn,
        shuffle_btn,
        scale: scale_widget,
        lbl_current,
        lbl_total,
        art_size,
    }
}

pub fn update(widgets: &Widgets) {
    use crate::widgets::media_widget::state::STATE;
    let state = STATE.read().unwrap();

    // 1. Determine if player switched
    let mut current_bus_lock = CURRENT_DISPLAYED_BUS.lock().unwrap();
    let active_bus_name = state.current_bus_name.clone().unwrap_or_default();
    
    let player_switched = *current_bus_lock != Some(active_bus_name.clone());
    
    let visible_name = widgets.stack.visible_child_name().map(|s| s.as_str().to_string()).unwrap_or("view_1".to_string());
    
    // Pick target view: if switched, pick hidden one. If not, pick current.
    let target_view = if player_switched {
        if visible_name == "view_1" { &widgets.view_2 } else { &widgets.view_1 }
    } else {
        if visible_name == "view_1" { &widgets.view_1 } else { &widgets.view_2 }
    };

    // 2. Update Target View Content
    update_view_content(target_view, &state);

    // 3. Handle Switch & Transition
    if player_switched {
        // Calculate Direction
        let old_idx = state.players.iter().position(|p| Some(p) == current_bus_lock.as_ref()).unwrap_or(0);
        let new_idx = state.players.iter().position(|p| p == &active_bus_name).unwrap_or(0);
        
        let direction = if new_idx > old_idx {
            StackTransitionType::SlideLeft // New enters from right
        } else {
            StackTransitionType::SlideRight // New enters from left
        };
        
        widgets.stack.set_transition_type(direction);
        
        let target_name = if visible_name == "view_1" { "view_2" } else { "view_1" };
        widgets.stack.set_visible_child_name(target_name);
        
        *current_bus_lock = Some(active_bus_name.clone());
        
        // Ensure marquee resets on the new view
        target_view.title.set_text(&state.title); 
        target_view.artist.set_text(&state.artist);
    }

    // 4. Update Dots (Intelligent)
    let current_children = widgets.dots_box.observe_children();
    let n_children = current_children.n_items();
    let n_players = state.players.len() as u32;
    let mut needs_rebuild = n_children != n_players;
    
    if !needs_rebuild {
        for i in 0..n_children {
            if let Some(child_obj) = current_children.item(i) {
                if let Ok(btn) = child_obj.downcast::<Button>() {
                     if let Some(name) = btn.widget_name().as_str().strip_prefix("player-") {
                         if state.players.get(i as usize) != Some(&name.to_string()) {
                             needs_rebuild = true;
                             break;
                         }
                     } else { needs_rebuild = true; break; }
                }
            }
        }
    }

    if needs_rebuild {
        while let Some(child) = widgets.dots_box.first_child() { widgets.dots_box.remove(&child); }
        for player_bus in &state.players {
            let dot = Button::builder().name(&format!("player-{}", player_bus)).build();
            dot.add_css_class("dot");
            if let Some(current) = &state.current_bus_name {
                if current == player_bus { dot.add_css_class("active"); }
            }
            let sender = widgets.cmd_sender.clone();
            let bus_name = player_bus.clone();
            dot.connect_clicked(move |_| {
                let _ = sender.send_blocking(crate::widgets::media_widget::mpris::MprisCommand::SwitchPlayer(bus_name.clone()));
            });
            widgets.dots_box.append(&dot);
        }
    } else {
        for i in 0..n_children {
            if let Some(child_obj) = current_children.item(i) {
                if let Ok(btn) = child_obj.downcast::<Button>() {
                    let player_bus = &state.players[i as usize];
                    let is_active = state.current_bus_name.as_ref() == Some(player_bus);
                    if is_active { btn.add_css_class("active"); } else { btn.remove_css_class("active"); }
                }
            }
        }
    }
}

fn update_view_content(view: &PlayerView, state: &crate::widgets::media_widget::state::MediaState) {
    view.title.set_text(&state.title);
    view.artist.set_text(&state.artist);
    
    // Update App Icon
    let raw_name = state.desktop_entry.as_deref().unwrap_or_else(|| {
        state.identity.as_deref().unwrap_or("audio-x-generic")
    });
    // Sanitize: "Google Chrome" -> "google-chrome"
    let icon_name = raw_name.replace(" ", "-").to_lowercase();
    view.app_icon_image.set_icon_name(Some(&icon_name));
    
    let play_icon_name = if state.is_playing { "media-playback-pause-symbolic" } else { "media-playback-start-symbolic" };
    if let Some(child) = view.play_btn.child() {
        if let Ok(img) = child.downcast::<Image>() {
             img.set_icon_name(Some(play_icon_name));
        }
    }
    
    // Update Loop Button
    match &state.loop_status {
        Some(status) => {
             view.loop_btn.set_sensitive(true);
             view.loop_btn.set_opacity(if status == "None" { 0.5 } else { 1.0 });
             if let Some(child) = view.loop_btn.child() {
                 if let Ok(img) = child.downcast::<Image>() {
                      let icon = if status == "Track" { "media-playlist-repeat-song-symbolic" } else { "media-playlist-repeat-symbolic" };
                      img.set_icon_name(Some(icon));
                 }
             }
             if status != "None" { view.loop_btn.add_css_class("active"); } else { view.loop_btn.remove_css_class("active"); }
        },
        None => {
             view.loop_btn.set_sensitive(false);
             view.loop_btn.set_opacity(0.3);
             view.loop_btn.remove_css_class("active");
        }
    }
    
    // Update Shuffle Button
    match state.shuffle {
        Some(is_shuffle) => {
             view.shuffle_btn.set_sensitive(true);
             view.shuffle_btn.set_opacity(if is_shuffle { 1.0 } else { 0.5 });
             if is_shuffle { view.shuffle_btn.add_css_class("active"); } else { view.shuffle_btn.remove_css_class("active"); }
        },
        None => {
             view.shuffle_btn.set_sensitive(false);
             view.shuffle_btn.set_opacity(0.3);
             view.shuffle_btn.remove_css_class("active");
        }
    }
    
    if !IS_DRAGGING.load(Ordering::SeqCst) {
        if state.length > 0 {
             let pct = (state.position as f64 / state.length as f64) * 100.0;
             view.scale.set_value(pct);
        } else {
            view.scale.set_value(0.0);
        }
        view.lbl_current.set_label(&format_time(state.position));
    }
    view.lbl_total.set_label(&format_time(state.length));

    // Art Loading (Simplified for brevity, assuming cache handles redundant calls)
    if !state.art_url.is_empty() {
        let (sender, receiver) = async_channel::bounded(1);
        crate::common::image_loader::load_art(&state.art_url, view.art_size, sender);
        let img_weak = view.art_image.downgrade();
        gtk4::glib::MainContext::default().spawn_local(async move {
            if let Ok(Some(texture)) = receiver.recv().await {
                if let Some(img) = img_weak.upgrade() {
                    img.set_paintable(Some(&texture));
                }
            }
        });
    } else {
         view.art_image.set_paintable(None::<&gtk4::gdk::Texture>);
    }
}

fn format_time(micros: u64) -> String {
    let total_seconds = micros / 1_000_000;
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;
    
    if hours > 0 {
        format!("{:02}:{:02}:{:02}", hours, minutes, seconds)
    } else {
        format!("{:02}:{:02}", minutes, seconds)
    }
}

fn create_control_btn<F>(icon: &str, size: i32, on_click: F) -> Button 
where F: Fn() + 'static {
    let btn = Button::builder().build();
    let image = Image::builder().icon_name(icon).pixel_size(size).build();
    btn.set_child(Some(&image));
    btn.add_css_class("control-btn");
    btn.connect_clicked(move |_| on_click());
    btn
}
