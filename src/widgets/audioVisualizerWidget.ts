/**
 * Desktop background equalizer widget layered above wallpaper and behind all windows.
 */

import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { paintVisualizerBars, type GjsCairoContext } from './visualizerRenderer.js';
import { VisualizerSmoother } from './visualizerSmoother.js';
import {
  computeVisualizerBounds, DEFAULT_VISUALIZER_COLORS, type RectBounds, type VisualizerConfig, type VisualizerGradientColors,
} from './visualizerTypes.js';

const ANIMATION_INTERVAL_MS = 16;

interface LayoutManagerWithBackground {
  _backgroundGroup?: {
    add_child(actor: St.Widget): void;
    remove_child(actor: St.Widget): void;
    set_child_above_sibling(child: St.Widget, sibling: St.Widget | null): void;
  };
  primaryIndex: number;
  getWorkAreaForMonitor(index: number): RectBounds;
  connect(signal: string, callback: () => void): number;
  disconnect(id: number): void;
}

export class AudioVisualizerWidget {
  private _area: St.DrawingArea | null = null;
  private _config: VisualizerConfig;
  private _colors: VisualizerGradientColors = DEFAULT_VISUALIZER_COLORS;
  private _smoother: VisualizerSmoother;
  private _timerId: number | null = null;
  private _monitorsSignalId: number | null = null;
  private _workareaSignalId: number | null = null;

  constructor(config: VisualizerConfig) {
    this._config = config;
    this._smoother = new VisualizerSmoother(config.barCount);
  }

  mount(): void {
    if (this._area) return;

    const layout = Main.layoutManager as unknown as LayoutManagerWithBackground;
    if (!layout._backgroundGroup) return;

    this._area = new St.DrawingArea({ reactive: false, visible: true });
    this._area.connect('repaint', (area) => this._onRepaint(area));

    layout._backgroundGroup.add_child(this._area);
    layout._backgroundGroup.set_child_above_sibling(this._area, null);
    this._updateGeometry();

    this._monitorsSignalId = layout.connect('monitors-changed', () => this._updateGeometry());
    this._workareaSignalId = global.display.connect('workareas-changed', () => this._updateGeometry());
  }

  destroy(): void {
    this._stopAnimationTimer();

    const layout = Main.layoutManager as unknown as LayoutManagerWithBackground;
    if (this._monitorsSignalId !== null) {
      layout.disconnect(this._monitorsSignalId);
      this._monitorsSignalId = null;
    }
    if (this._workareaSignalId !== null) {
      global.display.disconnect(this._workareaSignalId);
      this._workareaSignalId = null;
    }

    if (this._area) {
      this._area.get_parent()?.remove_child(this._area);
      this._area.destroy();
      this._area = null;
    }
  }

  updateConfig(config: VisualizerConfig): void {
    const barCountChanged = config.barCount !== this._config.barCount;
    this._config = config;
    if (barCountChanged) this._smoother.reset(config.barCount);
    this._updateGeometry();
  }

  updateColors(colors: VisualizerGradientColors): void {
    this._colors = colors;
    this._area?.queue_repaint();
  }

  pushFrame(bars: number[]): void {
    if (this._smoother.pushTarget(bars)) {
      this._ensureAnimationTimer();
    }
  }

  private _updateGeometry(): void {
    if (!this._area) return;

    const layout = Main.layoutManager as unknown as LayoutManagerWithBackground;
    const workArea = layout.getWorkAreaForMonitor(layout.primaryIndex);
    const bounds = computeVisualizerBounds(workArea, this._config);
    this._area.set_position(bounds.x, bounds.y);
    this._area.set_size(bounds.width, bounds.height);

    layout._backgroundGroup?.set_child_above_sibling(this._area, null);
    this._area.queue_repaint();
  }

  private _ensureAnimationTimer(): void {
    if (this._timerId !== null) return;
    this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ANIMATION_INTERVAL_MS, () => {
      const shouldContinue = this._smoother.step();
      this._area?.queue_repaint();
      if (!shouldContinue) {
        this._timerId = null;
        return GLib.SOURCE_REMOVE;
      }
      return GLib.SOURCE_CONTINUE;
    });
  }

  private _stopAnimationTimer(): void {
    if (this._timerId !== null) {
      GLib.source_remove(this._timerId);
      this._timerId = null;
    }
  }

  private _onRepaint(area: St.DrawingArea): void {
    const cr = area.get_context();
    if (!cr) return;

    try {
      const [width, height] = area.get_surface_size();
      paintVisualizerBars({
        context: cr, width, height, bars: this._smoother.displayBars,
        position: this._config.position, style: this._config.style,
        colorMode: this._config.colorMode, colors: this._colors,
        barSpacingPercent: this._config.barSpacing,
        cornerRadiusPercent: this._config.cornerRadius,
        opacityPercent: this._config.opacity, fadeAlpha: this._smoother.fadeAlpha,
      });
    } finally {
      (cr as unknown as GjsCairoContext).$dispose();
    }
  }
}
