
import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import GLib from 'gi://GLib?version=2.0';
import Gio from 'gi://Gio?version=2.0';
import { THEME_CSS_PATH, Config } from '../config.js';
// @ts-ignore
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
let calculatedOpacity = 60;

export const loadStyles = () => {
    try {
      const tFile = Gio.File.new_for_path(THEME_CSS_PATH);
      const [ok, doc] = tFile.load_contents(null);
      if (ok) {
          // @ts-ignore
          const decoder = new TextDecoder('utf-8');
          themeContent = decoder.decode(doc);
          const opaMatch = themeContent.match(/WIDGET_CALCULATED_OPACITY:\s*(\d+)/);
          if (opaMatch) calculatedOpacity = parseInt(opaMatch[1], 10);
          const styMatch = themeContent.match(/WIDGET_BG_STYLE:\s*(\w+)/);
          if (styMatch) bgStyle = styMatch[1];
      
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
    
    let bgOpacity: number;
    if (bgStyle === 'smart_transparency') {
        bgOpacity = calculatedOpacity / 100.0;
    } else {
        bgOpacity = config.background ? (config.background.opacity / 100.0) : 0.6;
    }
    
    const scale = config.layout.scale_factor || 1.0;
    const s = (v: number) => Math.round(v * scale);
    const padding = s(config.layout.padding || 24);
    const radius = s(config.layout.corner_radius ?? 16);
    const borderWidth = s(config.layout.border_width || 1);
    
    // Typography defaults
    const font = config.typography.font_family || 'Inter';
    const iconFont = config.typography.icon_font || 'Material Design Icons Desktop';
    const timeSize = s(parseInt(config.typography.clock_size) || 48);

    css.load_from_data(`
        ${themeContent}
        
        window { background-color: transparent; }

        .background-layer {
            border-radius: ${radius}px;
        }

        .glass-overlay {
            background-color: alpha(@widget_bg, ${bgOpacity});
            border-radius: ${radius}px;
            border: ${borderWidth}px solid alpha(@outline, 0.15);
        }
        
        /* The content box has the padding */
        .content-box {
             margin: ${padding}px;
        }

        .date {
            font-family: "${font}", sans-serif;
            font-size: ${s(14)}px;
            font-weight: 500;
            color: @widget_text;
        }

        .time {
            font-family: "${font}", sans-serif;
            font-size: ${timeSize}px;
            font-weight: bold;
            color: @widget_primary;
            letter-spacing: -${s(1)}px;
        }

        .ampm {
            font-family: "${font}", sans-serif;
            font-size: ${s(16)}px;
            font-weight: 500;
            color: @widget_text_secondary;
        }

        .weather-icon {
            font-family: "${iconFont}", monospace;
            font-size: ${s(32)}px;
            color: @widget_primary;
        }

        .weather-temp {
            font-family: "${font}", sans-serif;
            font-size: ${s(24)}px;
            font-weight: bold;
            color: @widget_text;
        }

        .weather-desc {
            font-family: "${font}", sans-serif;
            font-size: ${s(14)}px;
            font-weight: 500;
            color: @widget_text_secondary;
        }

        .weather-city {
            font-family: "${font}", sans-serif;
            font-size: ${s(14)}px;
            color: @widget_text_secondary;
            opacity: 1.0;
            font-weight: 500;
        }

        .detail {
            font-family: "${iconFont}", "${font}", monospace;
            font-size: ${s(14)}px;
            color: @widget_text_secondary;
            opacity: 0.9;
        }
        
        .sys-icon {
            font-family: "${iconFont}", monospace;
            font-size: ${s(18)}px;
            color: @widget_primary;
        }
        
        .divider {
            background-color: @widget_text_secondary;
            min-height: 1px;
            opacity: 0.15;
            margin-top: ${s(6)}px;
            margin-bottom: ${s(6)}px;
        }
    `);
    
    const screen = Gdk.Screen.get_default();
    if (screen) {
        Gtk.StyleContext.add_provider_for_screen(screen, css, 900);
    }
};
