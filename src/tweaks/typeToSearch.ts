/**
 * Type-to-search behavior controller for GNOME Shell Overview.
 */

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from 'gi://Clutter';

interface AnimatableActor extends Clutter.Actor {
  ease(options: {
    height?: number;
    opacity?: number;
    mode?: Clutter.AnimationMode;
    duration?: number;
    onComplete?: () => void;
  }): void;
}

interface SearchControllerType {
  searchActive: boolean;
  connect(signal: string, callback: () => void): number;
  disconnect(id: number): void;
}

const SEARCH_ANIMATION_MODE = Clutter.AnimationMode.EASE_OUT_QUAD;
const REVEAL_DURATION_MS = 120;
const HIDE_DURATION_MS = 100;
const DEFAULT_ENTRY_HEIGHT = 36;

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
        this._setSearchVisible(false, false);
      }
    });

    this._searchSignalId = searchController.connect('notify::search-active', () => {
      this._setSearchVisible(searchController.searchActive, true);
    });

    if (Main.overview.visible && !searchController.searchActive) {
      this._setSearchVisible(false, true);
    }
  }

  disable(): void {
    if (!this._isEnabled) return;

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
    this._resetSearchEntry();
  }

  private _resolveParentActor(): AnimatableActor | null {
    const searchEntry = Main.overview.searchEntry;
    const parentActor = searchEntry?.get_parent();
    return parentActor ? (parentActor as unknown as AnimatableActor) : null;
  }

  private _resetSearchEntry(): void {
    const parentActor = this._resolveParentActor();
    if (!parentActor) return;

    parentActor.remove_all_transitions();
    parentActor.set_height(-1);
    parentActor.opacity = 255;
    parentActor.visible = true;
  }

  private _setSearchVisible(isVisible: boolean, shouldAnimate: boolean): void {
    const parentActor = this._resolveParentActor();
    const searchEntry = Main.overview.searchEntry;
    if (!parentActor || !searchEntry) return;

    parentActor.remove_all_transitions();

    if (!shouldAnimate) {
      parentActor.set_height(isVisible ? -1 : 0);
      parentActor.opacity = isVisible ? 255 : 0;
      parentActor.visible = isVisible;
      return;
    }

    if (isVisible) {
      parentActor.visible = true;
      const [, preferredHeight] = searchEntry.get_preferred_height(-1);
      const targetHeight = preferredHeight > 0 ? preferredHeight : DEFAULT_ENTRY_HEIGHT;

      parentActor.ease({
        height: targetHeight,
        opacity: 255,
        mode: SEARCH_ANIMATION_MODE,
        duration: REVEAL_DURATION_MS,
        onComplete: () => {
          parentActor.set_height(-1);
        },
      });
    } else {
      parentActor.ease({
        height: 0,
        opacity: 0,
        mode: SEARCH_ANIMATION_MODE,
        duration: HIDE_DURATION_MS,
        onComplete: () => {
          parentActor.visible = false;
        },
      });
    }
  }
}
