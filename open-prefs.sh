#!/usr/bin/env bash
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UUID="meowterialyou@supsugam.github.com"
export GSETTINGS_SCHEMA_DIR="$REPO_DIR/dist/schemas:$REPO_DIR/schemas:$GSETTINGS_SCHEMA_DIR"

echo "Opening MeowterialYou Preferences..."
gnome-extensions prefs "$UUID"
