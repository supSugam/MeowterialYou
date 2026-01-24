#[derive(Debug, Clone)]
pub struct WeatherData {
    pub temp: String,
    pub icon_char: String,
    pub desc: String,
    pub city: String,
    pub humidity: String,
    pub wind: String,
}

impl Default for WeatherData {
    fn default() -> Self {
        Self {
            temp: "--".to_string(),
            icon_char: "".to_string(),
            desc: "...".to_string(),
            city: "...".to_string(),
            humidity: "".to_string(),
            wind: "".to_string(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct SystemStats {
    pub uptime: String,
    pub load: String,
    pub mem: String,
    pub temp: String,
    pub net: String,
}

impl Default for SystemStats {
    fn default() -> Self {
        Self {
            uptime: "0h 0m".to_string(),
            load: "0%".to_string(),
            mem: "0%".to_string(),
            temp: "0°C".to_string(),
            net: "0 K/s".to_string(),
        }
    }
}

#[derive(Debug, Clone)]
pub enum UpdateMessage {
    Weather(WeatherData),
    Stats(SystemStats),
    Time { time: String, ampm: String, date: String },
}
