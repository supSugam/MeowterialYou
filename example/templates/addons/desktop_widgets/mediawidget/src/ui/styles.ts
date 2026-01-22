
import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import GLib from 'gi://GLib?version=2.0';
import Gio from 'gi://Gio?version=2.0';
import { THEME_CSS_PATH, Config } from '../config.js';
import { log } from '../utils.js';

export const Layout = {
  marginX: 24,
  marginY: 60,
  stackOffsetY: 0,
  positionMode: 'bottom_left',
  forcedWidth: 0,
};

let themeContent = '';
let bgStyle = 'smart_transparency';
let calculatedOpacity = 80;

export const loadStyles = () => {
  try {
    const tFile = Gio.File.new_for_path(THEME_CSS_PATH);
    const [ok, doc] = tFile.load_contents(null);
    if (ok) {
        const decoder = new TextDecoder('utf-8');
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
    }
  } catch(e) {
      log(`[Error] Loading theme css: ${e}`);
  }
  return themeContent;
};

export const updateLayoutFromEnv = () => {
    const envX = GLib.getenv('WIDGET_MARGIN_X');
    if (envX) Layout.marginX = parseInt(envX, 10);
    const envY = GLib.getenv('WIDGET_MARGIN_Y');
    if (envY) Layout.marginY = parseInt(envY, 10);
    const envStack = GLib.getenv('WIDGET_STACK_OFFSET_Y');
    if (envStack) Layout.stackOffsetY = parseInt(envStack, 10);
    const envPos = GLib.getenv('WIDGET_POSITION_MODE');
    if (envPos) Layout.positionMode = envPos;
    const envWidth = GLib.getenv('WIDGET_WIDTH_OVERRIDE');
    if (envWidth) Layout.forcedWidth = parseInt(envWidth, 10);
};

export const applyStyles = (config: Config) => {
  const css = new Gtk.CssProvider();
  const bgOpacity =
    bgStyle === 'smart_transparency' ? calculatedOpacity / 100 : 0.8;

  const scale = config.layout.scale_factor || 1.0;
  const s = (v: number) => Math.round(v * scale);
  const padding = s(config.layout.padding || 20);
  // Use appearance.corner_radius as primary, layout.corner_radius as fallback
  // Use nullish coalescing to allow 0 as valid radius
  const radius = s(
    config.appearance?.corner_radius ?? config.layout.corner_radius ?? 16,
  );
  const borderWidth = s(config.layout.border_width || 0);

  css.load_from_data(`
        ${themeContent}
        .view {
            background-color: alpha(@widget_bg, ${bgOpacity});
            border-radius: ${radius}px;
            border: ${borderWidth}px solid alpha(@outline, 0.15);
            padding: ${padding}px;
        }
        .art-container {
            border-radius: ${radius}px;
            background-color: @surfaceVariant;
            box-shadow: 0 4px 12px alpha(black, 0.2);
        }
        .title { font-weight: 800; font-size: ${s(16)}px; color: @widget_text; margin-bottom: 0px; }
        .title-scroll { background: transparent; border: none; }
        .artist { font-size: ${s(13)}px; color: @widget_text_secondary; font-weight: 600; opacity: 0.8; }
        
        .control-btn { 
            background: @surfaceVariant; 
            color: @widget_text; 
            min-width: ${s(38)}px; min-height: ${s(38)}px; 
            padding: 0; margin: 0 ${s(2)}px; 
            border-radius: ${s(14)}px; /* Squircle/Rosette hint */
            border: none;
        }
        .control-btn:hover { background: alpha(@widget_text, 0.1); }
        .control-btn:active { background: alpha(@widget_text, 0.2); }
        
        .play-btn {
            background: @widget_primary; 
            color: @onPrimary; 
            min-width: ${s(60)}px; /* Wide Pill */
            border-radius: ${s(24)}px; 
            margin: 0 ${s(6)}px;
        }
        .play-btn:hover { background: alpha(@widget_primary, 0.9); box-shadow: 0 4px 12px alpha(@widget_primary, 0.3); }
    
        /* Modern Slider */
        scale {
            margin: 0; padding: 0;
        }
        scale trough {
            min-height: ${s(6)}px;
            border-radius: ${s(3)}px;
            background: alpha(@widget_text, 0.1);
        }
        scale highlight {
            min-height: ${s(6)}px;
            border-radius: ${s(3)}px;
            background: @widget_primary;
        }
        scale slider {
            min-width: ${s(16)}px; min-height: ${s(16)}px;
            border-radius: 50%;
            background: @widget_primary;
            box-shadow: 0 2px 4px alpha(black, 0.2);
            margin: ${s(-5)}px 0; /* Center on track */
        }
        .time-label { font-size: ${s(11)}px; font-weight: 600; color: @widget_text_secondary; margin-top: 0px; }
    
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
            margin-top: 0px;
        }
    `);

  const screen = Gdk.Screen.get_default();
  if (screen) {
    Gtk.StyleContext.add_provider_for_screen(screen, css, 900);
  }
};;;;
