use zbus::{Connection, Result, fdo};
use zbus::proxy;
use crate::widgets::media_widget::state::{STATE};
use std::collections::HashMap;
// use gtk4::prelude::*; // Unused
// use gtk4::glib; // Unused
use zbus::zvariant::Value;

macro_rules! debug_log {
    ($($arg:tt)*) => ({
        use std::fs::OpenOptions;
        use std::io::Write;
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open("/tmp/media_widget_debug.log") {
            let _ = writeln!(file, $($arg)*);
        }
    })
}

// Define proxy for MPRIS Player
#[proxy(
    interface = "org.mpris.MediaPlayer2.Player",
    default_path = "/org/mpris/MediaPlayer2"
)]
trait Player {
    #[zbus(property)]
    fn playback_status(&self) -> fdo::Result<String>;
    #[zbus(property)]
    fn metadata(&self) -> fdo::Result<HashMap<String, zbus::zvariant::OwnedValue>>;
    #[zbus(property)]
    fn position(&self) -> fdo::Result<i64>;
    
    #[zbus(property)]
    fn loop_status(&self) -> fdo::Result<String>;
    #[zbus(property)]
    fn set_loop_status(&self, value: &str) -> fdo::Result<()>;
    
    #[zbus(property)]
    fn shuffle(&self) -> fdo::Result<bool>;
    #[zbus(property)]
    fn set_shuffle(&self, value: bool) -> fdo::Result<()>;

    fn play_pause(&self) -> fdo::Result<()>;
    fn next(&self) -> fdo::Result<()>;
    fn previous(&self) -> fdo::Result<()>;
    fn set_position(&self, track_id: &zbus::zvariant::ObjectPath<'_>, position: i64) -> fdo::Result<()>;
}

// Define proxy for Root MPRIS Interface
#[proxy(
    interface = "org.mpris.MediaPlayer2",
    default_path = "/org/mpris/MediaPlayer2"
)]
trait MediaPlayer2 {
    fn raise(&self) -> fdo::Result<()>;
    // fn quit(&self) -> fdo::Result<()>; 
    
    #[zbus(property)]
    fn identity(&self) -> fdo::Result<String>;
    #[zbus(property)]
    fn desktop_entry(&self) -> fdo::Result<String>;
}

// Commands from UI
#[derive(Debug)]
pub enum MprisCommand {
    PlayPause,
    Next,
    Previous,
    Raise, // Bring player to front
    SetPosition(i64), // microseconds
    SwitchPlayer(String), // bus_name
    ToggleLoop,
    ToggleShuffle,
}

pub async fn init(
    ui_sender: async_channel::Sender<()>,
    cmd_receiver: async_channel::Receiver<MprisCommand>
) -> Result<()> {
    debug_log!("MPRIS Init started");
    // Connect to session bus
    let connection = Connection::session().await?;
    let conn_clone = connection.clone();
    
    // 1. Command Handler Loop
    let conn_cmd = connection.clone();
    let ui_sender_cmd = ui_sender.clone();
    tokio::spawn(async move {
        while let Ok(cmd) = cmd_receiver.recv().await {
            handle_command(&conn_cmd, cmd, &ui_sender_cmd).await;
        }
    });

    // 2. Polling / Discovery Loop
    let ui_sender_poll = ui_sender; // Move the original
    tokio::spawn(async move {
        loop {
            // A. Discovery Phase
            if let Ok(dbus) = zbus::fdo::DBusProxy::new(&conn_clone).await {
                if let Ok(names) = dbus.list_names().await {
                     let mut valid_players = Vec::new(); // Changed from found_players
                     
                     for name in names {
                         if name.as_str().starts_with("org.mpris.MediaPlayer2.") {
                               // FILTER: Only include players that are "active" (Playing or have Metadata)
                               // This prevents "zombie" Chrome instances (no media tabs) from showing as dots
                               if is_player_active(&conn_clone, &name).await {
                                   valid_players.push(name.to_string());
                               }
                         }
                     }
                     
                     // Update available players in state
                     {
                        let mut state = STATE.write().unwrap();
                        state.players = valid_players.clone();
                        
                        // Auto-select logic
                        let current_valid = state.current_bus_name.as_ref()
                            .map(|c| valid_players.contains(c)).unwrap_or(false);
                            
                        if !current_valid {
                            if let Some(first) = valid_players.first() {
                                debug_log!("Auto-selecting player: {}", first);
                                state.current_bus_name = Some(first.clone());
                            } else {
                                state.current_bus_name = None;
                            }
                        }
                     }
                }
            }
            
            // B. Fetch State from Current Player
            let current_bus = {
                let state = STATE.read().unwrap();
                state.current_bus_name.clone()
            };
            
            if let Some(bus_name) = current_bus {
                 let proxy_builder = PlayerProxy::builder(&conn_clone)
                    .destination(zbus::names::BusName::try_from(bus_name.clone()).expect("valid bus name"));
                 
                 let proxy_res = match proxy_builder {
                     Ok(b) => b.build().await,
                     Err(e) => {
                         debug_log!("Invalid destination {}: {}", bus_name, e);
                         Err(zbus::Error::Failure(format!("Builder error: {}", e)))
                     }
                 };
                    
                 if let Ok(player) = proxy_res {
                     if let Err(e) = fetch_state(&player, &conn_clone, &bus_name).await {
                         debug_log!("Error fetching state from {}: {}", bus_name, e);
                         // If we can't fetch state (e.g. process died), remove it from active list
                         {
                             let mut state = STATE.write().unwrap();
                             state.players.retain(|x| x != &bus_name);
                             if state.current_bus_name.as_ref() == Some(&bus_name) {
                                  state.current_bus_name = None;
                             }
                         }
                         reset_state();
                     }
                 } else if let Err(e) = proxy_res {
                     debug_log!("Failed to connect to player {}: {}", bus_name, e);
                     // Proxy build failed - dead player
                     {
                         let mut state = STATE.write().unwrap();
                         state.players.retain(|x| x != &bus_name);
                         if state.current_bus_name.as_ref() == Some(&bus_name) {
                              state.current_bus_name = None;
                         }
                     }
                     reset_state();
                 }
            } else {
                 reset_state();
            }

            let _ = ui_sender_poll.send(()).await;
            tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
        }
    });

    Ok(())
}

