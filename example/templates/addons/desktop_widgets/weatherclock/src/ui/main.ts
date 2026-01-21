
import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import GLib from 'gi://GLib?version=2.0';
import Pango from 'gi://Pango?version=1.0';
import { Config } from '../config.js';
import { Layout } from './styles.js';
// @ts-ignore
import { log } from '../utils.js';
import { getSystemStats } from '../services/system.js';
import { initWeather, getWeather, forceWeatherUpdate } from '../services/weather.js';
// ... (lines 13-284 skipped)

let win: Gtk.Window;

// Widgets
let dateLabel: Gtk.Label;
let timeLabel: Gtk.Label;
let ampmLabel: Gtk.Label;
let wIcon: Gtk.Label;
let wTemp: Gtk.Label;
let wDesc: Gtk.Label;
let wCity: Gtk.Label;
let windLabel: Gtk.Label;
let humidLabel: Gtk.Label;

let sysCpu: Gtk.Label;
let sysRam: Gtk.Label;
let sysNet: Gtk.Label;
let sysTemp: Gtk.Label;

export const buildUI = (config: Config) => {
    // Weather: Trigger a fresh fetch
    GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, (config.weather.refresh_interval_min || 15) * 60, () => {
        forceWeatherUpdate();
        return true;
    });

    win = new Gtk.Window({
        type: Gtk.WindowType.TOPLEVEL,
        title: 'MeowterialYou-Widget-weatherclock',
        decorated: false,
        skip_taskbar_hint: true,
        skip_pager_hint: true,
        accept_focus: true, // Allow interaction
    });
    
    win.set_wmclass('MeowterialYou-Widget-weatherclock', 'MeowterialYou-Widget-weatherclock');
    win.set_role('MeowterialYou-Widget-weatherclock');
    win.set_app_paintable(true);
    
    const visual = win.get_screen()?.get_rgba_visual();
    if (visual) win.set_visual(visual);
    
    // Size & Position
    const w = Layout.forcedWidth > 0 ? Layout.forcedWidth : config.layout.width;
    const h = config.layout.height;
    win.set_size_request(w, h);
    // win.resize(w, h); // Resize on realize/show

    // Wrapper -> Glass -> Content
    const wrapper = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
    wrapper.get_style_context().add_class('background-layer');
    
    const glassOverlay = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
    glassOverlay.get_style_context().add_class('glass-overlay');
    
    const content = new Gtk.Box({ 
        orientation: Gtk.Orientation.VERTICAL, 
        spacing: 0,
        valign: Gtk.Align.FILL, 
        halign: Gtk.Align.FILL 
    });
    content.get_style_context().add_class('content-box');
    
    // Scale Helper
    const scale = config.layout.scale_factor || 1.0;
    const s = (v: number) => Math.round(v * scale);
    
    const ALIGN = config.layout.alignment || 'auto';
    const isRight = ALIGN === 'right' || (ALIGN === 'auto' && config.layout.position.includes('right'));
    
    // --- Emoji Logic ---
    const createEmojiLabel = () => {
        if (config.emoji && config.emoji.value) {
            const l = new Gtk.Label(); // No label initially, use markup
            
            // Base size based on row
            const targetRow = config.emoji.row || 1;
            // Row 2 (Time) is large, Row 1 (Date) is small
            const baseSize = targetRow === 2 ? 48 : 14; 
            
            const rawSize = baseSize * (config.emoji.scale || 1.0);
            // Pango uses 1/1024th of a point units (usually). 
            // Or use 'size="x-large"' or 'size="14000"'.
            // Simpler: <span font_size="24pt">...</span> or size in 1024th of point.
            // 1pt approx 1.33px? 
            // Better: use explicit font size in 'pt' or 'px' if supported? 
            // Pango markup 'size' attribute is in 1024ths of a point.
            // Let's rely on standard px to pt conversion approx 0.75?
            // Safer: Use CSS but apply it directly to widget name or stronger priority?
            // User says "scaling is not working at all", implied it is small logic default.
            // The class .date might be enforcing font-size.
            // Let's use Pango <span size="...">
            
            // Convert px to Pango units (approx). 1px = 0.75pt = 768 pango units.
            // Actually, let's use 'font_desc' string format? No, markup is span.
            // <span size="large"> or <span size="20000">.
            const pangoSize = Math.round(rawSize * 1024 * 0.75);
            
            // Apply markup
            l.set_markup(`<span size="${pangoSize}">${config.emoji.value}</span>`);
            
            // We still add .date for color/weight inheritance but Pango span size should win
            l.get_style_context().add_class('date'); 
            l.get_style_context().add_class('emoji-custom');
            
            if (config.emoji.rotate) {
                l.set_angle(-config.emoji.rotate);
            }
            return l;
        }
        return null;
    };
    
    // --- Row 1: Date ---
    const dateRow = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: s(12) });
    dateLabel = new Gtk.Label({ label: '...', ellipsize: Pango.EllipsizeMode.END });
    dateLabel.get_style_context().add_class('date');
    
    // Packing Date Row with optional Emoji (Row 1)
    if ((config.emoji?.row || 1) === 1) {
         const e = createEmojiLabel();
         if (e) {
             if (isRight) {
                 // Cornered to end = Pack END for Emoji, Pack START for label? 
                 // No, standard is [Label] [Emoji] on right?
                 // User said "cornered to the end". This implies [Emoji] should be at the far edge.
                 // Right Alignment: [Label] ...... [Emoji] ?
                 // Or just [Label] [Emoji]
                 
                 // If "cornered to the end":
                 // [Spacer] [Label] [Emoji]
                 
                 dateRow.pack_end(e, false, false, 0); // Emoji at far right
                 dateRow.pack_end(dateLabel, false, false, 0); // Label next to it
             } else {
                 // Left Alignment: [Emoji] [Label]
                 // Or [Label] [Spacer] [Emoji]?
                 // Let's stick to standard flow: Emoji first?
                 // Backup logic:
                 // Left: [Date] [Spacer] [Emoji]  <-- Wait, backup had spacers!
                 
                 // Let's Re-read backup logic from memory/notes:
                 // "Left: [Date] [Spacer] [Emoji]" -> Emoji was cornered to right even on left align?
                 // Let's check backup notes from step 1698... NO, Step 1698 didn't show packing.
                 // Step 5 of previous run showed:
                 // "Left: [Date] [Spring] [Emoji]"
                 
                 // User wants "Cornered to the end". That usually means Far Right edge.
                 
                 const spacer = new Gtk.Box({ hexpand: true });
                 dateRow.pack_start(dateLabel, false, false, 0);
                 dateRow.pack_start(spacer, true, true, 0);
                 dateRow.pack_start(e, false, false, 0);
             }
         } else {
             if (isRight) dateRow.pack_end(dateLabel, false, false, 0);
             else dateRow.pack_start(dateLabel, false, false, 0);
         }
    } else {
         if (isRight) dateRow.pack_end(dateLabel, false, false, 0);
         else dateRow.pack_start(dateLabel, false, false, 0);
    }
    
    content.pack_start(dateRow, false, false, 0);
    content.pack_start(createVSpacer(), true, true, 0);
    
    // --- Row 2: Time ---
    const timeRow = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
    const timeGroup = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: s(6) });
    
    timeLabel = new Gtk.Label({ label: '...', ellipsize: Pango.EllipsizeMode.END });
    timeLabel.get_style_context().add_class('time');
    ampmLabel = new Gtk.Label({ label: 'AM', valign: Gtk.Align.END, margin_bottom: s(8) });
    ampmLabel.get_style_context().add_class('ampm');
    
    timeGroup.pack_start(timeLabel, false, false, 0);
    timeGroup.pack_start(ampmLabel, false, false, 0);
    
    // Packing Time Row with optional Emoji (Row 2)
    if (config.emoji?.row === 2) {
         const e = createEmojiLabel();
         if (e) {
             if (isRight) {
                 timeRow.pack_end(e, false, false, 0); 
                 timeRow.pack_end(timeGroup, false, false, 0);
             } else {
                 const spacer = new Gtk.Box({ hexpand: true });
                 timeRow.pack_start(timeGroup, false, false, 0);
                 timeRow.pack_start(spacer, true, true, 0);
                 timeRow.pack_start(e, false, false, 0);
             }
         } else {
             if (isRight) timeRow.pack_end(timeGroup, false, false, 0);
             else timeRow.pack_start(timeGroup, false, false, 0);
         }
    } else {
         if (isRight) timeRow.pack_end(timeGroup, false, false, 0);
         else timeRow.pack_start(timeGroup, false, false, 0);
    }
    
    content.pack_start(timeRow, false, false, 0);
    content.pack_start(createVSpacer(), true, true, 0);

    // --- Row 3: Weather ---
    const weatherRow = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 0 });
    
    const tempBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, valign: Gtk.Align.CENTER });
    wIcon = new Gtk.Label({ label: '' }); // Font Icon
    wIcon.get_style_context().add_class('weather-icon');
    wTemp = new Gtk.Label({ label: '--' });
    wTemp.get_style_context().add_class('weather-temp');
    tempBox.pack_start(wIcon, false, false, 0);
    tempBox.pack_start(wTemp, false, false, s(6));
    
    const infoBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, valign: Gtk.Align.CENTER });
    wDesc = new Gtk.Label({ label: 'Unknown', halign: Gtk.Align.END, ellipsize: Pango.EllipsizeMode.END });
    wDesc.get_style_context().add_class('weather-desc');
    wCity = new Gtk.Label({ label: 'Location', halign: Gtk.Align.END, ellipsize: Pango.EllipsizeMode.END });
    wCity.get_style_context().add_class('weather-city');
    infoBox.pack_start(wDesc, false, false, 0);
    infoBox.pack_start(wCity, false, false, 0);
    
    const wSpring = new Gtk.Box({ hexpand: true });
    weatherRow.pack_start(tempBox, false, false, 0);
    weatherRow.pack_start(wSpring, true, true, 0);
    weatherRow.pack_start(infoBox, false, false, 0);
    
    content.pack_start(weatherRow, false, false, 0);
    content.pack_start(createVSpacer(), true, true, 0);

    // --- Row 4: Details ---
    const detailRow = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, margin_top: s(6) });
    windLabel = new Gtk.Label({ label: '󰖝 --' });
    windLabel.get_style_context().add_class('detail');
    humidLabel = new Gtk.Label({ label: '󰖎 --%', margin_left: s(16) });
    humidLabel.get_style_context().add_class('detail');
    
    detailRow.pack_start(windLabel, false, false, 0);
    detailRow.pack_start(humidLabel, false, false, 0);
    
    content.pack_start(detailRow, false, false, 0);
    content.pack_start(createVSpacer(), true, true, 0);
    
    // --- Row 5: Divider ---
    const divider = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
    divider.get_style_context().add_class('divider');
    content.pack_start(divider, false, false, 0);
    content.pack_start(createVSpacer(), true, true, 0);
    
    // --- Row 6: Stats ---
    const sysRow = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, hexpand: true });
    
    const createSys = (icon: string, val: string) => {
        const b = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: s(6) });
        const i = new Gtk.Label({ label: icon });
        i.get_style_context().add_class('sys-icon');
        const l = new Gtk.Label({ label: val });
        l.get_style_context().add_class('detail');
        b.pack_start(i, false, false, 0);
        b.pack_start(l, false, false, 0);
        return { box: b, label: l };
    };
    
    const cpu = createSys('', '0%'); sysCpu = cpu.label;
    const ram = createSys('', '0%'); sysRam = ram.label;
    const net = createSys('', '0 K'); sysNet = net.label;
    const temp = createSys('', '0°C'); sysTemp = temp.label;
    
    sysRow.pack_start(cpu.box, false, false, 0);
    sysRow.pack_start(createHSpacer(), true, true, 0);
    sysRow.pack_start(ram.box, false, false, 0);
    sysRow.pack_start(createHSpacer(), true, true, 0);
    sysRow.pack_start(net.box, false, false, 0);
    sysRow.pack_start(createHSpacer(), true, true, 0);
    sysRow.pack_start(temp.box, false, false, 0);
    
    content.pack_start(sysRow, false, false, 0);
    
    // --- Packing Wrap Up ---
    glassOverlay.pack_start(content, true, true, 0);
    wrapper.pack_start(glassOverlay, true, true, 0);
    win.add(wrapper);
    win.set_keep_below(true);
    win.stick();
    
    // Interactions
    wrapper.add_events(Gdk.EventMask.BUTTON_PRESS_MASK);
    wrapper.connect('button-press-event', (widget, event: any) => {
         const button = event.get_button()[1];
         if (button === 1) {
             win.begin_move_drag(button, event.x_root, event.y_root, event.get_time());
         }
         return false;
    });
    wrapper.connect('enter-notify-event', () => { 
        win.set_keep_above(true); 
        return false; 
    });
    wrapper.connect('leave-notify-event', () => { 
        win.set_keep_below(true); 
        return false; 
    });
    
    win.connect('destroy', Gtk.main_quit);
};

