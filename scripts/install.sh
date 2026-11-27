#!/usr/bin/env bash
set -euo pipefail

UUID="meowterialyou@supsugam.github.com"
REPO="supSugam/MeowterialYou"
ASSET_NAME="${UUID}.shell-extension.zip"
EXT_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"

VERSION="latest"
UNINSTALL=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version|-v)
      VERSION="${2:-}"
      shift 2
      ;;
    --uninstall|-u)
      UNINSTALL=true
      shift
      ;;
    --help|-h)
      cat <<'EOF'
MeowterialYou GNOME Shell Extension Installer

Usage:
  install.sh                    Install or update to the latest release
  install.sh --version v1.0.0   Install a specific release tag
  install.sh --uninstall        Disable and remove the extension
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: '$1' is required but not installed." >&2
    exit 1
  fi
}

require_cmd gnome-extensions

if [[ "$UNINSTALL" == true ]]; then
  echo "Disabling and removing ${UUID}..."
  gnome-extensions disable "$UUID" >/dev/null 2>&1 || true
  gnome-extensions uninstall "$UUID" >/dev/null 2>&1 || rm -rf "$EXT_DIR"
  echo "Uninstalled ${UUID}."
  exit 0
fi

require_cmd curl

if [[ "$VERSION" == "latest" ]]; then
  DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${ASSET_NAME}"
else
  TAG="${VERSION#v}"
  DOWNLOAD_URL="https://github.com/${REPO}/releases/download/v${TAG}/${ASSET_NAME}"
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

ARCHIVE_PATH="${TMP_DIR}/${ASSET_NAME}"
echo "Downloading MeowterialYou (${VERSION})..."
curl -fsSL "$DOWNLOAD_URL" -o "$ARCHIVE_PATH"

WAS_INSTALLED=false
if [[ -d "$EXT_DIR" || -L "$EXT_DIR" ]]; then
  WAS_INSTALLED=true
  # Remove dev symlink cleanly before gnome-extensions install
  if [[ -L "$EXT_DIR" ]]; then
    rm -f "$EXT_DIR"
  fi
fi

echo "Installing extension bundle..."
gnome-extensions install --force "$ARCHIVE_PATH"
gnome-extensions enable "$UUID" >/dev/null 2>&1 || true

INSTALLED_VERSION="$(gnome-extensions info "$UUID" 2>/dev/null | awk -F': ' '/Version:/ {print $2}' || true)"
echo "Installed MeowterialYou (${UUID}${INSTALLED_VERSION:+, version $INSTALLED_VERSION})."

if [[ "${XDG_SESSION_TYPE:-}" == "wayland" ]]; then
  if [[ "$WAS_INSTALLED" == true ]]; then
    echo "Note: Log out and log back in once on Wayland so GNOME Shell reloads the updated runtime."
  else
    echo "Note: If the extension does not activate immediately on Wayland, log out and log back in once."
  fi
elif command -v busctl >/dev/null 2>&1; then
  echo "Tip: On X11, press Alt+F2 and run 'r' if the Shell panel does not refresh automatically."
fi
