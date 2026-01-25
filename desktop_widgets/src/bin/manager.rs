use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::process::{Child, Command};
use tokio::sync::mpsc;
use tokio::time::{sleep, Duration};
use notify::{Watcher, RecursiveMode, Config, EventKind};
use anyhow::Result;
use serde::Deserialize;

#[derive(Debug, Deserialize, Clone)]
struct GlobalConfig {
    global: GlobalSection,
}

#[derive(Debug, Deserialize, Clone)]
struct GlobalSection {
    enabled: Option<Vec<String>>,
    width: Option<WidthConfig>,
    scale_factor: Option<ScaleConfig>,
}

#[derive(Debug, Deserialize, Clone)]
struct WidthConfig {
    left_side: Option<i32>,
    right_side: Option<i32>,
}

#[derive(Debug, Deserialize, Clone)]
struct ScaleConfig {
    left_side: Option<f64>,
    right_side: Option<f64>,
}

// Minimal config structs for parsing individual widget configs
#[derive(Debug, Deserialize)]
struct MinimalWidgetConfig {
    layout: MinimalLayoutConfig,
}

#[derive(Debug, Deserialize)]
struct MinimalLayoutConfig {
    position: String,
}

struct ManagedWidget {
    name: String,
    bin_path: PathBuf,
    config_path: PathBuf,
    child: Option<Child>,
    env_vars: HashMap<String, String>,
}

impl ManagedWidget {
    async fn start(&mut self) -> Result<()> {
        if let Some(mut old_child) = self.child.take() {
            let _ = old_child.kill().await;
            let _ = old_child.wait().await;
        }

        println!("🚀 Starting widget: {} from {:?}", self.name, self.bin_path);
        
        let mut cmd = Command::new(&self.bin_path);
        cmd.envs(&self.env_vars);
        
        // Ensure widget can find its local config relative to the bin or repo root
        if let Some(parent) = self.bin_path.parent() {
             if parent.ends_with("release") || parent.ends_with("debug") {
                  // If running from target, set CWD to repo root so it finds ./desktop_widgets/configs/...
                  if let Some(repo_root) = parent.parent().and_then(|p| p.parent()) {
                       cmd.current_dir(repo_root);
                  }
             }
        }
        
        let child = cmd.spawn()
            .map_err(|e| anyhow::anyhow!("Failed to start {}: {}", self.name, e))?;
        
        self.child = Some(child);
        Ok(())
    }

    async fn stop(&mut self) {
        if let Some(mut child) = self.child.take() {
            println!("🛑 Stopping widget: {}", self.name);
            let _ = child.kill().await;
            let _ = child.wait().await;
        }
    }
}

fn get_home() -> String {
    std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string())
}

fn load_global_config(home: &str) -> (Option<GlobalConfig>, Option<PathBuf>) {
    let paths = [
        PathBuf::from("./desktop_widgets/configs/widgets.yaml"),
        PathBuf::from("./configs/widgets.yaml"),
        PathBuf::from(format!("{}/.config/meowterialyou-widgets/widgets.yaml", home)),
    ];

    for path in paths {
        if path.exists() {
            match std::fs::read_to_string(&path) {
                Ok(content) => match serde_yaml::from_str::<GlobalConfig>(&content) {
                    Ok(cfg) => {
                        println!("🌍 Loaded global config from {:?}", path);
                        return (Some(cfg), Some(path));
                    }
                    Err(e) => eprintln!("❌ Failed to parse {:?}: {}", path, e),
                },
                Err(e) => eprintln!("❌ Failed to read {:?}: {}", path, e),
            }
        }
    }
    (None, None)
}

fn discover_bin(name: &str) -> Option<PathBuf> {
    let home = get_home();
    let paths = [
        format!("./target/release/{}", name),
        format!("../target/release/{}", name),
        format!("{}/.local/bin/{}", home, name),
        format!("./{}", name),
    ];

    for p in paths {
        let path = PathBuf::from(p);
        if path.exists() {
            return Some(path);
        }
    }
    None
}

fn resolve_widget_alias(alias: &str) -> String {
    match alias {
        "weatherclock" => "weather_widget".to_string(),
        "mediawidget" => "media_widget".to_string(),
        other => other.to_string(),
    }
}

