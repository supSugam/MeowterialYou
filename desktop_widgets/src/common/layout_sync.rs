use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use serde::{Serialize, Deserialize};
use anyhow::Result;

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct LayoutState {
    pub widths: HashMap<String, i32>, // widget_name -> pixel_width
    pub heights: HashMap<String, i32>, // widget_name -> pixel_height
    pub sides: HashMap<String, String>, // widget_name -> side ("left" or "right")
    pub gaps: HashMap<String, (i32, i32)>, // widget_name -> (gap_x, gap_y)
    pub order: Vec<String>, // global display order from widgets.yaml
}

pub fn get_state_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(format!("{}/.config/meowterialyou-widgets/layout_sync.json", home))
}

pub fn update_layout(name: &str, side: &str, width: i32, height: i32, gap_x: i32, gap_y: i32) -> Result<()> {
    let path = get_state_path();
    let lock_path = path.with_extension("lock");
    
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    for _ in 0..5 {
        if fs::OpenOptions::new().create_new(true).write(true).open(&lock_path).is_ok() {
            let result = (|| -> Result<()> {
                let mut state = if path.exists() {
                    let content = fs::read_to_string(&path)?;
                    serde_json::from_str::<LayoutState>(&content).unwrap_or_default()
                } else {
                    LayoutState::default()
                };

                // Change Threshold: prevents jitter from sub-pixel or tiny font changes
                let old_w = state.widths.get(name).cloned().unwrap_or(0);
                let old_h = state.heights.get(name).cloned().unwrap_or(0);
                let old_gap = state.gaps.get(name).cloned().unwrap_or((0, 0));
                
                let w_diff = (old_w - width).abs();
                let h_diff = (old_h - height).abs();
                let gap_diff = (old_gap.0 - gap_x).abs() + (old_gap.1 - gap_y).abs();

                if w_diff < 2 && h_diff < 2 && gap_diff == 0 && state.sides.get(name).map(|s| s == side).unwrap_or(false) {
                    return Ok(()); // Skip redundant write
                }

                state.widths.insert(name.to_string(), width);
                state.heights.insert(name.to_string(), height);
                state.sides.insert(name.to_string(), side.to_string());
                state.gaps.insert(name.to_string(), (gap_x, gap_y));

                let content = serde_json::to_string_pretty(&state)?;
                fs::write(&path, content)?;
                Ok(())
            })();
            
            let _ = fs::remove_file(&lock_path);
            return result;
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    
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

pub fn set_order(order: Vec<String>) -> Result<()> {
    let path = get_state_path();
    let lock_path = path.with_extension("lock");

    for _ in 0..5 {
        if fs::OpenOptions::new().create_new(true).write(true).open(&lock_path).is_ok() {
            let result = (|| -> Result<()> {
                let mut state = if path.exists() {
                    let content = fs::read_to_string(&path)?;
                    serde_json::from_str(&content).unwrap_or_default()
                } else {
                    LayoutState::default()
                };

                state.order = order;

                let content = serde_json::to_string_pretty(&state)?;
                fs::write(&path, content)?;
                Ok(())
            })();
            
            let _ = fs::remove_file(&lock_path);
            return result;
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    Ok(())
}

pub fn get_y_offset(target_name: &str, spacing: i32) -> (i32, i32) {
    let path = get_state_path();
    if !path.exists() { return (0, 0); }

    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(state) = serde_json::from_str::<LayoutState>(&content) {
            let side = state.sides.get(target_name).map(|s| s.clone()).unwrap_or_default();
            if side.is_empty() { return (0, 0); }

            let mut cumulative_offset = 0;
            let mut anchor_gap_y = 0;
            let mut found_anchor = false;
            let mut found_target = false;

            for name in &state.order {
                // Determine if this widget belongs to the same side
                let s = state.sides.get(name);
                if s != Some(&side) { continue; }

                // The first widget we find on this side is the anchor
                if !found_anchor {
                    anchor_gap_y = state.gaps.get(name).map(|g| g.1).unwrap_or(24);
                    found_anchor = true;
                }

                if name == target_name {
                    found_target = true;
                    break;
                }

                // If it's a preceding widget on the same side, add its height
                let h = state.heights.get(name).cloned().unwrap_or(0);
                if h > 0 {
                    cumulative_offset += h + spacing;
                }
            }

            if found_target { 
                return (anchor_gap_y, cumulative_offset); 
            }
        }
    }
    (0, 0)
}

pub fn clear_state() -> Result<()> {
    let path = get_state_path();
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}
