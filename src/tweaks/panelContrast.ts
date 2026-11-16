/**
 * Panel Contrast Controller.
 * Dynamically ensures optimal text/icon contrast across opaque, transparent,
 * and blur-my-shell top/bottom panels.
 */

import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const CLASS_OPAQUE = 'meowterialyou-panel-opaque';
const CLASS_TRANS_DARK = 'meowterialyou-panel-trans-dark';
const CLASS_TRANS_LIGHT = 'meowterialyou-panel-trans-light';

export interface PanelContrastUpdateOptions {
  isTopDark?: boolean;
  isBottomDark?: boolean;
}

export class PanelContrastController {
  private _settings: Gio.Settings;
  private _signalIds: number[] = [];
  private _panelSignalIds: number[] = [];
  private _isTopDark: boolean = true;
  private _isBottomDark: boolean = true;
  private _isUpdating: boolean = false;

  constructor(settings: Gio.Settings) {
    this._settings = settings;
  }

  enable(): void {
    this._signalIds.push(
      this._settings.connect('changed::transparent-panel', () => this.update())
    );

    this._panelSignalIds.push(
      Main.panel.connect('notify::style-class-name', () => this.update()),
      Main.panel.connect('notify::y', () => this.update())
    );

    this.update();
  }

  destroy(): void {
    for (const signalId of this._signalIds) {
      this._settings.disconnect(signalId);
    }
    this._signalIds = [];

    for (const signalId of this._panelSignalIds) {
      Main.panel.disconnect(signalId);
    }
    this._panelSignalIds = [];

    this._clearClasses();
  }

  update(options?: PanelContrastUpdateOptions): void {
    if (this._isUpdating) {
      return;
    }

    if (options?.isTopDark !== undefined) {
      this._isTopDark = options.isTopDark;
    }
    if (options?.isBottomDark !== undefined) {
      this._isBottomDark = options.isBottomDark;
    }

    this._isUpdating = true;
    try {
      const isTransparent = this._detectPanelTransparency();
      const isAtBottom = Main.panel.y > 100;
      const isRegionDark = isAtBottom ? this._isBottomDark : this._isTopDark;

      const targetClass = !isTransparent
        ? CLASS_OPAQUE
        : isRegionDark
          ? CLASS_TRANS_DARK
          : CLASS_TRANS_LIGHT;

      if (!Main.panel.has_style_class_name(targetClass)) {
        this._clearClasses();
        Main.panel.add_style_class_name(targetClass);
      }
    } finally {
      this._isUpdating = false;
    }
  }

  private _detectPanelTransparency(): boolean {
    if (this._settings.get_boolean('transparent-panel')) {
      return true;
    }

    if (
      Main.panel.has_style_class_name('transparent-panel') ||
      Main.panel.has_style_class_name('contrasted-panel') ||
      Main.panel.has_style_class_name('bms-panel-blurred')
    ) {
      return true;
    }

    return this._checkBlurMyShellPanelSetting();
  }

  private _checkBlurMyShellPanelSetting(): boolean {
    try {
      const extensionManager = Main.extensionManager as unknown as {
        lookup(uuid: string): { state: number; dir: Gio.File } | undefined;
      };
      const bms = extensionManager?.lookup('blur-my-shell@aunetx');
      if (bms && bms.state === 1) {
        const schemaDir = Gio.File.new_for_path(`${bms.dir.get_path()}/schemas`);
        const schemaDirPath = schemaDir.get_path();
        if (schemaDirPath) {
          const source = Gio.SettingsSchemaSource.new_from_directory(
            schemaDirPath,
            Gio.SettingsSchemaSource.get_default(),
            false
          );
          const schema = source.lookup('org.gnome.shell.extensions.blur-my-shell.panel', false);
          if (schema) {
            const bmsSettings = new Gio.Settings({ settings_schema: schema });
            if (bmsSettings.get_boolean('blur') && bmsSettings.get_boolean('override-background')) {
              const style = bmsSettings.get_int('style-panel');
              return style === 0 || style === 3;
            }
          }
        }
      }
    } catch {
      // Fallback silently if extensionManager API or schemas differ
    }
    return false;
  }

  private _clearClasses(): void {
    Main.panel.remove_style_class_name(CLASS_OPAQUE);
    Main.panel.remove_style_class_name(CLASS_TRANS_DARK);
    Main.panel.remove_style_class_name(CLASS_TRANS_LIGHT);
  }
}
