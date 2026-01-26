use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use serde::{Serialize, Deserialize};
use anyhow::Result;

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct LayoutState {
    pub widths: HashMap<String, i32>, // widget_name -> pixel_width
    pub sides: HashMap<String, String>, // widget_name -> side ("left" or "right")
}

pub fn get_state_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(format!("{}/.config/meowterialyou-widgets/layout_sync.json", home))
}

pub fn register_width(name: &str, side: &str, width: i32) -> Result<()> {
    let path = get_state_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let mut state = if path.exists() {
        let content = fs::read_to_string(&path)?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        LayoutState::default()
    };

    state.widths.insert(name.to_string(), width);
    state.sides.insert(name.to_string(), side.to_string());

    let content = serde_json::to_string_pretty(&state)?;
    fs::write(path, content)?;
    Ok(())
}

pub fn get_max_width(side: &str) -> i32 {
    let path = get_state_path();
    if !path.exists() { return 0; }

    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(state) = serde_json::from_str::<LayoutState>(&content) {
            return state.widths.iter()
                .filter(|(name, _)| {
                    state.sides.get(*name)
                        .map(|s| s.to_lowercase().contains(&side.to_lowercase()))
                        .unwrap_or(false)
                })
                .map(|(_, &w)| w)
                .max()
                .unwrap_or(0);
        }
    }
    0
}

pub fn watch_layout(callback: impl Fn() + Send + Sync + 'static) -> Result<notify::RecommendedWatcher> {
    use notify::{Watcher, RecursiveMode, Config};
    let path = get_state_path();
    let mut watcher = notify::RecommendedWatcher::new(
        move |res: notify::Result<notify::Event>| {
            if let Ok(event) = res {
                if event.kind.is_modify() || event.kind.is_create() {
                    callback();
                }
            }
        },
        Config::default(),
    )?;
    
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
        watcher.watch(parent, RecursiveMode::NonRecursive)?;
    }
    Ok(watcher)
}

pub fn clear_state() -> Result<()> {
    let path = get_state_path();
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}
