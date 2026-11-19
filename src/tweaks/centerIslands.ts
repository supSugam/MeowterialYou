/**
 * Center Islands Controller.
 * Generically classifies every non-clock button in #panelCenter as a
 * meowterialyou-center-island so it receives the same Material You pill
 * styling as the Clock — without hardcoding any extension name.
 */

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const CENTER_ISLAND_CLASS = 'meowterialyou-center-island';

interface PanelWithCenterBox {
  _centerBox?: St.BoxLayout;
}

export class CenterIslandsController {
  private _signalIds: Array<{ box: St.BoxLayout; id: number }> = [];

  enable(): void {
    this._tagAllIslands();
    this._listenForBoxChanges();
  }

  destroy(): void {
    this._stopListening();
    this._untagAllIslands();
  }

  private _getPanel(): PanelWithCenterBox {
    return Main.panel as unknown as PanelWithCenterBox;
  }

  private _resolveButtonActor(actor: Clutter.Actor): St.Widget | null {
    if (actor instanceof St.Bin) {
      const child = actor.get_child() ?? actor.get_first_child();
      return child instanceof St.Widget ? child : null;
    }
    return actor instanceof St.Widget ? actor : null;
  }

  /**
   * The native GNOME clock button carries the `clock-display` style class.
   * Every other button in #panelCenter is a third-party center island.
   */
  private _isClockActor(actor: Clutter.Actor): boolean {
    const button = this._resolveButtonActor(actor);
    return button?.has_style_class_name('clock-display') ?? false;
  }

  private _tagActor(child: Clutter.Actor): void {
    if (this._isClockActor(child)) return;
    const button = this._resolveButtonActor(child);
    button?.add_style_class_name(CENTER_ISLAND_CLASS);
  }

  private _tagAllIslands(): void {
    const centerBox = this._getPanel()._centerBox;
    if (!centerBox) return;
    for (const child of centerBox.get_children()) {
      this._tagActor(child);
    }
  }

  private _untagAllIslands(): void {
    const centerBox = this._getPanel()._centerBox;
    if (!centerBox) return;
    for (const child of centerBox.get_children()) {
      const button = this._resolveButtonActor(child);
      button?.remove_style_class_name(CENTER_ISLAND_CLASS);
    }
  }

  private _listenForBoxChanges(): void {
    const centerBox = this._getPanel()._centerBox;
    if (!centerBox) return;
    const id = centerBox.connect('child-added', (_box, child) => {
      this._tagActor(child);
    });
    this._signalIds.push({ box: centerBox, id });
  }

  private _stopListening(): void {
    for (const { box, id } of this._signalIds) {
      box.disconnect(id);
    }
    this._signalIds = [];
  }
}
