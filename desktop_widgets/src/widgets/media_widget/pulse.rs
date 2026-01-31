use libpulse_binding as pulse;
use libpulse_glib_binding as pulse_glib;

use std::rc::Rc;
use std::cell::RefCell;
use pulse::context::{Context, FlagSet as ContextFlagSet, State as ContextState};
use pulse_glib::Mainloop; // Try root export
use pulse::volume::Volume;
use pulse::callbacks::ListResult;
// Checking online docs for libpulse-binding 2.28:
// It has `pulse::introspect`.
// Maybe I need to enable a feature? "introspect"?
// Default features usually include it.

pub struct PulseController {
    _mainloop: Rc<RefCell<Mainloop>>,
    context: Rc<RefCell<Context>>,
}

impl PulseController {
    pub fn new() -> Option<Self> {
        let mainloop = Rc::new(RefCell::new(Mainloop::new(None)?));
        // We need to borrow mutably. The GLib Mainloop struct implements the Mainloop trait itself.
        let mut ml_borrow = mainloop.borrow_mut();
        let context = Rc::new(RefCell::new(Context::new(&mut *ml_borrow, "MeowterialYou Media Hub")?));
        drop(ml_borrow); // Release borrow

        // Connect asynchronously - runs in the GTK GLib main loop
        if context.borrow_mut().connect(None, ContextFlagSet::NOFLAGS, None).is_err() {
            eprintln!("Failed to connect to PulseAudio context");
            return None;
        }
        
        Some(Self {
            _mainloop: mainloop,
            context,
        })
    }
    
    pub fn is_ready(&self) -> bool {
        self.context.borrow().get_state() == ContextState::Ready
    }
    
    // Set Master Volume (Default Sink)
    // NOTE: This uses the "fallback" default sink logic. 
    // Ideally we should resolve @DEFAULT_SINK@, but passing None usually targets default in some APIs, 
    // or we can use the string "@DEFAULT_SINK@".
    // libpulse doesn't accept "@DEFAULT_SINK@" for index, but it accepts Name.
    pub fn set_master_volume(&self, percent: u32) {
        if !self.is_ready() { return; }
        
        let context = self.context.borrow();
        let introspector = context.introspect();
        
        // We need to find the default sink first or use name
        // "@DEFAULT_SINK@" is a valid name in pa_context_set_sink_volume_by_name?
        // Documentation says "name" of the sink. "@DEFAULT_SINK@" might work if server supports it, but safer to lookup.
        // Actually, let's try introspecting by name "@DEFAULT_SINK@" which libpulse might handle or we fallback.
        
        // Closure hell with C-callbacks. 
        // Simplification: We assume stereo (2 channels) for instant responsiveness if introspection is too complex?
        // NO. Setting wrong channel count is bad.
        
        // Correct approach: Introspect Server Info -> Get Default Sink Name -> Get Sink Info -> Set Volume.
        // This is too many round trips for a "drag" event.
        
        // BETTER: When introspection completes, update a local cache of "Default Sink Channels". 
        // But for this first version, we'll optimistically use introspection inside execution.
        // "Fire and Forget": We trigger the introspection chain.
        
        // Strategy: Introspect by Name "@DEFAULT_SINK@"
        let vol_target = self.percentage_to_volume(percent);
        let ctx_clone = self.context.clone();
        
        // Get Sink Info for Default Sink
        introspector.get_sink_info_by_name("@DEFAULT_SINK@", move |res| {
             if let ListResult::Item(info) = res {
                 let mut new_cv = info.volume; // Copy current channel map/volume
                 new_cv.set(info.channel_map.len(), Volume(vol_target)); // Set all channels to target
                 
                 // Set it
                 ctx_clone.borrow().introspect().set_sink_volume_by_index(info.index, &new_cv, None);
             }
        });
    }
    
    // Set Stream (App) Volume
    pub fn set_stream_volume(&self, index: u32, percent: u32) {
        if !self.is_ready() { return; }
        
        let context = self.context.borrow();
        let introspector = context.introspect();
        let vol_target = self.percentage_to_volume(percent);
        let ctx_clone = self.context.clone();

        introspector.get_sink_input_info(index, move |res| {
             if let ListResult::Item(info) = res {
                 let mut new_cv = info.volume;
                 new_cv.set(info.channel_map.len(), Volume(vol_target));
                 
                 ctx_clone.borrow().introspect().set_sink_input_volume(index, &new_cv, None);
             }
        });
    }
    
    fn percentage_to_volume(&self, percent: u32) -> u32 {
        let v = (percent as f64 / 100.0) * Volume::NORMAL.0 as f64;
        v.round() as u32
    }
}
