#!/usr/bin/gjs
// MeowterialYou Desktop Widget - Pure GJS/GTK3
// Material You themed widget with JSON config and runtime theming

import Gtk from "gi://Gtk?version=3.0";
import Gdk from "gi://Gdk?version=3.0";
import GLib from "gi://GLib?version=2.0";
import Gio from "gi://Gio?version=2.0";
import GWeather from "gi://GWeather?version=4.0";
// @ts-ignore
import GTop from "gi://GTop?version=2.0";
// @ts-ignore
import Wnck from "gi://Wnck?version=3.0";
import yaml from 'js-yaml';

const log = (msg: string) => print(msg);

GLib.set_prgname('meowterialyou-widget');

// --- System Monitor ---
// Handles CPU, RAM, Net, Temp fetching
class SystemMonitor {
  private static cpu_prev = { total: 0, idle: 0 };
  private static net_prev = { rx: 0, tx: 0, time: 0 };
  
  // Cache for detected thermal path
  private static temp_path: string | null = null;
  
  // Current values (updated async)
  private static current = {
    cpu: 0,
    ram: 0,
    net: '0 KB/s',
    temp: 0
  };

  static async init() {
    this.net_prev.time = GLib.get_monotonic_time();
    await this.refresh();
  }
  
  static async refresh() {
    await Promise.all([
        this.updateCpu(),
        this.updateRam(),
        this.updateNet(),
        this.updateTemp()
    ]);
  }
  
  // 1. CPU: /proc/stat
  private static async updateCpu() {
    try {
        const data = await readFileAsync('/proc/stat');
        const lines = data.split('\n');
        const cpuLine = lines.find(l => l.startsWith('cpu '));
        
        if (cpuLine) {
            const parts = cpuLine.split(/\s+/).slice(1).map(Number);
            const user = parts[0];
            const nice = parts[1];
            const system = parts[2];
            const idle = parts[3];
            const iowait = parts[4];
            const irq = parts[5];
            const softirq = parts[6];
            const steal = parts[7];
            
            const totalIdle = idle + iowait;
            const totalNonIdle = user + nice + system + irq + softirq + steal;
            const total = totalIdle + totalNonIdle;
            
            const diffIdle = totalIdle - this.cpu_prev.idle;
            const diffTotal = total - this.cpu_prev.total;
            
            if (diffTotal > 0) {
                this.current.cpu = Math.round(((diffTotal - diffIdle) / diffTotal) * 100);
            }
            
            this.cpu_prev = { total, idle: totalIdle };
        }
    } catch (e) { log(`[Error] CPU: ${e}`); }
  }

  // 2. RAM: /proc/meminfo
  private static async updateRam() {
    try {
        const data = await readFileAsync('/proc/meminfo');
        const totalMatch = data.match(/MemTotal:\s+(\d+)/);
        const availMatch = data.match(/MemAvailable:\s+(\d+)/);
        
        if (totalMatch && availMatch) {
            const total = parseInt(totalMatch[1]);
            const avail = parseInt(availMatch[1]);
            const used = total - avail;
            this.current.ram = Math.round((used / total) * 100);
        }
    } catch (e) { log(`[Error] RAM: ${e}`); }
  }

