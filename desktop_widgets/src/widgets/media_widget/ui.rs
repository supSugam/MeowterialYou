use gtk4::prelude::*;
use gtk4::{Align, Box, Button, Image, Label, Orientation, Scale, Adjustment, Picture, Stack, StackTransitionType, Overlay, ScrolledWindow, PolicyType, ContentFit};
use gtk4::{gdk, gio};
use crate::widgets::media_widget::config::Config;
use crate::common::marquee::{MarqueeLabel, Direction};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use once_cell::sync::Lazy;
use std::rc::Rc;
use std::cell::RefCell;

// Shared flag to prevent slider updates during drag
static IS_DRAGGING: Lazy<AtomicBool> = Lazy::new(|| AtomicBool::new(false));
// Track which bus name is currently displayed to detect changes
static CURRENT_DISPLAYED_BUS: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));
// Track current active dot index for direction-aware transitions (0=Dashboard, 1+=Players)
static CURRENT_DOT_INDEX: Lazy<Mutex<i32>> = Lazy::new(|| Mutex::new(0));

#[derive(Clone)]
pub struct PlayerView {
    pub container: Box,
    pub art_stack: Stack,
    pub art_a: Picture,
    pub art_b: Picture,
    pub current_art_url: Rc<RefCell<String>>,
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
pub struct DashboardView {
    pub container: Box,
    pub mixer_list: Box,
    pub apps_grid: gtk4::FlowBox,
}

// ... imports
use crate::widgets::media_widget::pulse::PulseController;

// ...

#[derive(Clone)]
pub struct Widgets {
    pub stack: Stack,
    pub view_1: PlayerView,
    pub view_2: PlayerView,
    pub dashboard_view: DashboardView,
    pub dots_box: Box,
    pub last_players: Rc<RefCell<Vec<String>>>,
    pub cmd_sender: async_channel::Sender<crate::widgets::media_widget::mpris::MprisCommand>,
    pub root: Box,
    pub scale: f64,
    pub pulse: Option<Rc<PulseController>>, 
}

pub fn build(window: &gtk4::ApplicationWindow, cmd_sender: async_channel::Sender<crate::widgets::media_widget::mpris::MprisCommand>, config: &Config, pulse: Option<Rc<PulseController>>) -> Widgets {
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
    
    let root_wrapper = Box::builder()
        .orientation(Orientation::Vertical)
        .width_request(widget_width)
        .spacing(0)
        .build();
    root_wrapper.add_css_class("view");
    if config.layout.position.contains("left") {
        root_wrapper.add_css_class("side-left");
    } else {
        root_wrapper.add_css_class("side-right");
    }

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
    let dots_height = s(16.0); 
    // Higher bottom padding for dots to feel more balanced
    let padding_bottom = s(padding_val * 0.6);

    content_wrapper.set_margin_start(s(padding_val));
    content_wrapper.set_margin_end(s(padding_val));
    content_wrapper.set_margin_top(s(padding_val));
    content_wrapper.set_margin_bottom(padding_bottom);

    root_wrapper.append(&content_wrapper);

    let stack = Stack::builder()
        .transition_type(StackTransitionType::SlideLeftRight)
        .transition_duration(400) 
        .interpolate_size(false) 
        .build();

    // --- PORT HEIGHT CALCULATION (Sync with PlayerView) ---
    let labels_height_base_val = if is_portrait { 44.0 } else { 48.0 };
    let controls_height_base = 40.0;
    let progress_height_base = 32.0;
    let details_spacing_base = if is_portrait { 8.0 } else { 12.0 };
    let stack_height_base = labels_height_base_val + controls_height_base + progress_height_base + (2.0 * details_spacing_base);
    let art_spacing = if is_portrait { s(details_spacing_base) } else { 0 };
    let art_size = if is_portrait { (widget_width - s(padding_val * 2.0)).max(0) } else { s(stack_height_base) };
    let port_height = if is_portrait { art_size + art_spacing + s(stack_height_base) } else { art_size };

    let view_1 = build_player_view(cmd_sender.clone(), config, s);
    let view_2 = build_player_view(cmd_sender.clone(), config, s);
    let dashboard_view = build_dashboard_view(cmd_sender.clone(), config, s, port_height);

    stack.add_named(&view_1.container, Some("view_1"));
    stack.add_named(&view_2.container, Some("view_2"));
    stack.add_named(&dashboard_view.container, Some("dashboard_view"));

    content_wrapper.append(&stack);


    let dots_box = Box::builder()
        .orientation(Orientation::Horizontal)
        .halign(Align::Center)
        .hexpand(true)
        .vexpand(false)
        .height_request(dots_height)
        .build();
    dots_box.add_css_class("dots-box");
    content_wrapper.append(&dots_box);

    window.set_child(Some(&root_wrapper));

    Widgets {
        stack,
        view_1,
        view_2,
        dashboard_view,
        dots_box,
        last_players: Rc::new(RefCell::new(Vec::new())),
        cmd_sender,
        root: root_wrapper,
        scale,
        pulse: pulse.clone(),
    }
}

fn build_player_view<F>(cmd_sender: async_channel::Sender<crate::widgets::media_widget::mpris::MprisCommand>, config: &Config, s: F) -> PlayerView 
where F: Fn(f64) -> i32 + Copy {
    let is_portrait = config.layout.mode == "portrait";
    let padding_val = config.layout.padding as f64;
    
    let labels_height_base_val = if is_portrait { 44.0 } else { 48.0 };
    let controls_height_base = 40.0;
    let progress_height_base = 32.0;
    let details_spacing_base = if is_portrait { 8.0 } else { 12.0 };

    let stack_height_base = labels_height_base_val + controls_height_base + progress_height_base + (2.0 * details_spacing_base);
    
    let art_spacing = if is_portrait { s(details_spacing_base) } else { s(0.0) };
    
    let base_width = if let Some(w) = config.layout.width {
        w as f64
    } else {
        if is_portrait { 320.0 } else { 320.0 }
    };
    let widget_width = s(base_width);
    let border_x = s(config.appearance.border_width as f64) * 2;
    
    let port_content_width = widget_width - (s(padding_val) * 2);
    
    let art_size = if is_portrait {
         port_content_width 
    } else {
         s(stack_height_base * 1.0)
    };

    let content_width = if is_portrait {
         widget_width - s(padding_val * 2.0) - border_x
    } else {
         widget_width - s(padding_val * 2.0) - art_size - art_spacing - border_x
    };

    let main_box = Box::builder()
        .orientation(if is_portrait { Orientation::Vertical } else { Orientation::Horizontal })
        .spacing(art_spacing)
        .hexpand(true) // Allow content to follow root expansion
        .vexpand(false)
        .halign(Align::Fill)
        .build();
    
    let spacer_texture = gdk::MemoryTexture::new(
        1, 1, 
        gdk::MemoryFormat::R8g8b8a8, 
        &gtk4::glib::Bytes::from(&[0, 0, 0, 0]), 
        4
    );
    let spacer = Picture::builder()
        .paintable(&spacer_texture)
        .content_fit(ContentFit::Contain) // Ensure it respects ratio
        .can_shrink(false)
        .halign(Align::Fill)
        .valign(Align::Fill)
        .hexpand(if is_portrait { true } else { false })
        .width_request(if is_portrait { -1 } else { art_size })
        .height_request(if is_portrait { -1 } else { art_size })
        .build();

    // Use Overlay as the main container
    let art_overlay_container = Overlay::builder()
        .halign(if is_portrait { Align::Fill } else { Align::Center })
        .valign(Align::Center)
        .width_request(if is_portrait { -1 } else { art_size })
        .height_request(if is_portrait { -1 } else { art_size })
        .build();
    art_overlay_container.add_css_class("art-container");
    
    // The Spacer drives the size of the overlay
    art_overlay_container.set_child(Some(&spacer));

    let art_stack = Stack::builder()
        .transition_type(StackTransitionType::Crossfade)
        .transition_duration(500)
        .halign(Align::Fill)
        .valign(Align::Fill)
        .build();
    art_stack.add_css_class("art-image"); 

    let art_a = Picture::builder()
        .content_fit(ContentFit::Cover)
        .can_shrink(true)
        .build();
    
    let art_b = Picture::builder()
        .content_fit(ContentFit::Cover)
        .can_shrink(true)
        .build();

    art_stack.add_named(&art_a, Some("art_a"));
    art_stack.add_named(&art_b, Some("art_b"));
    art_stack.set_visible_child_name("art_a");
    
    let app_icon_size = s(24.0);
    let app_icon_btn = Button::builder()
        .halign(Align::Start)
        .valign(Align::End)
        .margin_start(s(8.0))
        .margin_bottom(s(8.0))
        .width_request(app_icon_size)
        .height_request(app_icon_size)
        .focus_on_click(false)
        .build();
    app_icon_btn.add_css_class("app-icon-btn");
    
    let app_icon_image = Image::builder()
        .icon_name("audio-x-generic") // Default fallback
        .pixel_size(app_icon_size)
        .build();
    app_icon_btn.set_child(Some(&app_icon_image));
    
    let raise_sender = cmd_sender.clone();
    app_icon_btn.connect_clicked(move |_| {
         eprintln!("[media_widget] App icon clicked - sending Raise command");
         let _ = raise_sender.send_blocking(crate::widgets::media_widget::mpris::MprisCommand::Raise);
    });
    
    // Internal Overlay for Art + Icon
    let content_overlay = Overlay::builder()
        .halign(Align::Fill)
        .valign(Align::Fill)
        .build();
    content_overlay.set_child(Some(&art_stack));
    content_overlay.add_overlay(&app_icon_btn);
    
    // WRAP IN SCROLLED WINDOW to enforce strict size clipping
    let scroller = ScrolledWindow::builder()
        .hscrollbar_policy(PolicyType::Never)
        .vscrollbar_policy(PolicyType::Never)
        .propagate_natural_width(false)
        .propagate_natural_height(false)
        .has_frame(false) 
        .hexpand(true)
        .vexpand(true)
        .build();
    
    scroller.set_child(Some(&content_overlay));
    
    // Add scroller ON TOP of the spacer in the main overlay
    art_overlay_container.add_overlay(&scroller);
    art_overlay_container.set_overflow(gtk4::Overflow::Hidden);

    let details_spacing = s(details_spacing_base);

    let details_box = Box::builder()
        .orientation(Orientation::Vertical)
        .valign(Align::Center)
        .halign(Align::Fill)
        .width_request(content_width)
        .hexpand(false)
        .vexpand(false)
        .spacing(details_spacing)
        .build();
    details_box.add_css_class("details-box");

    let labels_box = Box::builder()
        .orientation(Orientation::Vertical)
        .spacing(s(2.0))
        .height_request(s(labels_height_base_val))
        .vexpand(false)
        .halign(Align::Fill) 
        .build();
    labels_box.add_css_class("labels-container");

    let labels_inner = Box::builder()
        .orientation(Orientation::Vertical)
        .spacing(s(2.0))
        .valign(Align::Center)
        .vexpand(true)
        .build();

    let label_align = if is_portrait { Align::Center } else { Align::Start };
    let title_marquee = MarqueeLabel::new("title", Direction::Left, label_align);
    let artist_marquee = MarqueeLabel::new("artist", Direction::Right, label_align);

    labels_inner.append(&title_marquee.container);
    labels_inner.append(&artist_marquee.container);
    labels_box.append(&labels_inner);

    let controls_box = Box::builder()
        .orientation(Orientation::Horizontal)
        .halign(Align::Fill)
        .valign(Align::Center)
        .height_request(s(controls_height_base))
        .spacing(0)
        .vexpand(true)
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

    let progress_box = Box::builder()
        .orientation(Orientation::Vertical)
        .spacing(0)
        .height_request(s(progress_height_base))
        .vexpand(false)
        .build();

    let scale_widget = Scale::builder()
        .orientation(Orientation::Horizontal)
        .draw_value(false)
        .adjustment(&Adjustment::new(0.0, 0.0, 100.0, 1.0, 10.0, 0.0))
        .hexpand(true)
        .focus_on_click(false)
        .focusable(false)
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

    main_box.append(&art_overlay_container);
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
        gtk4::glib::Propagation::Proceed
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
        art_stack,
        art_a,
        art_b,
        current_art_url: Rc::new(RefCell::new(String::new())),
        app_icon_image,
        title: title_marquee,
        artist: artist_marquee,
        loop_btn,
        prev_btn,
        play_btn: {
            let b: Button = play_btn.downcast().unwrap();
            b.set_focus_on_click(false);
            b.set_focusable(false);
            b
        }, 
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
    let state_lock = STATE.read().unwrap();
    let state = &*state_lock;
    let s = |v: f64| -> i32 { (v * widgets.scale).round() as i32 };
    
    // 1. Detect Bus Change (Switching Players)
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
        if let Some(mut dot_idx_lock) = CURRENT_DOT_INDEX.try_lock().ok() {
            *dot_idx_lock = (new_idx + 1) as i32;
        }
        
        // Ensure marquee resets on the new view
        target_view.title.set_text(&state.title); 
        target_view.artist.set_text(&state.artist);
    }

