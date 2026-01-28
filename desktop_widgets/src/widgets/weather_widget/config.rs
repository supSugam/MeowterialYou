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
    pub emoji: EmojiConfig,
    pub typography: TypographyConfig,
    pub background: BackgroundConfig,
    pub weather: WeatherConfig,
    pub clock: ClockConfig,
    pub visibility: VisibilityConfig,
    pub performance: PerformanceConfig,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            layout: LayoutConfig {
                position: "bottom_left".to_string(),
                width: Some(380),
                gap: vec![24, 80],
                alignment: "auto".to_string(),
                scale: 1.0,
                padding: 20,
            },
            appearance: AppearanceConfig {
                corner_radius: 12,
                border_width: 0,
            },
            emoji: EmojiConfig {
                value: "😼".to_string(),
                scale: 0.5,
                rotate: 20,
                row: 2,
            },
            typography: TypographyConfig {
                font_family: "Inter".to_string(),
                icon_font: "MesloLGS Nerd Font Mono".to_string(),
                time_size: 60,
            },
            background: BackgroundConfig {
                style: "smart_transparency".to_string(),
                opacity: 100,
            },
            weather: WeatherConfig {
                unit: 'C',
                wind_unit: "km".to_string(),
                refresh_interval_min: 10,
            },
            clock: ClockConfig {
                format: "12h".to_string(),
                show_ampm: true,
            },
            visibility: VisibilityConfig {
                show_weather: true,
                show_computer_metrics: true,
                show_divider: true,
            },
            performance: PerformanceConfig {
                dynamic_refresh: true,
                refresh_normal_ms: 2000,
                refresh_eco_ms: 10000,
            },
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
pub struct LayoutConfig {
    pub position: String,
    #[serde(default)]
    pub width: Option<i32>,
    pub gap: Vec<i32>,
    pub alignment: String,
    pub scale: f64,
    pub padding: i32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AppearanceConfig {
    pub corner_radius: i32,
    #[serde(default)]
    pub border_width: i32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct EmojiConfig {
    pub value: String,
    pub scale: f64,
    pub rotate: i32,
    pub row: i32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct TypographyConfig {
    pub font_family: String,
    pub icon_font: String,
    pub time_size: i32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct BackgroundConfig {
    pub style: String,
    pub opacity: u8,
}

#[derive(Clone, Debug, Deserialize)]
pub struct WeatherConfig {
    pub unit: char,
    pub wind_unit: String,
    pub refresh_interval_min: u32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ClockConfig {
    pub format: String,
    pub show_ampm: bool,
}

#[derive(Clone, Debug, Deserialize)]
pub struct VisibilityConfig {
    pub show_weather: bool,
    pub show_computer_metrics: bool,
    pub show_divider: bool,
}

#[derive(Clone, Debug, Deserialize)]
pub struct PerformanceConfig {
    pub dynamic_refresh: bool,
    pub refresh_normal_ms: u32,
    pub refresh_eco_ms: u32,
}

pub fn load() -> Result<(), Box<dyn std::error::Error>> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    
    let paths = [
        "../configs/weather_widget/config.yaml".to_string(),
        "./configs/weather_widget/config.yaml".to_string(),
        "./desktop_widgets/configs/weather_widget/config.yaml".to_string(),
        format!("{}/.config/meowterialyou-widgets/weather_widget/config.yaml", home),
        format!("{}/.config/meowterialyou-widgets/weatherclock/config.yaml", home),
    ];

    for path_str in paths {
        let path = Path::new(&path_str);
        if path.exists() {
            eprintln!("Trying config from: {:?}", path);
            match fs::read_to_string(path) {
                Ok(contents) => {
                    match serde_yaml::from_str::<Config>(&contents) {
                        Ok(mut config) => {
                            eprintln!("Loaded Config: {:?}", config);
                             // Apply Env Overrides (Global Alignment)
                            if let Ok(w) = std::env::var("MEOW_WIDGET_WIDTH") {
                                if let Ok(val) = w.parse::<i32>() { config.layout.width = Some(val); }
                            }
                            if let Ok(s) = std::env::var("MEOW_WIDGET_SCALE") {
                                if let Ok(val) = s.parse::<f64>() { config.layout.scale = val; }
                            }
                            if let Ok(p) = std::env::var("MEOW_WIDGET_PADDING") {
                                if let Ok(val) = p.parse::<i32>() { config.layout.padding = val; }
                            }
                            if let Ok(gx) = std::env::var("MEOW_WIDGET_GAP_X") {
                                if let Ok(val) = gx.parse::<i32>() { 
                                    if config.layout.gap.len() >= 1 { config.layout.gap[0] = val; }
                                }
                            }
                            if let Ok(gy) = std::env::var("MEOW_WIDGET_GAP_Y") {
                                if let Ok(val) = gy.parse::<i32>() { 
                                    if config.layout.gap.len() >= 2 { config.layout.gap[1] = val; }
                                }
                            }

                            let mut global_conf = CONFIG.write().unwrap();
                            *global_conf = config;
                            return Ok(());
                        }
                        Err(e) => {
                            eprintln!("Failed to parse config {:?}: {}", path, e);
                            continue;
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Failed to read config {:?}: {}", path, e);
                    continue;
                }
            }
        }
    }
    
    eprintln!("No valid config file found, using defaults");
    Ok(())
}