  // 3. Network: /proc/net/dev
  private static async updateNet() {
    try {
        const data = await readFileAsync('/proc/net/dev');
        const lines = data.split('\n').slice(2); // Skip headers
        
        let totalRx = 0;
        let totalTx = 0;
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            
            const parts = trimmed.split(/\s+/);
            const name = parts[0];
            
            if (name.startsWith('lo')) continue;
            
            const cleanLine = trimmed.substring(trimmed.indexOf(':') + 1).trim();
            const columns = cleanLine.split(/\s+/).map(Number);
            
            if (columns.length >= 9) {
                totalRx += columns[0];
                totalTx += columns[8];
            }
        }
        
        const now = GLib.get_monotonic_time();
        const deltaSec = (now - this.net_prev.time) / 1000000;
        
        if (deltaSec > 0) {
            const speedRx = (totalRx - this.net_prev.rx) / deltaSec;
            const speedTx = (totalTx - this.net_prev.tx) / deltaSec;
            const totalSpeed = speedRx + speedTx;
            
            if (totalSpeed > 1024 * 1024) {
                this.current.net = `${(totalSpeed / (1024 * 1024)).toFixed(1)} MB/s`;
            } else {
                this.current.net = `${Math.round(totalSpeed / 1024)} KB/s`;
            }
        }
        
        this.net_prev = { rx: totalRx, tx: totalTx, time: now };
        
    } catch (e) { log(`[Error] Net: ${e}`); }
  }

  // 4. Temp: /sys/class/hwmon
  private static async updateTemp() {
     try {
        let val = 0;
        
        if (!this.temp_path) {
            const PRIORITY = ['coretemp', 'k10temp', 'zenpower', 'asus_ec'];
            let bestCandidate = null;
            let acpiCandidate = null;

            const baseDir = Gio.File.new_for_path('/sys/class/hwmon');
            const enumerator = await new Promise<Gio.FileEnumerator>((resolve, reject) => {
                baseDir.enumerate_children_async('standard::name', Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null, (obj, res) => {
                    try { resolve(baseDir.enumerate_children_finish(res)); } 
                    catch (e) { reject(e); }
                });
            });

            let info;
            while ((info = enumerator.next_file(null))) {
                const name = info.get_name(); 
                if (!name.startsWith('hwmon')) continue;
                
                const hwmonPath = `/sys/class/hwmon/${name}`;
                try {
                    const sensorName = (await readFileAsync(`${hwmonPath}/name`)).trim();
                    
                    if (PRIORITY.includes(sensorName)) {
                        const inputPath = `${hwmonPath}/temp1_input`;
                        const f = Gio.File.new_for_path(inputPath);
                        if (f.query_exists(null)) {
                            this.temp_path = inputPath;
                            break; 
                        }
                    }
                    
                    if (!bestCandidate && (sensorName === 'acpitz' || sensorName.includes('thermal'))) {
                        const inputPath = `${hwmonPath}/temp1_input`;
                        const f = Gio.File.new_for_path(inputPath);
                        if (f.query_exists(null)) acpiCandidate = inputPath;
                    }
                    
                } catch {}
            }
            
            if (!this.temp_path && acpiCandidate) {
                this.temp_path = acpiCandidate;
            } else if (!this.temp_path) {
                 const f = Gio.File.new_for_path('/sys/class/thermal/thermal_zone0/temp');
                 if (f.query_exists(null)) this.temp_path = '/sys/class/thermal/thermal_zone0/temp';
            }
        }
        
        if (this.temp_path) {
            try {
                const c = await readFileAsync(this.temp_path);
                val = parseInt(c.trim());
            } catch { this.temp_path = null; } 
        }
        
        if (val > 0) this.current.temp = Math.round(val / 1000);
        
    } catch (e) { log(`[Error] Temp: ${e}`); }
  }

  static getCpu() { return this.current.cpu; }
  static getRam() { return this.current.ram; }
  static getNet() { return this.current.net; }
  static getTemp() { return this.current.temp; }

}

const readFileAsync = (path: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const file = Gio.File.new_for_path(path);
        file.load_contents_async(null, (obj, res) => {
            try {
                const [success, contents] = file.load_contents_finish(res);
                if (success) {
                    // @ts-ignore
                    const decoder = new TextDecoder('utf-8');
                    resolve(decoder.decode(contents));
                } else {
                    reject(new Error('Failed to load contents'));
                }
            } catch (e) {
                reject(e);
            }
        });
    });
};

// --- Configuration ---
interface Config {
  layout: {
    padding: number;
    gap_x: number;
    gap_y: number;
    position: 'bottom_left' | 'bottom_right' | 'top_left' | 'top_right';
    scale_factor: number;
    corner_radius: number;
    border_width: number;
    alignment: 'left' | 'center' | 'right' | 'auto';
  };
  emoji: {
    value: string;
    scale: number;
    row: number;
    rotate: number;
  };
  typography: {
    font_family: string;
    icon_font: string;
    time_size: number;
  };
  background: {
    opacity: number;
  };
  clock: {
    format: '12h' | '24h';
    show_ampm: boolean;
  };
  weather: {
    unit: 'C' | 'F';
    refresh_interval_min: number;
    wind_unit: 'km' | 'mi';
  };
  visibility: {
    show_weather: boolean;
    show_computer_metrics: boolean;
    show_divider: boolean;
  };
  performance: {
    dynamic_refresh: boolean;
    refresh_normal_ms: number;
    refresh_eco_ms: number;
  };
}

const CONFIG_DIR = GLib.get_user_config_dir() + "/ags/meowterialyou";
const CONFIG_PATH = CONFIG_DIR + "/config.yaml";
const THEME_CSS_PATH = CONFIG_DIR + "/theme.css";

const defaultConfig: Config = {
  layout: {
    padding: 24,
    gap_x: 12,
    gap_y: 12,
    position: 'bottom_right',
    scale_factor: 1.0,
    corner_radius: 16,
    border_width: 1,
    alignment: 'auto',
  },
  emoji: {
    value: '',
    scale: 1.0,
    row: 1,
    rotate: 0,
  },
  typography: {
    font_family: 'Inter',
    icon_font: 'Material Design Icons Desktop',
    time_size: 48,
  },
  background: {
    opacity: 60,
  },
  clock: {
    format: '12h',
    show_ampm: true,
  },
  weather: {
    unit: 'C',
    refresh_interval_min: 15,
    wind_unit: 'km',
  },
  visibility: {
    show_weather: true,
    show_computer_metrics: true,
    show_divider: true,
  },
  performance: {
    dynamic_refresh: true,
    refresh_normal_ms: 1000,
    refresh_eco_ms: 5000,
  },
};

