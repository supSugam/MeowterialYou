use gtk4::prelude::*;
use gtk4::{Align, Box, Label, Orientation, ScrolledWindow, PolicyType, Adjustment};
use std::cell::RefCell;
use std::rc::Rc;
// use gtk4::glib; // Unused

#[derive(Clone)]
pub struct MarqueeLabel {
    pub container: ScrolledWindow,
    label1: Label,
    label2: Label,
    adjustment: Adjustment,
    #[allow(dead_code)] // Keep for potential direct access
    scroll_box: Box,
    state: Rc<RefCell<MarqueeState>>,
}

struct MarqueeState {
    text: String,
    offset: f64,
    waiting: i32,
    enabled: bool,
    scroll_limit: f64,
    direction: Direction,
}

#[derive(PartialEq, Clone, Copy)]
pub enum Direction {
    Left,
    Right,
}

impl MarqueeLabel {
    pub fn new(css_class: &str, direction: Direction, align: Align) -> Self {
        let label1 = Label::builder()
            .label("...")
            .halign(Align::Start)
            .wrap(false)
            .lines(1)
            .build();
        label1.add_css_class(css_class);

        let label2 = Label::builder()
            .label("...")
            .halign(Align::Start)
            .wrap(false)
            .lines(1)
            .visible(false) // Hidden by default
            .build();
        label2.add_css_class(css_class);

        let scroll_box = Box::builder()
            .orientation(Orientation::Horizontal)
            .spacing(60) // Gap between text repeats
            .halign(align) // Use dynamic alignment
            .build();
        
        scroll_box.append(&label1);
        scroll_box.append(&label2);

        let adjustment = Adjustment::new(0.0, 0.0, 10000.0, 1.0, 100.0, 0.0);

        let container = ScrolledWindow::builder()
            .hscrollbar_policy(PolicyType::External) // Hide scrollbar but allow scrolling
            .vscrollbar_policy(PolicyType::Never)
            .hadjustment(&adjustment)
            .propagate_natural_width(false) // CRITICAL: Prevent expansion
            .propagate_natural_height(false)
            .hexpand(true)
            .focusable(false)
            .can_focus(false)
            .can_target(false) // Let clicks pass through if possible
            .build();
        
        container.set_child(Some(&scroll_box));
        container.add_css_class("title-scroll");

        let state = Rc::new(RefCell::new(MarqueeState {
            text: String::new(),
            offset: 0.0,
            waiting: 100, // Frames to wait before scrolling
            enabled: false,
            scroll_limit: 0.0,
            direction,
        }));

        Self {
            container,
            label1,
            label2,
            adjustment,
            scroll_box,
            state,
        }
    }

    pub fn set_text(&self, text: &str) {
        let mut s = self.state.borrow_mut();
        if s.text == text {
            return;
        }
        s.text = text.to_string();
        
        self.label1.set_label(text);
        self.label2.set_label(text);
        
        self.reset(&mut s);
    }
    
    fn reset(&self, s: &mut MarqueeState) {
        s.offset = 0.0;
        s.waiting = 100;
        s.enabled = false;
        self.label2.set_visible(false);
        self.adjustment.set_value(0.0);
    }

    pub fn tick(&self) {
        let mut s = self.state.borrow_mut();
        
        // Init check if not enabled yet
        if !s.enabled {
            let container_width = self.container.allocation().width();
            if container_width > 0 {
                // Measure natural width of label 1
                let (_, nat_width, _, _) = self.label1.measure(Orientation::Horizontal, -1);
                
                if nat_width > container_width {
                     s.enabled = true;
                     s.scroll_limit = (nat_width + 60) as f64; // Width + Gap
                     self.label2.set_visible(true);
                     
                     if s.direction == Direction::Right {
                         s.offset = s.scroll_limit;
                         self.adjustment.set_value(s.offset);
                     }
                }
            }
            return;
        }

        if s.waiting > 0 {
            s.waiting -= 1;
            return;
        }

        let speed = 1.0; 

        if s.direction == Direction::Left {
            s.offset += speed;
            if s.offset >= s.scroll_limit {
                s.offset = 0.0;
                s.waiting = 100;
            }
        } else {
            // Right scroll (for Artist?)
            s.offset -= speed;
            if s.offset <= 0.0 {
                s.offset = s.scroll_limit;
                s.waiting = 100;
            }
        }

        self.adjustment.set_value(s.offset);
    }
}
