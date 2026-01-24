use std::fs;
use std::time::Instant;
use std::sync::Mutex;
use once_cell::sync::Lazy;

struct NetState {
    last_bytes: u64,
    last_time: Instant,
}

static NET_STATE: Lazy<Mutex<NetState>> = Lazy::new(|| {
    Mutex::new(NetState {
        last_bytes: 0,
        last_time: Instant::now(),
    })
});

struct CpuState {
    last_total: u64,
    last_idle: u64,
}

static CPU_STATE: Lazy<Mutex<CpuState>> = Lazy::new(|| {
    Mutex::new(CpuState {
        last_total: 0,
        last_idle: 0,
    })
});

pub fn get_system_stats() -> crate::widgets::weather_widget::state::SystemStats {
    let mut stats = crate::widgets::weather_widget::state::SystemStats::default();

    // Uptime
    if let Ok(content) = fs::read_to_string("/proc/uptime") {
        if let Some(up_sec_str) = content.split_whitespace().next() {
            if let Ok(up_sec) = up_sec_str.parse::<f64>() {
                let h = (up_sec / 3600.0) as u64;
                let m = ((up_sec % 3600.0) / 60.0) as u64;
                stats.uptime = format!("{}h {}m", h, m);
            }
        }
    }

    // CPU % calculation from /proc/stat
    if let Ok(content) = fs::read_to_string("/proc/stat") {
        if let Some(line) = content.lines().next() {
            let parts: Vec<u64> = line.split_whitespace().skip(1).filter_map(|s| s.parse().ok()).collect();
            if parts.len() >= 7 {
                let idle = parts[3];
                let total: u64 = parts.iter().sum();
                
                let mut cpu_state = CPU_STATE.lock().unwrap();
                let diff_total = total - cpu_state.last_total;
                let diff_idle = idle - cpu_state.last_idle;
                
                if diff_total > 0 {
                    let usage = 100 * (diff_total - diff_idle) / diff_total;
                    stats.load = format!("{}%", usage);
                }
                
                cpu_state.last_total = total;
                cpu_state.last_idle = idle;
            }
        }
    }

    // Mem
    if let Ok(content) = fs::read_to_string("/proc/meminfo") {
        let mut total = 0;
        let mut avail = 0;
        for line in content.lines() {
            if line.starts_with("MemTotal:") {
                total = line.split_whitespace().nth(1).and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
            } else if line.starts_with("MemAvailable:") {
                avail = line.split_whitespace().nth(1).and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
            }
        }
        if total > 0 {
            let used = total - avail;
            let percent = ((used as f64 / total as f64) * 100.0).round() as u64;
            stats.mem = format!("{}%", percent);
        }
    }

    // Temp
    let mut temp_val = 0.0;
    let temp_paths = ["/sys/class/thermal/thermal_zone0/temp", "/sys/class/thermal/thermal_zone1/temp", "/sys/class/hwmon/hwmon0/temp1_input"];
    for path in temp_paths {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(t) = content.trim().parse::<i64>() {
                temp_val = t as f64 / 1000.0;
                break;
            }
        }
    }
    stats.temp = format!("{}°C", temp_val.round() as i64);

    // Network Rate
    if let Ok(content) = fs::read_to_string("/proc/net/dev") {
        let mut total_bytes = 0u64;
        for line in content.lines() {
            if line.contains(':') {
                let parts: Vec<&str> = line.split(':').nth(1).unwrap_or("").split_whitespace().collect();
                if let Some(rx_str) = parts.get(0) {
                    if let Ok(rx) = rx_str.parse::<u64>() {
                        total_bytes += rx;
                    }
                }
                if let Some(tx_str) = parts.get(8) {
                    if let Ok(tx) = tx_str.parse::<u64>() {
                        total_bytes += tx;
                    }
                }
            }
        }

        let mut net_state = NET_STATE.lock().unwrap();
        let now = Instant::now();
        let delta_t = now.duration_since(net_state.last_time).as_secs_f64();

        if delta_t > 0.0 && net_state.last_bytes > 0 {
            let delta_b = if total_bytes >= net_state.last_bytes {
                total_bytes - net_state.last_bytes
            } else {
                0
            };
            let rate = delta_b as f64 / delta_t;

            if rate < 1024.0 {
                stats.net = format!("{} B", rate.round());
            } else if rate < 1024.0 * 1024.0 {
                stats.net = format!("{:.0} K", rate / 1024.0);
            } else {
                stats.net = format!("{:.1} M", rate / (1024.0 * 1024.0));
            }
        }
        net_state.last_bytes = total_bytes;
        net_state.last_time = now;
    }

    stats
}