// Helper to check if a player actually has content worth showing
async fn is_player_active(conn: &Connection, bus_name: &str) -> bool {
    if let Ok(builder) = PlayerProxy::builder(conn)
        .destination(zbus::names::BusName::try_from(bus_name).unwrap()) 
    {
        if let Ok(player) = builder.build().await {
            // Check Status
            if let Ok(status) = player.playback_status().await {
                if status == "Playing" {
                    return true;
                }
            }
            // Check Metadata Title
            if let Ok(meta) = player.metadata().await {
                if let Some(val) = meta.get("xesam:title") {
                    // meta is HashMap<String, OwnedValue>
                    // OwnedValue behaves like Value but owning data.
                    // We can try to cast or match variants.
                    
                    // Simple recursive helper for OwnedValue
                    fn check_title(v: &zbus::zvariant::OwnedValue) -> bool {
                        use zbus::zvariant::Value;
                        // OwnedValue derefs to Value
                        match &**v {
                            Value::Str(title) => !title.as_str().is_empty(),
                            Value::Value(inner) => {
                                // inner is Box<Value>, but we need to check if it wraps a Str
                                match &**inner {
                                     Value::Str(title) => !title.as_str().is_empty(),
                                     _ => false
                                }
                            }
                            _ => false
                        }
                    }

                    if check_title(val) {
                        return true;
                    }
                }
            }
        }
    }
    false
}

async fn handle_command(conn: &Connection, cmd: MprisCommand, ui_sender: &async_channel::Sender<()>) {
    let current_bus = {
        let state = STATE.read().unwrap();
        state.current_bus_name.clone()
    };
    
    // Handle SwitchPlayer independently of current bus
    if let MprisCommand::SwitchPlayer(new_name) = &cmd {
        {
            let mut state = STATE.write().unwrap();
            state.current_bus_name = Some(new_name.clone());
        } // Lock is dropped here
        
        // IMMEDIATE STATE FETCH for the new player
        if let Ok(builder) = PlayerProxy::builder(conn)
            .destination(zbus::names::BusName::try_from(new_name.clone()).expect("valid bus name"))
        {
            if let Ok(player) = builder.build().await {
                 let _ = fetch_state(&player, conn, new_name).await;
            }
        }

        // Trigger update immediately to switch UI
        let _ = ui_sender.send(()).await;
        return;
    }

    if let Some(bus_name) = current_bus {
        match cmd {
            MprisCommand::Raise => {
                debug_log!("Sending Raise command to {}", bus_name);
                if let Ok(builder) = MediaPlayer2Proxy::builder(conn)
                    .destination(zbus::names::BusName::try_from(bus_name.clone()).expect("valid bus name")) 
                {
                    match builder.build().await {
                        Ok(root_proxy) => {
                            if let Err(e) = root_proxy.raise().await {
                                debug_log!("Raise command failed for {}: {}", bus_name, e);
                            } else {
                                debug_log!("Raise command sent successfully to {}", bus_name);
                            }
                        },
                        Err(e) => debug_log!("Failed to build MediaPlayer2Proxy for {}: {}", bus_name, e),
                    }
                }
            },
            _ => {
                // Command for the Player interface
                if let Ok(builder) = PlayerProxy::builder(conn)
                    .destination(zbus::names::BusName::try_from(bus_name.clone()).expect("valid bus name"))
                {
                    if let Ok(player) = builder.build().await {
                        match cmd {
                            MprisCommand::PlayPause => { let _ = player.play_pause().await; },
                            MprisCommand::Next => { let _ = player.next().await; },
                            MprisCommand::Previous => { let _ = player.previous().await; },
                            MprisCommand::SetPosition(pos) => {
                                 let track_id_str = { STATE.read().unwrap().track_id.clone() };
                                 if let Ok(path) = zbus::zvariant::ObjectPath::try_from(track_id_str) {
                                     let _ = player.set_position(&path, pos).await;
                                 }
                            },
                            MprisCommand::ToggleLoop => {
                                 if let Ok(current) = player.loop_status().await {
                                     let next = match current.as_str() {
                                         "None" => "Playlist",
                                         "Playlist" => "Track",
                                         "Track" => "None",
                                         _ => "Playlist",
                                     };
                                     let _ = player.set_loop_status(next).await;
                                 }
                             },
                             MprisCommand::ToggleShuffle => {
                                 if let Ok(current) = player.shuffle().await {
                                     let _ = player.set_shuffle(!current).await;
                                 }
                             },
                             _ => {}
                        }
                        
                        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                        let _ = fetch_state(&player, conn, &bus_name).await;
                        let _ = ui_sender.send(()).await;
                    }
                }
            }
        }
    }
}

