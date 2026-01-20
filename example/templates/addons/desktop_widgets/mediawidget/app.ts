// @ts-nocheck
import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import GLib from 'gi://GLib?version=2.0';
import Gio from 'gi://Gio?version=2.0';
import GdkPixbuf from 'gi://GdkPixbuf?version=2.0';
import Pango from 'gi://Pango?version=1.0';
import yaml from 'js-yaml';

const log = (msg: string) => print(msg);
const Cairo = imports.cairo;
const decoder = new TextDecoder('utf-8');

// --- Config ---
interface Config {
  layout: {
    position: string;
    width: number;
    height: number;
    gap: number[];
  };
  appearance: {
    corner_radius: number;
  };
  controls: {
    show_next_prev: boolean;
  };
}

let config: Config = {
  layout: { position: 'bottom_right', width: 360, height: 140, gap: [24, 60] },
  appearance: { corner_radius: 16 },
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
  position: 0,
  lastUpdate: 0,
  trackId: '',
  players: [] as string[],
  currentArtPath: null as string | null,
  lastArtSize: 0,
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
const roundPixbuf = (pixbuf: any, radius: number) => {
  if (!pixbuf) return null;
  const w = pixbuf.get_width();
  const h = pixbuf.get_height();
  const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, w, h);
  const cr = new Cairo.Context(surface);

  // Create rounded path
  cr.arc(radius, radius, radius, Math.PI, 1.5 * Math.PI);
  cr.arc(w - radius, radius, radius, 1.5 * Math.PI, 0);
  cr.arc(w - radius, h - radius, radius, 0, 0.5 * Math.PI);
  cr.arc(radius, h - radius, radius, 0.5 * Math.PI, Math.PI);
  cr.closePath();
  cr.clip();

  // Paint pixbuf
  Gdk.cairo_set_source_pixbuf(cr, pixbuf, 0, 0);
  cr.paint();

  // Convert back to pixbuf
  return Gdk.pixbuf_get_from_surface(surface, 0, 0, w, h);
};

const updateArt = (path: string | null, size: number) => {
  if (!path) {
    artImage.set_from_icon_name('audio-x-generic', Gtk.IconSize.DIALOG);
    return;
  }
  // Optimization: Don't re-process if same path and size
  // if (State.currentArtPath === path && State.lastArtSize === size) return;

  try {
    // Load original first to dimensions
    let pixbuf = GdkPixbuf.Pixbuf.new_from_file(path);
    let w = pixbuf.get_width();
    let h = pixbuf.get_height();

    // "Cover" logic: Scale so smallest side matches target
    let scale = Math.max(size / w, size / h);
    let newW = Math.floor(w * scale);
    let newH = Math.floor(h * scale);

    // Scale it up/down
    let scaled = pixbuf.scale_simple(newW, newH, GdkPixbuf.InterpType.BILINEAR);

    // Center Crop
    let offsetX = Math.floor((newW - size) / 2);
    let offsetY = Math.floor((newH - size) / 2);

    // Clamp offsets (just in case)
    if (offsetX < 0) offsetX = 0;
    if (offsetY < 0) offsetY = 0;

    // Create subpixbuf (Crop)
    let cropped = scaled.new_subpixbuf(
      offsetX,
      offsetY,
      Math.min(size, newW),
      Math.min(size, newH),
    );

    // Round Corners
    const radius = config.appearance.corner_radius || 16;
    let rounded = roundPixbuf(cropped, radius);

    if (rounded) artImage.set_from_pixbuf(rounded);
    else artImage.set_from_pixbuf(cropped);

    State.currentArtPath = path;
    State.lastArtSize = size;
  } catch (e) {
    artImage.set_from_icon_name('audio-x-generic', Gtk.IconSize.DIALOG);
  }
};

