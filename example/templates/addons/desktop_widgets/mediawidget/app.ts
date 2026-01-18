// @ts-nocheck
import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import GLib from 'gi://GLib?version=2.0';
import Gio from 'gi://Gio?version=2.0';
import GdkPixbuf from 'gi://GdkPixbuf?version=2.0';
import Pango from 'gi://Pango?version=1.0';
import yaml from 'js-yaml';

const log = (msg: string) => print(msg);
const decoder = new TextDecoder('utf-8');

// --- Config ---
interface Config {
  layout: {
    position: string;
    width: number;
    height: number;
    gap_x: number;
    gap_y: number;
  };
  appearance: {
    corner_radius: number;
    blur_art: boolean;
  };
  controls: {
    show_next_prev: boolean;
  };
}

let config: Config = {
  layout: { position: 'bottom_right', width: 360, height: 140, gap_x: 24, gap_y: 60 },
  appearance: { corner_radius: 16, blur_art: true },
  controls: { show_next_prev: true },
};

const SCRIPT_DIR = GLib.path_get_dirname(imports.system.programInvocationName);
const CONFIG_PATH = `${SCRIPT_DIR}/config.yaml`;
const THEME_CSS_PATH = `${SCRIPT_DIR}/theme.css`;

log(`[DEBUG] Widget Starting in: ${SCRIPT_DIR}`);