fn reset_state() {
    let mut state = STATE.write().unwrap();
    state.title = "No Media".to_string();
    state.artist = "".to_string();
    state.is_playing = false;
    state.art_url = "".to_string();
    state.length = 0;
    state.position = 0;
    state.desktop_entry = None;
    state.identity = None;
    state.loop_status = None;
    state.shuffle = None;
}

async fn fetch_state(player: &PlayerProxy<'_>, conn: &Connection, p_name: &String) -> Result<()> {
    // 1. Fetch Root Props (Identity / DesktopEntry)
    let mut identity = None;
    let mut desktop_entry = None;
    
    // Fallback: Infer from bus name
    let bus_parts: Vec<&str> = p_name.split('.').collect();
    if bus_parts.len() >= 4 && bus_parts[0] == "org" && bus_parts[1] == "mpris" && bus_parts[2] == "MediaPlayer2" {
         let app_name = sanitize_app_name(bus_parts[3]);
         
         desktop_entry = Some(app_name.clone());
         identity = Some(app_name); 
    }

    if let Ok(builder) = MediaPlayer2Proxy::builder(conn)
        .destination(zbus::names::BusName::try_from(p_name.clone()).expect("valid bus name"))
    {
         if let Ok(root) = builder.build().await {
             if let Ok(id) = root.identity().await { 
                 if !id.is_empty() { 
                     identity = Some(sanitize_app_name(&id));
                 }
             }
             if let Ok(entry) = root.desktop_entry().await { 
                 if !entry.is_empty() { 
                     desktop_entry = Some(sanitize_app_name(&entry));
                 }
             }
         }
    }

    // 2. Fetch Player Props (Metadata / Status)
    let meta_res = player.metadata().await;
    let status_res = player.playback_status().await;
    let position_res = player.position().await;
    
    // Optional props (might fail if not supported)
    let loop_res = player.loop_status().await;
    let shuffle_res = player.shuffle().await;

    // 3. Update State (Locking only here)
    {
        let mut state = STATE.write().unwrap();
        
        state.player_name = p_name.clone();
        
        if let Some(id) = identity { state.identity = Some(id); }
        if let Some(entry) = desktop_entry { state.desktop_entry = Some(entry); }
        
        // RESET metadata fields to defaults before applying new data
        // This prevents stale data if the player sends empty metadata (e.g. Chrome with no media tabs)
        state.title = "No Media".to_string();
        state.artist = "".to_string();
        state.art_url = "".to_string();
        state.length = 0;
        state.track_id = "".to_string();
        
        match meta_res {
            Ok(meta) => {
                debug_log!("DEBUG META for {}: {:?}", p_name, meta);
                
                fn unpack<'a>(v: &'a Value<'a>) -> &'a Value<'a> {
                    match v {
                         Value::Value(inner) => unpack(inner),
                         _ => v,
                    }
                }
                
                fn as_str<'a>(v: &'a Value<'a>) -> Option<&'a str> {
                    match unpack(v) {
                        Value::Str(s) => Some(s.as_str()),
                        _ => None,
                    }
                }

                fn as_i64(v: &Value) -> Option<i64> {
                    match unpack(v) {
                        Value::I64(i) => Some(*i),
                        Value::U64(u) => Some(*u as i64),
                        Value::I32(i) => Some(*i as i64),
                        Value::U32(u) => Some(*u as i64),
                        _ => None,
                    }
                }

                if let Some(val) = meta.get("xesam:title") {
                    if let Some(s) = as_str(val) {
                        if !s.is_empty() { state.title = s.to_string(); }
                    }
                }
                
                // Fallback for VLC: extract filename from xesam:url if title is missing
                if state.title == "No Media" || state.title.is_empty() {
                    if let Some(val) = meta.get("xesam:url") {
                        if let Some(url) = as_str(val) {
                            // Extract filename from file:///path/to/Movie.mkv
                            if let Some(name) = url.split('/').last() {
                                let decoded = urlencoding::decode(name).expect("UTF-8").to_string();
                                state.title = decoded;
                            }
                        }
                    }
                }
                
                if let Some(val) = meta.get("xesam:artist") {
                    let v = unpack(val);
                    match v {
                        Value::Array(arr) => {
                             if let Ok(Some(first)) = arr.get(0) {
                             if let Some(s) = as_str(first) {
                                     state.artist = s.to_string();
                                 }
                             }
                        },
                        Value::Str(s) => {
                            state.artist = s.to_string();
                        },
                        _ => {}
                    }
                }
                
                if state.artist.is_empty() {
                     // Try album artist or just generic fallback
                     state.artist = "Unknown Artist".to_string();
                }
                
                if let Some(val) = meta.get("mpris:artUrl") {
                    if let Some(s) = as_str(val) {
                        state.art_url = enhance_art_url(s);
                    }
                } else {
                    state.art_url = "".to_string();
                }
                
                if let Some(val) = meta.get("mpris:length") {
                    if let Some(l) = as_i64(val) {
                        state.length = l as u64;
                    }
                }
                
                // Fallback for VLC length keys
                if state.length == 0 {
                    if let Some(val) = meta.get("vlc:length") { // milliseconds
                         if let Some(l) = as_i64(val) {
                             state.length = (l * 1000) as u64;
                         }
                    }
                }
                
                if let Some(val) = meta.get("mpris:trackid") {
                     let v = unpack(val);
                     match v {
                         Value::ObjectPath(p) => state.track_id = p.as_str().to_string(),
                         Value::Str(s) => state.track_id = s.to_string(),
                         _ => {}
                     }
                }
            },
            Err(e) => debug_log!("Failed to fetch metadata for {}: {}", p_name, e),
        }
        
        if let Ok(status) = status_res {
             state.is_playing = status == "Playing";
        }
        
        if let Ok(pos) = position_res {
             state.position = pos as u64;
        }
        
        match loop_res {
            Ok(status) => state.loop_status = Some(status),
            Err(_) => state.loop_status = None, // Not supported
        }
        
        match shuffle_res {
            Ok(s) => state.shuffle = Some(s),
            Err(_) => state.shuffle = None,
        }
    }
    
    Ok(())
}