fn get_widget_position(config_path: &Path) -> Option<String> {
    if let Ok(content) = std::fs::read_to_string(config_path) {
        if let Ok(cfg) = serde_yaml::from_str::<MinimalWidgetConfig>(&content) {
            return Some(cfg.layout.position);
        }
    }
    None
}

fn find_widget_config(name: &str, home: &str) -> PathBuf {
    let repo_paths = [
        format!("./desktop_widgets/configs/{}/config.yaml", name),
        format!("./configs/{}/config.yaml", name),
    ];

    for p in repo_paths {
        let path = PathBuf::from(p);
        if path.exists() {
             return path;
        }
    }

    PathBuf::from(format!("{}/.config/meowterialyou-widgets/{}/config.yaml", home, name))
}

fn is_left_side(pos: &str) -> bool {
    pos.contains("left")
}

fn is_right_side(pos: &str) -> bool {
    pos.contains("right")
}

#[tokio::main]
async fn main() -> Result<()> {
    let home = get_home();
    let lock_file = PathBuf::from("/tmp/meowterialyou-widget-manager.lock");

    // Single instance check
    if lock_file.exists() {
        if let Ok(pid_str) = std::fs::read_to_string(&lock_file) {
            if let Ok(pid) = pid_str.trim().parse::<i32>() {
                if std::path::Path::new(&format!("/proc/{}", pid)).exists() {
                    println!("⚠️  Manager already running (PID {}).", pid);
                    return Ok(());
                }
            }
        }
    }
    std::fs::write(&lock_file, std::process::id().to_string())?;

    println!("🎨 MeowterialYou Widget Manager starting...");
    
    // Clean start
    let _ = Command::new("pkill").arg("-f").arg("weather_widget").status().await;
    let _ = Command::new("pkill").arg("-f").arg("media_widget").status().await;

    // Load Global Config
    let (global_config, _global_config_path) = load_global_config(&home);
    
    // Determine enabled widgets
    let all_widgets = vec!["weather_widget", "media_widget"];
    let mut enabled_widgets_names = Vec::new();

    if let Some(ref gc) = global_config {
        if let Some(ref enabled_list) = gc.global.enabled {
            for alias in enabled_list {
                enabled_widgets_names.push(resolve_widget_alias(alias));
            }
        } else {
             enabled_widgets_names = all_widgets.iter().map(|s| s.to_string()).collect(); 
        }
    } else {
        enabled_widgets_names = all_widgets.iter().map(|s| s.to_string()).collect();
    }

    let mut managed_widgets = HashMap::new();
    let mut widget_positions = HashMap::new();

    // 1. Discovery and Position Analysis
    for name in &enabled_widgets_names {
        if !all_widgets.contains(&name.as_str()) {
             eprintln!("⚠️  Unknown widget '{}' in enabled list, skipping.", name);
             continue;
        }

        if let Some(bin_path) = discover_bin(name) {
             let config_path = find_widget_config(name, &home);
             
             if let Some(pos) = get_widget_position(&config_path) {
                 widget_positions.insert(name.clone(), pos);
             } else {
                 widget_positions.insert(name.clone(), "bottom_right".to_string());
             }

             managed_widgets.insert(name.clone(), ManagedWidget {
                 name: name.clone(),
                 bin_path,
                 config_path,
                 child: None,
                 env_vars: HashMap::new(),
             });
        } else {
            eprintln!("⚠️  Worker binary for '{}' not found, skipping.", name);
        }
    }

    // 2. Count Side Overlaps
    let left_count = widget_positions.values().filter(|p| is_left_side(p)).count();
    let right_count = widget_positions.values().filter(|p| is_right_side(p)).count();

    println!("📊 Layout Analysis: Left Side Widgets: {}, Right Side Widgets: {}", left_count, right_count);

    // 3. Apply Overrides and Start
    for (name, mw) in managed_widgets.iter_mut() {
        if let Some(pos) = widget_positions.get(name) {
            let mut width_override = None;
            let mut scale_override = None;

            if let Some(ref gc) = global_config {
                // Apply Width Override
                if let Some(ref w_conf) = gc.global.width {
                    if is_left_side(pos) && left_count > 1 {
                        width_override = w_conf.left_side;
                    } else if is_right_side(pos) && right_count > 1 {
                        width_override = w_conf.right_side;
                    }
                }
                // Apply Scale Override
                if let Some(ref s_conf) = gc.global.scale_factor {
                    if is_left_side(pos) && left_count > 1 {
                        scale_override = s_conf.left_side;
                    } else if is_right_side(pos) && right_count > 1 {
                        scale_override = s_conf.right_side;
                    }
                }
            }

            if let Some(w) = width_override {
                println!("📏 Applying width override {} to {}", w, name);
                mw.env_vars.insert("MEOW_WIDGET_WIDTH".to_string(), w.to_string());
            }
            if let Some(s) = scale_override {
                println!("⚖️  Applying scale override {} to {}", s, name);
                mw.env_vars.insert("MEOW_WIDGET_SCALE".to_string(), s.to_string());
            }
        }

        if let Err(e) = mw.start().await {
            eprintln!("❌ Error starting {}: {}", name, e);
        }
    }

    // 4. Watch loop
    let (tx, mut rx) = mpsc::channel(100);
    let mut watcher = notify::RecommendedWatcher::new(
        move |res| { if let Ok(event) = res { let _ = tx.blocking_send(event); } },
        Config::default(),
    )?;

    // Watch repo configs if they exist
    let mut watch_paths = vec![format!("{}/.config/meowterialyou-widgets", home)];
    if Path::new("./desktop_widgets/configs").exists() {
        watch_paths.push("./desktop_widgets/configs".to_string());
    } else if Path::new("./configs").exists() {
        watch_paths.push("./configs".to_string());
    }

    for path in watch_paths {
        if Path::new(&path).exists() {
            watcher.watch(Path::new(&path), RecursiveMode::Recursive)?;
            println!("🔍 Watching for configuration changes in {}", path);
        }
    }

    let widgets = Arc::new(tokio::sync::Mutex::new(managed_widgets));
    let widgets_ctrlc = Arc::clone(&widgets);
    let lock_file_ctrlc = lock_file.clone();

    tokio::spawn(async move {
        tokio::signal::ctrl_c().await.unwrap();
        println!("\n👋 Shutting down manager and widgets...");
        let mut w = widgets_ctrlc.lock().await;
        for mw in w.values_mut() { mw.stop().await; }
        let _ = std::fs::remove_file(lock_file_ctrlc);
        std::process::exit(0);
    });

    loop {
        tokio::select! {
            Some(event) = rx.recv() => {
                match event.kind {
                    EventKind::Modify(_) | EventKind::Create(_) => {
                        for path in event.paths {
                            // Helper to check extensions
                            let is_yaml = path.extension().map_or(false, |ext| ext == "yaml");
                            let is_css = path.extension().map_or(false, |ext| ext == "css");

                            // IGNORE CSS changes - Widgets handle this internally via hot-reload!
                            if is_css {
                                continue;
                            }

                            if path.file_name().map_or(false, |n| n == "widgets.yaml") {
                                 println!("🌍 Global config changed, restarting manager...");
                                 let mut w = widgets.lock().await;
                                 for mw in w.values_mut() { mw.stop().await; }
                                 let _ = std::fs::remove_file(&lock_file);
                                 std::process::exit(0); 
                            }
                            
                            if is_yaml {
                                let mut w = widgets.lock().await;
                                for mw in w.values_mut() {
                                    if path.starts_with(mw.config_path.parent().unwrap()) {
                                         println!("♻️  Config changed for {}, restarting...", mw.name);
                                         let _ = mw.start().await;
                                    }
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
            _ = sleep(Duration::from_secs(5)) => {
                let mut w = widgets.lock().await;
                for mw in w.values_mut() {
                    if let Some(ref mut child) = mw.child {
                        if let Ok(Some(status)) = child.try_wait() {
                            println!("⚠️  Widget {} died (status {}), restarting...", mw.name, status);
                            let _ = mw.start().await;
                        }
                    }
                }
            }
        }
    }
}
