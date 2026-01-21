
import GLib from 'gi://GLib?version=2.0';
import Gio from 'gi://Gio?version=2.0';
import * as yaml from 'js-yaml';
// @ts-ignore
import { log } from './utils.js';

export interface Config {
  layout: {
    position: string;
    width: number;
    height: number;
    gap: number[];
    alignment: 'left' | 'center' | 'right' | 'auto';
    scale_factor?: number;
    padding?: number;
    corner_radius?: number;
    border_width?: number;
  };
  emoji: {
    value: string;
    scale: number;
    rotate: number;
    row: number;
  };
  typography: {
    clock_size: string;
    date_size: string;
    font_family?: string;
    icon_font?: string;
    time_size?: number; // legacy from backup
  };
  background: {
      style: 'solid' | 'smart_transparency';
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

export const defaultConfig: Config = {
  layout: { 
      position: 'bottom_left', 
      width: 360, 
      height: 140, 
      gap: [24, 60], 
      alignment: 'auto',
      scale_factor: 1.0,
      padding: 24,
      corner_radius: 16,
      border_width: 1
  },
  emoji: { 
      value: "", 
      scale: 1.0, 
      rotate: 0, 
      row: 1 
  },
  typography: { 
      clock_size: '48px', 
      date_size: '16px',
      font_family: 'Inter',
      icon_font: 'Material Design Icons Desktop',
      time_size: 48 
  },
  background: {
      style: 'smart_transparency',
      opacity: 60
  },
  clock: {
      format: '12h',
      show_ampm: true
  },
  weather: {
      unit: 'C',
      refresh_interval_min: 15,
      wind_unit: 'km'
  },
  visibility: {
      show_weather: true,
      show_computer_metrics: true,
      show_divider: true
  },
  performance: {
      dynamic_refresh: true,
      refresh_normal_ms: 1000,
      refresh_eco_ms: 5000
  }
};

export const SCRIPT_DIR = GLib.path_get_dirname(imports.system.programInvocationName);
export const CONFIG_PATH = `${SCRIPT_DIR}/config.yaml`;
export const THEME_CSS_PATH = `${SCRIPT_DIR}/theme.css`;

export const loadConfig = (): Config => {
  let config = { ...defaultConfig };
  try {
    const file = Gio.File.new_for_path(CONFIG_PATH);
    const [success, contents] = file.load_contents(null);
    if (success) {
      // @ts-ignore
      const decoder = new TextDecoder('utf-8');
      const parsed = yaml.load(decoder.decode(contents)) as any;
      if (parsed) {
        // Deep merge sections
        if (parsed.layout) config.layout = { ...config.layout, ...parsed.layout };
        if (parsed.emoji) config.emoji = { ...config.emoji, ...parsed.emoji };
        if (parsed.typography) config.typography = { ...config.typography, ...parsed.typography };
        if (parsed.background) config.background = { ...config.background, ...parsed.background };
        if (parsed.clock) config.clock = { ...config.clock, ...parsed.clock };
        if (parsed.weather) config.weather = { ...config.weather, ...parsed.weather };
        if (parsed.visibility) config.visibility = { ...config.visibility, ...parsed.visibility };
        if (parsed.performance) config.performance = { ...config.performance, ...parsed.performance };
      }
    }
  } catch (e) {
    log(`[WARN] Failed to load config: ${e}`);
  }
  return config;
};
