
import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import GLib from 'gi://GLib?version=2.0';
import Pango from 'gi://Pango?version=1.0';
import { Config, defaultConfig } from '../config.js';
import { State } from '../state.js';
import { createMarquee } from './components/marquee.js';
import { Layout } from './styles.js';
import { log, formatTime } from '../utils.js';
import {
  currentPlayer,
  connectToPlayer,
  currentBusName,
} from '../services/mpris.js';
import { downloadArt, updateArtWidget } from '../services/art.js';

let win: Gtk.Window;
let mainBox: Gtk.Box;
let artImage: Gtk.Image;
let titleMarquee: any;
let artistMarquee: any;
let playBtnImage: Gtk.Image;
let scale: Gtk.Scale;
let lblCurrent: Gtk.Label;
let lblTotal: Gtk.Label;
let dotsBox: Gtk.Box;

let isDragging = false;
let currentConfig: Config = defaultConfig;

export const buildUI = (config: Config) => {
  currentConfig = config;
  win = new Gtk.Window({
    type: Gtk.WindowType.TOPLEVEL,
    title: 'MeowterialYou-Widget-mediawidget',
    decorated: false,
    skip_taskbar_hint: true,
    skip_pager_hint: true,
    accept_focus: true,
  });

  win.set_wmclass(
    'MeowterialYou-Widget-mediawidget',
    'MeowterialYou-Widget-mediawidget',
  );
  win.set_role('MeowterialYou-Widget-mediawidget');
  win.set_app_paintable(true);

  const visual = win.get_screen()?.get_rgba_visual();
  if (visual) win.set_visual(visual);

  const w = Layout.forcedWidth > 0 ? Layout.forcedWidth : config.layout.width;
  const h = config.layout.height;
  win.set_size_request(w, h);
  win.resize(w, h);

  mainBox = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 24, // Generous spacing
    valign: Gtk.Align.FILL,
    halign: Gtk.Align.FILL,
    hexpand: true,
  });
  // mainBox.get_style_context().add_class('view'); // Moved to rootWrapper

  // Art Section
  const artBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
  artBox.set_valign(Gtk.Align.CENTER);
  artBox.set_halign(Gtk.Align.CENTER);
  artBox.set_vexpand(false);
  artBox.set_hexpand(false);
  artImage = new Gtk.Image({ icon_name: 'audio-x-generic' });
  artImage.set_pixel_size(64);
  artBox.pack_start(artImage, false, false, 0);
  artBox.get_style_context().add_class('art-container');

  // Responsive Art
  artBox.connect('size-allocate', (widget, alloc) => {
    const newHeight = alloc.height;
    if (Math.abs(newHeight - State.lastArtSize) > 2) {
      GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        if (State.currentArtPath) {
          // Use full available height for art to be responsive
          // Subtract a small margin for safety if needed, but usually full height is fine
          // assuming mainBox height is constrained by widget height - padding
          const artSize = Math.max(newHeight, 64);

          // Use corner radius from config appearance section (allow 0)
          const s = config.layout.scale_factor || 1.0;
          const radius = Math.round(
            (config.appearance?.corner_radius ?? 16) * s,
          );
          updateArtWidget(artImage, State.currentArtPath, artSize, radius);
        }
        return GLib.SOURCE_REMOVE;
      });
    }
  });

  // Details Section
  const detailsBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 0,
  });
  detailsBox.set_valign(Gtk.Align.FILL);
  detailsBox.set_hexpand(true);

  // Marquee - Title scrolls left, Artist scrolls right when overflow
  titleMarquee = createMarquee('title', 'left');
  artistMarquee = createMarquee('artist', 'right');

  const labelsBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 2,
  });
  labelsBox.get_style_context().add_class('labels-container');
  labelsBox.pack_start(titleMarquee.container, false, false, 0);
  labelsBox.pack_start(artistMarquee.container, false, false, 0);

  // Controls
  const controlsBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
  controlsBox.get_style_context().add_class('controls-box');

  const prevBtn = createControlBtn(
    'media-skip-backward-symbolic',
    18,
    () => currentPlayer && currentPlayer.PreviousRemote(),
  );
  const playBtn = new Gtk.Button();
  playBtnImage = new Gtk.Image({
    icon_name: 'media-playback-start-symbolic',
    pixel_size: 28,
  });
  playBtn.add(playBtnImage);
  playBtn.get_style_context().add_class('control-btn');
  playBtn.get_style_context().add_class('play-btn');
  playBtn.connect('clicked', () => {
    currentPlayer && currentPlayer.PlayPauseRemote();
  });
  const nextBtn = createControlBtn(
    'media-skip-forward-symbolic',
    18,
    () => currentPlayer && currentPlayer.NextRemote(),
  );

  controlsBox.pack_start(prevBtn, false, false, 0);
  controlsBox.pack_start(playBtn, false, false, 0);
  controlsBox.pack_start(nextBtn, false, false, 0);

  // Progress
  const progressBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 0,
  });
  scale = new Gtk.Scale({
    orientation: Gtk.Orientation.HORIZONTAL,
    draw_value: false,
  });
  scale.set_range(0, 100);
  scale.set_increments(5, 10);
  scale.get_style_context().add_class('progress-bar');

  scale.connect('button-press-event', () => {
    isDragging = true;
    return false;
  });
  scale.connect('button-release-event', () => {
    isDragging = false;
    const val = scale.get_value();
    if (State.length > 0 && currentPlayer && State.trackId) {
      const targetMicro = (val / 100) * State.length;
      try {
        currentPlayer.SetPositionRemote(State.trackId, targetMicro);
      } catch (e) {}
    }
    return false;
  });

  const timeBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
  lblCurrent = new Gtk.Label({ label: '0:00', halign: Gtk.Align.START });
  lblCurrent.get_style_context().add_class('time-label');
  lblTotal = new Gtk.Label({ label: '0:00', halign: Gtk.Align.END });
  lblTotal.get_style_context().add_class('time-label');
  const spacer = new Gtk.Label({ label: '' });
  spacer.set_hexpand(true);
  timeBox.pack_start(lblCurrent, false, false, 0);
  timeBox.pack_start(spacer, true, true, 0);
  timeBox.pack_start(lblTotal, false, false, 0);

  progressBox.pack_start(scale, false, false, 0);
  progressBox.pack_start(timeBox, false, false, 0);

  // Assembly
  const vSpacer = () => {
    const s = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
    s.set_vexpand(true);
    return s;
  };

  detailsBox.pack_start(labelsBox, false, false, 0);
  detailsBox.pack_start(vSpacer(), true, true, 0);
  detailsBox.pack_start(controlsBox, false, false, 0);
  detailsBox.pack_start(vSpacer(), true, true, 0);
  detailsBox.pack_start(progressBox, false, false, 0);

  const rootWrapper = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
  rootWrapper.get_style_context().add_class('view');
  mainBox.pack_start(artBox, false, false, 0);
  mainBox.pack_start(detailsBox, true, true, 0);

  // Dots
  dotsBox = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    halign: Gtk.Align.CENTER,
  });
  dotsBox.get_style_context().add_class('dots-box');

  rootWrapper.pack_start(mainBox, true, true, 0);
  // Pack dots at the very end
  rootWrapper.pack_end(dotsBox, false, false, 0);
  win.add(rootWrapper);

  // Interactivity & Behavior
  win.set_titlebar(null);
  win.set_keep_below(true);
  win.stick();

  rootWrapper.add_events(Gdk.EventMask.BUTTON_PRESS_MASK);
  rootWrapper.connect('button-press-event', (widget, event) => {
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

  win.connect('destroy', Gtk.main_quit);
};;;;;

function createControlBtn(iconName: string, size: number, onClick: () => void) {
    const btn = new Gtk.Button();
    const icon = new Gtk.Image({ icon_name: iconName, pixel_size: size });
    btn.add(icon);
    btn.get_style_context().add_class('control-btn');
    btn.connect('clicked', onClick);
    return btn;
}

// Logic wiring
let lastDisplayedTitle = '';
let lastDisplayedArtist = '';

export const updateUI = () => {
  if (State.title !== lastDisplayedTitle) {
      titleMarquee.setText(State.title);
      lastDisplayedTitle = State.title;
  }
  if (State.artist !== lastDisplayedArtist) {
      artistMarquee.setText(State.artist);
      lastDisplayedArtist = State.artist;
  }
  
  playBtnImage.icon_name = State.isPlaying ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
  
  const fraction = State.length > 0 ? (State.position / State.length) * 100 : 0;
  if (!isDragging) scale.set_value(fraction);
  
  lblCurrent.label = formatTime(State.position);
  lblTotal.label = formatTime(State.length);
  
  // Art handling relies on the size-allocate listener mostly, but for URL changes:
  if (State.artUrl) {
      downloadArt(State.artUrl, (path) => {
           if (path) {
             // Use fallback size like backup (line 232)
             const currentSize = State.lastArtSize || 135;
             const s = currentConfig.layout.scale_factor || 1.0;
             const radius = Math.round(
               (currentConfig.appearance?.corner_radius ?? 16) * s,
             );
             updateArtWidget(artImage, path, currentSize, radius);
           } else {
             updateArtWidget(artImage, null, 0, 0);
           }
      });
  } else {
      updateArtWidget(artImage, null, 0, 0);
  }
};

export const renderDots = () => {
    dotsBox.get_children().forEach((child) => dotsBox.remove(child));
    
    State.players.forEach((player) => {
      const dot = new Gtk.Button();
      dot.get_style_context().add_class('dot');
      if (player === currentBusName) {
          dot.get_style_context().add_class('active');
      }
      dot.connect('clicked', () => connectToPlayer(player));
      dotsBox.add(dot);
    });
    dotsBox.show_all();
  };

export const startWindow = (config: Config) => {
    buildUI(config);
    win.show_all();
    
    // Tick Marquee
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30, () => {
        titleMarquee.tick();
        artistMarquee.tick();
        return true;
    });
    
    // Position
    const display = win.get_display();
    const monitor = display.get_primary_monitor() || display.get_monitor(0);
    if (monitor) {
        const geo = monitor.get_geometry();
        const w = config.layout.width || 360;
        const h = config.layout.height || 140;
        
        let x = Layout.marginX;
        let y = Layout.marginY;
        
        if (Layout.positionMode.includes('right')) x = geo.width - w - Layout.marginX;
        
        if (Layout.positionMode.includes('bottom')) y = geo.height - h - Layout.marginY - Layout.stackOffsetY;
        else y = Layout.marginY + Layout.stackOffsetY;
        
        win.move(x, y);
    }
    
    Gtk.main();
};
