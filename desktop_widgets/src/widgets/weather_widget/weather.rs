use serde_json::Value;
use reqwest;
use crate::widgets::weather_widget::config::Config;
use crate::widgets::weather_widget::state::WeatherData;

pub async fn fetch_weather(config: &Config) -> Result<WeatherData, Box<dyn std::error::Error + Send + Sync>> {
    let lat = config.location.lat;
    let lon = config.location.lon;
    
    let url = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={}&longitude={}&current_weather=true&relative_humidity_2m=true&wind_speed_10m=true",
        lat, lon
    );

    let client = reqwest::Client::new();
    let resp = client.get(url).send().await?.json::<Value>().await?;

    let current = &resp["current_weather"];
    let temp_val = current["temperature"].as_f64().unwrap_or(0.0);
    let weather_code = current["weathercode"].as_u64().unwrap_or(0);
    let wind_speed = current["windspeed"].as_f64().unwrap_or(0.0);
    let wind_direction_deg = current["winddirection"].as_f64().unwrap_or(0.0);
    
    let humidity_val = resp["current"]["relative_humidity_2m"].as_f64().unwrap_or(0.0);

    let unit_symbol = if config.weather.unit == 'F' { "°F" } else { "°" };
    
    let icon_char = get_weather_icon_char(weather_code);
    let desc = get_weather_desc(weather_code);

    let wind_unit_config = &config.weather.wind_unit;
    let unit_label = if wind_unit_config == "mi" { "mph" } else { "km/h" };
    let wind_str = format!("{} {}", wind_speed.round(), unit_label);
    let wind_direction_str = get_wind_direction_str(wind_direction_deg);

    Ok(WeatherData {
        temp: format!("{}{}", temp_val.round(), unit_symbol),
        icon_char: icon_char.to_string(),
        desc: desc.to_string(),
        city: config.location.name.clone(),
        humidity: format!("{}%", humidity_val.round()),
        wind: wind_str,
        wind_direction: wind_direction_str,
    })
}

fn get_wind_direction_str(degrees: f64) -> String {
    let directions = ["North", "North East", "East", "South East", "South", "South West", "West", "North West"];
    let index = ((degrees + 22.5) / 45.0).floor() as usize % 8;
    directions[index].to_string()
}

fn get_weather_icon_char(code: u64) -> &'static str {
    match code {
        0 => "",
        1 | 2 | 3 => "󰖕",
        45 | 48 => "󰖑",
        51 | 53 | 55 => "󰖖",
        56 | 57 => "󰖘",
        61 | 63 | 65 => "󰖗",
        66 | 67 => "󰖘",
        71 | 73 | 75 => "󰖘",
        77 => "󰖘",
        80 | 81 | 82 => "󰖖",
        85 | 86 => "󰖘",
        95 => "󰖓",
        96 | 99 => "󰖓",
        _ => "󰖙",
    }
}

fn get_weather_desc(code: u64) -> &'static str {
    match code {
        0 => "Clear sky",
        1 | 2 | 3 => "Partly cloudy",
        45 | 48 => "Fog",
        51 | 53 | 55 => "Drizzle",
        61 | 63 | 65 => "Rain",
        71 | 73 | 75 => "Snow Fall",
        80 | 81 | 82 => "Rain Showers",
        95 => "Thunderstorm",
        _ => "Cloudy",
    }
}