let config: Config = { ...defaultConfig };

function loadConfig() {
  try {
    const configFile = Gio.File.new_for_path(CONFIG_PATH);
    if (configFile.query_exists(null)) {
      const [success, doc] = configFile.load_contents(null);
      if (success && doc) {
        // @ts-ignore
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(doc);
        const userConfig = yaml.load(text) as Config;

        if (userConfig) {
            config = mergeDeep(defaultConfig, userConfig);
        }
        log(`Configuration loaded from ${CONFIG_PATH}`);
      }
    } else {
      log(`Config file not found at ${CONFIG_PATH}. Using default configuration.`);
    }
  } catch (e) {
    log(`Error loading config: ${e}. Using default configuration.`);
    config = { ...defaultConfig };
  }
}

function isObject(item: any): boolean {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

function mergeDeep<T extends object>(target: T, source: Partial<T>): T {
  let output = { ...target };
  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!(key in target))
          Object.assign(output, { [key]: source[key] });
        else
          output[key] = mergeDeep(target[key], source[key]);
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    }
  }
  return output;
}

// --- Weather Logic Helpers ---
function getGnomeWeatherLocation(): [string, string | null, number, number] | null {
  try {
    const settings = new Gio.Settings({ schema_id: 'org.gnome.Weather' });
    const locations = settings.get_value('locations');

    if (locations.n_children() > 0) {
      const child = locations.get_child_value(0);
      const inner = child.get_variant();
      const locData = inner.get_child_value(1).get_variant();

      const city = locData.get_child_value(0).get_string()[0];
      let code: string | null = null;
      try {
        code = locData.get_child_value(1).get_string()[0];
      } catch (e) { }

      const coordsArray = locData.get_child_value(3);

      if (coordsArray.n_children() > 0) {
        const coord = coordsArray.get_child_value(0);
        const lat = coord.get_child_value(0).get_double();
        const lon = coord.get_child_value(1).get_double();
        return [city, code, lat, lon];
      }
    }
  } catch (e) {
    log(`Error reading GNOME Weather location: ${e}`);
  }
  return null;
}

function getWeatherIconChar(iconName: string): string {
  if (!iconName) return '󰖙';
  const lower = iconName.toLowerCase();
  if (lower.includes('clear') && lower.includes('night')) return '';
  if (lower.includes('clear') || lower.includes('sunny')) return ''; 
  if (lower.includes('few-clouds') || lower.includes('partly')) return '󰖕';
  if (lower.includes('overcast') || lower.includes('cloud')) return '󰖐';
  if (lower.includes('fog') || lower.includes('mist')) return '󰖑';
  if (lower.includes('shower')) return '󰖖';
  if (lower.includes('rain')) return '󰖗';
  if (lower.includes('snow')) return '󰖘';
  if (lower.includes('storm') || lower.includes('thunder')) return '󰖓';
  return '';
}

// --- Styles ---
function applyStyles() {
  let themeContent = '';
  try {
    const themeFile = Gio.File.new_for_path(THEME_CSS_PATH);
    if (themeFile.query_exists(null)) {
      const [success, doc] = themeFile.load_contents(null);
      if (success && doc) {
        // @ts-ignore
        const decoder = new TextDecoder('utf-8');
        themeContent = decoder.decode(doc);
      }
    }
  } catch (e) {
    log(`Error loading theme.css content: ${e}`);
  }

  let bgOpacity = config.background.opacity / 100.0;
  
  const scale = config.layout.scale_factor || 1.0;
  const s = (v: number) => Math.round(v * scale);
  
  const borderWidth = (config.layout.border_width !== undefined) ? config.layout.border_width : 1;

  const dynamicCss = `
        /* Prepended Theme Colors */
        ${themeContent}
        
        /* Dynamic Styles */
        window { background-color: transparent; }

        .background-layer {
            border-radius: ${s(config.layout.corner_radius)}px;
        }

        .glass-overlay {
            background-color: alpha(@widget_bg, ${bgOpacity});
            border-radius: ${s(config.layout.corner_radius)}px;
            border: ${s(borderWidth)}px solid alpha(@outline, 0.15);
        }

        .date {
            font-family: "${config.typography.font_family}", sans-serif;
            font-size: ${s(14)}px;
            font-weight: 500;
            color: @onSurface;
        }

        .time {
            font-family: "${config.typography.font_family}", sans-serif;
            font-size: ${s(config.typography.time_size)}px;
            font-weight: bold;
            color: @primary;
            letter-spacing: -${s(1)}px;
        }

        .ampm {
            font-family: "${config.typography.font_family}", sans-serif;
            font-size: ${s(16)}px;
            font-weight: 500;
            color: @onSurfaceVariant;
        }

        .weather-icon {
            font-family: "${config.typography.icon_font}", monospace;
            font-size: ${s(32)}px;
            color: @primary;
        }

        .weather-temp {
            font-family: "${config.typography.font_family}", sans-serif;
            font-size: ${s(24)}px;
            font-weight: bold;
            color: @onSurface;
        }

        .weather-desc {
            font-family: "${config.typography.font_family}", sans-serif;
            font-size: ${s(14)}px;
            font-weight: 500;
            color: @onSurfaceVariant;
        }

        .weather-city {
            font-family: "${config.typography.font_family}", sans-serif;
            font-size: ${s(14)}px;
            color: @onSurfaceVariant;
            opacity: 1.0;
            font-weight: 500;
        }

        .detail {
            font-family: "${config.typography.icon_font}", "${config.typography.font_family}", monospace;
            font-size: ${s(14)}px;
            color: @onSurfaceVariant;
            opacity: 0.9;
        }
        
        .sys-icon {
            font-family: "${config.typography.icon_font}", monospace;
            font-size: ${s(18)}px;
            color: @primary;
        }
        .divider {
            background-color: @onSurfaceVariant;
            min-height: 1px;
            opacity: 0.15;
        }
    `;

  const styleProvider = new Gtk.CssProvider();
  // @ts-ignore
  styleProvider.load_from_data(dynamicCss);

  Gtk.StyleContext.add_provider_for_screen(
    Gdk.Screen.get_default()!,
    styleProvider,
    Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION + 10
  );
}

