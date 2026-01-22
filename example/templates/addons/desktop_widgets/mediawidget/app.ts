// @ts-nocheck
import GLib from 'gi://GLib?version=2.0';
import Gtk from 'gi://Gtk?version=3.0';

import { loadConfig } from './src/config.js'; // Note .js extension for ESM resolution in build
import {
  loadStyles,
  updateLayoutFromEnv,
  applyStyles,
} from './src/ui/styles.js';
import { startWindow, updateUI, renderDots } from './src/ui/main.js';
import { refreshPlayers, setCallbacks } from './src/services/mpris.js';
import { log } from './src/utils.js';

// Init Gtk
Gtk.init(null);

const config = loadConfig();

// Load & Apply Theme
loadStyles();
updateLayoutFromEnv();
applyStyles(config);

// Setup MPRIS
setCallbacks({
  updateUI: () => updateUI(),
  renderDots: () => renderDots(),
});

// Initial refresh
refreshPlayers();

// Polling for players (every 5s)
GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
  refreshPlayers();
  return true;
});

// Note: Metadata polling is now handled inside connectToPlayer() in mpris.ts
// matching the backup pattern (lines 370-375)

// Start UI
startWindow(config);

log('MediaWidget Started.');