function updateUI() {
  if (titleLabel.label !== State.title) {
    titleLabel.label = State.title;
    if (typeof titleLabel2 !== 'undefined') titleLabel2.label = State.title;
    if (typeof resetMarquee === 'function') resetMarquee();
  }
  artistLabel.label = State.artist;
  const iconName = State.isPlaying
    ? 'media-playback-pause-symbolic'
    : 'media-playback-start-symbolic';
  playBtnImage.icon_name = iconName;

  if (State.artUrl) {
    downloadArt(State.artUrl, (path) => {
      if (path) {
        // Ensure we have a size to render to, else default
        const currentSize = State.lastArtSize || 135;
        updateArt(path, currentSize);
      } else {
        updateArt(null, 0);
      }
    });
  } else {
    updateArt(null, 0);
  }
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
  renderDots(); // Update active dot
  log(`Connecting to ${busName}`);
  currentPlayer = new PlayerProxy(
    Gio.DBus.session,
    busName,
    '/org/mpris/MediaPlayer2',
  );
  currentProps = new PropsProxy(
    Gio.DBus.session,
    busName,
    '/org/mpris/MediaPlayer2',
  );

  currentProps.connectSignal(
    'PropertiesChanged',
    (
      proxy: any,
      senderName: string,
      [iface, changed, invalidated]: [string, any, any],
    ) => {
      // Keep signal handler for responsiveness, but rely on Polling for reliability
      if (iface !== 'org.mpris.MediaPlayer2.Player') return;
      const changedUnpacked = changed.deep_unpack
        ? changed.deep_unpack()
        : changed;
      if (changedUnpacked['PlaybackStatus']) {
        State.isPlaying = changedUnpacked['PlaybackStatus'] === 'Playing';
        updateUI();
      }
    },
  );

  if (!pollTimeoutId)
    pollTimeoutId = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      1000,
      updateProgress,
    );
}

function refreshPlayers() {
  Gio.DBus.session.call(
    'org.freedesktop.DBus',
    '/org/freedesktop/DBus',
    'org.freedesktop.DBus',
    'ListNames',
    null,
    null,
    0,
    -1,
    null,
    (obj, res) => {
      try {
        const result = Gio.DBus.session.call_finish(res);
        const [names] = result.deep_unpack();
        const players = names.filter((n: string) =>
          n.startsWith('org.mpris.MediaPlayer2.'),
        );

        State.players = players;
        renderDots();

        // Auto-select logic
        if (players.length > 0) {
          // If current player is gone, or none selected, pick one
          if (!currentBusName || !players.includes(currentBusName)) {
            const spotify = players.find((n: string) => n.includes('spotify'));
            connectToPlayer(spotify || players[0]);
          }
        } else {
          State.title = 'No Player';
          State.artist = 'Idle';
          State.isPlaying = false;
          currentBusName = null;
          currentPlayer = null;
          updateUI();
        }
      } catch (e) {}
    },
  );
}



Gtk.init(null);

// Pre-load Theme
let themeContent = '';
let bgStyle = 'smart_transparency';
let calculatedOpacity = 80;
const Layout = {
  marginX: 24,
  marginY: 60,
  stackOffsetY: 0,
  positionMode: 'bottom_left',
  forcedWidth: 0,
};

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
    const xMatch = themeContent.match(/WIDGET_MARGIN_X:\s*(\d+)/);
    if (xMatch) Layout.marginX = parseInt(xMatch[1], 10);
    const yMatch = themeContent.match(/WIDGET_MARGIN_Y:\s*(\d+)/);
    if (yMatch) Layout.marginY = parseInt(yMatch[1], 10);

    const stackMatch = themeContent.match(/WIDGET_STACK_OFFSET_Y:\s*(\d+)/);
    if (stackMatch) Layout.stackOffsetY = parseInt(stackMatch[1], 10);
    const posMatch = themeContent.match(/WIDGET_POSITION_MODE:\s*([\w_]+)/);
    if (posMatch) Layout.positionMode = posMatch[1];
    const widthMatch = themeContent.match(/WIDGET_WIDTH_OVERRIDE:\s*(\d+)/);
    if (widthMatch) Layout.forcedWidth = parseInt(widthMatch[1], 10);

    // Environment variable overrides (from Manager)
    const envX = GLib.getenv('WIDGET_MARGIN_X');
    if (envX) Layout.marginX = parseInt(envX, 10);
    const envY = GLib.getenv('WIDGET_MARGIN_Y');
    if (envY) Layout.marginY = parseInt(envY, 10);
    const envStack = GLib.getenv('WIDGET_STACK_OFFSET_Y');
    if (envStack) Layout.stackOffsetY = parseInt(envStack, 10);
    const envPos = GLib.getenv('WIDGET_POSITION_MODE');
    if (envPos) Layout.positionMode = envPos;

    const envWidth = GLib.getenv('WIDGET_WIDTH_OVERRIDE');
    if (envWidth) {
      Layout.forcedWidth = parseInt(envWidth, 10);
      print(
        `[DEBUG] MediaWidget Env Width: ${envWidth} -> ${Layout.forcedWidth}`,
      );
    } else {
      print(`[DEBUG] MediaWidget No Env Width found`);
    }
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
        config.layout.width =
          Layout.forcedWidth > 0
            ? Layout.forcedWidth
            : Number(config.layout.width) || 360;
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
// Smart Sizing
const w = Layout.forcedWidth > 0 ? Layout.forcedWidth : config.layout.width;
const h = config.layout.height; 
print(`[DEBUG] MediaWidget Setting Size: ${w} x ${h}`);

