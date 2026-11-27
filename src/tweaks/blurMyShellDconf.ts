/**
 * Shared Blur My Shell popup dconf helpers usable from both GNOME Shell and CLI.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const BMS_EXTENSION_UUID = 'blur-my-shell@aunetx';
export const BMS_POPUP_SCHEMA_ID = 'org.gnome.shell.extensions.blur-my-shell.popup';

export const BMS_STYLE_TRANSPARENT = 0;
export const BMS_STYLE_LIGHT = 1;
export const BMS_STYLE_DARK = 2;
export const BMS_STYLE_AUTOMATIC = 3;

export const BMS_PIPELINE_DARK_DEFAULT = 'pipeline_default';
export const BMS_PIPELINE_LIGHT_DEFAULT = 'pipeline_default_light';

export function loadBmsPopupSettings(schemaDirPath: string): Gio.Settings | null {
  try {
    const compiledPath = GLib.build_filenamev([schemaDirPath, 'gschemas.compiled']);
    if (!GLib.file_test(compiledPath, GLib.FileTest.EXISTS)) {
      return null;
    }
    const source = Gio.SettingsSchemaSource.new_from_directory(
      schemaDirPath,
      Gio.SettingsSchemaSource.get_default(),
      false
    );
    const schema = source.lookup(BMS_POPUP_SCHEMA_ID, false);
    return schema ? new Gio.Settings({ settings_schema: schema }) : null;
  } catch {
    return null;
  }
}

export function syncBmsPopupSettings(popupSettings: Gio.Settings, isDark: boolean): void {
  try {
    const currentStyle = popupSettings.get_int('style-popup');
    const targetStyle = isDark ? BMS_STYLE_DARK : BMS_STYLE_LIGHT;
    if (currentStyle !== BMS_STYLE_TRANSPARENT && currentStyle !== targetStyle) {
      popupSettings.set_int('style-popup', targetStyle);
    }

    if (!popupSettings.get_boolean('pipeline-auto-mode')) {
      const currentPipeline = popupSettings.get_string('pipeline');
      const targetPipeline = isDark ? BMS_PIPELINE_DARK_DEFAULT : BMS_PIPELINE_LIGHT_DEFAULT;
      const isStandardDefaultPipeline =
        currentPipeline === BMS_PIPELINE_DARK_DEFAULT ||
        currentPipeline === BMS_PIPELINE_LIGHT_DEFAULT;

      if (isStandardDefaultPipeline && currentPipeline !== targetPipeline) {
        popupSettings.set_string('pipeline', targetPipeline);
      }
    }
  } catch {
    // Graceful fallback if Blur My Shell schema keys differ across versions
  }
}

export function syncBmsPopupSettingsFromInstalled(isDark: boolean): void {
  const candidateSchemaDirs = [
    GLib.build_filenamev([GLib.get_user_data_dir(), 'gnome-shell', 'extensions', BMS_EXTENSION_UUID, 'schemas']),
    GLib.build_filenamev(['/usr', 'local', 'share', 'gnome-shell', 'extensions', BMS_EXTENSION_UUID, 'schemas']),
    GLib.build_filenamev(['/usr', 'share', 'gnome-shell', 'extensions', BMS_EXTENSION_UUID, 'schemas']),
  ];

  for (const schemaDirPath of candidateSchemaDirs) {
    const settings = loadBmsPopupSettings(schemaDirPath);
    if (settings) {
      syncBmsPopupSettings(settings, isDark);
      return;
    }
  }
}

export function restoreBmsPopupSettings(
  popupSettings: Gio.Settings,
  originalStylePopup: number | null,
  originalPipeline: string | null
): void {
  try {
    const restoreStyle =
      originalStylePopup !== null &&
      originalStylePopup !== BMS_STYLE_LIGHT &&
      originalStylePopup !== BMS_STYLE_DARK
        ? originalStylePopup
        : BMS_STYLE_AUTOMATIC;
    popupSettings.set_int('style-popup', restoreStyle);

    const isCustomOriginalPipeline =
      originalPipeline !== null &&
      originalPipeline !== BMS_PIPELINE_DARK_DEFAULT &&
      originalPipeline !== BMS_PIPELINE_LIGHT_DEFAULT;

    popupSettings.set_string(
      'pipeline',
      isCustomOriginalPipeline && originalPipeline ? originalPipeline : BMS_PIPELINE_DARK_DEFAULT
    );
  } catch {
    // Silent restore fallback
  }
}