// --- Helpers ---
const formatTime = (microSeconds: number): string => {
    if (!microSeconds || microSeconds < 0) return '0:00';
    const totalSeconds = Math.floor(microSeconds / 1000000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

// --- MPRIS D-Bus Proxy ---
const MPRIS_PLAYER_INTERFACE = `
<node>
  <interface name="org.mpris.MediaPlayer2.Player">
    <method name="PlayPause"/>
    <method name="Next"/>
    <method name="Previous"/>
    <method name="Play"/>
    <method name="Pause"/>
    <method name="SetPosition">
        <arg type="o" name="TrackId" direction="in"/>
        <arg type="x" name="Position" direction="in"/>
    </method>
    <property name="PlaybackStatus" type="s" access="read"/>
    <property name="Metadata" type="a{sv}" access="read"/>
    <property name="Position" type="x" access="read"/>
  </interface>
</node>`;

const PROPS_INTERFACE = `
<node>
  <interface name="org.freedesktop.DBus.Properties">
    <method name="Get">
        <arg type="s" name="interface_name" direction="in"/>
        <arg type="s" name="property_name" direction="in"/>
        <arg type="v" name="value" direction="out"/>
    </method>
    <signal name="PropertiesChanged">
      <arg type="s" name="interface_name"/>
      <arg type="a{sv}" name="changed_properties"/>
      <arg type="as" name="invalidated_properties"/>
    </signal>
  </interface>
</node>`;

const PlayerProxy = Gio.DBusProxy.makeProxyWrapper(MPRIS_PLAYER_INTERFACE);
const PropsProxy = Gio.DBusProxy.makeProxyWrapper(PROPS_INTERFACE);

let currentPlayer: any = null;
let currentProps: any = null;
let currentBusName: string | null = null;
let pollTimeoutId: number | null = null;

// --- State ---
const State = {
  title: 'No Media',
  artist: 'Idle',
  artUrl: '',
  isPlaying: false,
  length: 0, 
  position: 0,
  position: 0,
  lastUpdate: 0,
  trackId: ''
};

let isDragging = false;

// --- Helpers ---
const downloadArt = (url: string, callback: (path: string | null) => void) => {
  if (!url || !url.startsWith('http')) {
      if (url && url.startsWith('file://')) {
          callback(url.replace('file://', ''));
          return;
      }
      callback(null);
      return;
  }
  const hash = GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, url, -1);
  const cachePath = `${GLib.get_user_cache_dir()}/meowterialyou-art-${hash}.jpg`;
  if (GLib.file_test(cachePath, GLib.FileTest.EXISTS)) {
      callback(cachePath);
      return;
  }
  try {
     const proc = Gio.Subprocess.new(['curl', '-L', url, '-o', cachePath], Gio.SubprocessFlags.NONE);
     proc.wait_check_async(null, (obj, res) => {
         try {
             if (proc.wait_check_finish(res)) callback(cachePath);
             else callback(null);
         } catch (e) { callback(null); }
     });
  } catch (e) { callback(null); }
};

// --- App Logic ---
function updateUI() {
    titleLabel.label = State.title;
    artistLabel.label = State.artist;
    const iconName = State.isPlaying ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
    playBtnImage.icon_name = iconName;
    
    if (State.artUrl) {
        downloadArt(State.artUrl, (path) => {
            if (path) {
                try {
                    const targetSize = 135;
                    // Load original first to dimensions
                    let pixbuf = GdkPixbuf.Pixbuf.new_from_file(path);
                    let w = pixbuf.get_width();
                    let h = pixbuf.get_height();
                    
                    // "Cover" logic: Scale so smallest side matches target
                    let scale = Math.max(targetSize / w, targetSize / h);
                    let newW = Math.floor(w * scale);
                    let newH = Math.floor(h * scale);
                    
                    // Scale it up/down
                    let scaled = pixbuf.scale_simple(newW, newH, GdkPixbuf.InterpType.BILINEAR);
                    
                    // Center Crop
                    let offsetX = Math.floor((newW - targetSize) / 2);
                    let offsetY = Math.floor((newH - targetSize) / 2);
                    
                    // Clamp offsets (just in case)
                    if (offsetX < 0) offsetX = 0;
                    if (offsetY < 0) offsetY = 0;
                    
                    // Create subpixbuf (Crop)
                    let cropped = scaled.new_subpixbuf(offsetX, offsetY, Math.min(targetSize, newW), Math.min(targetSize, newH));
                    
                    artImage.set_from_pixbuf(cropped);
                } catch (e) { artImage.set_from_icon_name('audio-x-generic', Gtk.IconSize.DIALOG); }
            } else { artImage.set_from_icon_name('audio-x-generic', Gtk.IconSize.DIALOG); }
        });
    } else { artImage.set_from_icon_name('audio-x-generic', Gtk.IconSize.DIALOG); }
}

function updateProgress() {
    if (!currentPlayer) return true;
    
    // Explicit Polling for Metadata/Status to fix "Not Synced"
    // Many players (e.g. Spotify) are lazy with signals.
    try {
        const metadata = currentPlayer.Metadata;
        parseMetadata(metadata);
        
        const status = currentPlayer.PlaybackStatus;
        State.isPlaying = (status === 'Playing');
    } catch(e) {}
    
    // Position Update
    try {
        const now = GLib.get_monotonic_time();
        if (State.isPlaying) {
             const delta = now - State.lastUpdate;
             State.position += delta;
             State.lastUpdate = now;
        }
        if (State.position > State.length) State.position = State.length;
        
        if (State.position > State.length) State.position = State.length;
        
        const fraction = State.length > 0 ? (State.position / State.length) * 100 : 0;
        if (!isDragging) scale.set_value(fraction);
        
        lblCurrent.label = formatTime(State.position);
        lblTotal.label = formatTime(State.length);
        
        updateUI(); // Keep UI fresh
        
    } catch (e) { }
    return true; 
}

function parseMetadata(metadata: any) {
    if (!metadata) return;
    const unpack = (v: any) => {
        if (v && v.deep_unpack) return v.deep_unpack();
        if (v && v.unpack) return v.unpack();
        return v;
    };
    
    let title = "Unknown Title";
    let artist = "Unknown Artist";
    let artUrl = "";
    let length = 0;
    
    if (metadata['xesam:title']) title = unpack(metadata['xesam:title']);
    if (metadata['xesam:artist']) {
        const artists = unpack(metadata['xesam:artist']);
        if (Array.isArray(artists)) artist = artists.join(", ");
        else artist = String(artists);
    }
    if (metadata['mpris:artUrl']) artUrl = unpack(metadata['mpris:artUrl']);
    if (metadata['mpris:length']) length = unpack(metadata['mpris:length']);
    
    let trackId = '';
    if (metadata['mpris:trackid']) trackId = unpack(metadata['mpris:trackid']);

    
    if (typeof title !== 'string') title = String(title);
    if (typeof artist !== 'string') artist = String(artist);
    
    // Only update state if changed (avoids flickering art)
    if (State.title !== title) {
        State.title = title;
        State.artist = artist;
        State.artUrl = artUrl;
        State.length = Number(length) || 0;
        State.trackId = trackId;
        
        // Force Position Sync on track change
        if (currentPlayer && currentBusName) {
             Gio.DBus.session.call(
                currentBusName!, '/org/mpris/MediaPlayer2', 'org.freedesktop.DBus.Properties',
                'Get', new GLib.Variant('(ss)', ['org.mpris.MediaPlayer2.Player', 'Position']),
                null, 0, -1, null,
                (obj, res) => {
                    try {
                        const val = Gio.DBus.session.call_finish(res);
                        const [unpacked] = val.deep_unpack();
                        State.position = unpacked.deep_unpack ? unpacked.deep_unpack() : unpacked;
                        State.lastUpdate = GLib.get_monotonic_time();
                    } catch(e) {}
                }
            );
        }
    }
}

function connectToPlayer(busName: string) {
    currentBusName = busName;
    log(`Connecting to ${busName}`);
    currentPlayer = new PlayerProxy(Gio.DBus.session, busName, '/org/mpris/MediaPlayer2');
    currentProps = new PropsProxy(Gio.DBus.session, busName, '/org/mpris/MediaPlayer2');
    
    currentProps.connectSignal('PropertiesChanged', (proxy: any, senderName: string, [iface, changed, invalidated]: [string, any, any]) => {
         // Keep signal handler for responsiveness, but rely on Polling for reliability
         if (iface !== 'org.mpris.MediaPlayer2.Player') return;
         const changedUnpacked = changed.deep_unpack ? changed.deep_unpack() : changed;
         if (changedUnpacked['PlaybackStatus']) {
             State.isPlaying = (changedUnpacked['PlaybackStatus'] === 'Playing');
             updateUI();
         }
    });

    if (!pollTimeoutId) pollTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, updateProgress);
}

