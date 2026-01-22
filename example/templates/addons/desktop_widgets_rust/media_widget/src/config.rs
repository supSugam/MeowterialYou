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
    pub gap: Vec<i32>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AppearanceConfig {
    pub corner_radius: i32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct BackgroundConfig {
    pub style: String,
    pub opacity: u8,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ControlsConfig {
    pub show_next_prev: bool,
}

pub fn load() -> Result<(), Box<dyn std::error::Error>> {
    let config_path = Path::new("./config.yaml");
    println!("Loading config from: {:?}", config_path);
    if config_path.exists() {
        let contents = fs::read_to_string(config_path)?;
        let config: Config = serde_yaml::from_str(&contents)?;
        println!("Loaded Config: {:?}", config);
        let mut global_conf = CONFIG.write().unwrap();
        *global_conf = config;
    }
    Ok(())
}
