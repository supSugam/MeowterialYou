/**
 * Blur My Shell Synchronization Controller.
 * Keeps BMS popup styles and pipelines synchronized with MeowterialYou light/dark state,
 * including across lock/unlock cycles and runtime enabling/disabling of BMS.
 */

import type Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
  BMS_EXTENSION_UUID,
  loadBmsPopupSettings,
  restoreBmsPopupSettings,
  syncBmsPopupSettings,
} from './blurMyShellDconf.js';

interface ExtensionInfo {
  state: number;
  dir: Gio.File;
}

interface ExtensionManager {
  lookup(uuid: string): ExtensionInfo | undefined;
  connect(signal: string, callback: () => void): number;
  disconnect(id: number): void;
}

const EXTENSION_STATE_ENABLED = 1;
const CLASS_SURFACE_DARK = 'bms-popup-surface-dark';
const CLASS_SURFACE_LIGHT = 'bms-popup-surface-light';
const CLASS_BACKGROUND_DARK = 'bms-popup-background-dark';
const CLASS_BACKGROUND_LIGHT = 'bms-popup-background-light';

const ALL_BMS_POPUP_CLASSES = [
  CLASS_SURFACE_DARK,
  CLASS_SURFACE_LIGHT,
  CLASS_BACKGROUND_DARK,
  CLASS_BACKGROUND_LIGHT,
];

export class BlurMyShellSyncController {
  private _bmsPopupSettings: Gio.Settings | null = null;
  private _originalStylePopup: number | null = null;
  private _originalPipeline: string | null = null;
  private _lastIsDark: boolean | null = null;
  private _extensionStateChangedId: number | null = null;

  enable(): void {
    this._ensureSettings();
    const extensionManager = Main.extensionManager as unknown as ExtensionManager;
    if (extensionManager && this._extensionStateChangedId === null) {
      this._extensionStateChangedId = extensionManager.connect('extension-state-changed', () => {
        this._handleExtensionStateChanged();
      });
    }
  }

  destroy(): void {
    if (this._extensionStateChangedId !== null) {
      try {
        const extensionManager = Main.extensionManager as unknown as ExtensionManager;
        extensionManager?.disconnect(this._extensionStateChangedId);
      } catch {
        // Ignore teardown disconnect failures
      }
      this._extensionStateChangedId = null;
    }

    if (this._bmsPopupSettings) {
      restoreBmsPopupSettings(
        this._bmsPopupSettings,
        this._originalStylePopup,
        this._originalPipeline
      );
    }
    this._clearUiGroupClasses();
    this._bmsPopupSettings = null;
    this._originalStylePopup = null;
    this._originalPipeline = null;
    this._lastIsDark = null;
  }

  syncThemeMode(isDark: boolean): void {
    this._lastIsDark = isDark;
    if (!this._ensureSettings()) {
      this._clearUiGroupClasses();
      return;
    }

    this._syncUiGroupClasses(isDark);
    if (this._bmsPopupSettings) {
      syncBmsPopupSettings(this._bmsPopupSettings, isDark);
    }
  }

  private _handleExtensionStateChanged(): void {
    const extensionManager = Main.extensionManager as unknown as ExtensionManager;
    const bms = extensionManager?.lookup(BMS_EXTENSION_UUID);
    if (!bms || bms.state !== EXTENSION_STATE_ENABLED) {
      this._bmsPopupSettings = null;
      this._clearUiGroupClasses();
      return;
    }

    if (this._lastIsDark !== null) {
      this.syncThemeMode(this._lastIsDark);
    } else {
      this._ensureSettings();
    }
  }

  private _ensureSettings(): boolean {
    const extensionManager = Main.extensionManager as unknown as ExtensionManager;
    const bms = extensionManager?.lookup(BMS_EXTENSION_UUID);
    if (!bms || bms.state !== EXTENSION_STATE_ENABLED) {
      return false;
    }
    if (this._bmsPopupSettings) {
      return true;
    }

    const popupSettings = loadBmsPopupSettings(`${bms.dir.get_path()}/schemas`);
    if (!popupSettings) {
      return false;
    }

    this._bmsPopupSettings = popupSettings;
    this._originalStylePopup = popupSettings.get_int('style-popup');
    this._originalPipeline = popupSettings.get_string('pipeline');
    return true;
  }

  private _syncUiGroupClasses(isDark: boolean): void {
    const toRemove = isDark
      ? [CLASS_SURFACE_LIGHT, CLASS_BACKGROUND_LIGHT]
      : [CLASS_SURFACE_DARK, CLASS_BACKGROUND_DARK];
    const toAdd = isDark
      ? [CLASS_SURFACE_DARK, CLASS_BACKGROUND_DARK]
      : [CLASS_SURFACE_LIGHT, CLASS_BACKGROUND_LIGHT];

    for (const className of toRemove) Main.uiGroup.remove_style_class_name(className);
    for (const className of toAdd) Main.uiGroup.add_style_class_name(className);
  }

  private _clearUiGroupClasses(): void {
    for (const className of ALL_BMS_POPUP_CLASSES) {
      Main.uiGroup.remove_style_class_name(className);
    }
  }
}
