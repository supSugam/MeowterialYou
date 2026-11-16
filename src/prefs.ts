/**
 * Extension preferences window entry point (GNOME 45+ ESM).
 */

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import type Adw from 'gi://Adw';
import { createGeneralPage } from './ui/prefs/pageGeneral.js';
import { createWallpaperPage } from './ui/prefs/pageWallpaper.js';
import { createWindowControlsPage } from './ui/prefs/pageWindowControls.js';
import { createIconsPage } from './ui/prefs/pageIcons.js';
import { createTweaksPage } from './ui/prefs/pageTweaks.js';
import { createAdvancedPage } from './ui/prefs/pageAdvanced.js';
import { createAboutPage } from './ui/prefs/pageAbout.js';
import { LiveCssManager } from './ui/prefs/liveCss.js';

export default class MeowterialYouPreferences extends ExtensionPreferences {
  private _liveCss: LiveCssManager | null = null;

  async fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
    const settings = this.getSettings();

    this._liveCss = new LiveCssManager();
    this._liveCss.attach(window);

    window.add(createGeneralPage(settings));
    window.add(createWallpaperPage(settings, window));
    window.add(createWindowControlsPage(settings));
    window.add(createIconsPage(settings));
    window.add(createTweaksPage(settings));
    window.add(createAdvancedPage(settings));
    window.add(createAboutPage());
  }
}
