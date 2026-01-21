
import { readFileAsync } from '../utils.js';

// State for network rate calculation
let lastNetBytes = 0;
let lastNetTime = 0;

export const getSystemStats = () => {
    let uptime = '0h 0m';
    let load = '0.00';
    let mem = '0%';
    let temp = '0°C';
    let net = '0 K/s';

    // Uptime
    const upSec = parseFloat(readFileAsync('/proc/uptime').split(' ')[0]);
    if (!isNaN(upSec)) {
        const h = Math.floor(upSec / 3600);
        const m = Math.floor((upSec % 3600) / 60);
        uptime = `${h}h ${m}m`;
    }

    // Load
    const loadStr = readFileAsync('/proc/loadavg').split(' ')[0];
    if (loadStr) load = loadStr;

    // Mem
    const memInfo = readFileAsync('/proc/meminfo');
    const totalMatch = memInfo.match(/MemTotal:\s+(\d+)/);
    const availMatch = memInfo.match(/MemAvailable:\s+(\d+)/);
    if (totalMatch && availMatch) {
       const total = parseInt(totalMatch[1]);
       const avail = parseInt(availMatch[1]);
       const used = total - avail;
       const percent = Math.round((used / total) * 100);
       mem = `${percent}%`;
    }

    // Temp (try a few zones)
    let tempVal = 0;
    try {
       const t = readFileAsync('/sys/class/thermal/thermal_zone0/temp');
       if (t) tempVal = parseInt(t) / 1000;
    } catch(e) {}
    temp = `${Math.round(tempVal)}°C`;
    
    // Network Rate
    try {
        const netDev = readFileAsync('/proc/net/dev');
        const lines = netDev.split('\n');
        let totalBytes = 0;
        // Sum rx_bytes for all non-lo/virtual interfaces usually, or just sum everything?
        // Let's sum everything for simplicity, or specific iface
        for (const line of lines) {
            if (line.includes(':')) {
                const parts = line.split(':')[1].trim().split(/\s+/);
                const rx = parseInt(parts[0]); // rx_bytes
                if (!isNaN(rx)) totalBytes += rx;
            }
        }
        
        const now = Date.now();
        if (lastNetTime > 0) {
            const deltaT = (now - lastNetTime) / 1000; // seconds
            if (deltaT > 0) {
                const deltaB = totalBytes - lastNetBytes;
                const rate = deltaB / deltaT; // bytes/sec
                
                if (rate < 1024) net = `${Math.round(rate)} B/s`;
                else if (rate < 1024 * 1024) net = `${(rate / 1024).toFixed(1)} K/s`;
                else net = `${(rate / (1024 * 1024)).toFixed(1)} M/s`;
            }
        }
        lastNetBytes = totalBytes;
        lastNetTime = now;
    } catch(e) {}

    return { uptime, load, mem, temp, net };
};