    // 4. Navigation Dots (Home + Players)
    let current_children = widgets.dots_box.observe_children();
    let n_children = current_children.n_items();
    let n_players = state.players.len() as u32;
    let expected_dots = n_players + 1; // Always Home
    
    let mut last_players_lock = widgets.last_players.borrow_mut();
    let players_changed = *last_players_lock != state.players;

    if n_children != expected_dots || players_changed {
        *last_players_lock = state.players.clone();
        while let Some(child) = widgets.dots_box.first_child() { widgets.dots_box.remove(&child); }
        
        // 4a. Home Dot (Always first)
        let home_dot = Button::builder()
            .name("home-dot")
            .focus_on_click(false)
            .build();
        home_dot.add_css_class("dot");
        home_dot.add_css_class("home-dot");
        
        let icon = Image::builder()
            .icon_name("user-home-symbolic") 
            .pixel_size(s(8.0))
            .build();
        home_dot.set_child(Some(&icon));
        
        let stack_clone = widgets.stack.clone();
        home_dot.connect_clicked(move |_| {
            let mut idx_lock = CURRENT_DOT_INDEX.lock().unwrap();
            let old_idx = *idx_lock;
            let new_idx = 0;
            
            if new_idx != old_idx {
                let direction = if new_idx > old_idx {
                    StackTransitionType::SlideLeft
                } else {
                    StackTransitionType::SlideRight
                };
                stack_clone.set_transition_type(direction);
                stack_clone.set_visible_child_name("dashboard_view");
                *idx_lock = new_idx;
            }
        });
        widgets.dots_box.append(&home_dot);

        // 4b. Player Dots
        for player_bus in &state.players {
            let dot = Button::builder()
                .name(&format!("player-{}", player_bus))
                .focus_on_click(false)
                .build();
            dot.add_css_class("dot");
            
            let sender = widgets.cmd_sender.clone();
            let bus_name = player_bus.clone();
            let stack_clone = widgets.stack.clone();
            let player_idx = (state.players.iter().position(|p| p == player_bus).unwrap_or(0) + 1) as i32;
            dot.connect_clicked(move |_| {
                let mut idx_lock = CURRENT_DOT_INDEX.lock().unwrap();
                let old_idx = *idx_lock;
                let new_idx = player_idx;

                if new_idx != old_idx {
                    let direction = if new_idx > old_idx {
                        StackTransitionType::SlideLeft
                    } else {
                        StackTransitionType::SlideRight
                    };
                    stack_clone.set_transition_type(direction);
                    stack_clone.set_visible_child_name("view_1");
                    *idx_lock = new_idx;
                }
                let _ = sender.send_blocking(crate::widgets::media_widget::mpris::MprisCommand::SwitchPlayer(bus_name.clone()));
            });
            widgets.dots_box.append(&dot);
        }
    }

