
import GLib from 'gi://GLib?version=2.0';
import Gio from 'gi://Gio?version=2.0';
import * as yaml from 'js-yaml';
import { log } from './utils.js';

export interface Config {
  layout: {
    position: string;
    width: number;
    height: number;
    gap: number[];
    scale_factor?: number;
    padding?: number;
    corner_radius?: number;
    border_width?: number;
  };
  appearance: {
    corner_radius: number;
    blur_art?: boolean;
  };
  controls: {
    show_next_prev: boolean;
  };
}

export const defaultConfig: Config = {
  layout: {
    position: 'bottom_right',
    width: 360,
    height: 140,
    gap: [24, 60],
    scale_factor: 1.0,
    padding: 20,
    corner_radius: 16,
    border_width: 0,
  },
  appearance: {
    corner_radius: 16,
    blur_art: true,
  },
  controls: { show_next_prev: true },
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
        // Deep merge layout
        if (parsed.layout) config.layout = { ...config.layout, ...parsed.layout };
        if (parsed.appearance)
          config.appearance = { ...config.appearance, ...parsed.appearance };
        if (parsed.controls) config.controls = { ...config.controls, ...parsed.controls };
      }
    }
  } catch (e) {
    log(`[WARN] Failed to load config: ${e}`);
  }
  log(
    `[DEBUG] Loaded Config: radius=${config.appearance?.corner_radius}, layout_radius=${config.layout.corner_radius}`,
  );
  return config;
};