function findPlayers() {
    Gio.DBus.session.call(
        'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'ListNames',
        null, null, 0, -1, null,
        (obj, res) => {
            try {
                const result = Gio.DBus.session.call_finish(res);
                const [names] = result.deep_unpack();
                const players = names.filter((n: string) => n.startsWith('org.mpris.MediaPlayer2.'));
                if (players.length > 0) {
                    const spotify = players.find((n: string) => n.includes('spotify'));
                    connectToPlayer(spotify || players[0]);
                } else {
                    State.title = "No Player";
                    updateUI();
                }
            } catch (e) {}
        }
    );
}

// Watch for players
Gio.DBus.session.signal_subscribe( 'org.freedesktop.DBus', 'org.freedesktop.DBus', 'NameOwnerChanged', '/org/freedesktop/DBus', null, Gio.DBusSignalFlags.NONE,
    (conn, sender, path, iface, signal, p) => {
        const [name, oldOwner, newOwner] = p.deep_unpack();
        if (name.startsWith('org.mpris.MediaPlayer2.')) {
            if (newOwner && !oldOwner && (!currentBusName || name.includes('spotify'))) connectToPlayer(name);
        }
    }
);

Gtk.init(null);

// Pre-load Theme
let themeContent = '';
let bgStyle = 'smart_transparency';
let calculatedOpacity = 80;
let stackOffsetY = 0;
let forcedWidth: number | null = null;

try {
  const tFile = Gio.File.new_for_path(THEME_CSS_PATH);
  const [ok, doc] = tFile.load_contents(null);
  if (ok) {
     themeContent = decoder.decode(doc);
     const opaMatch = themeContent.match(/WIDGET_CALCULATED_OPACITY:\s*(\d+)/);
     if (opaMatch) calculatedOpacity = parseInt(opaMatch[1], 10);
     const styMatch = themeContent.match(/WIDGET_BG_STYLE:\s*(\w+)/);
     if (styMatch) bgStyle = styMatch[1];
     
     // Stacking & Layout Logic
     const stackMatch = themeContent.match(/WIDGET_STACK_OFFSET_Y:\s*(\d+)/);
     if (stackMatch) stackOffsetY = parseInt(stackMatch[1], 10);
     
     const widthMatch = themeContent.match(/WIDGET_FORCED_WIDTH:\s*(\d+)/);
     if (widthMatch) forcedWidth = parseInt(widthMatch[1], 10);
  }
} catch (e) {}

