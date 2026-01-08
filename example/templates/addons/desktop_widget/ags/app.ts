#!/usr/bin/gjs
// MeowterialYou Desktop Widget - Pure GJS/GTK3
// Material You themed widget with JSON config and runtime theming

import Gtk from "gi://Gtk?version=3.0";
import Gdk from "gi://Gdk?version=3.0";
import GLib from "gi://GLib?version=2.0";
import Gio from "gi://Gio?version=2.0";
import GWeather from "gi://GWeather?version=4.0";
import yaml from "js-yaml";

// --- Configuration ---
interface Config {
    layout: {
        position: "bottom_left" | "bottom_right" | "top_left" | "top_right";
        gap_x: number;
        gap_y: number;
        padding: number;
        corner_radius: number;
    };
    typography: {
        font_family: string;
        icon_font: string;
        time_size: number;
    };
    background: {
        mode: "solid" | "transparent";
        opacity: number;
    };
}

const CONFIG_DIR = GLib.get_user_config_dir() + "/ags/meowterialyou";
const CONFIG_PATH = CONFIG_DIR + "/config.yaml";
const THEME_CSS_PATH = CONFIG_DIR + "/theme.css";

let config: Config = {
    layout: {
        position: "bottom_left",
        gap_x: 24,
        gap_y: 64,
        padding: 20,
        corner_radius: 24
    },
    typography: {
        font_family: "Inter",
        icon_font: "MesloLGS Nerd Font Mono",
        time_size: 48
    },
    background: {
        mode: "transparent",
        opacity: 50
    }
};

function loadConfig() {
    try {
        const file = Gio.File.new_for_path(CONFIG_PATH);
        if (file.query_exists(null)) {
            const [success, content] = file.load_contents(null);
            if (success && content) {
                // @ts-ignore
                const text = new TextDecoder().decode(content);
                const loaded = yaml.load(text) as Config;
                
                if (loaded) {
                    if (loaded.layout) config.layout = { ...config.layout, ...loaded.layout };
                    if (loaded.typography) config.typography = { ...config.typography, ...loaded.typography };
                    if (loaded.background) config.background = { ...config.background, ...loaded.background };
                }
            }
        }
    } catch (e) {
        log(`Error loading config: ${e}`);
    }
}
loadConfig();

// --- Helpers ---
function getCmdOut(cmd: string): string {
    try {
        const [, out, , status] = GLib.spawn_command_line_sync(cmd);
        if (status === 0 && out) {
            // @ts-ignore
            return imports.byteArray.toString(out).trim();
        }
    } catch (e) {}
    return "--";
}

function getGnomeWeatherLocation(): [string, number, number] | null {
    try {
        const settings = new Gio.Settings({ schema_id: 'org.gnome.Weather' });
        const locations = settings.get_value('locations');
        
        if (locations.n_children() > 0) {
            const child = locations.get_child_value(0);
            const inner = child.get_variant();
            const locData = inner.get_child_value(1).get_variant();
            
            const city = locData.get_child_value(0).get_string()[0];
            const coordsArray = locData.get_child_value(3);
            
            if (coordsArray.n_children() > 0) {
                const coord = coordsArray.get_child_value(0);
                const lat = coord.get_child_value(0).get_double();
                const lon = coord.get_child_value(1).get_double();
                return [city, lat, lon];
            }
        }
    } catch (e) {
        log(`Error reading GNOME Weather location: ${e}`);
    }
    return null;
}

function getWeatherIconChar(iconName: string): string {
    if (!iconName) return "󰖙";
    const lower = iconName.toLowerCase();
    if (lower.includes("clear") && lower.includes("night")) return "";
    if (lower.includes("clear") || lower.includes("sunny")) return "󰖙";
    if (lower.includes("few-clouds") || lower.includes("partly")) return "󰖕";
    if (lower.includes("overcast") || lower.includes("cloud")) return "󰖐";
    if (lower.includes("fog") || lower.includes("mist")) return "󰖑";
    if (lower.includes("shower")) return "󰖖";
    if (lower.includes("rain")) return "󰖗";
    if (lower.includes("snow")) return "󰖘";
    if (lower.includes("storm") || lower.includes("thunder")) return "󰖓";
    return "󰖙";
}