// --- Initialization ---
// @ts-ignore
Gtk.init(null);
loadConfig();
applyStyles();

// Helper for UI construction scaling
const scale = config.layout.scale_factor || 1.0;
const s = (v: number) => Math.round(v * scale);

// Helper for Alignment
const getAlign = () => {
    const a = config.layout.alignment || 'auto';
    const pos = config.layout.position;
    
    if (a === 'center') return { gtk: Gtk.Align.CENTER, x: 0.5, isRight: false, isCenter: true };
    if (a === 'left') return { gtk: Gtk.Align.START, x: 0, isRight: false, isCenter: false };
    if (a === 'right') return { gtk: Gtk.Align.END, x: 1.0, isRight: true, isCenter: false };
    
    // Auto
    if (pos.includes('left')) return { gtk: Gtk.Align.START, x: 0, isRight: false, isCenter: false };
    return { gtk: Gtk.Align.END, x: 1.0, isRight: true, isCenter: false };
};
const ALIGN = getAlign();

// --- Window & UI ---
const win = new Gtk.Window({
  type: Gtk.WindowType.TOPLEVEL,
  decorated: false,
  skip_taskbar_hint: true,
  skip_pager_hint: true,
  accept_focus: false,
});
win.set_title('MeowterialYou Widget');

// Set WM Class/Role for Compositor Rules
win.set_wmclass('meowterialyou-widget', 'MeowterialYou Widget');
win.set_role('meowterialyou-widget');

win.set_app_paintable(true);
const visual = win.get_screen()?.get_rgba_visual();
if (visual) win.set_visual(visual);

win.set_type_hint(Gdk.WindowTypeHint.NORMAL);
win.set_keep_below(true);
win.stick();

// Nested Architecture: Wrapper (Background) -> Glass Overlay -> Content (Padding)
const wrapper = new Gtk.Box({
  orientation: Gtk.Orientation.VERTICAL,
});
wrapper.get_style_context().add_class('background-layer');

// Glass tint overlay
const glassOverlay = new Gtk.Box({
  orientation: Gtk.Orientation.VERTICAL,
});
glassOverlay.get_style_context().add_class('glass-overlay');

const content = new Gtk.Box({
  orientation: Gtk.Orientation.VERTICAL,
  spacing: s(6),
  margin: s(config.layout.padding),
});

// Custom Emoji Helper
const createEmojiLabel = () => {
    if (config.emoji && config.emoji.value) {
        const emojiLabel = new Gtk.Label({ label: config.emoji.value });
        
        // Determine Base Size based on Row
        // Row 1 (Date) ~ 14px
        // Row 2 (Time) ~ config.typography.time_size (default 48px)
        const targetRow = config.emoji.row || 1;
        const baseSize = targetRow === 2 ? config.typography.time_size : 14;
        
        // Calculate raw size
        const rawSize = baseSize * (config.emoji.scale || 1.0);
        
        // CLAMP: Max size is the base row height (user request)
        // We allow shrinking (scale < 1.0) but cap growing > 1.0 relative to row height
        // Actually, user said "max should be the row height", implies cap at baseSize.
        const finalSize = s(Math.min(rawSize, baseSize));
        
        const cssProv = new Gtk.CssProvider();
        cssProv.load_from_data(`.emoji-custom { font-size: ${finalSize}px; }`);
        
        // Use a higher priority (APPLICATION + 20) to ensure we override the base .date style
        emojiLabel.get_style_context().add_provider(cssProv, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION + 20);
        emojiLabel.get_style_context().add_class('date'); 
        emojiLabel.get_style_context().add_class('emoji-custom');
        
        if (config.emoji.rotate) {
            emojiLabel.set_angle(config.emoji.rotate);
        }
        
        return emojiLabel;
    }
    return null;
};

