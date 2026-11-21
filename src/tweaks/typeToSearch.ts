/**
 * Type-to-search behavior controller for GNOME Shell Overview.
 *
 * Operates purely on searchEntry opacity to avoid mutating Clutter actor
 * geometry or interfering with GNOME Shell's ControlsManager layout animations.
 */

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from 'gi://Clutter';

interface SearchControllerType {
  searchActive: boolean;
  connect(signal: string, callback: () => void): number;
  disconnect(id: number): void;
}

interface AnimatableEntry extends Clutter.Actor {
  ease(options: {
    opacity?: number;
    mode?: Clutter.AnimationMode;
    duration?: number;
    onComplete?: () => void;
  }): void;
}

const FADE_DURATION_MS = 120;
const FADE_MODE = Clutter.AnimationMode.EASE_OUT_QUAD;

export class TypeToSearchController {
  private _searchSignalId: number | null = null;
  private _overviewShowingId: number | null = null;
  private _isEnabled: boolean = false;

  enable(): void {
    if (this._isEnabled) return;
    this._isEnabled = true;

    const searchController = Main.overview._overview?.controls?._searchController as unknown as
      | SearchControllerType
      | undefined;
    if (!searchController) return;

    this._overviewShowingId = Main.overview.connect('showing', () => {
      if (!searchController.searchActive) {
        this._setSearchOpacity(0, false);
      }
    });

    this._searchSignalId = searchController.connect('notify::search-active', () => {
      this._setSearchOpacity(searchController.searchActive ? 255 : 0, true);
    });

    if (Main.overview.visible && !searchController.searchActive) {
      this._setSearchOpacity(0, false);
    }
  }

  disable(): void {
    if (this._overviewShowingId !== null) {
      Main.overview.disconnect(this._overviewShowingId);
      this._overviewShowingId = null;
    }

    const searchController = Main.overview._overview?.controls?._searchController as unknown as
      | SearchControllerType
      | undefined;
    if (searchController && this._searchSignalId !== null) {
      searchController.disconnect(this._searchSignalId);
      this._searchSignalId = null;
    }

    this._isEnabled = false;
    this._restoreSearchEntry();
  }

  private _getSearchEntry(): AnimatableEntry | null {
    const entry = Main.overview.searchEntry;
    return entry ? (entry as unknown as AnimatableEntry) : null;
  }

  private _restoreSearchEntry(): void {
    const entry = this._getSearchEntry();
    if (!entry) return;

    entry.remove_all_transitions();
    entry.opacity = 255;
    entry.visible = true;
  }

  private _setSearchOpacity(targetOpacity: number, shouldAnimate: boolean): void {
    const entry = this._getSearchEntry();
    if (!entry) return;

    entry.remove_all_transitions();

    if (!shouldAnimate) {
      entry.opacity = targetOpacity;
      return;
    }

    entry.ease({
      opacity: targetOpacity,
      mode: FADE_MODE,
      duration: FADE_DURATION_MS,
    });
  }
}
