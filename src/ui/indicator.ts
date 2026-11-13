/**
 * Top bar panel indicator for MeowterialYou status and quick actions.
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import type Gio from 'gi://Gio';

export interface IndicatorCallbacks {
  onCycleNext(): void;
  onOpenPreferences(): void;
}

export const MeowterialIndicator = GObject.registerClass(
  class MeowterialIndicator extends PanelMenu.Button {
    private _settings!: Gio.Settings;
    private _callbacks!: IndicatorCallbacks;
    private _statusLabel!: St.Label;
    private _pauseSwitch!: PopupMenu.PopupSwitchMenuItem;
    private _currentMode: string = 'system';
    private _isDark: boolean = false;

    _init() {
      super._init(0.0, 'MeowterialYou Indicator', false);

      const icon = new St.Icon({
        icon_name: 'applications-graphics-symbolic',
        style_class: 'system-status-icon meowterialyou-indicator-icon',
      });
      this.add_child(icon);
    }

    initialize(settings: Gio.Settings, callbacks: IndicatorCallbacks): void {
      this._settings = settings;
      this._callbacks = callbacks;
      this._buildMenu();
    }

    updateDisplay(isDark: boolean): void {
      if (!this._statusLabel || !this._pauseSwitch) {
        return;
      }

      this._isDark = isDark;
      this._currentMode = this._settings.get_string('theme-mode');
      const isPaused = this._settings.get_boolean('paused');
      const modeText =
        this._currentMode === 'system'
          ? `System (${this._isDark ? 'Dark' : 'Light'})`
          : this._currentMode.toUpperCase();
      const statusText = isPaused ? 'Paused' : 'Active';

      this._statusLabel.set_text(`MeowterialYou • ${statusText} • ${modeText}`);
      this._pauseSwitch.setToggleState(isPaused);
    }

    private _buildMenu(): void {
      const menu = this.menu;
      if (!menu || !('addMenuItem' in menu)) {
        return;
      }

      // 1. Status Header
      const headerItem = new PopupMenu.PopupMenuItem('MeowterialYou • Initializing...', {
        reactive: false,
        can_focus: false,
      });
      this._statusLabel = headerItem.label;
      this._statusLabel.add_style_class_name('meowterialyou-status-label');
      menu.addMenuItem(headerItem);

      menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

      // 2. Next Wallpaper Button
      const nextWallpaperItem = new PopupMenu.PopupMenuItem('Next Wallpaper');
      nextWallpaperItem.connect('activate', () => {
        this._callbacks.onCycleNext();
      });
      menu.addMenuItem(nextWallpaperItem);

      // 3. Pause/Resume Auto-Theming
      this._pauseSwitch = new PopupMenu.PopupSwitchMenuItem(
        'Pause Auto-Theming',
        this._settings.get_boolean('paused')
      );
      this._pauseSwitch.connect('toggled', (_item: unknown, state: boolean) => {
        this._settings.set_boolean('paused', state);
      });
      menu.addMenuItem(this._pauseSwitch);

      menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

      // 4. Mode Selection Submenu
      const modeSubmenu = new PopupMenu.PopupSubMenuMenuItem('Theme Mode', false);
      const modes: Array<{ label: string; mode: 'system' | 'dark' | 'light' }> = [
        { label: 'Follow System', mode: 'system' },
        { label: 'Dark Mode', mode: 'dark' },
        { label: 'Light Mode', mode: 'light' },
      ];

      for (const item of modes) {
        const menuItem = new PopupMenu.PopupMenuItem(item.label);
        menuItem.connect('activate', () => {
          this._settings.set_string('theme-mode', item.mode);
        });
        modeSubmenu.menu.addMenuItem(menuItem);
      }
      menu.addMenuItem(modeSubmenu);

      menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

      // 5. Open Preferences
      const prefsItem = new PopupMenu.PopupMenuItem('Extension Settings');
      prefsItem.connect('activate', () => {
        this._callbacks.onOpenPreferences();
      });
      menu.addMenuItem(prefsItem);
    }
  }
);

export type MeowterialIndicatorType = InstanceType<typeof MeowterialIndicator>;