fn enhance_art_url(url: &str) -> String {
    let mut new_url = url.to_string();
    
    // 1. YouTube / Google User Content (lh3.googleusercontent.com)
    // Format: ...=w60-h60-l90-rj
    // Fix: Replace size params with high res
    if url.contains("googleusercontent.com") {
        if let Some(idx) = new_url.rfind("=") {
             // Keep up to '=' and add high res params
             let base = &new_url[..idx+1];
             // s512 is standard high res for album art
             // w512-h512 is also used
             return format!("{}w512-h512-l90-rj", base);
        }
    }
    
    // 2. YouTube Thumbnail (i.ytimg.com)
    // Format: .../default.jpg, .../mqdefault.jpg
    // Fix: Replace with maxresdefault.jpg
    if url.contains("i.ytimg.com") {
        new_url = new_url.replace("/default.jpg", "/maxresdefault.jpg");
        new_url = new_url.replace("/mqdefault.jpg", "/maxresdefault.jpg");
        new_url = new_url.replace("/hqdefault.jpg", "/maxresdefault.jpg");
        new_url = new_url.replace("/sddefault.jpg", "/maxresdefault.jpg");
    }

    new_url
}

fn sanitize_app_name(name: &str) -> String {
    let lower = name.to_lowercase();
    
    if lower.contains("firefox") {
        return "firefox".to_string();
    }
    if lower.contains("chromium") {
        return "google-chrome".to_string(); // Map to standard chrome icon
    }
    if lower.contains("chrome") {
        return "google-chrome".to_string();
    }
    if lower.contains("spotify") {
        return "spotify".to_string();
    }
    
    // Default: clean existing
    lower.replace(" ", "-")
}