// Row 1: Date & Optional Emoji
const dateRow = new Gtk.Box({
  orientation: Gtk.Orientation.HORIZONTAL,
  spacing: s(12),
  halign: ALIGN.isCenter ? Gtk.Align.CENTER : Gtk.Align.FILL, // Fill to allow justifying
});

const dateLabel = new Gtk.Label({
  label: '...',
  halign: ALIGN.gtk,
  xalign: ALIGN.x,
});
dateLabel.get_style_context().add_class('date');

const dateSpacer = new Gtk.Box({ hexpand: true }); // Spring

// Packing Logic for Date Row
if ((config.emoji?.row ?? 1) === 1) {
    const e = createEmojiLabel();
    if (e) {
        if (ALIGN.isRight) {
             // Right Align: [Emoji] <space> [Date]
             dateRow.pack_start(e, false, false, 0);
             dateRow.pack_start(dateSpacer, true, true, 0);
             dateRow.pack_start(dateLabel, false, false, 0);
        } else {
             // Left/Center Align: [Date] <space> [Emoji]
             // Note: If Center, spacer might behave oddly, but user asked for "End".
             // For Center, maybe just next to it? 
             // "flips and becomes left when alignment is right" implies specific behavior for L/R.
             // Let's stick to justify for L/R. For Center, keep neighbors?
             // User prompt: "ofc this flips... when alignment is right".
             
             if (ALIGN.isCenter) {
                 // Center: [Date] [Emoji] (Just packed)
                 dateRow.pack_start(dateLabel, false, false, 0);
                 dateRow.pack_start(e, false, false, 0);
             } else {
                 // Left: [Date] <space> [Emoji]
                 dateRow.pack_start(dateLabel, false, false, 0);
                 dateRow.pack_start(dateSpacer, true, true, 0);
                 dateRow.pack_start(e, false, false, 0);
             }
        }
    } else {
         // No emoji, just label
         // Use pack_start with expand=false to respect alignment? 
         // Since halign=FILL, we need to justify the label ourselves if we want it strictly left/right?
         // No, if no emoji, we can likely just pack it. 
         // But if halign=FILL, label at start=Left.
         // If Right align, we need spacer first?
         if (ALIGN.isRight) {
             dateRow.pack_end(dateLabel, false, false, 0); // Pack end = Right
         } else if (ALIGN.isCenter) {
             dateRow.set_halign(Gtk.Align.CENTER);
             dateRow.pack_start(dateLabel, false, false, 0);
         } else {
             dateRow.pack_start(dateLabel, false, false, 0);
         }
    }
} else {
    // Emoji not on this row
    if (ALIGN.isRight) dateRow.pack_end(dateLabel, false, false, 0);
    else if (ALIGN.isCenter) {
             dateRow.set_halign(Gtk.Align.CENTER);
             dateRow.pack_start(dateLabel, false, false, 0);
    }
    else dateRow.pack_start(dateLabel, false, false, 0);
}

content.pack_start(dateRow, false, false, 0);

// Row 2: Time
const timeRow = new Gtk.Box({
  orientation: Gtk.Orientation.HORIZONTAL,
  halign: ALIGN.isCenter ? Gtk.Align.CENTER : Gtk.Align.FILL,
});

// Group Time + AMPM
const timeGroup = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: s(6)
});

const timeLabel = new Gtk.Label({ label: '...' });
timeLabel.get_style_context().add_class('time');
const ampmLabel = new Gtk.Label({
  label: '...',
  valign: Gtk.Align.END,
  margin_bottom: s(8),
});
ampmLabel.get_style_context().add_class('ampm');
timeGroup.pack_start(timeLabel, false, false, 0);
timeGroup.pack_start(ampmLabel, false, false, 0);

const timeSpacer = new Gtk.Box({ hexpand: true });