const loadConfig = () => {
  try {
    const file = Gio.File.new_for_path(CONFIG_PATH);
    const [success, contents] = file.load_contents(null);
    if (success) {
      const parsed = yaml.load(decoder.decode(contents)) as any;
      if (parsed) {
        config = { ...config, ...parsed };
        if (parsed.layout) config.layout = { ...config.layout, ...parsed.layout };
        
        // Use forced width if available from stacking logic (max width in zone)
        // Otherwise use config width (default 360)
        config.layout.width = forcedWidth || Number(config.layout.width) || 360;
        config.layout.height = Number(config.layout.height) || 140;
      }
    }
  } catch (e) {}
};
loadConfig();

// --- DEBUG MODE WINDOW SETUP ---
const win = new Gtk.Window({
  type: Gtk.WindowType.TOPLEVEL, // Changed from TOPLEVEL (with Dock hint) to pure TOPLEVEL
  title: 'MeowterialYou-Widget-mediawidget',
  decorated: false,
  skip_taskbar_hint: true,
  skip_pager_hint: true,
  accept_focus: true,
});
win.set_wmclass('MeowterialYou-Widget-mediawidget', 'MeowterialYou-Widget-mediawidget');
win.set_role('MeowterialYou-Widget-mediawidget');
// Window Properties: Cleared (Managed at bottom in 'INTERACTIVITY FIX' block)
// win.set_keep_above(false);
// win.set_type_hint(Gdk.WindowTypeHint.NORMAL);
win.set_app_paintable(true);
const visual = win.get_screen()?.get_rgba_visual();
if (visual) win.set_visual(visual);
win.set_size_request(config.layout.width, config.layout.height);
win.set_resizable(false);

const css = new Gtk.CssProvider();
const bgOpacity = bgStyle === 'smart_transparency' ? calculatedOpacity / 100 : 0.8;

css.load_from_data(`
    ${themeContent}
    .view {
        background-color: alpha(@widget_bg, ${bgOpacity});
        border-radius: ${config.appearance.corner_radius}px;
        border: 1px solid alpha(@outline, 0.1);
        padding: 16px;
    }
    .art-container {
        border-radius: 16px;
        background-color: @surfaceVariant;
        box-shadow: 0 4px 12px alpha(black, 0.2);
    }
    .title { font-weight: 800; font-size: 16px; color: @widget_text; margin-bottom: 2px; }
    .artist { font-size: 13px; color: @widget_text_secondary; font-weight: 600; opacity: 0.8; }
    
    .control-btn { 
        background: @surfaceVariant; 
        color: @widget_text; 
        min-width: 42px; min-height: 42px; 
        padding: 0; margin: 0 2px; 
        border-radius: 14px; /* Squircle/Rosette hint */
        border: none;
    }
    .control-btn:hover { background: alpha(@widget_text, 0.1); }
    .control-btn:active { background: alpha(@widget_text, 0.2); }
    
    .play-btn {
        background: @widget_primary; 
        color: @onPrimary; 
        min-width: 80px; /* Wide Pill */
        border-radius: 24px; 
        margin: 0 6px;
    }
    .play-btn:hover { background: alpha(@widget_primary, 0.9); box-shadow: 0 4px 12px alpha(@widget_primary, 0.3); }

    /* Modern Slider */
    scale {
        margin: 0; padding: 0;
    }
    scale trough {
        min-height: 6px;
        border-radius: 3px;
        background: alpha(@widget_text, 0.1);
    }
    scale highlight {
        min-height: 6px;
        border-radius: 3px;
        background: @widget_primary;
    }
    scale slider {
        min-width: 16px; min-height: 16px;
        border-radius: 50%;
        background: @widget_primary;
        box-shadow: 0 2px 4px alpha(black, 0.2);
        margin: -5px 0; /* Center on track */
    }
    .time-label { font-size: 11px; font-weight: 600; color: @widget_text_secondary; margin-top: 0px; }
`);
Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default()!, css, 900);

const mainBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 20 });
mainBox.get_style_context().add_class('view');

const artBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
artBox.set_valign(Gtk.Align.CENTER);
const artImage = new Gtk.Image({ icon_name: 'audio-x-generic', pixel_size: 135 });
artBox.pack_start(artImage, false, false, 0);
artBox.get_style_context().add_class('art-container'); 
// No margins - fill the box


const detailsBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
detailsBox.set_valign(Gtk.Align.CENTER);
detailsBox.set_hexpand(true);

