/**
 * Type-to-search behavior controller for GNOME Shell Overview.
 */

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from 'gi://Clutter';

interface EaseActor {
  ease(options: {
    height?: number;
    opacity?: number;
    mode?: Clutter.AnimationMode;
    duration?: number;
  }): void;
}

interface SearchControllerType {
  searchActive: boolean;
  connect(signal: string, callback: () => void): number;
  disconnect(id: number): void;
}

export class TypeToSearchController {
  private _searchSignalId: number | null = null;
  private _overviewShowingId: number | null = null;

  enable(): void {
    this.disable();

    const searchController = Main.overview._overview?.controls?._searchController as unknown as
      | SearchControllerType
      | undefined;

    if (!searchController) {
      return;
    }

    this._overviewShowingId = Main.overview.connect('showing', () => {
      this._setSearchVisible(false);
    });

    this._searchSignalId = searchController.connect('notify::search-active', () => {
      this._setSearchVisible(searchController.searchActive);
    });
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
    this._setSearchVisible(true);
  }

  private _setSearchVisible(isVisible: boolean): void {
    const searchEntry = Main.overview.searchEntry;
    const parent = searchEntry?.get_parent() as unknown as EaseActor | null;
    if (!parent) {
      return;
    }

    parent.ease({
      height: isVisible ? searchEntry.height : 0,
      opacity: isVisible ? 255 : 0,
      mode: Clutter.AnimationMode.EASE,
      duration: isVisible ? 60 : 100,
    });
  }
}