// Packing Logic for Time Row
if (config.emoji?.row === 2) {
    const e = createEmojiLabel();
    if (e) {
         if (ALIGN.isRight) {
             // [Emoji] <space> [TimeGroup]
             timeRow.pack_start(e, false, false, 0);
             timeRow.pack_start(timeSpacer, true, true, 0);
             timeRow.pack_start(timeGroup, false, false, 0);
         } else {
             if (ALIGN.isCenter) {
                 timeRow.pack_start(timeGroup, false, false, 0);
                 timeRow.pack_start(e, false, false, 0);
             } else {
                 // [TimeGroup] <space> [Emoji]
                 timeRow.pack_start(timeGroup, false, false, 0);
                 timeRow.pack_start(timeSpacer, true, true, 0);
                 timeRow.pack_start(e, false, false, 0);
             }
         }
    } else {
        if (ALIGN.isRight) timeRow.pack_end(timeGroup, false, false, 0);
        else if (ALIGN.isCenter) {
             timeRow.set_halign(Gtk.Align.CENTER);
             timeRow.pack_start(timeGroup, false, false, 0);
        }
        else timeRow.pack_start(timeGroup, false, false, 0);
    }
} else {
    if (ALIGN.isRight) timeRow.pack_end(timeGroup, false, false, 0);
    else if (ALIGN.isCenter) {
         timeRow.set_halign(Gtk.Align.CENTER);
         timeRow.pack_start(timeGroup, false, false, 0);
    }
    else timeRow.pack_start(timeGroup, false, false, 0);
}

content.pack_start(timeRow, false, false, 0);

// Row 3: Weather
const weatherRow = new Gtk.Box({
  orientation: Gtk.Orientation.HORIZONTAL,
  spacing: s(124),
});

const tempBox = new Gtk.Box({
  orientation: Gtk.Orientation.HORIZONTAL,
  valign: Gtk.Align.CENTER,
});
const wIcon = new Gtk.Label({ label: '' });
wIcon.get_style_context().add_class('weather-icon');
const wTemp = new Gtk.Label({ label: '--' });
wTemp.get_style_context().add_class('weather-temp');
tempBox.pack_start(wIcon, false, false, 0);
tempBox.pack_start(wTemp, false, false, s(6));

const infoBox = new Gtk.Box({
  orientation: Gtk.Orientation.VERTICAL,
  valign: Gtk.Align.CENTER,
  hexpand: true,
});
infoBox.set_margin_start(s(40));
const wDesc = new Gtk.Label({
  label: 'Unknown',
  halign: ALIGN.gtk === Gtk.Align.START ? Gtk.Align.END : Gtk.Align.START,
  xalign: ALIGN.x === 0 ? 1.0 : 0,
});
wDesc.get_style_context().add_class('weather-desc');
const wCity = new Gtk.Label({
  label: 'Location',
  halign: ALIGN.gtk === Gtk.Align.START ? Gtk.Align.END : Gtk.Align.START,
  xalign: ALIGN.x === 0 ? 1.0 : 0,
});
wCity.get_style_context().add_class('weather-city');
infoBox.pack_start(wDesc, false, false, 0);
infoBox.pack_start(wCity, false, false, 0);

weatherRow.pack_start(tempBox, false, false, 0);
weatherRow.pack_end(infoBox, true, true, 0); 
content.pack_start(weatherRow, false, false, 0);

// Row 4: Details
const detailRow = new Gtk.Box({
  orientation: Gtk.Orientation.HORIZONTAL,
  halign: ALIGN.gtk,
  margin_top: s(6),
});
const windLabel = new Gtk.Label({ label: '󰖝 --' });
windLabel.get_style_context().add_class('detail');
const humidLabel = new Gtk.Label({ label: '󰖎 --%', margin_left: s(16) });
humidLabel.get_style_context().add_class('detail');
detailRow.pack_start(windLabel, false, false, 0);
detailRow.pack_start(humidLabel, false, false, 0);
content.pack_start(detailRow, false, false, 0);

// Row 5: Divider line
const divider = new Gtk.Box({
  orientation: Gtk.Orientation.HORIZONTAL,
  margin_top: s(6),
  margin_bottom: s(6),
});
divider.get_style_context().add_class('divider');
content.pack_start(divider, false, false, 0);

// Row 6: System Metrics
const sysRow = new Gtk.Box({
  orientation: Gtk.Orientation.HORIZONTAL,
  spacing: 0, // Springs handle spacing
  halign: Gtk.Align.FILL, // Always fill width to allow justifying
  hexpand: true,
});
const createSysItem = (icon: string, labelV: string) => {
  const box = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: s(6),
  });
  const i = new Gtk.Label({ label: icon });
  i.get_style_context().add_class('sys-icon');
  const l = new Gtk.Label({ label: labelV });
  l.get_style_context().add_class('detail');
  box.pack_start(i, false, false, 0);
  box.pack_start(l, false, false, 0);
  return { box, label: l };
};

const cpuWidget = createSysItem('', '0%');
const ramWidget = createSysItem('', '0%');
const netWidget = createSysItem('', '0 KB/s');
const tempWidget = createSysItem('', '0°C');

// Justify Space Between: [Item] <spring> [Item] <spring> ...
const s1 = new Gtk.Box({ hexpand: true });
const s2 = new Gtk.Box({ hexpand: true });
const s3 = new Gtk.Box({ hexpand: true });

