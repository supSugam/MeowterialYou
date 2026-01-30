use gtk4::gdk;
// use gtk4::prelude::*; // Unused
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;

// Simple memory cache: URL -> Texture
type TextureCache = Arc<Mutex<HashMap<String, gdk::Texture>>>;
static CACHE: Lazy<TextureCache> = Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

pub fn load_art(url: &str, _art_size: i32, sender: async_channel::Sender<Option<gdk::Texture>>) {
    let url = url.to_string();
    let cache = CACHE.clone();

    // Cache by URL only (not size since we'll scale via CSS)
    if let Ok(lock) = cache.lock() {
        if let Some(texture) = lock.get(&url) {
            let _ = sender.send_blocking(Some(texture.clone()));
            return;
        }
    }
    
    // Spawn blocking task
    std::thread::spawn(move || {
        let texture = fetch_texture(&url);
        
        if let Some(tex) = &texture {
            if let Ok(mut lock) = cache.lock() {
                // simple eviction: if cache gets too big, clear it to prevent leaks
                if lock.len() > 50 {
                    lock.clear();
                }
                lock.insert(url, tex.clone());
            }
        }
        
        let _ = sender.send_blocking(texture);
    });
}

fn fetch_texture(url: &str) -> Option<gdk::Texture> {
    // 1. Handle file://
    if url.starts_with("file://") {
        let path = url.trim_start_matches("file://");
        let path = urlencoding::decode(path).ok()?;
        let file = gtk4::gio::File::for_path(path.as_ref());
        return gdk::Texture::from_file(&file).ok();
    }
    
    // 2. Handle http://
    if url.starts_with("http") {
        if let Ok(resp) = reqwest::blocking::get(url) {
            if let Ok(bytes) = resp.bytes() {
                let glib_bytes = gtk4::glib::Bytes::from(&bytes[..]);
                return gdk::Texture::from_bytes(&glib_bytes).ok();
            }
        }
    }
    
    None
}
