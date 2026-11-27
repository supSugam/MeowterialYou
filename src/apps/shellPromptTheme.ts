/**
 * Material You Bash/Zsh prompt (PS1) and dynamic env color reload generator.
 */

import GLib from 'gi://GLib';
import { getTargetHomeDirectories, readTextFile, writeTextFile } from '../theme/fileHelper.js';
import type { MaterialSchemeColors } from '../types/theme.js';
import { buildShellEnvExports } from './shellEnvColors.js';

const SOURCE_LINE =
  '[ -f ~/.config/meowterialyou/prompt.sh ] && source ~/.config/meowterialyou/prompt.sh';
const FASTFETCH_CYCLE_SOURCE_LINE =
  '[ -f "$HOME/.config/meowterialyou/fastfetch-cycle.sh" ] && source "$HOME/.config/meowterialyou/fastfetch-cycle.sh"';
const PROMPT_DISABLED_STUB =
  `#!/bin/bash\n# MeowterialYou shell prompt styling is disabled.\n${FASTFETCH_CYCLE_SOURCE_LINE}\n`;

export interface ShellPromptOptions {
  scheme: MaterialSchemeColors;
  isDark: boolean;
}

export function buildPromptScript({ scheme, isDark }: ShellPromptOptions): string {
  const envExports = buildShellEnvExports(scheme, isDark);

  return `#!/bin/bash
# MeowterialYou - Dynamic Material You Shell Prompt & Colors (auto-generated)

_MY_PROMPT_FILE="$HOME/.config/meowterialyou/prompt.sh"
_MY_PRIMARY=$'\\e[34m'
_MY_SECONDARY=$'\\e[36m'
_MY_TERTIARY=$'\\e[35m'
_MY_ERROR=$'\\e[31m'
_MY_OUTLINE=$'\\e[90m'
_MY_RESET=$'\\e[0m'

if [ -n "$ZSH_VERSION" ]; then
  _NP_START='%{'
  _NP_END='%}'
else
  _NP_START=$'\\001'
  _NP_END=$'\\002'
fi

__meowterialyou_prompt_suffix() {
  local last_exit=$1
  local out=""
  local branch status_color
  branch=$(git symbolic-ref --short HEAD 2>/dev/null || git describe --tags --exact-match 2>/dev/null)
  if [ -n "$branch" ]; then
    if git diff --quiet 2>/dev/null && git diff --staged --quiet 2>/dev/null; then
      status_color="\${_MY_PRIMARY}"
    else
      status_color="\${_MY_ERROR}"
    fi
    out+=" \${_NP_START}\${status_color}\${_NP_END}($branch)\${_NP_START}\${_MY_RESET}\${_NP_END}"
  fi
  if [ "$last_exit" -ne 0 ]; then
    out+=" \${_NP_START}\${_MY_ERROR}\${_NP_END}✗$last_exit\${_NP_START}\${_MY_RESET}\${_NP_END}"
  fi
  printf '%s' "$out"
}

__meowterialyou_refresh_env() {
  [ -r "$_MY_PROMPT_FILE" ] || return 0
  local mtime
  mtime=$(stat -c %Y "$_MY_PROMPT_FILE" 2>/dev/null) || return 0
  if [ "$mtime" != "\${_MY_PROMPT_MTIME:-}" ]; then
    _MY_PROMPT_MTIME="$mtime"
    source "$_MY_PROMPT_FILE"
  fi
}

if [ -n "$BASH_VERSION" ]; then
  _MY_PROMPT_MTIME=$(stat -c %Y "$_MY_PROMPT_FILE" 2>/dev/null || echo "")
  case ";\${PROMPT_COMMAND:-};" in
    *";__meowterialyou_refresh_env;"*) ;;
    ";;") PROMPT_COMMAND="__meowterialyou_refresh_env" ;;
    *) PROMPT_COMMAND="__meowterialyou_refresh_env;\${PROMPT_COMMAND}" ;;
  esac
  PS1="\\[\${_MY_PRIMARY}\\]\\u\\[\${_MY_OUTLINE}\\]@\\[\${_MY_TERTIARY}\\]\\h\\[\${_MY_RESET}\\]:\\[\${_MY_SECONDARY}\\]\\w\\[\${_MY_RESET}\\]\\$(__meowterialyou_prompt_suffix \\$?)\\$ "
fi

if [ -n "$ZSH_VERSION" ]; then
  _MY_PROMPT_MTIME=$(stat -c %Y "$_MY_PROMPT_FILE" 2>/dev/null || echo "")
  case " \${precmd_functions[*]} " in
    *" __meowterialyou_refresh_env "*) ;;
    *) precmd_functions+=(__meowterialyou_refresh_env) ;;
  esac
  setopt PROMPT_SUBST 2>/dev/null
  PROMPT="%F{blue}%n%F{8}@%F{magenta}%m%f:%F{cyan}%~%f\\$(__meowterialyou_prompt_suffix \\$?)%# "
fi

${envExports}
${FASTFETCH_CYCLE_SOURCE_LINE}
`;
}

function resolveShellHomes(): string[] {
  const realHome = `/home/${GLib.get_user_name()}`;
  return getTargetHomeDirectories().filter((dir) => {
    if (dir === realHome) return true;
    return (
      GLib.file_test(GLib.build_filenamev([dir, '.bashrc']), GLib.FileTest.EXISTS) ||
      GLib.file_test(GLib.build_filenamev([dir, '.zshrc']), GLib.FileTest.EXISTS)
    );
  });
}

export function ensureShellRcSourced(homeDir: string): void {
  for (const rcName of ['.bashrc', '.zshrc']) {
    const rcPath = GLib.build_filenamev([homeDir, rcName]);
    if (!GLib.file_test(rcPath, GLib.FileTest.EXISTS)) continue;

    const content = readTextFile(rcPath);
    if (content.includes('meowterialyou/prompt.sh')) continue;

    const separator = content.endsWith('\n') ? '\n' : '\n\n';
    writeTextFile(rcPath, `${content}${separator}# MeowterialYou themed prompt\n${SOURCE_LINE}\n`);
  }
}

export function applyShellPromptTheme(options: ShellPromptOptions): void {
  const script = buildPromptScript(options);
  for (const homeDir of resolveShellHomes()) {
    const promptPath = GLib.build_filenamev([homeDir, '.config', 'meowterialyou', 'prompt.sh']);
    writeTextFile(promptPath, script);
    ensureShellRcSourced(homeDir);
  }
}

export function clearShellPromptTheme(): void {
  for (const homeDir of resolveShellHomes()) {
    const promptPath = GLib.build_filenamev([homeDir, '.config', 'meowterialyou', 'prompt.sh']);
    if (GLib.file_test(promptPath, GLib.FileTest.EXISTS)) {
      writeTextFile(promptPath, PROMPT_DISABLED_STUB);
    }
  }
}
