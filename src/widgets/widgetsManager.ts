/**
 * Desktop widgets lifecycle coordinator managing settings and CAVA visualizer state.
 */

import type Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type { MaterialSchemeColors } from '../types/theme.js';
import { AudioVisualizerWidget } from './audioVisualizerWidget.js';
import { CavaRunner, isCavaInstalled } from './cavaRunner.js';
import {
  buildVisualizerColors,
  type VisualizerColorMode,
  type VisualizerConfig,
  type VisualizerPosition,
  type VisualizerStyle,
} from './visualizerTypes.js';

const VISUALIZER_KEYS: ReadonlyArray<string> = [
  'visualizer-enabled',
  'visualizer-position',
  'visualizer-style',
  'visualizer-color-mode',
  'visualizer-bar-count',
  'visualizer-bar-spacing',
  'visualizer-corner-radius',
  'visualizer-thickness',
  'visualizer-base-padding',
  'visualizer-side-padding',
  'visualizer-opacity',
  'visualizer-pause-fullscreen',
];

export class WidgetsManager {
  private _settings: Gio.Settings;
  private _signalIds: number[] = [];
  private _fullscreenSignalId: number | null = null;
  private _widget: AudioVisualizerWidget | null = null;
  private _cavaRunner: CavaRunner | null = null;
  private _activeBarCount: number | null = null;
  private _lastScheme: MaterialSchemeColors | null = null;

  constructor(settings: Gio.Settings) {
    this._settings = settings;
  }

  enable(): void {
    for (const key of VISUALIZER_KEYS) {
      this._signalIds.push(
        this._settings.connect(`changed::${key}`, () => this._syncVisualizerState())
      );
    }
    this._fullscreenSignalId = global.display.connect('in-fullscreen-changed', () => {
      this._syncVisualizerState();
    });
    this._syncVisualizerState();
  }

  destroy(): void {
    for (const id of this._signalIds) {
      this._settings.disconnect(id);
    }
    this._signalIds = [];
    if (this._fullscreenSignalId !== null) {
      global.display.disconnect(this._fullscreenSignalId);
      this._fullscreenSignalId = null;
    }
    this._teardownVisualizer();
    this._lastScheme = null;
  }

  updateThemeScheme(scheme: MaterialSchemeColors): void {
    this._lastScheme = scheme;
    this._widget?.updateColors(buildVisualizerColors(scheme));
  }

  private _readConfig(): VisualizerConfig {
    return {
      enabled: this._settings.get_boolean('visualizer-enabled'),
      position: this._settings.get_string('visualizer-position') as VisualizerPosition,
      style: this._settings.get_string('visualizer-style') as VisualizerStyle,
      colorMode: this._settings.get_string('visualizer-color-mode') as VisualizerColorMode,
      barCount: this._settings.get_int('visualizer-bar-count'),
      barSpacing: this._settings.get_int('visualizer-bar-spacing'),
      cornerRadius: this._settings.get_int('visualizer-corner-radius'),
      thickness: this._settings.get_int('visualizer-thickness'),
      basePadding: this._settings.get_int('visualizer-base-padding'),
      sidePadding: this._settings.get_int('visualizer-side-padding'),
      opacity: this._settings.get_int('visualizer-opacity'),
      pauseFullscreen: this._settings.get_boolean('visualizer-pause-fullscreen'),
    };
  }

  private _isPausedForFullscreen(config: VisualizerConfig): boolean {
    if (!config.pauseFullscreen) return false;
    const primary = Main.layoutManager.primaryMonitor as { inFullscreen?: boolean } | null;
    return primary?.inFullscreen ?? false;
  }

  private _syncVisualizerState(): void {
    const config = this._readConfig();
    if (!config.enabled || !isCavaInstalled() || this._isPausedForFullscreen(config)) {
      this._teardownVisualizer();
      return;
    }

    if (!this._widget) {
      this._widget = new AudioVisualizerWidget(config);
      this._widget.mount();
      if (this._lastScheme) {
        this._widget.updateColors(buildVisualizerColors(this._lastScheme));
      }
      this._cavaRunner = new CavaRunner((bars) => this._widget?.pushFrame(bars));
      this._cavaRunner.start(config.barCount);
      this._activeBarCount = config.barCount;
      return;
    }

    this._widget.updateConfig(config);
    if (this._activeBarCount !== config.barCount) {
      this._cavaRunner?.start(config.barCount);
      this._activeBarCount = config.barCount;
    }
  }

  private _teardownVisualizer(): void {
    this._cavaRunner?.stop();
    this._cavaRunner = null;
    this._activeBarCount = null;
    this._widget?.destroy();
    this._widget = null;
  }
}
