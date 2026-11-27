/**
 * Generates LS_COLORS, GCC_COLORS, GREP_COLORS, and LESS_TERMCAP exports
 * from the active Material You palette.
 */

import { convertHexToRgbTuple } from '../color/colorConverter.js';
import { getTerminalAnsiPalette } from './terminalPalette.js';
import type { MaterialSchemeColors } from '../types/theme.js';

function rgbTrueColor(hexColor: string): string {
  const [r, g, b] = convertHexToRgbTuple(hexColor);
  return `38;2;${r};${g};${b}`;
}

export function buildShellEnvExports(scheme: MaterialSchemeColors, isDark: boolean): string {
  const primary = scheme.primary || '#8ab4f8';
  const secondary = scheme.secondary || '#b8c8da';
  const tertiary = scheme.tertiary || '#d3bee6';
  const error = scheme.error || '#ffb4a9';
  const outline = scheme.outline || '#8c9198';
  const palette = getTerminalAnsiPalette({ scheme, isDark });

  const cDir = rgbTrueColor(palette[4] ?? primary);
  const cExec = rgbTrueColor(palette[2] ?? primary);
  const cLink = rgbTrueColor(palette[6] ?? tertiary);
  const cArch = rgbTrueColor(palette[1] ?? error);
  const cMedia = rgbTrueColor(palette[5] ?? tertiary);
  const cWarn = rgbTrueColor(palette[3] ?? secondary);
  const cDoc = rgbTrueColor(primary);
  const cSec = rgbTrueColor(secondary);
  const cTert = rgbTrueColor(tertiary);
  const cMuted = rgbTrueColor(outline);
  const cErr = rgbTrueColor(error);

  return `export LS_COLORS="di=${cDir};1:ln=${cLink}:so=${cMedia}:pi=${cWarn}:ex=${cExec};1:bd=${cWarn};1:cd=${cWarn}:su=${cErr};1:sg=${cErr}:tw=${cDir};4:ow=${cDir};4:*.tar=${cArch}:*.gz=${cArch}:*.zip=${cArch}:*.7z=${cArch}:*.rar=${cArch}:*.jpg=${cMedia}:*.jpeg=${cMedia}:*.png=${cMedia}:*.gif=${cMedia}:*.svg=${cMedia}:*.webp=${cMedia}:*.mp3=${cMedia}:*.mp4=${cMedia}:*.mkv=${cMedia}:*.pdf=${cErr}:*.md=${cDoc}:*.txt=${cMuted}:*.py=${cExec}:*.js=${cWarn}:*.mjs=${cWarn}:*.ts=${cLink}:*.tsx=${cLink}:*.jsx=${cWarn}:*.json=${cMuted}:*.jsonc=${cMuted}:*.yaml=${cMuted}:*.yml=${cMuted}:*.toml=${cMuted}:*.sh=${cExec}:*.css=${cMedia}:*.html=${cArch}:"
export GCC_COLORS="error=${cErr};1:warning=${cWarn};1:note=${cLink}:caret=${cExec};1:locus=${cMuted}:quote=${cDoc}"
export GREP_COLORS="ms=${cDoc};1:mc=${cDoc};1:sl=:cx=${cMuted}:fn=${cMedia}:ln=${cLink}:bn=${cLink}:se=${cMuted}"
export LESS_TERMCAP_mb=$'\\E[1;${cDoc}m'
export LESS_TERMCAP_md=$'\\E[1;${cDoc}m'
export LESS_TERMCAP_me=$'\\E[0m'
export LESS_TERMCAP_se=$'\\E[0m'
export LESS_TERMCAP_so=$'\\E[${cTert};${cMuted.replace('38;', '48;')}m'
export LESS_TERMCAP_ue=$'\\E[0m'
export LESS_TERMCAP_us=$'\\E[4;${cSec}m'`;
}
