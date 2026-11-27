/**
 * Apps preferences page — terminals, code editors, and Obsidian integrations.
 */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import type Gtk from 'gi://Gtk';
import { isAntigravityAppDetected } from '../../apps/antigravityAppTheme.js';
import { isGhosttyDetected } from '../../apps/ghosttyTheme.js';
import { discoverObsidianVaults } from '../../apps/obsidianTheme.js';
import { discoverVerifiedVscodeEditors } from '../../apps/vscodeForks.js';
import { createFastfetchGroup } from './fastfetchGroup.js';

function detectGnomeTerminalsSummary(): string {
  const source = Gio.SettingsSchemaSource.get_default();
  const detected: string[] = [];
  if (source?.lookup('org.gnome.Terminal.ProfilesList', true)) detected.push('GNOME Terminal');
  if (source?.lookup('org.gnome.Console', true)) detected.push('GNOME Console');
  return detected.length > 0
    ? `Detected: ${detected.join(', ')} — adaptive 16-color palette and opacity`
    : 'Syncs GNOME Terminal ANSI palette and GNOME Console dark/light mode when installed';
}

export function createAppsPage(
  settings: Gio.Settings,
  parentWindow?: Gtk.Window
): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({
    title: 'Apps',
    icon_name: 'applications-other-symbolic',
  });

  // ── Terminals ─────────────────────────────────────────────────────────────
  const terminalGroup = new Adw.PreferencesGroup({
    title: 'Terminals',
    description: 'Inject dynamic Material You color palettes and adaptive contrast transparency',
  });
  page.add(terminalGroup);

  const gnomeTermRow = new Adw.SwitchRow({
    title: 'GNOME Terminal and Console',
    subtitle: detectGnomeTerminalsSummary(),
  });
  settings.bind('terminal-theming-enabled', gnomeTermRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  terminalGroup.add(gnomeTermRow);

  const ghosttyRow = new Adw.SwitchRow({
    title: 'Ghostty',
    subtitle: isGhosttyDetected()
      ? 'Detected — writes themes/MeowterialYou-{dark,light} and preserves user config'
      : 'Ghostty not detected — applies automatically once installed',
  });
  settings.bind('ghostty-enabled', ghosttyRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  terminalGroup.add(ghosttyRow);

  const promptRow = new Adw.SwitchRow({
    title: 'Shell Prompt and Colors (Bash/Zsh)',
    subtitle: 'Generates ~/.config/meowterialyou/prompt.sh for PS1, git status, and LS_COLORS',
  });
  settings.bind('shell-prompt-enabled', promptRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  terminalGroup.add(promptRow);

  // ── Code Editors ──────────────────────────────────────────────────────────
  const editorsGroup = new Adw.PreferencesGroup({
    title: 'Code Editors',
    description: 'Sync dynamic theme extension only to verified VS Code and fork installations',
  });
  page.add(editorsGroup);

  const verifiedEditors = discoverVerifiedVscodeEditors();
  const editorNames = Array.from(new Set(verifiedEditors.map((editor) => editor.name)));
  const vscodeRow = new Adw.SwitchRow({
    title: 'VS Code and Verified Forks',
    subtitle:
      editorNames.length > 0
        ? `Verified: ${editorNames.join(', ')}`
        : 'No verified VS Code, Cursor, Antigravity IDE, Windsurf, or VSCodium profiles found',
  });
  settings.bind('vscode-enabled', vscodeRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  editorsGroup.add(vscodeRow);

  const antigravityRow = new Adw.SwitchRow({
    title: 'Antigravity App',
    subtitle: isAntigravityAppDetected()
      ? 'Detected — injects light/dark customThemeSeeds into ~/.gemini/config/config.json'
      : 'Antigravity App not detected — applies automatically once installed',
  });
  settings.bind('antigravity-app-enabled', antigravityRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  editorsGroup.add(antigravityRow);

  // ── Knowledge Base ────────────────────────────────────────────────────────
  const notesGroup = new Adw.PreferencesGroup({
    title: 'Notes',
    description: 'Apply dynamic Material You stylesheets to local knowledge bases',
  });
  page.add(notesGroup);

  const vaults = discoverObsidianVaults();
  const obsidianRow = new Adw.SwitchRow({
    title: 'Obsidian',
    subtitle:
      vaults.length > 0
        ? `Discovered ${vaults.length} vault${vaults.length === 1 ? '' : 's'} — writes MeowterialYou Material You theme`
        : 'No Obsidian vaults found yet — checked native, Flatpak, and Snap configs',
  });
  settings.bind('obsidian-enabled', obsidianRow, 'active', Gio.SettingsBindFlags.DEFAULT);
  notesGroup.add(obsidianRow);

  page.add(createFastfetchGroup(settings, parentWindow));

  return page;
}