win.set_size_request(w, h);
win.resize(w, h);
win.set_resizable(false);

const css = new Gtk.CssProvider();
const bgOpacity = bgStyle === 'smart_transparency' ? calculatedOpacity / 100 : 0.8;

css.load_from_data(`
    ${themeContent}
    .view {
        background-color: alpha(@widget_bg, ${bgOpacity});
        border-radius: ${config.appearance.corner_radius}px;
        border: 1px solid alpha(@outline, 0.1);
        padding: 20px;
    }
    .art-container {
        border-radius: 16px;
        background-color: @surfaceVariant;
        box-shadow: 0 4px 12px alpha(black, 0.2);
    }
    .title { font-weight: 800; font-size: 16px; color: @widget_text; margin-bottom: 0px; }
    .title-scroll { background: transparent; border: none; }
    .artist { font-size: 13px; color: @widget_text_secondary; font-weight: 600; opacity: 0.8; }
    
    .control-btn { 
        background: @surfaceVariant; 
        color: @widget_text; 
        min-width: 38px; min-height: 38px; 
        padding: 0; margin: 0 2px; 
        border-radius: 14px; /* Squircle/Rosette hint */
        border: none;
    }
    .control-btn:hover { background: alpha(@widget_text, 0.1); }
    .control-btn:active { background: alpha(@widget_text, 0.2); }
    
    .play-btn {
        background: @widget_primary; 
        color: @onPrimary; 
        min-width: 60px; /* Wide Pill */
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
    .time-label { font-size: 11px; font-weight: 600; color: @widget_text_secondary; margin-top: 0px; }

    .dot {
        min-width: 8px; min-height: 8px;
        border-radius: 50%;
        background-color: alpha(@widget_text, 0.3);
        margin: 4px;
        padding: 0;
        border: none;
        box-shadow: none;
    }
    .dot.active {
        background-color: @widget_primary;
        box-shadow: 0 0 4px alpha(@widget_primary, 0.5);
    }
    .dots-box {
        margin-top: 4px;
    }
`);
Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default()!, css, 900);

  // Main Container with Flex Layout
  const mainBox = new Gtk.Box({ 
    orientation: Gtk.Orientation.HORIZONTAL, 
    spacing: 8,
    valign: Gtk.Align.FILL,
    halign: Gtk.Align.FILL,
    hexpand: true
  });
mainBox.get_style_context().add_class('view');

const artBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
artBox.set_valign(Gtk.Align.CENTER); // Art stays centered relative to its side
artBox.set_vexpand(true); // Allow it to take height so it can center itself
// const artImage = new Gtk.Image({ icon_name: 'audio-x-generic', pixel_size: 135 });
const artImage = new Gtk.Image({ icon_name: 'audio-x-generic' });
// Set a minimum to avoid collapse before first load, but small enough to not force expansion
artImage.set_pixel_size(64); 

artBox.pack_start(artImage, false, false, 0);
artBox.get_style_context().add_class('art-container'); 

// RESPONSIVE ART LOGIC
artBox.connect('size-allocate', (widget, alloc) => {
    const newHeight = alloc.height;
    // Debounce/Threshold: Only update if height changed significantly (>2px) and we have art
    if (Math.abs(newHeight - State.lastArtSize) > 2) {
        // Queue an update (avoid blocking the allocate cycle)
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
             if (State.currentArtPath) {
                 // Clamp art size to 145px to prevent widget width blowout
                 // even if the widget itself is taller (e.g. 190px)
                 const artSize = Math.min(newHeight, 145);
                 updateArt(State.currentArtPath, artSize);
             }
             return GLib.SOURCE_REMOVE;
        });
    }
});


// Shared Vertical Gap
const CONTENT_SPACING = 12;

const detailsBox = new Gtk.Box({
  orientation: Gtk.Orientation.VERTICAL,
  spacing: 0,
});
detailsBox.set_valign(Gtk.Align.FILL);
detailsBox.set_hexpand(true);

// --- Marquee Magic ---
let marqueeOffset = 0;
let marqueeWaiting = 0;
let marqueeEnabled = false;
let marqueeScrollLimit = 0;
const MARQUEE_GAP = 60;
const MARQUEE_PAUSE_FRAMES = 100;

