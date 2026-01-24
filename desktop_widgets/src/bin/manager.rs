use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::process::{Child, Command};
use tokio::sync::mpsc;
use tokio::time::{sleep, Duration};
use notify::{Watcher, RecursiveMode, Config, EventKind};
use anyhow::Result;

struct ManagedWidget {
    name: String,
    bin_path: PathBuf,
    config_path: PathBuf,
    child: Option<Child>,
}

impl ManagedWidget {
    async fn start(&mut self) -> Result<()> {
        if let Some(mut old_child) = self.child.take() {
            let _ = old_child.kill().await;
            let _ = old_child.wait().await;
        }

        println!("🚀 Starting widget: {} from {:?}", self.name, self.bin_path);
        
        let child = Command::new(&self.bin_path)
            .spawn()
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

fn discover_bin(name: &str) -> Option<PathBuf> {
    let home = get_home();
    let paths = [
        format!("{}/.local/bin/{}", home, name),
        format!("./target/release/{}", name),
        format!("../target/release/{}", name),
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

#[tokio::main]
async fn main() -> Result<()> {
    let home = get_home();
    let lock_file = PathBuf::from("/tmp/meowterialyou-widget-manager.lock");

    // Single instance check
    if lock_file.exists() {
        if let Ok(pid_str) = std::fs::read_to_string(&lock_file) {
            if let Ok(pid) = pid_str.trim().parse::<i32>() {
                // Check if process still exists
                if std::path::Path::new(&format!("/proc/{}", pid)).exists() {
                    println!("⚠️  Manager already running (PID {}).", pid);
                    return Ok(());
                }
            }
        }
    }
    std::fs::write(&lock_file, std::process::id().to_string())?;

    println!("🎨 MeowterialYou Widget Manager starting...");

    // Clean start: kill any stray widget processes
    let _ = Command::new("pkill").arg("-f").arg("weather_widget").status().await;
    let _ = Command::new("pkill").arg("-f").arg("media_widget").status().await;

    let widgets_list = vec!["weather_widget", "media_widget"];
    let mut managed_widgets = HashMap::new();

    for name in widgets_list {
        if let Some(bin_path) = discover_bin(name) {
            let config_path = PathBuf::from(format!("{}/.config/meowterialyou-widgets/{}/config.yaml", home, name));
            let mut mw = ManagedWidget {
                name: name.to_string(),
                bin_path,
                config_path,
                child: None,
            };
            if let Err(e) = mw.start().await {
                eprintln!("❌ Error starting {}: {}", name, e);
            }
            managed_widgets.insert(name.to_string(), mw);
        } else {
            eprintln!("⚠️  Worker binary for '{}' not found, skipping.", name);
        }
    }

    let (tx, mut rx) = mpsc::channel(100);
    
    let mut watcher = notify::RecommendedWatcher::new(
        move |res| {
            if let Ok(event) = res {
                let _ = tx.blocking_send(event);
            }
        },
        Config::default(),
    )?;

    let config_root = format!("{}/.config/meowterialyou-widgets", home);
    let config_path_obj = Path::new(&config_root);
    if config_path_obj.exists() {
        watcher.watch(config_path_obj, RecursiveMode::Recursive)?;
        println!("🔍 Watching for configuration changes in {}", config_root);
    }

    let widgets = Arc::new(tokio::sync::Mutex::new(managed_widgets));
    let widgets_ctrlc = Arc::clone(&widgets);
    let lock_file_ctrlc = lock_file.clone();

    tokio::spawn(async move {
        tokio::signal::ctrl_c().await.unwrap();
        println!("\n👋 Shutting down manager and widgets...");
        let mut w = widgets_ctrlc.lock().await;
        for mw in w.values_mut() {
            mw.stop().await;
        }
        let _ = std::fs::remove_file(lock_file_ctrlc);
        std::process::exit(0);
    });

    loop {
        tokio::select! {
            Some(event) = rx.recv() => {
                // Debounce simple: only act on Modify(Data) or Create
                match event.kind {
                    EventKind::Modify(_) | EventKind::Create(_) => {
                        for path in event.paths {
                            if path.extension().map_or(false, |ext| ext == "yaml") {
                                let mut w = widgets.lock().await;
                                for mw in w.values_mut() {
                                    // Watch parent dir or exact file
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
                // Occasional health check
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
