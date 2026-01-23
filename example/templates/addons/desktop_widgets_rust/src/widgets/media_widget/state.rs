use once_cell::sync::Lazy;
use std::sync::{Arc, RwLock};

#[derive(Debug, Clone)]
pub struct MediaState {
    pub title: String,
    pub artist: String,
    #[allow(dead_code)] // Reserved for album display feature
    pub album: String,
    pub art_url: String,
    pub length: u64, // microseconds
    pub position: u64,
    pub is_playing: bool,
    pub player_name: String, 
    pub track_id: String,
    
    // Identity fields for icon and display
    pub desktop_entry: Option<String>,
    pub identity: Option<String>,
    
    // Multi-player support
    pub players: Vec<String>, // List of bus names
    pub current_bus_name: Option<String>,
}

impl Default for MediaState {
    fn default() -> Self {
        Self {
            title: "No Media".to_string(),
            artist: "".to_string(),
            album: "".to_string(),
            art_url: "".to_string(),
            length: 0,
            position: 0,
            is_playing: false,
            player_name: "".to_string(),
            track_id: "".to_string(),
            
            desktop_entry: None,
            identity: None,
            
            players: Vec::new(),
            current_bus_name: None,
        }
    }
}

// Global Config Singleton (referenced here? No, config is in config.rs)
// But we keep state here
pub static STATE: Lazy<Arc<RwLock<MediaState>>> = Lazy::new(|| {
    Arc::new(RwLock::new(MediaState::default()))
});
