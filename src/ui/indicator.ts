/**
 * Top bar panel indicator for MeowterialYou status and quick actions.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import Gio from 'gi://Gio';

export interface IndicatorCallbacks {
  onReapplyTheme(): void;
  onCycleNext(): void;
  onOpenPreferences(): void;
}

export const MeowterialIndicator = GObject.registerClass(
  class MeowterialIndicator extends PanelMenu.Button {
    declare private _settings: Gio.Settings;
    declare private _callbacks: IndicatorCallbacks;
    declare private _pauseSwitch: PopupMenu.PopupSwitchMenuItem;
    declare private _icon: St.Icon;

    _init() {
      super._init(0.5, 'MeowterialYou Indicator', false);

      this._icon = new St.Icon({
        style_class: 'system-status-icon',
        y_align: Clutter.ActorAlign.CENTER,
        y_expand: true,
      });
      this.add_child(this._icon);
    }

    initialize(settings: Gio.Settings, callbacks: IndicatorCallbacks, extensionPath: string): void {
      this._settings = settings;
      this._callbacks = callbacks;

      if (!this._icon) {
        this._icon = new St.Icon({
          style_class: 'system-status-icon',
          y_align: Clutter.ActorAlign.CENTER,
          y_expand: true,
        });
        this.add_child(this._icon);
      }

      const iconFile = Gio.File.new_for_path(
        `${extensionPath}/data/icons/meowterialyou-symbolic.svg`
      );
      if (iconFile.query_exists(null)) {
        this._icon.gicon = new Gio.FileIcon({ file: iconFile });
      } else {
        this._icon.icon_name = 'applications-graphics-symbolic';
      }

      this._buildMenu();
    }

    updateDisplay(_isDark: boolean): void {
      if (!this._pauseSwitch) {
        return;
      }
      const isPaused = this._settings.get_boolean('paused');
      this._pauseSwitch.setToggleState(isPaused);
    }

    private _buildMenu(): void {
      const menu = this.menu;
      if (!menu || !('addMenuItem' in menu)) {
        return;
      }

      // 1. Reapply Theme
      const reapplyItem = new PopupMenu.PopupMenuItem('Reapply Theme');
      reapplyItem.connect('activate', () => {
        this._callbacks.onReapplyTheme();
      });
      menu.addMenuItem(reapplyItem);

      // 2. Next Wallpaper
      const nextWallpaperItem = new PopupMenu.PopupMenuItem('Next Wallpaper');
      nextWallpaperItem.connect('activate', () => {
        this._callbacks.onCycleNext();
      });
      menu.addMenuItem(nextWallpaperItem);

      menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

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
      const preferencesItem = new PopupMenu.PopupMenuItem('Extension Settings');
      preferencesItem.connect('activate', () => {
        this._callbacks.onOpenPreferences();
      });
      menu.addMenuItem(preferencesItem);
    }
  }
);

export type MeowterialIndicatorType = InstanceType<typeof MeowterialIndicator>;
