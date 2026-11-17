/**
 * Blur My Shell Synchronization Controller.
 * Ensures popups and menus dynamically adapt between light and dark modes
 * when blur-my-shell is enabled on GNOME 46+.
 */

import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

interface ExtensionInfo {
  state: number;
  dir: Gio.File;
}

interface ExtensionManager {
  lookup(uuid: string): ExtensionInfo | undefined;
}

const BMS_UUID = 'blur-my-shell@aunetx';
const BMS_POPUP_SCHEMA = 'org.gnome.shell.extensions.blur-my-shell.popup';

const CLASS_SURFACE_DARK = 'bms-popup-surface-dark';
const CLASS_SURFACE_LIGHT = 'bms-popup-surface-light';
const CLASS_BACKGROUND_DARK = 'bms-popup-background-dark';
const CLASS_BACKGROUND_LIGHT = 'bms-popup-background-light';

export class BlurMyShellSyncController {
  private _bmsPopupSettings: Gio.Settings | null = null;
  private _originalStylePopup: number | null = null;
  private _originalPipeline: string | null = null;

  enable(): void {
    this._initSettings();
  }

  destroy(): void {
    this._restoreSettings();
    this._bmsPopupSettings = null;
  }

  syncThemeMode(isDark: boolean): void {
    this._syncUiGroupClasses(isDark);
    this._syncBmsPopupSettings(isDark);
  }

  private _initSettings(): void {
    try {
      const extensionManager = Main.extensionManager as unknown as ExtensionManager;
      const bms = extensionManager?.lookup(BMS_UUID);
      if (!bms || bms.state !== 1) {
        return;
      }

      const schemaDir = Gio.File.new_for_path(`${bms.dir.get_path()}/schemas`);
      const schemaDirPath = schemaDir.get_path();
      if (!schemaDirPath) {
        return;
      }

      const source = Gio.SettingsSchemaSource.new_from_directory(
        schemaDirPath,
        Gio.SettingsSchemaSource.get_default(),
        false
      );
      const schema = source.lookup(BMS_POPUP_SCHEMA, false);
      if (schema) {
        this._bmsPopupSettings = new Gio.Settings({ settings_schema: schema });
        this._originalStylePopup = this._bmsPopupSettings.get_int('style-popup');
        this._originalPipeline = this._bmsPopupSettings.get_string('pipeline');
      }
    } catch {
      // Blur My Shell extension or schema is unavailable
    }
  }

  private _syncUiGroupClasses(isDark: boolean): void {
    if (isDark) {
      Main.uiGroup.remove_style_class_name(CLASS_SURFACE_LIGHT);
      Main.uiGroup.remove_style_class_name(CLASS_BACKGROUND_LIGHT);
      Main.uiGroup.add_style_class_name(CLASS_SURFACE_DARK);
      Main.uiGroup.add_style_class_name(CLASS_BACKGROUND_DARK);
    } else {
      Main.uiGroup.remove_style_class_name(CLASS_SURFACE_DARK);
      Main.uiGroup.remove_style_class_name(CLASS_BACKGROUND_DARK);
      Main.uiGroup.add_style_class_name(CLASS_SURFACE_LIGHT);
      Main.uiGroup.add_style_class_name(CLASS_BACKGROUND_LIGHT);
    }
  }

  private _syncBmsPopupSettings(isDark: boolean): void {
    if (!this._bmsPopupSettings) {
      return;
    }

    try {
      const targetStyle = isDark ? 2 : 1;
      const targetPipeline = isDark ? 'pipeline_default' : 'pipeline_default_light';

      if (this._bmsPopupSettings.get_int('style-popup') !== targetStyle) {
        this._bmsPopupSettings.set_int('style-popup', targetStyle);
      }
      if (this._bmsPopupSettings.get_string('pipeline') !== targetPipeline) {
        this._bmsPopupSettings.set_string('pipeline', targetPipeline);
      }
    } catch {
      // Graceful fallback if settings keys fail
    }
  }

  private _restoreSettings(): void {
    if (!this._bmsPopupSettings) {
      return;
    }

    try {
      const restoreStyle =
        this._originalStylePopup !== null &&
        this._originalStylePopup !== 1 &&
        this._originalStylePopup !== 2
          ? this._originalStylePopup
          : 3;
      this._bmsPopupSettings.set_int('style-popup', restoreStyle);
      if (this._originalPipeline !== null) {
        this._bmsPopupSettings.set_string('pipeline', this._originalPipeline);
      }
    } catch {
      // Silent restore fallback
    }
  }
}