const titleLabel = new Gtk.Label({ label: 'Waiting...', halign: Gtk.Align.CENTER, max_width_chars: 20, wrap: true, lines: 2, ellipsize: Pango.EllipsizeMode.END });
titleLabel.get_style_context().add_class('title');
const artistLabel = new Gtk.Label({ label: 'System Check', halign: Gtk.Align.CENTER, max_width_chars: 25, ellipsize: Pango.EllipsizeMode.END });
artistLabel.get_style_context().add_class('artist');

const controlsBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
controlsBox.get_style_context().add_class('controls-box');

const prevBtn = new Gtk.Button();
const prevIcon = new Gtk.Image({ icon_name: 'media-skip-backward-symbolic', pixel_size: 18 });
prevBtn.add(prevIcon);
prevBtn.get_style_context().add_class('control-btn');
prevBtn.connect('clicked', () => { 
    log('[DEBUG] CLICK: Prev'); 
    currentPlayer && currentPlayer.PreviousRemote(); 
    lowerWin();
});

const playBtn = new Gtk.Button();
const playBtnImage = new Gtk.Image({ icon_name: 'media-playback-start-symbolic', pixel_size: 28 });
playBtn.add(playBtnImage);
playBtn.get_style_context().add_class('control-btn');
playBtn.get_style_context().add_class('play-btn');
playBtn.connect('clicked', () => { 
    log('[DEBUG] CLICK: Play'); 
    currentPlayer && currentPlayer.PlayPauseRemote(); 
    lowerWin();
});

const nextBtn = new Gtk.Button();
const nextIcon = new Gtk.Image({ icon_name: 'media-skip-forward-symbolic', pixel_size: 18 });
nextBtn.add(nextIcon);
nextBtn.get_style_context().add_class('control-btn');
nextBtn.connect('clicked', () => { 
    log('[DEBUG] CLICK: Next'); 
    currentPlayer && currentPlayer.NextRemote(); 
    lowerWin();
});

controlsBox.pack_start(prevBtn, false, false, 0);
controlsBox.pack_start(playBtn, false, false, 0);
controlsBox.pack_start(nextBtn, false, false, 0);

const progressBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 0 });

// Interactive Slider
const scale = new Gtk.Scale({ orientation: Gtk.Orientation.HORIZONTAL, draw_value: false });
scale.set_range(0, 100);
scale.set_increments(5, 10);
scale.get_style_context().add_class('progress-bar');
// Seeking Logic
scale.connect('change-value', (s, scrollType, value) => {
   // Use SetPosition logic if needed, but 'change-value' is tricky in GJS sometimes.
   // Simpler: Use 'button-release-event' to commit seek?
   // Or standard range 'value-changed'.
   // NOTE: We must prevent the update loop from overwriting this while dragging.
   return false; // Propagate
});
scale.connect('button-press-event', () => {
   isDragging = true;
   lowerWin(); // Interaction lowers window
   return false;
});
scale.connect('button-release-event', () => {
   isDragging = false;
   const val = scale.get_value();
   log(`[DEBUG] SEEK to ${val}% of ${State.length}`);
   if (State.length > 0 && currentPlayer && State.trackId) {
       // Calc microseconds: (val / 100) * length
       const targetMicro = (val / 100) * State.length;
       // Try SetPosition (requires TrackId)
       try {
           currentPlayer.SetPositionRemote(State.trackId, targetMicro);
       } catch(e) { logError(e, 'Seek failed'); }
   }
   lowerWin();
   return false;
});

const timeBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
const lblCurrent = new Gtk.Label({ label: '0:00', halign: Gtk.Align.START });
lblCurrent.get_style_context().add_class('time-label');
const lblTotal = new Gtk.Label({ label: '0:00', halign: Gtk.Align.END });
lblTotal.get_style_context().add_class('time-label');
const spacer = new Gtk.Label({ label: '' }); spacer.set_hexpand(true);
timeBox.pack_start(lblCurrent, false, false, 0);
timeBox.pack_start(spacer, true, true, 0);
timeBox.pack_start(lblTotal, false, false, 0);
progressBox.pack_start(scale, false, false, 0);
progressBox.pack_start(timeBox, false, false, 0);