sysRow.pack_start(cpuWidget.box, false, false, 0);
sysRow.pack_start(s1, true, true, 0);
sysRow.pack_start(ramWidget.box, false, false, 0);
sysRow.pack_start(s2, true, true, 0);
sysRow.pack_start(netWidget.box, false, false, 0);
sysRow.pack_start(s3, true, true, 0);
sysRow.pack_start(tempWidget.box, false, false, 0);

content.pack_start(sysRow, false, false, 0);

// --- Event-Driven Smart Refresh ---
const PerfState = {
    isMaximized: false
};

let currentInterval = config.performance.refresh_normal_ms;

if (config.performance.dynamic_refresh) {
    try {
        const screen = Wnck.Screen.get_default();
        screen.force_update();

        const updateState = () => {
            let foundMax = false;
            const activeWorkspace = screen.get_active_workspace();
            const windows = screen.get_windows();
            
            for (let i = 0; i < windows.length; i++) {
                const w = windows[i];
                const isOnCurrent = (w.get_workspace() === activeWorkspace) || w.is_pinned();
                
                if (w.is_maximized() && !w.is_minimized() && isOnCurrent) {
                    foundMax = true;
                    break;
                }
            }
            PerfState.isMaximized = foundMax;
        };

        const connectWin = (win: any) => {
            // @ts-ignore
            win.connect('state-changed', () => updateState());
        };

        // @ts-ignore
        screen.connect('window-opened', (_, win) => {
            connectWin(win);
            updateState();
        });
        
        // @ts-ignore
        screen.connect('window-closed', () => updateState());

        // Connect existing
        // @ts-ignore
        screen.get_windows().forEach(connectWin);
        
        // Initial check
        updateState();
        
    } catch(e) {
        log(`[WARNING] Failed to init Wnck events: ${e}`);
    }
}

// Metrics Loop with Dynamic Interval
const updateMetrics = async () => {
    // 1. Refresh Data (Async)
    await SystemMonitor.refresh();

    // 2. Update UI
    cpuWidget.label.set_label(`${SystemMonitor.getCpu()}%`);
    ramWidget.label.set_label(`${SystemMonitor.getRam()}%`);
    netWidget.label.set_label(SystemMonitor.getNet());
    tempWidget.label.set_label(`${SystemMonitor.getTemp()}°C`);

    // 3. Decide next interval (Reads cached state, no polling)
    if (config.performance.dynamic_refresh) {
        currentInterval = PerfState.isMaximized 
            ? config.performance.refresh_eco_ms 
            : config.performance.refresh_normal_ms;
    } else {
        currentInterval = config.performance.refresh_normal_ms;
    }
    
    // Reschedule
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, currentInterval, () => {
        updateMetrics();
        return false;
    });
};

// Pack Content into Glass Overlay
glassOverlay.pack_start(content, true, true, 0);

// Pack Glass Overlay into Wrapper (Background)
wrapper.pack_start(glassOverlay, true, true, 0);
win.add(wrapper);

// --- Positioning ---
win.connect('size-allocate', () => {
  const display = win.get_display();
  const monitor = display.get_primary_monitor() || display.get_monitor(0);
  if (monitor) {
    const geom = monitor.get_geometry();
    const alloc = win.get_allocation();
    let x = 0,
      y = 0;
    const { position, gap_x, gap_y } = config.layout;

    if (position === 'bottom_left') {
      x = geom.x + gap_x;
      y = geom.y + geom.height - alloc.height - gap_y;
    } else if (position === 'bottom_right') {
      x = geom.x + geom.width - alloc.width - gap_x;
      y = geom.y + geom.height - alloc.height - gap_y;
    } else if (position === 'top_left') {
      x = geom.x + gap_x;
      y = geom.y + gap_y;
    } else if (position === 'top_right') {
      x = geom.x + geom.width - alloc.width - gap_x;
      y = geom.y + gap_y;
    }
    win.move(x, y);
  }
});

// --- Logic ---
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
  const now = GLib.DateTime.new_now_local();
  
  const is12h = config.clock.format !== '24h';
  const timeFormat = is12h ? "%I:%M" : "%H:%M";
  
  timeLabel.label = now.format(timeFormat) || '...';
  
  if (is12h && config.clock.show_ampm) {
      ampmLabel.label = now.format("%p") || '';
      ampmLabel.visible = true;
  } else {
      ampmLabel.visible = false;
  }
  
  dateLabel.label = now.format("%a, %b %d") || '...';
  return true;
});

