/**
 * Center Islands & Media Controls Controller.
 * Identifies center panel buttons and Media Controls instances to apply Material You island pill styling.
 */

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const MEDIA_CONTROLS_CLASS = 'meowterialyou-media-controls-button';
const CENTER_ISLAND_CLASS = 'meowterialyou-center-island';

interface PanelWithBoxes {
  _leftBox?: St.BoxLayout;
  _centerBox?: St.BoxLayout;
  _rightBox?: St.BoxLayout;
  statusArea: Record<string, { container?: Clutter.Actor; add_style_class_name(c: string): void; remove_style_class_name(c: string): void } | undefined>;
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

  private _getPanel(): PanelWithBoxes {
    return Main.panel as unknown as PanelWithBoxes;
  }

  private _resolveButtonActor(actor: Clutter.Actor): St.Widget | null {
    if (actor instanceof St.Bin) {
      const child = actor.get_child() ?? actor.get_first_child();
      return child instanceof St.Widget ? child : null;
    }
    return actor instanceof St.Widget ? actor : null;
  }

  private _isClockActor(actor: Clutter.Actor): boolean {
    const button = this._resolveButtonActor(actor);
    return button?.has_style_class_name('clock-display') ?? false;
  }

  private _isMediaControlsActor(actor: Clutter.Actor): boolean {
    const button = this._resolveButtonActor(actor);
    const target = button ?? actor;
    if (target.name === 'Media Controls') {
      return true;
    }
    const panel = this._getPanel();
    const mcEntry = panel.statusArea['Media Controls'];
    if (mcEntry && (mcEntry.container === actor || mcEntry.container === target)) {
      return true;
    }
    return false;
  }

  private _tagActor(child: Clutter.Actor, isCenter: boolean): void {
    const button = this._resolveButtonActor(child);
    if (!button) return;

    if (this._isMediaControlsActor(child) || this._isMediaControlsActor(button)) {
      button.add_style_class_name(MEDIA_CONTROLS_CLASS);
    }
    if (isCenter && !this._isClockActor(child)) {
      button.add_style_class_name(CENTER_ISLAND_CLASS);
    }
  }

  private _tagAllIslands(): void {
    const panel = this._getPanel();

    // Check direct statusArea registration
    const mcEntry = panel.statusArea['Media Controls'];
    mcEntry?.add_style_class_name(MEDIA_CONTROLS_CLASS);

    // Tag children in boxes
    const centerBox = panel._centerBox;
    if (centerBox) {
      for (const child of centerBox.get_children()) {
        this._tagActor(child, true);
      }
    }

    // Check if media controls is in left or right boxes
    for (const box of [panel._leftBox, panel._rightBox]) {
      if (!box) continue;
      for (const child of box.get_children()) {
        this._tagActor(child, false);
      }
    }
  }

  private _untagAllIslands(): void {
    const panel = this._getPanel();
    const mcEntry = panel.statusArea['Media Controls'];
    mcEntry?.remove_style_class_name(MEDIA_CONTROLS_CLASS);

    for (const box of [panel._leftBox, panel._centerBox, panel._rightBox]) {
      if (!box) continue;
      for (const child of box.get_children()) {
        const button = this._resolveButtonActor(child);
        button?.remove_style_class_name(MEDIA_CONTROLS_CLASS);
        button?.remove_style_class_name(CENTER_ISLAND_CLASS);
      }
    }
  }

  private _listenForBoxChanges(): void {
    const panel = this._getPanel();
    const boxes: Array<{ box?: St.BoxLayout; isCenter: boolean }> = [
      { box: panel._centerBox, isCenter: true },
      { box: panel._leftBox, isCenter: false },
      { box: panel._rightBox, isCenter: false },
    ];

    for (const { box, isCenter } of boxes) {
      if (!box) continue;
      const id = box.connect('child-added', (_b, child) => {
        this._tagActor(child, isCenter);
      });
      this._signalIds.push({ box, id });
    }
  }

  private _stopListening(): void {
    for (const { box, id } of this._signalIds) {
      box.disconnect(id);
    }
    this._signalIds = [];
  }
}