const titleAdjustment = new Gtk.Adjustment();
const titleLabel = new Gtk.Label({ label: 'Waiting...', halign: Gtk.Align.START, wrap: false, lines: 1 });
titleLabel.get_style_context().add_class('title');
const titleLabel2 = new Gtk.Label({
  label: 'Waiting...',
  halign: Gtk.Align.START,
  wrap: false,
  lines: 1,
});
titleLabel2.get_style_context().add_class('title');

const titleBox = new Gtk.Box({
  orientation: Gtk.Orientation.HORIZONTAL,
  spacing: MARQUEE_GAP,
});
titleBox.pack_start(titleLabel, false, false, 0);
titleBox.pack_start(titleLabel2, false, false, 0);

const titleScroll = new Gtk.ScrolledWindow({
  hscrollbar_policy: Gtk.PolicyType.EXTERNAL,
  vscrollbar_policy: Gtk.PolicyType.NEVER,
  hadjustment: titleAdjustment,
  hexpand: true,
});
titleScroll.get_style_context().add_class('title-scroll');
titleScroll.add(titleBox);

function resetMarquee() {
  marqueeOffset = 0;
  marqueeWaiting = MARQUEE_PAUSE_FRAMES;
  titleAdjustment.set_value(0);
  marqueeEnabled = false;
  titleLabel2.hide();
  titleBox.halign = Gtk.Align.CENTER;

  GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
    const scrollAlloc = titleScroll.get_allocation();
    const labelAlloc = titleLabel.get_allocation();
    if (labelAlloc.width > scrollAlloc.width) {
      marqueeEnabled = true;
      marqueeScrollLimit = labelAlloc.width + MARQUEE_GAP;
      titleLabel2.show();
      titleBox.halign = Gtk.Align.START;
    }
    return false;
  });
}

function tickMarquee() {
  if (!marqueeEnabled) return true;
  if (marqueeWaiting > 0) {
    marqueeWaiting--;
    return true;
  }
  marqueeOffset += 1;
  if (marqueeOffset >= marqueeScrollLimit) {
    marqueeOffset = 0;
    marqueeWaiting = MARQUEE_PAUSE_FRAMES;
  }
  titleAdjustment.set_value(marqueeOffset);
  return true;
}
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30, tickMarquee);

const artistLabel = new Gtk.Label({
  label: 'System Check',
  halign: Gtk.Align.START,
  ellipsize: Pango.EllipsizeMode.END,
});
artistLabel.get_style_context().add_class('artist');

const labelsBox = new Gtk.Box({
  orientation: Gtk.Orientation.VERTICAL,
  spacing: 2,
});
labelsBox.get_style_context().add_class('labels-container');
labelsBox.pack_start(titleScroll, false, false, 0);
labelsBox.pack_start(artistLabel, false, false, 0);

const controlsBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
controlsBox.get_style_context().add_class('controls-box');

const prevBtn = new Gtk.Button();
const prevIcon = new Gtk.Image({ icon_name: 'media-skip-backward-symbolic', pixel_size: 18 });
prevBtn.add(prevIcon);
prevBtn.get_style_context().add_class('control-btn');
prevBtn.connect('clicked', () => {
  log('[DEBUG] CLICK: Prev');
  currentPlayer && currentPlayer.PreviousRemote();
  // No-op
});

const playBtn = new Gtk.Button();
const playBtnImage = new Gtk.Image({ icon_name: 'media-playback-start-symbolic', pixel_size: 28 });
playBtn.add(playBtnImage);
playBtn.get_style_context().add_class('control-btn');
playBtn.get_style_context().add_class('play-btn');
playBtn.connect('clicked', () => {
  log('[DEBUG] CLICK: Play');
  currentPlayer && currentPlayer.PlayPauseRemote();
  // No-op
});

const nextBtn = new Gtk.Button();
const nextIcon = new Gtk.Image({ icon_name: 'media-skip-forward-symbolic', pixel_size: 18 });
nextBtn.add(nextIcon);
nextBtn.get_style_context().add_class('control-btn');
nextBtn.connect('clicked', () => {
  log('[DEBUG] CLICK: Next');
  currentPlayer && currentPlayer.NextRemote();
  // No-op
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
    } catch (e) {
      logError(e, 'Seek failed');
    }
  }
  // No-op
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

const dotsBox = new Gtk.Box({
  orientation: Gtk.Orientation.HORIZONTAL,
  halign: Gtk.Align.CENTER,
});
dotsBox.get_style_context().add_class('dots-box');

