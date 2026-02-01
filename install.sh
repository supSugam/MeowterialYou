#!/bin/bash
# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║                         MeowterialYou Installer                           ║
# ║              Material You Theming for Linux Desktops                       ║
# ╚═══════════════════════════════════════════════════════════════════════════╝

set -e

# ─────────────────────────────────────────────────────────────────────────────
# Colors & Formatting
# ─────────────────────────────────────────────────────────────────────────────
readonly GREEN='\033[0;32m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly MAGENTA='\033[0;35m'
readonly YELLOW='\033[1;33m'
readonly RED='\033[0;31m'
readonly WHITE='\033[1;37m'
readonly BOLD='\033[1m'
readonly DIM='\033[2m'
readonly ITALIC='\033[3m'
readonly NC='\033[0m'

# Symbols
readonly CHECK="${GREEN}✓${NC}"
readonly CROSS="${RED}✗${NC}"
readonly ARROW="${CYAN}➜${NC}"
readonly DOT="${DIM}•${NC}"
readonly STAR="${YELLOW}★${NC}"
readonly TRASH="${RED}🗑️${NC}"

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────
# The repo directory IS the installation - no copying needed
# We only add a shell alias pointing to this repo
BIN_DIR="$HOME/.local/bin"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Config file stored in repo - tracks last installation choices
CONFIG_FILE="$SCRIPT_DIR/.install_config"

# User preferences (defaults)
WALLPAPER=""
THEME="system"
TITLE_BUTTONS="native"
TITLE_BUTTONS_POSITION="right"
CHROME_GTK4=false
UI_IMPROVEMENTS=false
DESKTOP_WIDGETS=false
TRANSPARENT_PANEL=false
THEMED_FOLDER_ICONS=true

SKIP_INTERACTIVE=false
DO_UNINSTALL=false
DO_DEFAULTS=false
DO_REAPPLY=false
REBUILD_WIDGETS=false
CLI_REBUILD_WIDGETS=false
SILENT=false
HAS_GUM=false

# Optional app theming
THEME_GNOME_TERMINAL=true
THEME_SPOTIFY=false
THEME_DISCORD=false
THEME_VSCODE=false
THEME_OBSIDIAN=false
THEME_VIVALDI=false


# ─────────────────────────────────────────────────────────────────────────────
# UI Functions
# ─────────────────────────────────────────────────────────────────────────────

print_banner() {
    clear
    echo ""
    echo -e "${MAGENTA}"
    cat << 'EOF'

  ╔═════════════════════════════════════════════════════════╗
  ║                                                         ║
  ║         ╔╦╗┌─┐┌─┐┬ ┬┌┬┐┌─┐┬─┐┬┌─┐┬  ╦ ╦┌─┐┬ ┬           ║
  ║         ║║║├┤ │ ││││ │ ├┤ ├┬┘│├─┤│  ╚╦╝│ ││ │           ║
  ║         ╩ ╩└─┘└─┘└┴┘ ┴ └─┘┴└─┴┴ ┴┴─┘ ╩ └─┘└─┘           ║
  ║                                                         ║
  ║           Material You Theming for Linux                ║
  ║                                                         ║
  ╚═════════════════════════════════════════════════════════╝

EOF
    echo -e "${NC}"
}

print_section() {
    local title="$1"
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${WHITE}  $title${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

print_step() {
    local step="$1"
    local desc="$2"
    echo -e "  ${CYAN}[$step]${NC} $desc"
}

print_success() {
    echo -e "  ${CHECK} $1"
}

print_error() {
    echo -e "  ${CROSS} $1"
}

print_info() {
    echo -e "  ${DOT} ${DIM}$1${NC}"
}

print_progress() {
    local current="$1"
    local total="$2"
    local desc="$3"
    local pct=$((current * 100 / total))
    local filled=$((pct / 5))
    local empty=$((20 - filled))
    
    printf "\r  ${ARROW} %-40s [" "$desc"
    printf "${GREEN}%${filled}s${NC}" | tr ' ' '█'
    printf "${DIM}%${empty}s${NC}" | tr ' ' '░'
    printf "] ${WHITE}%3d%%${NC}" "$pct"
}

# ─────────────────────────────────────────────────────────────────────────────
# Gum Integration
# ─────────────────────────────────────────────────────────────────────────────

check_gum() {
    if command -v gum &> /dev/null; then
        HAS_GUM=true
        return 0
    fi
    return 1
}

install_gum() {
    echo -e "  ${ARROW} Installing ${BOLD}gum${NC} for interactive menus..."
    
    if command -v apt &> /dev/null; then
        sudo mkdir -p /etc/apt/keyrings 2>/dev/null
        curl -fsSL https://repo.charm.sh/apt/gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/charm.gpg 2>/dev/null
        echo "deb [signed-by=/etc/apt/keyrings/charm.gpg] https://repo.charm.sh/apt/ * *" | sudo tee /etc/apt/sources.list.d/charm.list >/dev/null
        sudo apt update -qq && sudo apt install -y gum -qq
    elif command -v dnf &> /dev/null; then
        echo '[charm]
name=Charm
baseurl=https://repo.charm.sh/yum/
enabled=1
gpgcheck=1
gpgkey=https://repo.charm.sh/yum/gpg.key' | sudo tee /etc/yum.repos.d/charm.repo >/dev/null
        sudo dnf install -y gum -q
    elif command -v pacman &> /dev/null; then
        sudo pacman -S --noconfirm gum >/dev/null
    else
        return 1
    fi
    
    HAS_GUM=true
    print_success "gum installed"
    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Uninstall Logic
# ─────────────────────────────────────────────────────────────────────────────

confirm_uninstall() {
    echo -e "\n  ${RED}${BOLD}⚠️  Warning${NC}"
    echo -e "  This will remove all MeowterialYou themes, config files, and the tool itself."
    echo ""
    
    if $HAS_GUM; then
        if gum confirm --affirmative="  Uninstall  " --negative="  Cancel  " \
            --prompt.foreground="255" --selected.background="196" --default=false \
            "  Are you sure you want to uninstall?"; then
            return 0
        else
            return 1
        fi
    else
        echo -e "  Are you sure you want to uninstall? [y/N]"
        read -rp "     ▸ " input
        [[ "$input" =~ ^[Yy]$ ]]
    fi
}

uninstall_meowterialyou() {
    print_section "🗑️  Uninstalling MeowterialYou"
    
    # 1. Try Python uninstall first (handles gsettings resets)
    echo -e "  ${DOT} Running cleanup script..."
    if [ -f "$SCRIPT_DIR/.venv/bin/python" ] && [ -f "$SCRIPT_DIR/src/main.py" ]; then
        cd "$SCRIPT_DIR" && "$SCRIPT_DIR/.venv/bin/python" "$SCRIPT_DIR/src/main.py" --uninstall 2>/dev/null || true
    elif command -v meowterialyou &> /dev/null; then
        meowterialyou --uninstall 2>/dev/null || true
    fi

    # 2. Remove theme directories
    echo -e "  ${DOT} Cleaning up theme files..."
    rm -rf ~/.local/share/themes/MeowterialYou-dark
    rm -rf ~/.local/share/themes/MeowterialYou-light
    rm -rf ~/.local/share/themes/custom-dark
    rm -rf ~/.local/share/themes/custom-light
    rm -rf ~/.themes/MeowterialYou-dark
    rm -rf ~/.themes/MeowterialYou-light
    rm -rf ~/.local/share/icons/MeowterialYou

    # 3. Cleanup GTK config files/links
    echo -e "  ${DOT} Cleaning up GTK configs..."
    rm -f ~/.config/gtk-3.0/gtk.css
    rm -f ~/.config/gtk-3.0/gtk-dark.css
    rm -rf ~/.config/gtk-3.0/assets
    rm -f ~/.config/gtk-4.0/gtk.css
    rm -f ~/.config/gtk-4.0/gtk-dark.css
    rm -rf ~/.config/gtk-4.0/assets

    # 4. Remove MeowterialYou config directory (XDG location)
    echo -e "  ${DOT} Removing config directory..."
    rm -rf ~/.config/meowterialyou
    rm -rf ~/.config/meowterialyou-widgets
    rm -f /tmp/meowterialyou-widget-manager.lock

    # Stop running widgets
    echo -e "  ${DOT} Stopping widgets..."
    pkill -f "meowterialyou-widget-manager" || true
    pkill -f "media_widget" || true
    pkill -f "weather_widget" || true

    # 5. Remove legacy installation directory (old copy-based install)
    echo -e "  ${DOT} Removing legacy installation..."
    rm -rf ~/.local/share/meowterialyou

    # 6. Remove alias from shell config files
    echo -e "  ${DOT} Removing shell alias..."
    local MARKER="# MeowterialYou"
    sed -i "/$MARKER/d" "$HOME/.bashrc" 2>/dev/null || true
    sed -i "/$MARKER/d" "$HOME/.zshrc" 2>/dev/null || true
    # Also remove old symlink if it exists
    rm -f "$BIN_DIR/meowterialyou" 2>/dev/null || true

    # 7. Remove system themes (requires sudo)
    echo -e "  ${DOT} Removing system themes (requires sudo)..."
    sudo rm -rf /usr/share/themes/MeowterialYou-dark 2>/dev/null || true
    sudo rm -rf /usr/share/themes/MeowterialYou-light 2>/dev/null || true

    # 8. Reset all gsettings to defaults
    echo -e "  ${DOT} Resetting GNOME settings..."
    gsettings reset org.gnome.desktop.interface gtk-theme 2>/dev/null || true
    gsettings reset org.gnome.desktop.interface color-scheme 2>/dev/null || true
    gsettings reset org.gnome.desktop.interface icon-theme 2>/dev/null || true
    gsettings reset org.gnome.shell.extensions.user-theme name 2>/dev/null || true
    gsettings reset org.gnome.desktop.wm.preferences button-layout 2>/dev/null || true

    echo ""
    echo -e "${GREEN}"
    cat << 'EOF'
    ╔═══════════════════════════════════════════════════════════════════════╗
    ║                                                                       ║
    ║               🗑️   Uninstallation Complete                           ║
    ║                                                                       ║
    ╚═══════════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    echo -e "  ${BOLD}Note:${NC} Your GNOME settings have been reset to defaults."
    echo -e "  You may need to log out and back in to see all changes."
    echo ""
    echo -e "  ${DIM}The repository at $SCRIPT_DIR was not removed.${NC}"
    echo -e "  ${DIM}You can delete it manually if you no longer need it.${NC}"
    echo ""
    exit 0
}


# ─────────────────────────────────────────────────────────────────────────────
# Interactive Configuration
# ─────────────────────────────────────────────────────────────────────────────

run_interactive() {
    print_section "⚙️  Configuration"
    
    echo -e "  ${ITALIC}Use arrow keys to navigate, Enter to select${NC}"
    echo ""
    
    if $HAS_GUM; then
        # ─── Installation Mode ───
        echo -e "  ${BOLD}1. Action${NC}"
        local MODE=$(gum choose --cursor="  ▸ " --cursor.foreground="212" \
            --selected.foreground="212" "Install / Update" "Uninstall")
            
        if [ "$MODE" = "Uninstall" ]; then
            if confirm_uninstall; then
                uninstall_meowterialyou
            else
                echo -e "  ${YELLOW}Uninstallation cancelled.${NC}"
                exit 0
            fi
        fi
        
        # ─── Theme Mode ───
        echo -e "  ${BOLD}2. Theme Mode${NC}"
        THEME=$(gum choose --cursor="  ▸ " --cursor.foreground="212" \
            --selected.foreground="212" --height=4 \
            "system (Auto-detect from system)" "dark" "light")
        THEME=$(echo "$THEME" | cut -d' ' -f1)
        echo -e "     ${CHECK} Selected: ${BOLD}${MAGENTA}$THEME${NC}"
        echo ""
        
        # ─── Window Buttons ───
        echo -e "  ${BOLD}3. Window Button Style${NC}"
        TITLE_BUTTONS=$(gum choose --cursor="  ▸ " --cursor.foreground="212" \
            --selected.foreground="212" --height=3 \
            "native (Default GNOME style)" "mac (Circular macOS style)")
        TITLE_BUTTONS=$(echo "$TITLE_BUTTONS" | cut -d' ' -f1)
        echo -e "     ${CHECK} Selected: ${BOLD}${MAGENTA}$TITLE_BUTTONS${NC}"
        echo ""
        
        # ─── Button Position ───
        echo -e "  ${BOLD}4. Button Position${NC}"
        TITLE_BUTTONS_POSITION=$(gum choose --cursor="  ▸ " --cursor.foreground="212" \
            --selected.foreground="212" --height=3 \
            "right" "left")
        echo -e "     ${CHECK} Selected: ${BOLD}${MAGENTA}$TITLE_BUTTONS_POSITION${NC}"
        echo ""
        
        # ─── Chrome GTK4 ───
        echo -e "  ${BOLD}5. Chrome/Chromium Theme${NC}"
        if gum confirm --affirmative="  Yes, enable  " --negative="  No, skip  " \
            --prompt.foreground="255" --selected.background="212" --default=false \
            "     Enable Chrome GTK4 theming?"; then
            CHROME_GTK4=true
            echo -e "     ${CHECK} Chrome GTK4: ${BOLD}${GREEN}enabled${NC}"
        else
            echo -e "     ${CHECK} Chrome GTK4: ${DIM}disabled${NC}"
        fi
        echo ""
        
        # ─── UI Improvements ───
        echo -e "  ${BOLD}6. UI Improvements${NC}"
        echo -e "     ${DIM}Transparent tray icons, improved system tray styling${NC}"
        if gum confirm --affirmative="  Yes, enable  " --negative="  No, disable  " \
            --prompt.foreground="255" --selected.background="212" --default=false \
            "     Enable UI improvements?"; then
            UI_IMPROVEMENTS=true
            echo -e "     ${CHECK} UI Improvements: ${BOLD}${GREEN}enabled${NC}"
        else
            UI_IMPROVEMENTS=false
            echo -e "     ${CHECK} UI Improvements: ${DIM}disabled${NC}"
        fi
        echo ""
        
        # ─── Desktop Widget ───
        echo -e "  ${BOLD}7. Desktop Widget${NC}"
        echo -e "     ${DIM}Clock + weather widget on desktop (uses EWW)${NC}"
        if gum confirm --affirmative="  Yes, enable  " --negative="  No, skip  " \
            --prompt.foreground="255" --selected.background="212" --default=false \
            "     Enable desktop widget?"; then
            DESKTOP_WIDGETS=true
            echo -e "     ${CHECK} Desktop Widget: ${BOLD}${GREEN}enabled${NC}"
            echo -e "     ${CHECK} Desktop Widget: ${BOLD}${GREEN}enabled${NC}"
            echo -e "     ${DIM}Built from source (Rust)${NC}"
        else
            DESKTOP_WIDGETS=false
            echo -e "     ${CHECK} Desktop Widget: ${DIM}disabled${NC}"
        fi
        # ─── Transparent Panel ───
        echo -e "  ${BOLD}8. Transparent Panel${NC}"
        echo -e "     ${DIM}Make the panel transparent${NC}"
        if gum confirm --affirmative="  Yes, enable  " --negative="  No, skip  " \
            --prompt.foreground="255" --selected.background="212" --default=false \
            "     Enable transparent panel?"; then
            TRANSPARENT_PANEL=true
            echo -e "     ${CHECK} Transparent Panel: ${BOLD}${GREEN}enabled${NC}"
        else
            TRANSPARENT_PANEL=false
            echo -e "     ${CHECK} Transparent Panel: ${DIM}disabled${NC}"
        fi
        echo ""
        
        # ─── Themed Folder Icons ───
        echo -e "  ${BOLD}9. Themed Folder Icons${NC}"
        echo -e "     ${DIM}Recolor folder icons to match your wallpaper palette${NC}"
        if gum confirm --affirmative="  Yes, enable  " --negative="  No, skip  " \
            --prompt.foreground="255" --selected.background="212" --default=true \
            "     Enable themed folder icons?"; then
            THEMED_FOLDER_ICONS=true
            echo -e "     ${CHECK} Themed Folder Icons: ${BOLD}${GREEN}enabled${NC}"
        else
            THEMED_FOLDER_ICONS=false
            echo -e "     ${CHECK} Themed Folder Icons: ${DIM}disabled${NC}"
        fi
        echo ""
        

        
        # ─── Wallpaper ───
        echo -e "  ${BOLD}11. Wallpaper${NC}"
        echo -e "     ${DIM}Press Enter to use your current wallpaper${NC}"
        WALLPAPER=$(gum input --placeholder="Path to wallpaper (or press Enter for current)" \
            --prompt="     ▸ " --cursor.foreground="212" --width=50)
        if [ -z "$WALLPAPER" ]; then
            echo -e "     ${CHECK} Using: ${BOLD}current system wallpaper${NC}"
        else
            if [ -f "$WALLPAPER" ]; then
                echo -e "     ${CHECK} Using: ${BOLD}$WALLPAPER${NC}"
            else
                echo -e "     ${YELLOW}⚠${NC}  File not found, using current wallpaper"
                WALLPAPER=""
            fi
        fi
        echo ""
        
        # ─── GNOME Terminal Theming ───
        echo -e "  ${BOLD}12. GNOME Terminal Theming${NC}"
        echo -e "     ${DIM}Apply Material You colors to terminal (background, cursor, highlight, palette)${NC}"
        if gum confirm --affirmative="  Yes, enable  " --negative="  No, skip  " \
            --prompt.foreground="255" --selected.background="212" --default=true \
            "     Theme GNOME Terminal?"; then
            THEME_GNOME_TERMINAL=true
            echo -e "     ${CHECK} GNOME Terminal: ${BOLD}${GREEN}enabled${NC}"
        else
            THEME_GNOME_TERMINAL=false
            echo -e "     ${CHECK} GNOME Terminal: ${DIM}disabled${NC}"
        fi
        echo ""
        
        # ─── Optional App Theming ───
        echo -e "  ${BOLD}13. Additional Apps${NC} ${DIM}(detected apps only)${NC}"
        
        # Spicetify (Spotify)
        if command -v spicetify &> /dev/null; then
            if gum confirm --affirmative="Yes" --negative="No" --default=false \
                "     Theme Spotify (Spicetify)?"; then
                THEME_SPOTIFY=true
                echo -e "     ${CHECK} Spotify: ${GREEN}yes${NC}"
            else
                echo -e "     ${CHECK} Spotify: ${DIM}no${NC}"
            fi
        fi
        
        # BetterDiscord
        if [ -d "$HOME/.config/BetterDiscord" ]; then
            if gum confirm --affirmative="Yes" --negative="No" --default=false \
                "     Theme Discord (BetterDiscord)?"; then
                THEME_DISCORD=true
                echo -e "     ${CHECK} Discord: ${GREEN}yes${NC}"
            else
                echo -e "     ${CHECK} Discord: ${DIM}no${NC}"
            fi
        fi
        
        # Vivaldi
        if [ -d "$HOME/.config/vivaldi" ]; then
            if gum confirm --affirmative="Yes" --negative="No" --default=false \
                "     Theme Vivaldi?"; then
                THEME_VIVALDI=true
                echo -e "     ${CHECK} Vivaldi: ${GREEN}yes${NC}"
            else
                echo -e "     ${CHECK} Vivaldi: ${DIM}no${NC}"
            fi
        fi
        
    else
        # Fallback without gum
        echo -e "  ${BOLD}Action:${NC} [Install/Uninstall]"
        read -rp "     ▸ " action
        if [[ "${action,,}" == "uninstall" ]]; then
            echo -e "  Are you sure? [y/N]"
            read -rp "     ▸ " confirm
            [[ "$confirm" =~ ^[Yy]$ ]] && uninstall_meowterialyou
            exit 0
        fi

        echo -e "  ${BOLD}Theme Mode${NC} [system/dark/light] (default: system)"
        read -rp "     ▸ " input
        THEME=${input:-system}
        echo ""
        
        echo -e "  ${BOLD}Window Button Style${NC} [native/mac] (default: native)"
        read -rp "     ▸ " input
        TITLE_BUTTONS=${input:-native}
        echo ""
        
        echo -e "  ${BOLD}Button Position${NC} [left/right] (default: right)"
        read -rp "     ▸ " input
        TITLE_BUTTONS_POSITION=${input:-right}
        echo ""
        
        echo -e "  ${BOLD}Chrome GTK4 Theme${NC} [y/N]"
        read -rp "     ▸ " input
        [[ "$input" =~ ^[Yy]$ ]] && CHROME_GTK4=true
        echo ""
        
        echo -e "  ${BOLD}UI Improvements${NC} (transparent tray icons, etc.) [y/N]"
        read -rp "     ▸ " input
        [[ "$input" =~ ^[Yy]$ ]] && UI_IMPROVEMENTS=true
        echo ""
        
        echo -e "  ${BOLD}Desktop Widget${NC} (clock + media + weather, uses Rust) [y/N]"
        read -rp "     ▸ " input
        [[ "$input" =~ ^[Yy]$ ]] && DESKTOP_WIDGETS=true
        echo ""

        echo -e "  ${BOLD}Transparent Panel${NC} [y/N]"
        read -rp "     ▸ " input
        [[ "$input" =~ ^[Yy]$ ]] && TRANSPARENT_PANEL=true
        echo ""
        
        echo -e "  ${BOLD}GNOME Terminal Theming${NC} [Y/n] (default: yes)"
        read -rp "     ▸ " input
        if [[ "$input" =~ ^[Nn]$ ]]; then
            THEME_GNOME_TERMINAL=false
        else
            THEME_GNOME_TERMINAL=true
        fi
        echo ""
        
        echo -e "  ${BOLD}Wallpaper Path${NC} (Enter for current)"
        read -rp "     ▸ " WALLPAPER
    fi
    
    # ─── Summary ───
    print_section "📋 Configuration Summary"
    echo -e "  ${DOT} Theme Mode:      ${BOLD}$THEME${NC}"
    echo -e "  ${DOT} Button Style:    ${BOLD}$TITLE_BUTTONS${NC}"
    echo -e "  ${DOT} Button Position: ${BOLD}$TITLE_BUTTONS_POSITION${NC}"
    echo -e "  ${DOT} Chrome GTK4:     ${BOLD}$([ "$CHROME_GTK4" = true ] && echo "enabled" || echo "disabled")${NC}"
    echo -e "  ${DOT} UI Improvements: ${BOLD}$([ "$UI_IMPROVEMENTS" = true ] && echo "enabled" || echo "disabled")${NC}"
    echo -e "  ${DOT} Desktop Widget:  ${BOLD}$([ "$DESKTOP_WIDGETS" = true ] && echo "enabled" || echo "disabled")${NC}"
    echo -e "  ${DOT} Transp. Panel:  ${BOLD}$([ "$TRANSPARENT_PANEL" = true ] && echo "enabled" || echo "disabled")${NC}"
    echo -e "  ${DOT} Terminal Theme:  ${BOLD}$([ "$THEME_GNOME_TERMINAL" = true ] && echo "enabled" || echo "disabled")${NC}"
    echo -e "  ${DOT} Wallpaper:       ${BOLD}${WALLPAPER:-"Current system wallpaper"}${NC}"
    
    # Show optional apps if any enabled
    local apps_enabled=""
    [ "$THEME_SPOTIFY" = true ] && apps_enabled+="Spotify "
    [ "$THEME_DISCORD" = true ] && apps_enabled+="Discord "
    [ "$THEME_VIVALDI" = true ] && apps_enabled+="Vivaldi "
    if [ -n "$apps_enabled" ]; then
        echo -e "  ${DOT} Extra Apps:     ${BOLD}$apps_enabled${NC}"
    fi
    echo ""
    
    if $HAS_GUM; then
        if ! gum confirm --affirmative="  Continue  " --negative="  Cancel  " \
            --prompt.foreground="255" --selected.background="212" \
            "  Proceed with installation?"; then
            echo -e "\n  ${YELLOW}Installation cancelled.${NC}\n"
            exit 0
        fi
    else
        echo -e "  ${BOLD}Continue with installation?${NC} [Y/n]"
        read -rp "     ▸ " input
        if [[ "$input" =~ ^[Nn]$ ]]; then
            echo -e "\n  ${YELLOW}Installation cancelled.${NC}\n"
            exit 0
        fi
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Installation Steps
# ─────────────────────────────────────────────────────────────────────────────

check_requirements() {
    print_section "🔍 Checking Requirements"
    
    # Python
    if command -v python3 &> /dev/null; then
        PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
        print_success "Python $PYTHON_VERSION"
    else
        print_error "Python 3.10+ required"
        echo -e "\n  ${RED}Please install Python 3.10 or later and try again.${NC}\n"
        exit 1
    fi
    
    # PyGObject
    if python3 -c "import gi" 2>/dev/null; then
        print_success "PyGObject (GTK bindings)"
    else
        echo -e "  ${ARROW} Installing PyGObject..."
        if command -v apt &> /dev/null; then
            sudo apt install -y python3-gi python3-gi-cairo gir1.2-gtk-4.0 libgirepository1.0-dev -qq
        elif command -v dnf &> /dev/null; then
            sudo dnf install -y python3-gobject gtk4 -q
        elif command -v pacman &> /dev/null; then
            sudo pacman -S --noconfirm python-gobject gtk4 >/dev/null
        else
            print_error "Could not install PyGObject. Please install manually."
            exit 1
        fi
        print_success "PyGObject (GTK bindings)"
    fi
    
    # gum
    if check_gum; then
        print_success "gum (TUI toolkit)"
    else
        print_info "gum not found - installing for better experience..."
        install_gum || print_info "Using fallback prompts"
    fi

    # Cargo (Rust) for Desktop Widgets
    if [ "$DESKTOP_WIDGETS" = true ]; then
        if command -v cargo &> /dev/null; then
            print_success "Rust/Cargo (for widgets)"
        else
            print_error "Rust/Cargo not found"
            echo -e "  ${ARROW} Please install Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
            exit 1
        fi
    fi
}

install_venv() {
    print_section "📦 Setting Up Environment"
    
    # Check if venv already exists and is functional
    if [ -f "$SCRIPT_DIR/.venv/bin/python" ]; then
        # Quick check if critical packages are installed
        if "$SCRIPT_DIR/.venv/bin/python" -c "import rich, pydantic" 2>/dev/null; then
            print_success "Environment ready"
            return 0
        fi
    fi
    
    # Create venv if needed
    if [ ! -d "$SCRIPT_DIR/.venv" ]; then
        echo -e "  ${ARROW} Creating virtual environment..."
        python3 -m venv --system-site-packages "$SCRIPT_DIR/.venv"
        print_success "Virtual environment created"
    fi
    
    # Install packages only if needed
    echo -e "  ${ARROW} Installing Python packages..."
    "$SCRIPT_DIR/.venv/bin/pip" install --upgrade pip -q 2>/dev/null
    "$SCRIPT_DIR/.venv/bin/pip" install -r "$SCRIPT_DIR/requirements.txt" -q 2>/dev/null
    print_success "Python packages installed"
}


install_files() {
    print_section "📁 Setting Up Command"
    
    # Add alias to shell config files pointing directly to install.sh
    local ALIAS_LINE="alias meowterialyou='$SCRIPT_DIR/install.sh'"
    local MARKER="# MeowterialYou"
    
    print_progress 1 3 "Setting up shell alias..."
    
    # Function to add/update alias in a shell config file
    add_alias_to_file() {
        local config_file="$1"
        if [ -f "$config_file" ]; then
            # Remove old MeowterialYou alias if exists
            sed -i "/$MARKER/d" "$config_file"
            # Add new alias
            echo "${ALIAS_LINE}  ${MARKER}" >> "$config_file"
            return 0
        fi
        return 1
    }
    
    # Add to both .bashrc and .zshrc if they exist
    local added=false
    if add_alias_to_file "$HOME/.bashrc"; then
        print_success "Added alias to ~/.bashrc"
        added=true
    fi
    if add_alias_to_file "$HOME/.zshrc"; then
        print_success "Added alias to ~/.zshrc"
        added=true
    fi
    
    if [ "$added" = false ]; then
        # Neither exists, create .bashrc
        echo "${ALIAS_LINE}  ${MARKER}" >> "$HOME/.bashrc"
        print_success "Created ~/.bashrc with alias"
    fi
    echo ""
    
    # Remove old symlink if it exists (cleanup from previous install)
    if [ -L "$BIN_DIR/meowterialyou" ] || [ -f "$BIN_DIR/meowterialyou" ]; then
        rm -f "$BIN_DIR/meowterialyou"
        print_info "Removed old symlink from ~/.local/bin/"
    fi
    
    # Set up theme directories (these are OUTPUT locations, not sources)
    print_progress 2 3 "Setting up theme directories..."
    mkdir -p ~/.themes/MeowterialYou-dark/gnome-shell
    mkdir -p ~/.themes/MeowterialYou-light/gnome-shell
    mkdir -p ~/.local/share/themes
    cp -r "$SCRIPT_DIR/assets/MeowterialYou-dark" ~/.local/share/themes/
    cp -r "$SCRIPT_DIR/assets/MeowterialYou-light" ~/.local/share/themes/
    cp "$SCRIPT_DIR/assets/MeowterialYou-dark/gnome-shell/"*.svg ~/.themes/MeowterialYou-dark/gnome-shell/ 2>/dev/null || true
    cp "$SCRIPT_DIR/assets/MeowterialYou-light/gnome-shell/"*.svg ~/.themes/MeowterialYou-light/gnome-shell/ 2>/dev/null || true
    echo ""
    print_success "Theme directories configured"
    
    # Save user preferences to XDG config directory
    print_progress 3 3 "Saving preferences..."
    mkdir -p "$HOME/.config/meowterialyou"
    cat > "$HOME/.config/meowterialyou/prefs.conf" << EOF
# MeowterialYou User Preferences
THEME_GNOME_TERMINAL=$THEME_GNOME_TERMINAL
THEME_SPOTIFY=$THEME_SPOTIFY
THEME_DISCORD=$THEME_DISCORD
THEME_VSCODE=$THEME_VSCODE
THEME_OBSIDIAN=$THEME_OBSIDIAN
THEME_VIVALDI=$THEME_VIVALDI
EOF
    echo ""
    # User preferences saved
    echo ""
    print_success "User preferences saved"

    # Install Desktop Widgets (Rust)
    if [ "$DESKTOP_WIDGETS" = true ]; then
        print_progress 3 3 "Installing Desktop Widgets..."
        
        # Decide if we need to perform a full install/restart
        local MUST_INSTALL=false
        if [ "$REBUILD_WIDGETS" = true ]; then
            MUST_INSTALL=true
        elif [ ! -f "$BIN_DIR/meowterialyou-widget-manager" ]; then
            MUST_INSTALL=true
        elif [ "$DO_REAPPLY" = false ]; then
            # Fresh install or interactive mode
            MUST_INSTALL=true
        else
            # Check if any config file is newer than our installed binary
            if [ -f "$BIN_DIR/meowterialyou-widget-manager" ]; then
                if find "$SCRIPT_DIR/desktop_widgets/configs" -name "*.yaml" -newer "$BIN_DIR/meowterialyou-widget-manager" 2>/dev/null | grep -q .; then
                    MUST_INSTALL=true
                    print_info "Detected widget configuration changes, updating..."
                fi
            fi
        fi

        if [ "$MUST_INSTALL" = true ]; then
            # Always run an incremental build to reflect any code changes
            # Cargo is smart enough to skip if nothing changed (~0.5s)
            echo -e "\n  ${DIM}Checking for widget updates (incremental build)...${NC}"
            if cd "$SCRIPT_DIR/desktop_widgets"; then
                if cargo build --release --quiet; then
                    print_success "Widgets up to date"
                else
                    print_error "Failed to build widgets"
                    cd "$SCRIPT_DIR" || exit
                    return 1
                fi
            else
                print_error "Could not enter widget directory"
                return 1
            fi
            
            # Stop existing instances before copying (Fixes "Text file busy")
            pkill -f "meowterialyou-widget-manager" || true
            pkill -f "media_widget" || true
            pkill -f "weather_widget" || true
            sleep 0.5
            
            # Install binaries
            cp "$SCRIPT_DIR/target/release/manager" "$BIN_DIR/meowterialyou-widget-manager"
            cp "$SCRIPT_DIR/target/release/media_widget" "$BIN_DIR/media_widget"
            cp "$SCRIPT_DIR/target/release/weather_widget" "$BIN_DIR/weather_widget"
            
            # Install Configs (Generic Loop for all widgets)
            local CONFIG_SRC="$SCRIPT_DIR/desktop_widgets/configs"
            local CONFIG_DEST="$HOME/.config/meowterialyou-widgets"
            
            if [ -d "$CONFIG_SRC" ]; then
                for widget_dir in "$CONFIG_SRC"/*; do
                    if [ -d "$widget_dir" ]; then
                        local widget_name
                        widget_name=$(basename "$widget_dir")
                        local target_dir="$CONFIG_DEST/$widget_name"
                        
                        mkdir -p "$target_dir"
                        
                        if [ ! -f "$target_dir/config.yaml" ]; then
                            if [ -f "$widget_dir/config.yaml" ]; then
                                cp "$widget_dir/config.yaml" "$target_dir/config.yaml"
                                print_info "Installed default config for $widget_name"
                            fi
                        else
                             print_info "Preserving config for $widget_name"
                        fi
                    fi
                done
            fi
            
            # Legacy cleanup (renamed folder)
            if [ -d "$CONFIG_DEST/mediawidget" ]; then
                 mv "$CONFIG_DEST/mediawidget" "$CONFIG_DEST/media_widget" 2>/dev/null || true
            fi
            
            # Create Autostart Entry
            mkdir -p "$HOME/.config/autostart"
            cat > "$HOME/.config/autostart/meowterialyou-widgets.desktop" << EOF
[Desktop Entry]
Type=Application
Name=MeowterialYou Widgets
Comment=Desktop widgets for MeowterialYou
Exec=$BIN_DIR/meowterialyou-widget-manager
Path=$SCRIPT_DIR
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
EOF
            print_success "Widget autostart configured"
            
            # Ensure started from repo root for local config prioritization
            pkill -f "meowterialyou-widget-manager" || true
            (cd "$SCRIPT_DIR" && nohup "$BIN_DIR/meowterialyou-widget-manager" >/dev/null 2>&1 &)
            print_info "Started widget manager from repository root"
        else
            print_info "Widgets are already running and up to date. Skipping restart."
        fi
        cd "$SCRIPT_DIR" || exit
    else
        # Disabled - Cleanup if previously installed
        print_info "Cleaning up desktop widgets..."
        
        # 1. Stop running processes
        if pgrep -f "meowterialyou-widget-manager" > /dev/null || pgrep -f "media_widget" > /dev/null; then
            pkill -f "meowterialyou-widget-manager" || true
            pkill -f "media_widget" || true
            pkill -f "weather_widget" || true # For future proofing
            print_info "Stopped running widgets"
        fi
        
        # 2. Remove binaries
        rm -f "$BIN_DIR/meowterialyou-widget-manager"
        rm -f "$BIN_DIR/media_widget"
        rm -f "$BIN_DIR/weather_widget" 2>/dev/null || true
        
        # 3. Disable autostart
        local AUTOSTART_FILE="$HOME/.config/autostart/meowterialyou-widgets.desktop"
        if [ -f "$AUTOSTART_FILE" ]; then
            rm "$AUTOSTART_FILE"
            print_info "Disabled widget autostart"
        fi
        
        print_success "Desktop widgets uninstalled"
    fi
}


apply_theme() {
    print_section "🎨 Applying Theme"
    
    # Build command args
    local args="--theme $THEME --title-buttons $TITLE_BUTTONS --title-buttons-position $TITLE_BUTTONS_POSITION"
    [ -n "$WALLPAPER" ] && args="$args --wallpaper \"$WALLPAPER\""
    [ "$CHROME_GTK4" = true ] && args="$args --chrome-gtk4"
    [ "$UI_IMPROVEMENTS" = true ] && args="$args --ui-improvements"
    [ "$DESKTOP_WIDGETS" = true ] && args="$args --desktop-widget"
    [ "$TRANSPARENT_PANEL" = true ] && args="$args --transparent-panel"
    [ "$THEMED_FOLDER_ICONS" = true ] && args="$args --themed-folder-icons"

    { [ "$DO_REAPPLY" = true ] || [ "$SILENT" = true ]; } && args="$args --silent"
    
    echo -e "  ${DIM}$ meowterialyou $args${NC}"
    echo ""
    
    # Run Python directly
    cd "$SCRIPT_DIR"
    export PYTHONPATH="$SCRIPT_DIR:$PYTHONPATH"
    eval "$SCRIPT_DIR/.venv/bin/python $SCRIPT_DIR/src/main.py $args"
}



print_finale() {
    echo ""
    echo -e "${GREEN}"
    cat << 'EOF'
    ╔═══════════════════════════════════════════════════════════════════════╗
    ║                                                                       ║
    ║                    ✨ Installation Complete! ✨                       ║
    ║                                                                       ║
    ╚═══════════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    
    echo -e "  ${YELLOW}⚠️  To use 'meowterialyou' command, run:${NC}"
    echo -e "     ${DIM}source ~/.bashrc${NC}  or  ${DIM}source ~/.zshrc${NC}"
    echo -e "     ${DIM}(or open a new terminal)${NC}"
    echo ""

    echo -e "  ${BOLD}Next Steps:${NC}"
    echo -e "  To make your theme automatically update when you change your wallpaper:"
    echo ""
    echo -e "  1. Install ${CYAN}GNOME Routines${NC} extension"
    echo -e "  2. Create a new routine with:"
    echo -e "     ${DIM}Trigger:${NC} Wallpaper changes"
    echo -e "     ${DIM}Action:${NC}  Run Command"
    echo -e "     ${DIM}Command:${NC} ${MAGENTA}meowterialyou --reapply${NC}"
    echo ""
    echo -e "  ${BOLD}Quick Commands:${NC}"
    echo -e "    ${CYAN}meowterialyou${NC}                          Apply theme with current wallpaper"
    echo -e "    ${CYAN}meowterialyou --wallpaper ~/img.jpg${NC}    Apply theme with specific wallpaper"
    echo -e "    ${CYAN}meowterialyou --help${NC}                   Show all options"
    echo ""
    echo -e "  ${RED}⚠️  IMPORTANT: Do NOT delete this repository folder!${NC}"
    echo -e "     ${DIM}The theme regenerates from this repo every time your wallpaper changes.${NC}"
    echo -e "     ${DIM}Only delete it if you want to completely uninstall MeowterialYou.${NC}"
    echo ""
    echo -e "  ${BOLD}Uninstall:${NC}"
    echo -e "    Run ${CYAN}./install.sh --uninstall${NC} or select Uninstall from the menu"
    echo ""
}

# ─────────────────────────────────────────────────────────────────────────────
# Config Save/Load
# ─────────────────────────────────────────────────────────────────────────────

save_config() {
    # Save current installation choices to repo
    cat > "$CONFIG_FILE" << EOF
# MeowterialYou Installation Config
# Generated on $(date)
THEME=$THEME
TITLE_BUTTONS=$TITLE_BUTTONS
TITLE_BUTTONS_POSITION=$TITLE_BUTTONS_POSITION
CHROME_GTK4=$CHROME_GTK4
UI_IMPROVEMENTS=$UI_IMPROVEMENTS
DESKTOP_WIDGETS=$DESKTOP_WIDGETS
REBUILD_WIDGETS=$REBUILD_WIDGETS
TRANSPARENT_PANEL=$TRANSPARENT_PANEL
THEME_GNOME_TERMINAL=$THEME_GNOME_TERMINAL
THEME_SPOTIFY=$THEME_SPOTIFY
THEME_DISCORD=$THEME_DISCORD
THEME_VSCODE=$THEME_VSCODE
THEME_OBSIDIAN=$THEME_OBSIDIAN
THEME_VIVALDI=$THEME_VIVALDI
THEMED_FOLDER_ICONS=$THEMED_FOLDER_ICONS
EOF
}

load_config() {
    # Load config from repo if it exists
    if [ -f "$CONFIG_FILE" ]; then
        # shellcheck source=/dev/null
        source "$CONFIG_FILE"
        # Migration for transparent_topbar rename
        [ -n "$TRANSPARENT_TOPBAR" ] && TRANSPARENT_PANEL="$TRANSPARENT_TOPBAR"
        return 0
    fi
    return 1
}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --wallpaper)   WALLPAPER="$2"; SKIP_INTERACTIVE=true; shift 2 ;;
            --theme)       THEME="$2"; SKIP_INTERACTIVE=true; shift 2 ;;
            --title-buttons) TITLE_BUTTONS="$2"; SKIP_INTERACTIVE=true; shift 2 ;;
            --title-buttons-position) TITLE_BUTTONS_POSITION="$2"; SKIP_INTERACTIVE=true; shift 2 ;;
            --chrome-gtk4) CHROME_GTK4=true; SKIP_INTERACTIVE=true; shift ;;
            --ui-improvements) UI_IMPROVEMENTS=true; SKIP_INTERACTIVE=true; shift ;;
            --desktop-widget) DESKTOP_WIDGETS=true; SKIP_INTERACTIVE=true; shift ;;
            --transparent-panel) TRANSPARENT_PANEL=true; SKIP_INTERACTIVE=true; shift ;;
            --themed-folder-icons) THEMED_FOLDER_ICONS=true; SKIP_INTERACTIVE=true; shift ;;

            --uninstall)   DO_UNINSTALL=true; shift ;;
            --defaults)    DO_DEFAULTS=true; SKIP_INTERACTIVE=true; shift ;;
            --reapply)     DO_REAPPLY=true; SKIP_INTERACTIVE=true; shift ;;
            --rebuild-widgets) CLI_REBUILD_WIDGETS=true; shift ;;
            --silent)      SILENT=true; shift ;;
            --help|-h)
                echo "Usage: meowterialyou [OPTIONS]"
                echo ""
                echo "Modes:"
                echo "  (no args)              Interactive installation"
                echo "  --defaults             Install with default settings (dark, native buttons)"
                echo "  --reapply              Reinstall using last saved configuration"
                echo ""
                echo "Options:"
                echo "  --wallpaper PATH       Path to wallpaper image"
                echo "  --theme MODE           Theme mode: system (auto-detect), dark, or light"
                echo "  --title-buttons STYLE  Button style: native or mac"
                echo "  --title-buttons-position POS  Position: left or right"
                echo "  --chrome-gtk4          Enable Chrome/Chromium GTK4 theme"
                echo "  --ui-improvements      Enable UI improvements (transparent tray icons)"
                echo "  --desktop-widget       Enable desktop widget (clock + weather)"
                echo "  --transparent-panel    Enable transparent panel addon"
                echo "  --themed-folder-icons  Enable themed folder icons"
                echo "  --rebuild-widgets      Force rebuild of Rust desktop widgets"

                echo "  --silent               Disable desktop notifications"
                echo "  --uninstall            Uninstall MeowterialYou"
                echo ""
                exit 0
                ;;
            *) shift ;;
        esac
    done
    
    # Handle --reapply: load last config
    if [ "$DO_REAPPLY" = true ]; then
        if load_config; then
            echo -e "  ${CHECK} Loaded last configuration from .install_config"
        else
            echo -e "  ${YELLOW}⚠️  No saved config found. Running with defaults.${NC}"
            DO_DEFAULTS=true
        fi
    fi
    
    # CLI flag overrides config
    if [ "$CLI_REBUILD_WIDGETS" = true ]; then
        REBUILD_WIDGETS=true
    fi
    
    print_banner
    check_requirements

    if [ "$DO_UNINSTALL" = true ]; then
        if confirm_uninstall; then
            uninstall_meowterialyou
        else
            echo -e "  ${YELLOW}Uninstallation cancelled.${NC}"
            exit 0
        fi
    fi
    
    if [ "$SKIP_INTERACTIVE" = false ]; then
        run_interactive
    fi
    
    install_venv
    install_files
    save_config  # Save choices to repo
    apply_theme
    
    if [ "$SKIP_INTERACTIVE" = false ]; then
        prompt_restart
    fi
    
    print_finale
}

prompt_restart() {
    # Only prompt if we have a way to restart (X11) or just to inform user
    # But usually killall -3 gnome-shell only works on X11
    if [ "$XDG_SESSION_TYPE" = "wayland" ]; then
        return
    fi

    echo ""
    echo -e "  ${DIM}To ensure all changes apply correctly, you may want to restart GNOME Shell.${NC}"
    echo ""
    
    local should_restart=false
    
    if check_gum; then
        if gum confirm "Restart GNOME Shell now?"; then
            should_restart=true
        fi
    else
        read -p "  Restart GNOME Shell? [y/N] " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            should_restart=true
        fi
    fi
    
    if [ "$should_restart" = true ]; then
        killall -3 gnome-shell 2>/dev/null || true
    fi
}

main "$@"
