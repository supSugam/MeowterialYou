#!/usr/bin/env bash
set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UUID="meowterialyou@supsugam.github.com"
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"
RESOLUTION="${1:-1600x900}"

echo "=========================================================="
echo "  🐾 MeowterialYou Nested GNOME Shell Session Runner     "
echo "=========================================================="

# 1. Build TypeScript extension
echo "🔨 Building latest TypeScript extension..."
export PATH="/home/ctrlcat/.local/share/pnpm:/home/ctrlcat/.nvm/versions/node/v25.2.1/bin:$PATH"
cd "$REPO_DIR"
pnpm build

# 2. Ensure symlink exists to latest build
echo "🔗 Linking to $EXT_DIR..."
mkdir -p "$HOME/.local/share/gnome-shell/extensions"
rm -rf "$EXT_DIR"
ln -s "$REPO_DIR/dist" "$EXT_DIR"

# 3. Ensure extension is in enabled-extensions
python3 -c "
import subprocess, ast
try:
    current = subprocess.check_output(['gsettings', 'get', 'org.gnome.shell', 'enabled-extensions']).decode().strip()
    exts = ast.literal_eval(current)
    if '$UUID' not in exts:
        exts.append('$UUID')
        subprocess.run(['gsettings', 'set', 'org.gnome.shell', 'enabled-extensions', str(exts)], check=True)
except Exception as e:
    pass
"

echo "✨ Starting nested GNOME Shell ($RESOLUTION)..."
echo "💡 Press Ctrl+C in this terminal to close the nested session."
echo "💡 To open preferences while running, execute: ./open-prefs.sh in another terminal."
echo "----------------------------------------------------------"

# Launch nested session (supports GNOME 50+ --devkit --wayland or --nested --wayland)
if gnome-shell --devkit --help &>/dev/null; then
    MUTTER_DEBUG_DUMMY_MODE_SPECS="$RESOLUTION" \
    dbus-run-session gnome-shell --devkit --wayland
else
    MUTTER_DEBUG_DUMMY_MODE_SPECS="$RESOLUTION" \
    dbus-run-session -- gnome-shell --nested --wayland
fi
