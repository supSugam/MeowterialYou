use serde::Deserialize;
use std::fs;
use std::path::Path;
use std::sync::RwLock;
use lazy_static::lazy_static;

lazy_static! {
    pub static ref CONFIG: RwLock<Config> = RwLock::new(Config::default());
}

#[derive(Clone, Debug, Deserialize)]
pub struct Config {
    pub layout: LayoutConfig,
    pub appearance: AppearanceConfig,
    pub background: BackgroundConfig,
    #[allow(dead_code)] // Reserved for future use
    pub controls: ControlsConfig,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            layout: LayoutConfig {
                position: "bottom_right".to_string(),
                scale: 1.0,
                padding: 20,
                gap: vec![24, 80],
            },
            appearance: AppearanceConfig {
                corner_radius: 16,
            },
            background: BackgroundConfig {
                style: "smart_transparency".to_string(),
                opacity: 80,
            },
            controls: ControlsConfig {
                show_next_prev: true,
            },
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
pub struct LayoutConfig {
    pub position: String,
    pub scale: f64,
    pub padding: i32,
    #[allow(dead_code)] // Reserved for multi-widget layout
    pub gap: Vec<i32>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AppearanceConfig {
    pub corner_radius: i32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct BackgroundConfig {
    #[allow(dead_code)] // Reserved for smart transparency mode
    pub style: String,
    pub opacity: u8,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ControlsConfig {
    #[allow(dead_code)] // Reserved for conditional control rendering
    pub show_next_prev: bool,
}

pub fn load() -> Result<(), Box<dyn std::error::Error>> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    
    // Prioritize project configs first for development, XDG last for production
    let paths = [
        // Relative path when running from Rust project directory
        "./configs/media_widget/config.yaml".to_string(),
        // Relative path when running from parent MeowterialYou directory
        "./example/templates/addons/desktop_widgets_rust/configs/media_widget/config.yaml".to_string(),
        // Fallback local config
        "./config.yaml".to_string(),
        // Standard XDG config path (last - for production/installed use)
        format!("{}/.config/meowterialyou-widgets/mediawidget/config.yaml", home),
    ];

    for path_str in paths {
        let path = Path::new(&path_str);
        if path.exists() {
            eprintln!("Trying config from: {:?}", path);
            match fs::read_to_string(path) {
                Ok(contents) => {
                    match serde_yaml::from_str::<Config>(&contents) {
                        Ok(config) => {
                            eprintln!("Loaded Config: {:?}", config);
                            let mut global_conf = CONFIG.write().unwrap();
                            *global_conf = config;
                            return Ok(());
                        }
                        Err(e) => {
                            eprintln!("Failed to parse config {:?}: {}, trying next...", path, e);
                            continue; // Try next path
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Failed to read config {:?}: {}, trying next...", path, e);
                    continue; // Try next path
                }
            }
        }
    }
    
    eprintln!("No valid config file found, using defaults");
    Ok(())
}
