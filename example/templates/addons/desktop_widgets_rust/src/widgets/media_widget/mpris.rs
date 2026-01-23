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

// Commands from UI
#[derive(Debug)]
pub enum MprisCommand {
    PlayPause,
    Next,
    Previous,
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
                     
                     if !found_players.is_empty() {
                         // debug_log!("Found players: {:?}", found_players);
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
                 debug_log!("Loop tick. Current bus: {}", bus_name);
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
                     if let Err(e) = fetch_state(&player, &bus_name).await {
                         debug_log!("Error fetching state from {}: {}", bus_name, e);
                     }
                 } else if let Err(e) = proxy_res {
                     debug_log!("Failed to connect to player {}: {}", bus_name, e);
                 }
            } else {
                 // debug_log!("No current bus selected");
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
                 // Fetch everything immediately so UI has data BEFORE sliding
                 let _ = fetch_state(&player, new_name).await;
            }
        }

        // Trigger update immediately to switch UI
        let _ = ui_sender.send(()).await;
        return;
    }

    if let Some(bus_name) = current_bus {
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
                let _ = fetch_state(&player, &bus_name).await;
                let _ = ui_sender.send(()).await;
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
}

async fn fetch_state(player: &PlayerProxy<'_>, p_name: &String) -> Result<()> {
    // Fetch Meta
    match player.metadata().await {
        Ok(meta) => {
            debug_log!("DEBUG META for {}: {:?}", p_name, meta);
            let mut state = STATE.write().unwrap();
            
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

            // Robust Metadata Extraction
            if let Some(val) = meta.get("xesam:title") {
                if let Some(s) = as_str(val) {
                    debug_log!("Extracted Title: {}", s);
                    state.title = s.to_string();
                }
            }
            
            if let Some(val) = meta.get("xesam:artist") {
                let v = unpack(val);
                match v {
                    Value::Array(arr) => {
                         if let Ok(Some(first)) = arr.get(0) {
                         if let Some(s) = as_str(first) {
                                 debug_log!("Extracted Artist (Array): {}", s);
                                 state.artist = s.to_string();
                             }
                         }
                    },
                    Value::Str(s) => {
                        debug_log!("Extracted Artist (Str): {}", s);
                        state.artist = s.to_string();
                    },
                    _ => {}
                }
            }
            
            if let Some(val) = meta.get("mpris:artUrl") {
                if let Some(s) = as_str(val) {
                    state.art_url = s.to_string();
                }
            }
            
            if let Some(val) = meta.get("mpris:length") {
                if let Some(l) = as_i64(val) {
                    state.length = l as u64;
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
            
            state.player_name = p_name.clone();
        },
        Err(e) => debug_log!("Failed to fetch metadata for {}: {}", p_name, e),
    }
    
    // Playback Status
    match player.playback_status().await {
        Ok(status) => {
            let mut state = STATE.write().unwrap();
            state.is_playing = status == "Playing";
        },
        Err(e) => debug_log!("Status error: {}", e),
    }
    
    // Position
    if let Ok(pos) = player.position().await {
         let mut state = STATE.write().unwrap();
         state.position = pos as u64;
    }
    
    Ok(())
}