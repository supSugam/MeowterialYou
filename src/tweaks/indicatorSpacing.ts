/**
 * App Indicator Spacing Controller.
 * Isolates app indicators from Quick Settings and applies compact spacing presets.
 */

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type { IndicatorSpacing } from '../types/theme.js';

const SPACING_CLASSES = [
  'meowterialyou-indicators-relaxed',
  'meowterialyou-indicators-compact',
  'meowterialyou-indicators-ultra-compact',
] as const;

const INDICATOR_STYLE_CLASS = 'meowterialyou-app-indicator';
const QUICK_SETTINGS_STYLE_CLASS = 'meowterialyou-quick-settings-button';

interface PanelActorWithRightBox {
  _rightBox?: St.BoxLayout;
  statusArea: {
    quickSettings?: {
      container?: Clutter.Actor;
      add_style_class_name(className: string): void;
      remove_style_class_name(className: string): void;
    };
  };
}

export class IndicatorSpacingController {
  private _childAddedSignalId: number | null = null;

  apply(spacing: IndicatorSpacing): void {
    this._clearPanelSpacingClasses();
    this._tagQuickSettings();
    this._tagIndicators();
    this._listenForNewIndicators();

    if (spacing !== 'default') {
      Main.panel.add_style_class_name(`meowterialyou-indicators-${spacing}`);
    }
  }

  destroy(): void {
    this._stopListening();
    this._clearPanelSpacingClasses();
    this._untagQuickSettings();
    this._untagIndicators();
  }

  private _getPanel(): PanelActorWithRightBox {
    return Main.panel as unknown as PanelActorWithRightBox;
  }

  private _tagQuickSettings(): void {
    const quickSettings = this._getPanel().statusArea.quickSettings;
    quickSettings?.add_style_class_name(QUICK_SETTINGS_STYLE_CLASS);
  }

  private _untagQuickSettings(): void {
    const quickSettings = this._getPanel().statusArea.quickSettings;
    quickSettings?.remove_style_class_name(QUICK_SETTINGS_STYLE_CLASS);
  }

  private _resolveButtonActor(actor: Clutter.Actor): St.Widget | null {
    if (actor instanceof St.Bin) {
      const child = actor.get_child() ?? actor.get_first_child();
      return child instanceof St.Widget ? child : null;
    }
    return actor instanceof St.Widget ? actor : null;
  }

  private _tagIndicators(): void {
    const panel = this._getPanel();
    const rightBox = panel._rightBox;
    if (!rightBox) return;

    const quickSettingsContainer = panel.statusArea.quickSettings?.container;
    for (const child of rightBox.get_children()) {
      if (child === quickSettingsContainer) continue;
      const button = this._resolveButtonActor(child);
      button?.add_style_class_name(INDICATOR_STYLE_CLASS);
    }
  }

  private _untagIndicators(): void {
    const rightBox = this._getPanel()._rightBox;
    if (!rightBox) return;

    for (const child of rightBox.get_children()) {
      const button = this._resolveButtonActor(child);
      button?.remove_style_class_name(INDICATOR_STYLE_CLASS);
    }
  }

  private _listenForNewIndicators(): void {
    const panel = this._getPanel();
    const rightBox = panel._rightBox;
    if (!rightBox || this._childAddedSignalId !== null) return;

    this._childAddedSignalId = rightBox.connect('child-added', (_box, child) => {
      if (child === panel.statusArea.quickSettings?.container) return;
      const button = this._resolveButtonActor(child);
      button?.add_style_class_name(INDICATOR_STYLE_CLASS);
    });
  }

  private _stopListening(): void {
    const rightBox = this._getPanel()._rightBox;
    if (rightBox && this._childAddedSignalId !== null) {
      rightBox.disconnect(this._childAddedSignalId);
      this._childAddedSignalId = null;
    }
  }

  private _clearPanelSpacingClasses(): void {
    for (const className of SPACING_CLASSES) {
      Main.panel.remove_style_class_name(className);
    }
  }
}
