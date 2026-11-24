/**
 * Overview state controller for GNOME Shell top bar.
 * Manages `.in-overview` style class on Main.panel during overview transitions.
 */

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class OverviewStateController {
  private _showingSignalId: number | null = null;
  private _hidingSignalId: number | null = null;
  private _isEnabled: boolean = false;

  enable(): void {
    if (this._isEnabled) return;
    this._isEnabled = true;

    this._showingSignalId = Main.overview.connect('showing', () => {
      Main.panel.add_style_class_name('in-overview');
    });

    this._hidingSignalId = Main.overview.connect('hiding', () => {
      Main.panel.remove_style_class_name('in-overview');
    });

    if (Main.overview.visibleTarget) {
      Main.panel.add_style_class_name('in-overview');
    }
  }

  destroy(): void {
    if (!this._isEnabled) return;
    this._isEnabled = false;

    if (this._showingSignalId !== null) {
      Main.overview.disconnect(this._showingSignalId);
      this._showingSignalId = null;
    }

    if (this._hidingSignalId !== null) {
      Main.overview.disconnect(this._hidingSignalId);
      this._hidingSignalId = null;
    }

    Main.panel.remove_style_class_name('in-overview');
  }
}
