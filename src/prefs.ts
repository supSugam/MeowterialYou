/**
 * Extension preferences window entry point (GNOME 45+ ESM).
 */

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import type Adw from 'gi://Adw';
import { createGeneralPage } from './ui/prefs/pageGeneral.js';
import { createAppearancePage } from './ui/prefs/pageAppearance.js';
import { createWallpaperPage } from './ui/prefs/pageWallpaper.js';
import { createAppsPage } from './ui/prefs/pageApps.js';
import { createWidgetsPage } from './ui/prefs/pageWidgets.js';
import { createTweaksPage } from './ui/prefs/pageTweaks.js';
import { createAboutPage } from './ui/prefs/pageAbout.js';
import { LiveCssManager } from './ui/prefs/liveCss.js';

export default class MeowterialYouPreferences extends ExtensionPreferences {
  private _liveCss: LiveCssManager | null = null;

  async fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
    const settings = this.getSettings();

    this._liveCss = new LiveCssManager();
    this._liveCss.attach(window, settings);

    window.add(createGeneralPage(settings));
    window.add(createAppearancePage(settings));
    window.add(createWallpaperPage(settings, window));
    window.add(createAppsPage(settings, window));
    window.add(createWidgetsPage(settings));
    window.add(createTweaksPage(settings));
    window.add(createAboutPage());
  }
}