function renderDots() {
  // Clear existing dots
  dotsBox.get_children().forEach((child) => dotsBox.remove(child));

  State.players.forEach((player) => {
    const dot = new Gtk.Button();
    dot.get_style_context().add_class('dot');
    if (player === currentBusName) {
      dot.get_style_context().add_class('active');
    }
    dot.connect('clicked', () => {
      connectToPlayer(player);
    });
    dotsBox.add(dot);
  });
  dotsBox.show_all();
}

// Flex Spacers
const vSpacer = () => {
    const s = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
    s.set_vexpand(true);
    return s;
};

// Layout: [Labels] - (space) - [Dots] - (space) - [Controls] - (space) - [Progress]
// We want "space-between" effect.
// Top: Labels
// Bottom: Progress
// Center: Controls / Dots

detailsBox.pack_start(labelsBox, false, false, 0);
detailsBox.pack_start(vSpacer(), true, true, 0);
detailsBox.pack_start(dotsBox, false, false, 0);
detailsBox.pack_start(vSpacer(), true, true, 0);
detailsBox.pack_start(controlsBox, false, false, 0);
detailsBox.pack_start(vSpacer(), true, true, 0);
detailsBox.pack_start(progressBox, false, false, 0);

mainBox.pack_start(artBox, false, false, 0);
mainBox.pack_start(detailsBox, true, true, 0);

win.add(mainBox);

// INTERACTIVITY FIX:
// "Dock" window type + Keep Below + Sticky = Desktop Widget behavior.
win.set_titlebar(null);
win.set_keep_above(false);
// keep_below(true) enforced for desktop pinning
win.set_keep_below(true);
win.set_type_hint(Gdk.WindowTypeHint.NORMAL);
win.set_decorated(false); 
win.set_skip_taskbar_hint(true);
win.set_skip_pager_hint(true);
win.set_accept_focus(true); // Allow clicks

// AGGRESSIVE LOWERING STRATEGY:
// 1. Hammer 'lower()' on startup to defeat WM initial placement
// let lowerCount = 0;
// GLib.timeout_add(GLib.PRIORITY_LOW, 200, () => {
//   const gw = win.get_window();
//   //     if (gw) gw.lower();
//   lowerCount++;
//   return lowerCount < 20; // Run for ~4 seconds
// });

// 2. Lower immediately after interaction (Fixes "Pushes apps behind")
const lowerWin = () => {};

// win.connect('focus-out-event', () => { lowerWin(); return false; });
// Also lower on focus-in to strictly forbid raising? No, might block click.

// Drag Support (Guaranteed to work on Normal windows)
mainBox.add_events(Gdk.EventMask.BUTTON_PRESS_MASK);
mainBox.connect('button-press-event', (widget, event) => {
    if (event.get_button()[1] === 1) {
       win.begin_move_drag(
         event.get_button()[1],
         event.x_root,
         event.y_root,
         event.get_time(),
       );
    }
    return false;
});
win.stick(); // Visible on all workspaces

// --- Positioning ---
// We calculate locally using standard Logical metrics to ensure correct placement.
win.show_all();

// Positioning Logic
const display = win.get_display();
const monitor = display.get_primary_monitor() || display.get_monitor(0);
if (monitor) {
  const geo = monitor.get_geometry();
  const alloc = win.get_allocation();
  const w = alloc.width > 40 ? alloc.width : config.layout.width || 360;
  const h = alloc.height > 40 ? alloc.height : config.layout.height || 184;

  let x = Layout.marginX;
  let y = Layout.marginY;

  if (Layout.positionMode.includes('right')) {
    x = geo.width - w - Layout.marginX;
  }

  if (Layout.positionMode.includes('bottom')) {
    y = geo.height - h - Layout.marginY - Layout.stackOffsetY;
  } else {
    y = Layout.marginY + Layout.stackOffsetY;
  }

  win.move(x, y);
  log(
    `[INFO] Positioned at ${x}, ${y} (Mode: ${Layout.positionMode}, Stack: ${Layout.stackOffsetY}, Size: ${w}x${h})`,
  );
}

win.connect('destroy', Gtk.main_quit);
win.show_all();

// Watch for players
Gio.DBus.session.signal_subscribe(
  'org.freedesktop.DBus',
  'org.freedesktop.DBus',
  'NameOwnerChanged',
  '/org/freedesktop/DBus',
  null,
  Gio.DBusSignalFlags.NONE,
  (conn, sender, path, iface, signal, p) => {
    const [name, oldOwner, newOwner] = p.deep_unpack();
    if (name.startsWith('org.mpris.MediaPlayer2.')) {
      refreshPlayers();
    }
  },
);

refreshPlayers();
Gtk.main();
