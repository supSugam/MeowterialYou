use std::process::Command;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct AudioStream {
    pub index: u32,
    pub name: String,
    pub volume: u32, // Average percentage
    pub is_muted: bool,
    pub icon: String,
}

pub fn get_streams() -> Vec<AudioStream> {
    // We use pactl --format=json list sink-inputs
    // But since pactl json output can be inconsistent across versions, 
    // we'll try to parse the JSON if possible, else fallback to text parsing.
    
    let output = Command::new("pactl")
        .args(["--format=json", "list", "sink-inputs"])
        .output();
        
    if let Ok(out) = output {
        if let Ok(json_str) = String::from_utf8(out.stdout) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&json_str) {
                if let Some(list) = val.as_array() {
                    let mut streams = Vec::new();
                    for item in list {
                        if let Some(stream) = parse_stream_json(item) {
                            streams.push(stream);
                        }
                    }
                    return streams;
                }
            }
        }
    }
    
    Vec::new()
}

fn parse_stream_json(val: &serde_json::Value) -> Option<AudioStream> {
    let index = val.get("index")?.as_u64()? as u32;
    
    // Attempt to get a better name from properties
    let properties = val.get("properties");
    let name = properties.and_then(|p| p.get("application.name"))
        .or_else(|| properties.and_then(|p| p.get("media.name")))
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown App")
        .to_string();
        
    let mut icon = properties.and_then(|p| p.get("application.icon_name"))
        .and_then(|v| v.as_str())
        .unwrap_or("audio-x-generic")
        .to_string();

    // Fix for Spotify and other common apps that might missing proper icons in Pulse
    if name.to_lowercase().contains("spotify") && (icon == "audio-x-generic" || icon.is_empty()) {
        icon = "spotify".to_string();
    }

    // Volume is usually an object with channel keys
    let volume_obj = val.get("volume")?.as_object()?;
    let mut total_vol = 0;
    let mut count = 0;
    for (_chan, v) in volume_obj {
        if let Some(pct) = v.get("value_percent").and_then(|v| v.as_str()) {
             // "45%" -> 45
             if let Ok(p) = pct.trim_end_matches('%').parse::<u32>() {
                 total_vol += p;
                 count += 1;
             }
        }
    }
    let avg_volume = if count > 0 { total_vol / count } else { 0 };
    
    let is_muted = val.get("mute").and_then(|v| v.as_bool()).unwrap_or(false);

    Some(AudioStream {
        index,
        name,
        volume: avg_volume,
        is_muted,
        icon,
    })
}

pub fn set_volume(index: u32, volume: u32) {
    let _ = Command::new("pactl")
        .args(["set-sink-input-volume", &index.to_string(), &format!("{}%", volume)])
        .spawn();
}

pub fn get_master_volume() -> (u32, bool) {
    let output = Command::new("pactl")
        .args(["get-sink-volume", "@DEFAULT_SINK@"])
        .output();
        
    let vol = if let Ok(out) = output {
        let text = String::from_utf8_lossy(&out.stdout);
        // "Volume: front-left: 31452 /  48% / -19.13 dB, ..."
        text.split('/')
            .nth(1)
            .and_then(|s| s.trim().trim_end_matches('%').parse::<u32>().ok())
            .unwrap_or(0)
    } else { 0 };

    let mute_output = Command::new("pactl")
        .args(["get-sink-mute", "@DEFAULT_SINK@"])
        .output();
    let muted = if let Ok(out) = mute_output {
        String::from_utf8_lossy(&out.stdout).contains("yes")
    } else { false };

    (vol, muted)
}

pub fn set_master_volume(volume: u32) {
    let _ = Command::new("pactl")
        .args(["set-sink-volume", "@DEFAULT_SINK@", &format!("{}%", volume)])
        .spawn();
}

pub fn set_master_mute(mute: bool) {
    let val = if mute { "1" } else { "0" };
    let _ = Command::new("pactl")
        .args(["set-sink-mute", "@DEFAULT_SINK@", val])
        .spawn();
}