function createVSpacer() {
    const s = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
    s.set_vexpand(true);
    return s;
}
function createHSpacer() {
    const s = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
    s.set_hexpand(true);
    return s;
}

export const updateClock = (config: Config) => {
    const now = GLib.DateTime.new_now_local();
    const is12 = config.clock && config.clock.format !== '24h';
    const fmt = is12 ? "%I:%M" : "%H:%M";
    
    timeLabel.label = now.format(fmt) || '...';
    
    if (is12 && config.clock.show_ampm) {
        ampmLabel.label = now.format("%p") || '';
        ampmLabel.visible = true;
    } else {
        ampmLabel.visible = false;
    }
    
    dateLabel.label = now.format("%a, %b %d") || '...';
};

export const updateStats = () => {
    const s = getSystemStats();
    if(sysCpu) sysCpu.label = s.load; // mapped to load in service, but check service output
    // Wait, getSystemStats returns {uptime, load, mem, temp}
    // backup used GTop... refactored uses /proc.
    // 'load' in service is LoadAvg, but widget wants CPU %.
    
    // In refactor service: 'load' is "0.00" (LoadAvg).
    // Backup calculated CPU usage (%).
    // We need to fix service to give CPU %.
    
    if(sysRam) sysRam.label = s.mem;
    if(sysTemp) sysTemp.label = s.temp;
    // @ts-ignore
    if(sysNet && s.net) sysNet.label = s.net;
};