function initWeather() {
  let location: GWeather.Location;
  const sysLoc = getGnomeWeatherLocation();

  if (sysLoc) {
    const [city, code, lat, lon] = sysLoc;
    log(
      `[DEBUG] Found system weather location: ${city} (Code: ${code}, ${lat}, ${lon})`
    );
    location = GWeather.Location.new_detached(city, code, lat, lon);
    wCity.label = city;
  } else {
    log(`[DEBUG] System weather location not found, falling back to Pokhara`);
    location = GWeather.Location.new_detached(
      'Pokhara',
      'VNPK',
      28.2096 * (Math.PI / 180.0),
      83.9856 * (Math.PI / 180.0)
    );
    wCity.label = 'Pokhara';
  }

  if (!config.visibility.show_weather) return;

  const info = new GWeather.Info({
    location: location,
    application_id: 'meowterialyou.widget',
    contact_info: 'https://github.com/meowterialyou',
    enabled_providers: GWeather.Provider.MET_NO,
  });

  // Explicitly set again to be sure
  info.set_enabled_providers(GWeather.Provider.MET_NO);

  info.connect('updated', () => {
    const unit = config.weather.unit === 'F' ? GWeather.TemperatureUnit.FAHRENHEIT : GWeather.TemperatureUnit.CENTIGRADE;
    const [ok, temp] = info.get_value_temp(unit);
    const iconName = info.get_icon_name();
    const summary = info.get_weather_summary();

    // Use legacy getters if available or fallbacks
    // @ts-ignore
    const humidity = info.get_humidity ? info.get_humidity() : '';
    
    // Wind Logic
    let windStr = '';
    try {
        const speedUnit = config.weather.wind_unit === 'mi' 
            ? GWeather.SpeedUnit.MPH 
            : GWeather.SpeedUnit.KPH;
            
        // get_value_wind returns [ok, speed, direction_enum]
        const [windOk, windSpeed, windDirEnum] = info.get_value_wind(speedUnit);
        
        if (windOk) {
            const unitLabel = config.weather.wind_unit === 'mi' ? 'mph' : 'km/h';
            
            let dirStr = '';
            const rawDir = GWeather.wind_direction_to_string(windDirEnum);
            
            if (rawDir) {
               dirStr = rawDir;
            }

            windStr = `${Math.round(windSpeed)} ${unitLabel} ${dirStr}`;
        }
    } catch (e) {
        log(`[WARNING] Failed to get wind speed: ${e}`);
    }

    // Force update UI
    const unitSymbol = config.weather.unit === 'F' ? '°F' : '°';
    wTemp.label = ok ? `${Math.round(temp)}${unitSymbol}` : `--${unitSymbol}`;
    wIcon.label = getWeatherIconChar(iconName || '');

    // Strip city from summary
    let desc = summary || '';

    // Fallback logic
    if (!desc || desc.toLowerCase().includes('unknown') || desc === '??') {
        if (iconName) {
            const lowerIcon = iconName.toLowerCase();
            if (lowerIcon.includes('clear') || lowerIcon.includes('fair') || lowerIcon.includes('sunny')) desc = 'Clear';
            else if (lowerIcon.includes('cloud') || lowerIcon.includes('overcast')) desc = 'Cloudy';
            else if (lowerIcon.includes('fog') || lowerIcon.includes('mist')) desc = 'Foggy';
            else if (lowerIcon.includes('rain') || lowerIcon.includes('showers')) desc = 'Rain';
            else if (lowerIcon.includes('snow')) desc = 'Snow';
            else if (lowerIcon.includes('storm') || lowerIcon.includes('thunder')) desc = 'Storm';
            else desc = '...'; 
        } else {
             desc = '...';
        }
    }

    if (
      desc.toLowerCase().includes('failed') ||
      desc.toLowerCase().includes('error')
    ) {
      desc = 'Offline';
    }

    const locName = location.get_name();
    if (locName && desc.includes(locName)) {
      desc = desc.replace(locName, '').trim();
      desc = desc.replace(/^[:\s-]+|[:\s-]+$/g, '');
    }
    
    if (desc.length > 20) desc = desc.substring(0, 20) + '...';
    
    wDesc.label = desc;

    if (humidity) humidLabel.label = `󰖎 ${humidity}`;
    if (windStr) windLabel.label = `󰖝 ${windStr}`;
  });

  // Initial update
  info.update();
  
  const intervalMin = Math.max(1, config.weather.refresh_interval_min || 10);
  const intervalMs = intervalMin * 60 * 1000;
  
  GLib.timeout_add(GLib.PRIORITY_DEFAULT, intervalMs, () => {
    info.update();
    return true;
  });
}
initWeather();

win.connect("destroy", Gtk.main_quit);

// --- Async Startup ---
GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
    (async () => {
        try {
            log('[INFO] Warming up system sensors...');
            await SystemMonitor.init();
            
            await new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                resolve(true);
                return false;
            }));
            
            await updateMetrics();
            
            win.show_all();
            log('[INFO] Widget started with valid metrics.');
            
        } catch (e) {
            log(`[ERROR] Startup failed: ${e}`);
            win.show_all();
        }
    })();
    return false;
});

Gtk.main();
