// @ts-nocheck
import GLib from 'gi://GLib?version=2.0';
import Gtk from 'gi://Gtk?version=3.0';

import { loadConfig } from './src/config.js';
import {
  loadStyles,
  updateLayoutFromEnv,
  applyStyles,
} from './src/ui/styles.js';
import { startWindow } from './src/ui/main.js';
import { log } from './src/utils.js';

// Init Gtk
Gtk.init(null);

const config = loadConfig();

// Load & Apply Theme
loadStyles();
updateLayoutFromEnv();
applyStyles(config);

// Start UI
startWindow(config);

log('WeatherClock Started.');