detailsBox.pack_start(titleLabel, false, false, 0);
detailsBox.pack_start(artistLabel, false, false, 0);
detailsBox.pack_start(controlsBox, false, false, 0);
detailsBox.pack_start(progressBox, false, false, 0);
mainBox.pack_start(artBox, false, false, 0);
mainBox.pack_start(detailsBox, true, true, 0);

win.add(mainBox);

// INTERACTIVITY FIX:
// "Dock" window type + Keep Below + Sticky = Desktop Widget behavior.
win.set_titlebar(null);
win.set_keep_above(false);
win.set_keep_below(false); 
win.set_type_hint(Gdk.WindowTypeHint.NORMAL);
win.set_decorated(false); 
win.set_skip_taskbar_hint(true);
win.set_skip_pager_hint(true);
win.set_accept_focus(true); // Allow clicks
win.stick();

// AGGRESSIVE LOWERING STRATEGY:
// KeepBelow kills clicks on XWayland. We must manually manage z-order.
// 1. Lower on startup
win.connect('map-event', () => { 
    const gdkWin = win.get_window();
    if (gdkWin) gdkWin.lower(); 
});
// 2. Lower when losing focus (e.g. clicking wallpaper or another app)
// RELENTLESS LOWERING STRATEGY:
// 1. Hammer 'lower()' on startup to defeat WM initial placement
let lowerCount = 0;
GLib.timeout_add(GLib.PRIORITY_LOW, 200, () => {
    const gw = win.get_window();
    if (gw) gw.lower();
    lowerCount++;
    return lowerCount < 20; // Run for ~4 seconds
});

// 2. Lower immediately after interaction (Fixes "Pushes apps behind")
const lowerWin = () => { const gw = win.get_window(); if(gw) gw.lower(); };

win.connect('focus-out-event', () => { lowerWin(); return false; });
// Also lower on focus-in to strictly forbid raising? No, might block click.

// Drag Support (Guaranteed to work on Normal windows)
mainBox.add_events(Gdk.EventMask.BUTTON_PRESS_MASK);
mainBox.connect('button-press-event', (widget, event) => {
    if (event.get_button()[1] === 1) {
       win.begin_move_drag(event.get_button()[1], event.x_root, event.y_root, event.get_time());
       lowerWin(); // Lower after drag starts
    }
    return false;
});
win.stick(); // Visible on all workspaces

// --- Positioning ---
// FORCE LOCAL CALCULATION:
// domain.py calculates physical pixels (e.g. 2496 on 2880 screen).
// GTK on HiDPI often expects Logical pixels. Resulting in window clamping (Gap 0).
// We calculate locally using standard Logical metrics to ensure correct placement.

let initialPosSet = false;
win.connect('size-allocate', () => {
   if (initialPosSet) return;
   
   const display = win.get_display();
   const monitor = display.get_primary_monitor() || display.get_monitor(0);
   
   if (monitor) {
       const geo = monitor.get_geometry();
       const alloc = win.get_allocation();
       
       const width = alloc.width; // Use REAL width, not config guess
       const height = alloc.height; // Use REAL height
       
       const gapX = config.layout.gap_x;
       const gapY = config.layout.gap_y;
       
       log(`[DEBUG] Screen Geometry: ${geo.width}x${geo.height}`);
       log(`[DEBUG] Real Window Alloc: ${width}x${height}`);
       log(`[DEBUG] Desired Gap: ${gapX}, ${gapY}`);
       
       log(`[DEBUG] Desired Gap: ${gapX}, ${gapY}`);
       
       let x = 0;
       let y = 0;
       const position = config.layout.position || 'bottom_right';
       log(`[DEBUG] Align Mode: ${position}`);

       // X Logic
       if (position.includes('left')) {
           x = gapX;
       } else {
           // Right Align
           const shadowComp = 12; // Compensate for right-side shadow extension
           x = geo.width - width - gapX - shadowComp;
       }

       // Y Logic
       if (position.includes('top')) {
           y = gapY + stackOffsetY;
       } else {
           // Bottom Align
           y = geo.height - height - gapY - stackOffsetY;
       }
       
       log(`[DEBUG] Calculated Position (Stack Offset ${stackOffsetY}): ${x}, ${y}`);
       win.move(x, y);
       initialPosSet = true;
   }
});

win.connect('destroy', Gtk.main_quit);
win.show_all();

findPlayers();
Gtk.main();
