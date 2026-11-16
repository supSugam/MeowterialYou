/**
 * Top bar and GNOME Shell runtime tweaks manager.
 */

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type Gio from 'gi://Gio';
import type { IndicatorSpacing } from '../types/theme.js';
import { IndicatorSpacingController } from './indicatorSpacing.js';
import { PanelContrastController } from './panelContrast.js';
import { TypeToSearchController } from './typeToSearch.js';
import { BlurMyShellSyncController } from './blurMyShellSync.js';

export class TweaksManager {
  private _settings: Gio.Settings;
  private _typeToSearch: TypeToSearchController;
  private _indicatorSpacing: IndicatorSpacingController;
  private _panelContrast: PanelContrastController;
  private _bmsSync: BlurMyShellSyncController;
  private _signalIds: number[] = [];

  constructor(settings: Gio.Settings) {
    this._settings = settings;
    this._typeToSearch = new TypeToSearchController();
    this._indicatorSpacing = new IndicatorSpacingController();
    this._panelContrast = new PanelContrastController(settings);
    this._bmsSync = new BlurMyShellSyncController();
  }

  enable(): void {
    this._applyTopBarElementVisibility();
    this._applyIndicatorSpacing();
    this._applyNotificationDot();
    this._applyWindowCloseButton();
    this._applyTypeToSearch();
    this._panelContrast.enable();
    this._bmsSync.enable();
    this._setupSettingsListeners();
  }

  destroy(): void {
    for (const signalId of this._signalIds) {
      this._settings.disconnect(signalId);
    }
    this._signalIds = [];

    this._typeToSearch.disable();
    this._indicatorSpacing.destroy();
    this._panelContrast.destroy();
    this._bmsSync.destroy();
    this._restoreTopBarElementVisibility();
    Main.panel.remove_style_class_name('meowterialyou-hide-notification-dot');
    Main.layoutManager.uiGroup.remove_style_class_name('meowterialyou-hide-window-close');
  }

  updatePanelContrast(isTopDark: boolean, isBottomDark: boolean): void {
    this._panelContrast.update({ isTopDark, isBottomDark });
  }

  syncBlurMyShell(isDark: boolean): void {
    this._bmsSync.syncThemeMode(isDark);
  }

  private _setupSettingsListeners(): void {
    const keys = [
      'hide-workspace-indicator', 'hide-a11y-indicator', 'hide-keyboard-indicator',
      'hide-notification-dot', 'indicator-spacing', 'type-to-search', 'hide-window-close-button',
    ];

    for (const key of keys) {
      this._signalIds.push(
        this._settings.connect(`changed::${key}`, () => this._handleSettingChanged(key))
      );
    }
  }

  private _handleSettingChanged(key: string): void {
    if (key === 'indicator-spacing') {
      this._applyIndicatorSpacing();
    } else if (key === 'hide-notification-dot') {
      this._applyNotificationDot();
    } else if (key === 'hide-window-close-button') {
      this._applyWindowCloseButton();
    } else if (key === 'type-to-search') {
      this._applyTypeToSearch();
    } else {
      this._applyTopBarElementVisibility();
    }
  }

  private _applyTopBarElementVisibility(): void {
    const hideWorkspace = this._settings.get_boolean('hide-workspace-indicator');
    const hideA11y = this._settings.get_boolean('hide-a11y-indicator');
    const hideKeyboard = this._settings.get_boolean('hide-keyboard-indicator');

    const statusArea = Main.panel.statusArea;
    if (statusArea.activities?.container) statusArea.activities.container.visible = !hideWorkspace;
    if (statusArea.a11y?.container) statusArea.a11y.container.visible = !hideA11y;
    if (statusArea.keyboard?.container) statusArea.keyboard.container.visible = !hideKeyboard;
  }

  private _restoreTopBarElementVisibility(): void {
    const statusArea = Main.panel.statusArea;
    if (statusArea.activities?.container) statusArea.activities.container.visible = true;
    if (statusArea.a11y?.container) statusArea.a11y.container.visible = true;
    if (statusArea.keyboard?.container) statusArea.keyboard.container.visible = true;
  }

  private _applyIndicatorSpacing(): void {
    const spacing = this._settings.get_string('indicator-spacing') as IndicatorSpacing;
    this._indicatorSpacing.apply(spacing);
  }

  private _applyNotificationDot(): void {
    const hide = this._settings.get_boolean('hide-notification-dot');
    if (hide) {
      Main.panel.add_style_class_name('meowterialyou-hide-notification-dot');
    } else {
      Main.panel.remove_style_class_name('meowterialyou-hide-notification-dot');
    }
  }

  private _applyWindowCloseButton(): void {
    const hide = this._settings.get_boolean('hide-window-close-button');
    if (hide) {
      Main.layoutManager.uiGroup.add_style_class_name('meowterialyou-hide-window-close');
    } else {
      Main.layoutManager.uiGroup.remove_style_class_name('meowterialyou-hide-window-close');
    }
  }

  private _applyTypeToSearch(): void {
    if (this._settings.get_boolean('type-to-search')) {
      this._typeToSearch.enable();
    } else {
      this._typeToSearch.disable();
    }
  }
}
