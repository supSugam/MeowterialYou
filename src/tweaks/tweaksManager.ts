/**
 * Top bar and GNOME Shell runtime tweaks manager.
 */

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type Gio from 'gi://Gio';
import type { IndicatorSpacing } from '../types/theme.js';
import { TypeToSearchController } from './typeToSearch.js';

const SPACING_CLASSES = [
  'meowterialyou-indicators-relaxed',
  'meowterialyou-indicators-compact',
  'meowterialyou-indicators-ultra-compact',
];

export class TweaksManager {
  private _settings: Gio.Settings;
  private _typeToSearch: TypeToSearchController;
  private _signalIds: number[] = [];

  constructor(settings: Gio.Settings) {
    this._settings = settings;
    this._typeToSearch = new TypeToSearchController();
  }

  enable(): void {
    this._applyTopBarElementVisibility();
    this._applyIndicatorSpacing();
    this._applyNotificationDot();
    this._applyWindowCloseButton();
    this._applyTypeToSearch();
    this._setupSettingsListeners();
  }

  destroy(): void {
    for (const signalId of this._signalIds) {
      this._settings.disconnect(signalId);
    }
    this._signalIds = [];

    this._typeToSearch.disable();
    this._restoreTopBarElementVisibility();
    this._clearPanelClasses();
    Main.layoutManager.uiGroup.remove_style_class_name('meowterialyou-hide-window-close');
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
    for (const className of SPACING_CLASSES) {
      Main.panel.remove_style_class_name(className);
    }
    const spacing = this._settings.get_string('indicator-spacing') as IndicatorSpacing;
    if (spacing !== 'default') {
      Main.panel.add_style_class_name(`meowterialyou-indicators-${spacing}`);
    }
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

  private _clearPanelClasses(): void {
    for (const className of SPACING_CLASSES) {
      Main.panel.remove_style_class_name(className);
    }
    Main.panel.remove_style_class_name('meowterialyou-hide-notification-dot');
  }
}
