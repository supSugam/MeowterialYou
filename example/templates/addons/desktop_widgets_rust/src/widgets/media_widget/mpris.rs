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
                     let mut found_players = Vec::new();
                     for name in names {
                         if name.as_str().starts_with("org.mpris.MediaPlayer2.") {
                               found_players.push(name.to_string());
                         }
                     }
                     
                     // Update available players in state
                     {
                        let mut state = STATE.write().unwrap();
                        state.players = found_players.clone();
                        
                        // Auto-select logic
                        let current_valid = state.current_bus_name.as_ref()
                            .map(|c| found_players.contains(c)).unwrap_or(false);
                            
                        if !current_valid {
                            if let Some(first) = found_players.first() {
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
                 // debug_log!("Loop tick. Current bus: {}", bus_name);
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
                     }
                 } else if let Err(e) = proxy_res {
                     debug_log!("Failed to connect to player {}: {}", bus_name, e);
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
}

async fn fetch_state(player: &PlayerProxy<'_>, conn: &Connection, p_name: &String) -> Result<()> {
    // 1. Fetch Root Props (Identity / DesktopEntry)
    let mut identity = None;
    let mut desktop_entry = None;
    
    // Fallback: Infer from bus name
    let bus_parts: Vec<&str> = p_name.split('.').collect();
    if bus_parts.len() >= 4 && bus_parts[0] == "org" && bus_parts[1] == "mpris" && bus_parts[2] == "MediaPlayer2" {
         let mut app_name = bus_parts[3].to_string();
         
         // Force Google Chrome branding if chromium part found
         if app_name.to_lowercase().contains("chromium") {
             app_name = "google-chrome".to_string();
         }
         
         desktop_entry = Some(app_name.clone());
         identity = Some(app_name); 
    }

    if let Ok(builder) = MediaPlayer2Proxy::builder(conn)
        .destination(zbus::names::BusName::try_from(p_name.clone()).expect("valid bus name"))
    {
        if let Ok(root) = builder.build().await {
             if let Ok(id) = root.identity().await { 
                 if !id.is_empty() { 
                     // Check if it's Chromium and map to google-chrome
                     if id.to_lowercase().contains("chromium") {
                         identity = Some("google-chrome".to_string());
                     } else {
                         identity = Some(id); 
                     }
                 }
             }
             if let Ok(entry) = root.desktop_entry().await { 
                 if !entry.is_empty() { 
                     if entry.to_lowercase().contains("chromium") {
                         desktop_entry = Some("google-chrome".to_string());
                     } else {
                         desktop_entry = Some(entry); 
                     }
                 }
             }
        }
    }

    // 2. Fetch Player Props (Metadata / Status)
    let meta_res = player.metadata().await;
    let status_res = player.playback_status().await;
    let position_res = player.position().await;

    // 3. Update State (Locking only here)
    {
        let mut state = STATE.write().unwrap();
        
        state.player_name = p_name.clone();
        
        if let Some(id) = identity { state.identity = Some(id); }
        if let Some(entry) = desktop_entry { state.desktop_entry = Some(entry); }
        
        match meta_res {
            Ok(meta) => {
                debug_log!("DEBUG META for {}: {:?}", p_name, meta); // <--- LOGGING ADDED FOR VLC DIAGNOSIS
                
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
                        state.art_url = s.to_string();
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
    }
    
    Ok(())
}