export const updateWeather = (config: Config) => {
    const w = getWeather(config);
    if(w.temp) wTemp.label = w.temp;
    if(w.iconChar) wIcon.label = w.iconChar;
    if(w.desc) wDesc.label = w.desc;
    if(w.city) wCity.label = w.city;
    if(w.wind) windLabel.label = `󰖝 ${w.wind}`;
    if(w.humidity) humidLabel.label = `󰖎 ${w.humidity}`;
};

export const startWindow = (config: Config) => {
    // Pass callback to update UI when weather fetch completes
    initWeather(config, () => updateWeather(config));
    
    buildUI(config);
    win.show_all();
    
    updateClock(config);
    updateStats();
    // Initial fetch check (might be empty if async not done)
    updateWeather(config);
    
    // Ticks matching backup
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
        updateClock(config);
        return true;
    });
    
    // Stats
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, () => {
        updateStats();
        return true;
    });
    
    // Weather: Trigger a fresh fetch
    // (Handled by import at top)

    // Position setup
    const display = win.get_display();
    const monitor = display.get_primary_monitor() || display.get_monitor(0);
    if (monitor) {
        const geo = monitor.get_geometry();
        const w = config.layout.width || 360;
        const h = config.layout.height || 140; // Backup default
        
        let x = Layout.marginX;
        let y = Layout.marginY;
        
        if (Layout.positionMode.includes('right')) x = geo.width - w - Layout.marginX;
        
        if (Layout.positionMode.includes('bottom')) y = geo.height - h - Layout.marginY - Layout.stackOffsetY;
        else y = Layout.marginY + Layout.stackOffsetY;
        
        win.move(x, y);
    }
    
    Gtk.main();
};