    // 4c. Active State Sync
    let is_dashboard = widgets.stack.visible_child_name() == Some("dashboard_view".into());
    let current_children = widgets.dots_box.observe_children();
    for i in 0..current_children.n_items() {
        if let Some(child) = current_children.item(i) {
            if let Ok(btn) = child.downcast::<Button>() {
                if i == 0 { // Home
                    if is_dashboard { btn.add_css_class("active"); } else { btn.remove_css_class("active"); }
                } else {
                    // Player dots
                    if !is_dashboard {
                        let player_bus = &state.players[i as usize - 1];
                        let is_active = state.current_bus_name.as_ref() == Some(player_bus);
                        if is_active { btn.add_css_class("active"); } else { btn.remove_css_class("active"); }
                    } else {
                        btn.remove_css_class("active");
                    }
                }
            }
        }
    }

    // 5. Auto-switch to Dashboard if No Players
    if n_players == 0 && !is_dashboard {
        widgets.stack.set_visible_child_name("dashboard_view");
    }

    // --- DASHBOARD UPDATE ---
    // Update content if we are currently looking at the dashboard
    if is_dashboard {
        update_dashboard_content(&widgets.dashboard_view, &state, widgets.cmd_sender.clone(), s, widgets.pulse.clone());
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

    // Art Loading with Crossfade
    let mut current_url = view.current_art_url.borrow_mut();
    if *current_url != state.art_url {
        *current_url = state.art_url.clone();
        
        if !state.art_url.is_empty() {
            let (sender, receiver) = async_channel::bounded::<Option<gtk4::gdk::Texture>>(1);
            crate::common::image_loader::load_art(&state.art_url, view.art_size, sender);
            
            // Determine target (hidden) picture
            let visible = view.art_stack.visible_child_name().map(|s| s.as_str().to_string()).unwrap_or("art_a".to_string());
            let (target_name, target_pic): (&str, &gtk4::Picture) = if visible == "art_a" { 
                ("art_b", &view.art_b) 
            } else { 
                ("art_a", &view.art_a) 
            };
            
            let img_weak = target_pic.downgrade();
            let stack_weak = view.art_stack.downgrade();
            let target_name_owned = target_name.to_string();
            
            gtk4::glib::MainContext::default().spawn_local(async move {
                if let Ok(Some(texture)) = receiver.recv().await {
                    if let Some(img) = img_weak.upgrade() {
                        img.set_paintable(Some(&texture));
                        if let Some(stack) = stack_weak.upgrade() {
                            stack.set_visible_child_name(&target_name_owned);
                        }
                    }
                }
            });
        } else {
             // Clear Art (Fade to empty? Or just clear)
             // Ideally fade to placeholder, but for now just clear current
             view.art_a.set_paintable(None::<&gtk4::gdk::Texture>);
             view.art_b.set_paintable(None::<&gtk4::gdk::Texture>);
        }
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
    let btn = Button::builder()
        .focus_on_click(false)
        .focusable(false)
        .build();
    btn.set_cursor_from_name(Some("pointer"));

    let image = Image::builder()
        .icon_name(icon)
        .pixel_size(size)
        .halign(Align::Fill)
        .valign(Align::Fill)
        .build();
    image.set_cursor_from_name(Some("pointer"));
    btn.set_child(Some(&image));
    btn.add_css_class("control-btn");
    btn.connect_clicked(move |_| on_click());
    btn
}

fn build_dashboard_view<F>(_cmd_sender: async_channel::Sender<crate::widgets::media_widget::mpris::MprisCommand>, config: &Config, s: F, port_height: i32) -> DashboardView 
where F: Fn(f64) -> i32 + Copy {
    let is_landscape = config.layout.mode == "landscape";
    
    // 1. Mixer Section
    let mixer_list = Box::builder()
        .orientation(Orientation::Vertical)
        .spacing(s(8.0))
        .build();
    
    let mixer_scroll = ScrolledWindow::builder()
        .hscrollbar_policy(PolicyType::Never)
        .vscrollbar_policy(PolicyType::Automatic)
        .child(&mixer_list)
        .vexpand(false) // Don't greedily take space
        .build();

    if !is_landscape {
        // Capping Mixer at 50% height in portrait
        mixer_scroll.set_max_content_height(port_height / 2);
        mixer_scroll.set_propagate_natural_height(true);
    } else {
        mixer_scroll.set_vexpand(true);
    }

    // 2. Apps Section
    let apps_grid = gtk4::FlowBox::builder()
        .orientation(Orientation::Horizontal)
        .valign(Align::Start)
        .halign(Align::Fill)
        .hexpand(true)
        .homogeneous(true)
        .selection_mode(gtk4::SelectionMode::None)
        .min_children_per_line(2)
        .max_children_per_line(6)
        .column_spacing(s(12.0) as u32)
        .row_spacing(s(12.0) as u32)
        .build();

    let apps_scroll = ScrolledWindow::builder()
        .hscrollbar_policy(PolicyType::Never)
        .vscrollbar_policy(PolicyType::Automatic)
        .child(&apps_grid)
        .vexpand(true) // Fills remaining area
        .build();

    // 3. Main Layout
    let main_layout = Box::builder()
        .orientation(if is_landscape { Orientation::Horizontal } else { Orientation::Vertical })
        .spacing(s(8.0)) // Tightened spacing
        .height_request(port_height) // Ensure height matches PlayerView
        .build();

    // Wrapper for Mixer
    let mixer_wrapper = Box::new(Orientation::Vertical, s(8.0));
    let mixer_title = Label::builder().label("Volume Mixer").halign(Align::Start).build();
    mixer_title.add_css_class("title");
    mixer_wrapper.append(&mixer_title);
    mixer_wrapper.append(&mixer_scroll);
    if is_landscape {
        mixer_wrapper.set_hexpand(true);
        mixer_wrapper.set_vexpand(true);
    }

    // Wrapper for Apps
    let apps_wrapper = Box::new(Orientation::Vertical, s(8.0));
    let apps_title = Label::builder().label("Quick Launch").halign(Align::Start).build();
    apps_title.add_css_class("title");
    apps_wrapper.append(&apps_title);
    apps_wrapper.append(&apps_scroll);
    apps_wrapper.set_hexpand(true);
    apps_wrapper.set_vexpand(true);

    main_layout.append(&mixer_wrapper);
    if is_landscape {
         let sep = Box::builder().width_request(1).hexpand(false).build();
         sep.add_css_class("vertical-divider");
         main_layout.append(&sep);
    } else {
         let sep = Box::builder().height_request(1).build();
         sep.add_css_class("divider");
         main_layout.append(&sep);
    }
    main_layout.append(&apps_wrapper);

    DashboardView {
        container: main_layout,
        mixer_list,
        apps_grid,
    }
}

fn update_dashboard_content<F>(view: &DashboardView, state: &crate::widgets::media_widget::state::MediaState, cmd_sender: async_channel::Sender<crate::widgets::media_widget::mpris::MprisCommand>, s: F, pulse: Option<Rc<PulseController>>) 
where F: Fn(f64) -> i32 + Copy {
    // 1. Update Mixer
    let n_streams = state.audio_streams.len();
    let expected_mixer_count = 1 + n_streams; // Master + Streams

    let mut current_mixer_count = 0;
    let mut child = view.mixer_list.first_child();
    while let Some(c) = child {
        current_mixer_count += 1;
        child = c.next_sibling();
    }

    if current_mixer_count == expected_mixer_count {
        let mut iter = view.mixer_list.first_child();
        // Master
        if let Some(ref row) = iter {
            update_row_val(row, state.master_volume);
        }
        iter = iter.and_then(|c| c.next_sibling());

        // Streams
        for stream in &state.audio_streams {
            if let Some(ref row) = iter {
                 update_row_val(row, stream.volume);
            }
            iter = iter.and_then(|c| c.next_sibling());
        }
    } else {
        // Rebuild Mixer
        while let Some(child) = view.mixer_list.first_child() { view.mixer_list.remove(&child); }
        
        let master_row = build_volume_row("audio-volume-high-symbolic", "System", state.master_volume, None, cmd_sender.clone(), s, pulse.clone());
        view.mixer_list.append(&master_row);

        for stream in &state.audio_streams {
            let name = title_case(&stream.name);
            let app_row = build_volume_row(&stream.icon, &name, stream.volume, Some(stream.index), cmd_sender.clone(), s, pulse.clone());
            view.mixer_list.append(&app_row);
        }
    }

    // 2. Update Apps (only if empty)
    if view.apps_grid.first_child().is_none() {
        let is_landscape = view.container.orientation() == Orientation::Horizontal;
        let icon_size = if is_landscape { 36.0 } else { 44.0 };
        
        let apps: Vec<ShortcutApp> = discover_media_apps();
        for app in apps {
            let btn = Button::builder()
                .tooltip_text(&app.name())
                .hexpand(true)
                .focus_on_click(false)
                .build();
            btn.add_css_class("shortcut-btn");
            
            let img = Image::builder().icon_name(&app.icon()).pixel_size(s(icon_size)).build();
            btn.set_child(Some(&img));
            
            btn.connect_clicked(move |_| {
                app.launch();
            });
            view.apps_grid.append(&btn);
        }
    }
}

fn update_row_val(row: &gtk4::Widget, val: u32) {
    if !crate::widgets::media_widget::ui::IS_DRAGGING.load(std::sync::atomic::Ordering::SeqCst) {
        if let Some(bx) = row.downcast_ref::<Box>() {
            // 1. Update Icon
            if let Some(icon_img) = bx.first_child().and_then(|c| c.downcast::<Image>().ok()) {
                if let Some(icon_name) = icon_img.icon_name() {
                    let name_str = icon_name.as_str();
                    let is_muted_icon = name_str.ends_with("-muted-symbolic") || name_str.contains("muted");
                    
                    if val == 0 && !is_muted_icon {
                        if name_str.contains("audio-volume") {
                            icon_img.set_icon_name(Some("audio-volume-muted-symbolic"));
                        } else if name_str == "audio-speakers-symbolic" {
                            icon_img.set_icon_name(Some("audio-volume-muted-symbolic"));
                        }
                    } else if val > 0 && is_muted_icon {
                         icon_img.set_icon_name(Some("audio-volume-high-symbolic"));
                    }
                }
            }

            // 2. Update Slider
            if let Some(vbox) = bx.last_child().and_then(|c| c.downcast::<Box>().ok()) {
                 if let Some(scale) = vbox.last_child().and_then(|c| c.downcast::<Scale>().ok()) {
                      scale.set_value(val as f64);
                 }
            }
        }
    }
}

fn build_volume_row<F>(icon: &str, label: &str, volume: u32, stream_index: Option<u32>, cmd_sender: async_channel::Sender<crate::widgets::media_widget::mpris::MprisCommand>, s: F, pulse: Option<Rc<PulseController>>) -> Box 
where F: Fn(f64) -> i32 + Copy {
    let row = Box::new(Orientation::Horizontal, s(12.0));
    
    // Determine initial icon state
    let mut initial_icon = icon.to_string();
    if volume == 0 && (initial_icon.contains("audio-volume") || initial_icon == "audio-speakers-symbolic") {
        initial_icon = "audio-volume-muted-symbolic".to_string();
    }

    let icon_img = Image::builder().icon_name(&initial_icon).pixel_size(s(24.0)).build();
    row.append(&icon_img);

    let content_vbox = Box::new(Orientation::Vertical, s(0.0));
    content_vbox.set_hexpand(true);
    content_vbox.set_valign(Align::Center);

    let vol_label = Label::builder()
        .label(label)
        .halign(Align::Start)
        .valign(Align::Center)
        .build();
    vol_label.add_css_class("mixer-app-label");
    
    let adj = Adjustment::new(volume as f64, 0.0, 100.0, 1.0, 1.0, 1.0);
    let slider = Scale::builder()
        .adjustment(&adj)
        .draw_value(false)
        .hexpand(true)
        .focus_on_click(false)
        .focusable(false)
        .build();
    slider.add_css_class("mixer-slider");
    slider.add_css_class("sleek-slider");

    content_vbox.append(&vol_label);
    content_vbox.append(&slider);
    
    row.append(&content_vbox);
    
    // --- Throttled Continuous Updates ---
    // Uses Rc/RefCell to share state between the callback closures without atomics overhead
    // pending_val: The latest value from the slider
    // update_active: Prevents spawning multiple timeouts
    let s_clone = cmd_sender.clone();
    let idx_opt = stream_index;

    let last_vol = Rc::new(std::cell::Cell::new(if volume > 0 { volume } else { 50 }));
    let last_vol_slider = last_vol.clone();
    slider.connect_value_changed(move |scale| {
        let val = scale.value() as u32;
        if val > 0 {
            last_vol_slider.set(val);
        }
        
        // --- Immediate Native Update (No Throttling) ---
        if let Some(ctrl) = &pulse {
             if let Some(i) = idx_opt {
                 ctrl.set_stream_volume(i, val);
             } else {
                 ctrl.set_master_volume(val);
             }
        } else {
             // Fallback: Fire and forget via channel (try_send is non-blocking)
             let cmd = if let Some(i) = idx_opt {
                 crate::widgets::media_widget::mpris::MprisCommand::SetStreamVolume(i, val)
             } else {
                 crate::widgets::media_widget::mpris::MprisCommand::SetMasterVolume(val)
             };
             let _ = s_clone.try_send(cmd);
        }
    });

    // --- Mute Toggle Gesture ---
    let icon_gesture = gtk4::GestureClick::new();
    let last_vol_icon = last_vol.clone();
    let adj_icon = adj.clone();
    icon_gesture.connect_released(move |_, _, _, _| {
        let current = adj_icon.value() as u32;
        if current > 0 {
            last_vol_icon.set(current);
            adj_icon.set_value(0.0);
        } else {
            adj_icon.set_value(last_vol_icon.get() as f64);
        }
    });
    icon_img.add_controller(icon_gesture);

    // --- Disable Scroll on Slider ---
    // This allows parent ScrolledWindow to handle scrolling and prevents the "revert" bug
    let scroll_ctrl = gtk4::EventControllerScroll::new(gtk4::EventControllerScrollFlags::VERTICAL);
    scroll_ctrl.connect_scroll(|_, _, _| {
        // Return true to inhibit default GTK scroll handling on the slider
        gtk4::glib::Propagation::Stop
    });
    slider.add_controller(scroll_ctrl);

    // --- Drag Interaction State ---
    // Manages the global IS_DRAGGING flag to prevent backend updates from moving the slider while user interacts
    let gesture = gtk4::GestureClick::new();
    gesture.connect_pressed(|_, _, _, _| {
        crate::widgets::media_widget::ui::IS_DRAGGING.store(true, Ordering::SeqCst);
    });
    gesture.connect_released(|_, _, _, _| {
        // Keep flag true briefly to mask backend latency/round-trip
        gtk4::glib::timeout_add_local_once(std::time::Duration::from_millis(200), || {
            crate::widgets::media_widget::ui::IS_DRAGGING.store(false, Ordering::SeqCst);
        });
    });
    slider.add_controller(gesture);
    
    row
}

fn title_case(s: &str) -> String {
    s.split_whitespace()
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + &chars.as_str().to_lowercase(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

// Cleanup: is_bin_installed and launch_app_or_url are now handled by ShortcutApp enum

#[derive(Clone)]
enum ShortcutApp {
    System(gio::AppInfo),
    Web { name: String, icon: String, url: String },
}

impl ShortcutApp {
    fn name(&self) -> String {
        use gio::prelude::AppInfoExt;
        match self {
            Self::System(info) => info.display_name().to_string(),
            Self::Web { name, .. } => name.clone(),
        }
    }
    
    fn icon(&self) -> String {
        use gio::prelude::AppInfoExt;
        match self {
            Self::System(info) => {
                if let Some(icon) = info.icon() {
                    if let Some(themed) = icon.downcast_ref::<gio::ThemedIcon>() {
                        if let Some(name) = themed.names().first() {
                            return name.to_string();
                        }
                    }
                }
                "media-playback-start-symbolic".to_string()
            }
            Self::Web { icon, .. } => icon.clone(),
        }
    }

    fn launch(&self) {
        use gio::prelude::AppInfoExt;
        match self {
            Self::System(info) => {
                let _ = info.launch(&[], gio::AppLaunchContext::NONE);
            }
            Self::Web { url, .. } => {
                let _ = std::process::Command::new("xdg-open").arg(url).spawn();
            }
        }
    }
}

fn discover_media_apps() -> Vec<ShortcutApp> {
    use gio::prelude::*;
    use std::collections::HashSet;
    let mut apps: Vec<ShortcutApp> = Vec::new();
    let mut seen_names = HashSet::new();
    
    // 1. Mandatory Web Apps
    apps.push(ShortcutApp::Web { 
        name: "YouTube".into(), 
        icon: "youtube".into(), 
        url: "https://youtube.com".into() 
    });
    apps.push(ShortcutApp::Web { 
        name: "Netflix".into(), 
        icon: "netflix".into(), 
        url: "https://netflix.com".into() 
    });
    apps.push(ShortcutApp::Web { 
        name: "YT Music".into(), 
        icon: "youtube-music".into(), 
        url: "https://music.youtube.com".into() 
    });

    // 2. Discover System Apps
    let all_apps = gio::AppInfo::all();
    let mut system_apps: Vec<ShortcutApp> = Vec::new();

    for app in all_apps {
        if !app.should_show() { continue; }
        
        let id = app.id().unwrap_or_default().to_string().to_lowercase();
        let display_name = app.display_name().to_string();
        let name_lowered = display_name.to_lowercase();

        // Deduplication: Skip if we've already seen an app with this name
        if seen_names.contains(&name_lowered) { continue; }
        
        // Use trait methods from AppInfoExt/DesktopAppInfoExt
        let is_media = if let Some(desktop_info) = app.downcast_ref::<gio::DesktopAppInfo>() {
            let categories = desktop_info.categories().map(|c| c.to_string()).unwrap_or_default();
            categories.contains("Audio") || categories.contains("Video") || categories.contains("Music") || categories.contains("Player")
        } else {
            name_lowered.contains("player") || name_lowered.contains("music") || name_lowered.contains("video")
        };

        if is_media {
            if id.contains("meow") { continue; }
            seen_names.insert(name_lowered);
            system_apps.push(ShortcutApp::System(app));
        }
    }
    
    system_apps.sort_by(|a, b| a.name().to_lowercase().cmp(&b.name().to_lowercase()));
    
    if let Some(pos) = system_apps.iter().position(|a| a.name().to_lowercase().contains("spotify")) {
        let spotify = system_apps.remove(pos);
        apps.insert(0, spotify);
    } else {
        apps.insert(0, ShortcutApp::Web { 
            name: "Spotify".into(), 
            icon: "spotify".into(), 
            url: "https://open.spotify.com".into() 
        });
    }

    apps.extend(system_apps);
    apps
}