// --- Styles ---
function applyStyles() {
    // 1. Load generated theme colors
    const themeProvider = new Gtk.CssProvider();
    try {
        const themeFile = Gio.File.new_for_path(THEME_CSS_PATH);
        if (themeFile.query_exists(null)) {
            themeProvider.load_from_file(themeFile);
            Gtk.StyleContext.add_provider_for_screen(
                Gdk.Screen.get_default()!,
                themeProvider,
                Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
            );
        }
    } catch (e) {
        log(`Error loading theme.css: ${e}`);
    }

    // 2. Generate dynamic CSS based on config
    let bgOpacity = config.background.opacity / 100.0;
    if (config.background.mode === "solid") {
        bgOpacity = 1.0;
    }

    const dynamicCss = `
        window { background-color: transparent; }

        .background-layer {
            /* @widget_bg is defined as the RGB components of 'surface' color in domain.py */
            background-color: alpha(@widget_bg, ${bgOpacity});
            border-radius: ${config.layout.corner_radius}px;
        }

        .date {
            font-family: "${config.typography.font_family}", sans-serif;
            font-size: 14px;
            font-weight: 500;
            color: @onSurface;
        }

        .time {
            font-family: "${config.typography.font_family}", sans-serif;
            font-size: ${config.typography.time_size}px;
            font-weight: bold;
            color: @primary;
            letter-spacing: -1px;
        }

        .ampm {
            font-family: "${config.typography.font_family}", sans-serif;
            font-size: 16px;
            font-weight: 500;
            color: @onSurfaceVariant;
        }

        .weather-icon {
            font-family: "${config.typography.icon_font}", monospace;
            font-size: 28px;
            color: @primary;
        }

        .weather-temp {
            font-family: "${config.typography.font_family}", sans-serif;
            font-size: 24px;
            font-weight: bold;
            color: @onSurface;
        }

        .weather-desc {
            font-family: "${config.typography.font_family}", sans-serif;
            font-size: 13px;
            font-weight: 500;
            color: @onSurfaceVariant;
        }

        .weather-city {
            font-family: "${config.typography.font_family}", sans-serif;
            font-size: 12px;
            color: @outline;
            opacity: 0.8;
        }

        .detail {
            font-family: "${config.typography.icon_font}", "${config.typography.font_family}", monospace;
            font-size: 12px;
            color: @onSurfaceVariant;
            opacity: 0.9;
        }
    `;

    // 3. Load dynamic styles
    const styleProvider = new Gtk.CssProvider();
    // @ts-ignore
    styleProvider.load_from_data(dynamicCss);
    
    Gtk.StyleContext.add_provider_for_screen(
        Gdk.Screen.get_default()!,
        styleProvider,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION + 10
    );
}

// Initialize
// @ts-ignore
Gtk.init(null);
applyStyles();

// --- Window & UI ---
const win = new Gtk.Window({
    type: Gtk.WindowType.TOPLEVEL,
    decorated: false,
    skip_taskbar_hint: true,
    skip_pager_hint: true,
    accept_focus: false,
});

win.set_app_paintable(true);
const visual = win.get_screen()?.get_rgba_visual();
if (visual) win.set_visual(visual);

win.set_type_hint(Gdk.WindowTypeHint.DOCK);
win.set_keep_below(true);
win.stick();

// Nested Architecture: Wrapper (Background) -> Content (Padding)
const wrapper = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
});
wrapper.get_style_context().add_class("background-layer");

const content = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 6,
    margin: config.layout.padding, // Padding applied here, inside the background
});

// Row 1: Date
const dateLabel = new Gtk.Label({ label: "...", halign: Gtk.Align.START, xalign: 0 });
dateLabel.get_style_context().add_class("date");
content.pack_start(dateLabel, false, false, 0);

// Row 2: Time
const timeRow = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, halign: Gtk.Align.START });
const timeLabel = new Gtk.Label({ label: "..." });
timeLabel.get_style_context().add_class("time");
const ampmLabel = new Gtk.Label({ label: "...", valign: Gtk.Align.END, margin_bottom: 8 });
ampmLabel.get_style_context().add_class("ampm");
timeRow.pack_start(timeLabel, false, false, 0);
timeRow.pack_start(ampmLabel, false, false, 6);
content.pack_start(timeRow, false, false, 0);

// Row 3: Weather
const weatherRow = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 48 });

const tempBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, valign: Gtk.Align.CENTER });
const wIcon = new Gtk.Label({ label: "󰖙",  });
wIcon.get_style_context().add_class("weather-icon");
const wTemp = new Gtk.Label({ label: "--" });
wTemp.get_style_context().add_class("weather-temp");
tempBox.pack_start(wIcon, false, false, 0);
tempBox.pack_start(wTemp, false, false, 8);

const infoBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, valign: Gtk.Align.CENTER, hexpand: true });
infoBox.set_margin_start(40);
const wDesc = new Gtk.Label({ label: "Unknown", halign: Gtk.Align.END, xalign: 1.0 });
wDesc.get_style_context().add_class("weather-desc");
const wCity = new Gtk.Label({ label: "Location", halign: Gtk.Align.END, xalign: 1.0 });
wCity.get_style_context().add_class("weather-city");
infoBox.pack_start(wDesc, false, false, 0);
infoBox.pack_start(wCity, false, false, 0);

weatherRow.pack_start(tempBox, false, false, 0);
weatherRow.pack_end(infoBox, true, true, 0);
content.pack_start(weatherRow, false, false, 0);

// Row 4: Details
const detailRow = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, halign: Gtk.Align.START, margin_top: 6 });
const windLabel = new Gtk.Label({ label: "󰖝 --" });
windLabel.get_style_context().add_class("detail");
const humidLabel = new Gtk.Label({ label: "󰖎 --%", margin_left: 16 });
humidLabel.get_style_context().add_class("detail");
detailRow.pack_start(windLabel, false, false, 0);
detailRow.pack_start(humidLabel, false, false, 0);
content.pack_start(detailRow, false, false, 0);

wrapper.pack_start(content, true, true, 0);
win.add(wrapper);

// --- Positioning ---
let positioned = false;
win.connect("size-allocate", () => {
    if (positioned) return;
    const display = win.get_display();
    const monitor = display.get_primary_monitor() || display.get_monitor(0);
    if (monitor) {
        const geom = monitor.get_geometry();
        const alloc = win.get_allocation();
        let x = 0, y = 0;
        const { position, gap_x, gap_y } = config.layout;
        
        if (position === "bottom_left") {
            x = geom.x + gap_x;
            y = geom.y + geom.height - alloc.height - gap_y;
        } else if (position === "bottom_right") {
            x = geom.x + geom.width - alloc.width - gap_x;
            y = geom.y + geom.height - alloc.height - gap_y;
        } else if (position === "top_left") {
            x = geom.x + gap_x;
            y = geom.y + gap_y;
        } else if (position === "top_right") {
            x = geom.x + geom.width - alloc.width - gap_x;
            y = geom.y + gap_y;
        }
        win.move(x, y);
        positioned = true;
    }
});

win.show_all();

// --- Logic ---
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
    timeLabel.label = getCmdOut("date '+%I:%M'");
    ampmLabel.label = getCmdOut("date '+%p'");
    dateLabel.label = getCmdOut("date '+%a, %b %d'");
    return true;
});

function initWeather() {
    const locData = getGnomeWeatherLocation();
    if (!locData) {
        wDesc.label = "Location Not Found";
        return;
    }
    
    const [city, lat, lon] = locData;
    wCity.label = city || "Unknown";
    print(`Weather Location: ${city}`);

    const location = GWeather.Location.new_detached(city, null, lat, lon);
    const info = GWeather.Info.new(location);
    info.set_application_id("io.github.meowterialyou.widget");
    info.set_contact_info("meowterialyou@widget");
    info.set_enabled_providers(GWeather.Provider.MET_NO | GWeather.Provider.OWM);
    
    info.connect("updated", () => {
        const [ok, temp] = info.get_value_temp(GWeather.TemperatureUnit.CENTIGRADE);
        const iconName = info.get_icon_name();
        const humidity = info.get_humidity();
        const wind = info.get_wind();
        const summary = info.get_weather_summary();
        
        print(`Weather: ${temp}°C, Summary: ${summary}`);
        
        wTemp.label = ok ? `${Math.round(temp)}°` : "--°";
        wIcon.label = getWeatherIconChar(iconName || "");
        
        // Strip city from summary if present to avoid duplication
        let desc = summary || "Unknown";
        if (city && desc.includes(city)) {
             desc = desc.replace(city, "").trim();
             // Remove leading/trailing punctuation like ": " or " - "
             desc = desc.replace(/^[:\s-]+|[:\s-]+$/g, "");
        }
        wDesc.label = desc;

        if (humidity) humidLabel.label = `󰖎 ${humidity}`;
        if (wind) windLabel.label = `󰖝 ${wind}`;
    });
    
    info.update();
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 900000, () => {
        info.update();
        return true;
    });
}
initWeather();

win.connect("destroy", Gtk.main_quit);
Gtk.main();
