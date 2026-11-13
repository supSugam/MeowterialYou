/**
 * Session snapshot and reversible state management.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { getHomeDirectory, readTextFile, writeTextFile } from '../theme/fileHelper.js';

interface SavedSessionState {
  gtkTheme: string;
  iconTheme: string;
  buttonLayout: string;
  shellTheme: string;
}

export class SessionStateManager {
  private _stateFile: string;
  private _savedState: SavedSessionState | null = null;

  constructor() {
    this._stateFile = GLib.build_filenamev([
      getHomeDirectory(),
      '.config',
      'meowterialyou',
      'backup_state.json',
    ]);
  }

  captureInitialState(): void {
    if (this._hasExistingBackup()) {
      return;
    }

    const interfaceSettings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' });
    const wmSettings = new Gio.Settings({ schema: 'org.gnome.desktop.wm.preferences' });

    let shellTheme = '';
    try {
      const defaultSource = Gio.SettingsSchemaSource.get_default();
      if (defaultSource && defaultSource.lookup('org.gnome.shell.extensions.user-theme', true)) {
        const userThemeSettings = new Gio.Settings({
          schema: 'org.gnome.shell.extensions.user-theme',
        });
        shellTheme = userThemeSettings.get_string('name');
      }
    } catch {
      shellTheme = '';
    }

    this._savedState = {
      gtkTheme: interfaceSettings.get_string('gtk-theme'),
      iconTheme: interfaceSettings.get_string('icon-theme'),
      buttonLayout: wmSettings.get_string('button-layout'),
      shellTheme,
    };

    writeTextFile(this._stateFile, JSON.stringify(this._savedState, null, 2));
  }

  restoreOriginalState(): void {
    const state = this._loadSavedState();
    if (!state) {
      return;
    }

    const interfaceSettings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' });
    const wmSettings = new Gio.Settings({ schema: 'org.gnome.desktop.wm.preferences' });

    if (state.gtkTheme) {
      interfaceSettings.set_string('gtk-theme', state.gtkTheme);
    }
    if (state.iconTheme) {
      interfaceSettings.set_string('icon-theme', state.iconTheme);
    }
    if (state.buttonLayout) {
      wmSettings.set_string('button-layout', state.buttonLayout);
    }

    if (state.shellTheme !== undefined) {
      try {
        const defaultSource = Gio.SettingsSchemaSource.get_default();
        if (defaultSource && defaultSource.lookup('org.gnome.shell.extensions.user-theme', true)) {
          const userThemeSettings = new Gio.Settings({
            schema: 'org.gnome.shell.extensions.user-theme',
          });
          userThemeSettings.set_string('name', state.shellTheme);
        }
      } catch {
        // User theme extension not found
      }
    }

    this._deleteBackup();
  }

  private _hasExistingBackup(): boolean {
    return Gio.File.new_for_path(this._stateFile).query_exists(null);
  }

  private _loadSavedState(): SavedSessionState | null {
    if (this._savedState) {
      return this._savedState;
    }

    if (!this._hasExistingBackup()) {
      return null;
    }

    try {
      const content = readTextFile(this._stateFile);
      this._savedState = JSON.parse(content) as SavedSessionState;
      return this._savedState;
    } catch {
      return null;
    }
  }

  private _deleteBackup(): void {
    const file = Gio.File.new_for_path(this._stateFile);
    if (file.query_exists(null)) {
      try {
        file.delete(null);
      } catch {
        // Ignore deletion errors
      }
    }
    this._savedState = null;
  }
}
