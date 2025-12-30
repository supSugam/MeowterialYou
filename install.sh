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
INSTALL_DIR="$HOME/.local/share/meowterialyou"
BIN_DIR="$HOME/.local/bin"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# User preferences (defaults)
WALLPAPER=""
THEME="dark"
TITLE_BUTTONS="native"
TITLE_BUTTONS_POSITION="right"
CHROME_GTK4=false
SKIP_INTERACTIVE=false
DO_UNINSTALL=false
HAS_GUM=false

# Optional app theming
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
    
    # 1. Cleaner theme removal using Python script if available
    echo -e "  ${DOT} Removing applied themes..."
    if command -v meowterialyou &> /dev/null; then
         meowterialyou --uninstall 2>/dev/null || true
    fi

    # 2. Cleanup theme styling files
    echo -e "  ${DOT} Cleaning up theme files..."
    rm -rf ~/.local/share/themes/MeowterialYou-dark
    rm -rf ~/.local/share/themes/MeowterialYou-light
    rm -rf ~/.themes/MeowterialYou-dark
    rm -rf ~/.themes/MeowterialYou-light

    # 3. Cleanup config files/links
    echo -e "  ${DOT} Cleaning up GTK configs..."
    rm -f ~/.config/gtk-3.0/gtk.css
    rm -f ~/.config/gtk-3.0/gtk-dark.css
    rm -rf ~/.config/gtk-3.0/assets
    rm -f ~/.config/gtk-4.0/gtk.css
    rm -f ~/.config/gtk-4.0/gtk-dark.css
    rm -rf ~/.config/gtk-4.0/assets

    # 4. Remove executable and installation dir
    echo -e "  ${DOT} Removing program files..."
    rm -f "$BIN_DIR/meowterialyou"
    rm -rf "$INSTALL_DIR"

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
    echo -e "  ${BOLD}Note:${NC} Your GTK theme has been reset."
    echo -e "  You may need to log out and back in to see all changes."
    echo -e "  Or run: ${DIM}gsettings reset org.gnome.desktop.interface gtk-theme${NC}"
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
            --selected.foreground="212" --height=3 \
            "dark" "light")
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
        
        # ─── Wallpaper ───
        echo -e "  ${BOLD}6. Wallpaper${NC}"
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
        
        # ─── Optional App Theming ───
        echo -e "  ${BOLD}7. Additional Apps${NC} ${DIM}(detected apps only)${NC}"
        
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

        echo -e "  ${BOLD}Theme Mode${NC} [dark/light] (default: dark)"
        read -rp "     ▸ " input
        THEME=${input:-dark}
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
        
        echo -e "  ${BOLD}Wallpaper Path${NC} (Enter for current)"
        read -rp "     ▸ " WALLPAPER
    fi
    
    # ─── Summary ───
    print_section "📋 Configuration Summary"
    echo -e "  ${DOT} Theme Mode:      ${BOLD}$THEME${NC}"
    echo -e "  ${DOT} Button Style:    ${BOLD}$TITLE_BUTTONS${NC}"
    echo -e "  ${DOT} Button Position: ${BOLD}$TITLE_BUTTONS_POSITION${NC}"
    echo -e "  ${DOT} Chrome GTK4:     ${BOLD}$([ "$CHROME_GTK4" = true ] && echo "enabled" || echo "disabled")${NC}"
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
}

install_venv() {
    print_section "📦 Setting Up Environment"
    
    mkdir -p "$INSTALL_DIR"
    
    # Create venv only if it doesn't exist
    if [ ! -d "$INSTALL_DIR/.venv" ]; then
        echo -e "  ${ARROW} Creating virtual environment..."
        python3 -m venv --system-site-packages "$INSTALL_DIR/.venv"
        print_success "Virtual environment created"
        
        # Install packages
        echo -e "  ${ARROW} Installing Python packages..."
        "$INSTALL_DIR/.venv/bin/pip" install --upgrade pip -q 2>/dev/null
        "$INSTALL_DIR/.venv/bin/pip" install -r "$SCRIPT_DIR/requirements.txt" -q 2>/dev/null
        print_success "Python packages installed"
    else
        print_success "Virtual environment exists"
        # Check if packages need updating
        echo -e "  ${ARROW} Checking packages..."
        "$INSTALL_DIR/.venv/bin/pip" install -r "$SCRIPT_DIR/requirements.txt" -q 2>/dev/null || true
        print_success "Packages up to date"
    fi
}

install_files() {
    print_section "📁 Installing Files"
    
    # Copy project files
    print_progress 1 4 "Copying source files..."
    cp -r "$SCRIPT_DIR/src" "$INSTALL_DIR/"
    echo ""
    print_success "Source files"
    
    print_progress 2 4 "Copying assets..."
    cp -r "$SCRIPT_DIR/assets" "$INSTALL_DIR/"
    echo ""
    print_success "Theme assets"
    
    print_progress 3 4 "Copying templates..."
    cp -r "$SCRIPT_DIR/example" "$INSTALL_DIR/"
    # We no longer need to copy uninstall.sh separately
    echo ""
    print_success "Templates & config"
    
    # Create command
    print_progress 4 4 "Creating command..."
    mkdir -p "$BIN_DIR"
    
    # Create wrapper that correctly handles invocation
    cat > "$BIN_DIR/meowterialyou" << 'WRAPPER'
#!/bin/bash
INSTALL_DIR="$HOME/.local/share/meowterialyou"
cd "$INSTALL_DIR" || exit 1
export PYTHONPATH="$INSTALL_DIR:$PYTHONPATH"
exec "$INSTALL_DIR/.venv/bin/python" "$INSTALL_DIR/src/main.py" "$@"
WRAPPER
    chmod +x "$BIN_DIR/meowterialyou"
    echo ""
    print_success "Command: ${BOLD}meowterialyou${NC}"
    
    # Install theme directories
    echo -e "  ${ARROW} Setting up theme directories..."
    mkdir -p ~/.themes/MeowterialYou-dark/gnome-shell
    mkdir -p ~/.themes/MeowterialYou-light/gnome-shell
    mkdir -p ~/.local/share/themes
    cp -r "$INSTALL_DIR/assets/MeowterialYou-dark" ~/.local/share/themes/
    cp -r "$INSTALL_DIR/assets/MeowterialYou-light" ~/.local/share/themes/
    cp "$INSTALL_DIR/assets/MeowterialYou-dark/gnome-shell/"*.svg ~/.themes/MeowterialYou-dark/gnome-shell/ 2>/dev/null || true
    cp "$INSTALL_DIR/assets/MeowterialYou-light/gnome-shell/"*.svg ~/.themes/MeowterialYou-light/gnome-shell/ 2>/dev/null || true
    print_success "Theme directories configured"
    
    # Save user preferences
    cat > "$INSTALL_DIR/prefs.conf" << EOF
# MeowterialYou User Preferences
THEME_SPOTIFY=$THEME_SPOTIFY
THEME_DISCORD=$THEME_DISCORD
THEME_VSCODE=$THEME_VSCODE
THEME_OBSIDIAN=$THEME_OBSIDIAN
THEME_VIVALDI=$THEME_VIVALDI
EOF
}

apply_theme() {
    print_section "🎨 Applying Theme"
    
    local cmd="meowterialyou --theme $THEME --title-buttons $TITLE_BUTTONS --title-buttons-position $TITLE_BUTTONS_POSITION"
    
    [ -n "$WALLPAPER" ] && cmd="$cmd --wallpaper \"$WALLPAPER\""
    [ "$CHROME_GTK4" = true ] && cmd="$cmd --chrome-gtk4"
    
    echo -e "  ${DIM}$ $cmd${NC}"
    echo ""
    
    eval "$cmd"
}

check_path() {
    if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
        echo ""
        echo -e "  ${YELLOW}⚠️  Warning: ~/.local/bin is not in your PATH${NC}"
        echo -e "     To run 'meowterialyou' from anywhere, add this to your shell config:"
        echo -e "     ${DIM}export PATH=\"\$HOME/.local/bin:\$PATH\"${NC}"
        echo ""
    fi
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
    
    check_path

    local routine_cmd="meowterialyou"
    
    # Construct the command based on user preferences
    # We include all options explicitly so the routine enforces the user's preferred style
    routine_cmd="$routine_cmd --theme $THEME"
    
    if [ "$TITLE_BUTTONS" != "native" ]; then
        routine_cmd="$routine_cmd --title-buttons $TITLE_BUTTONS"
        if [ "$TITLE_BUTTONS_POSITION" != "right" ]; then
            routine_cmd="$routine_cmd --title-buttons-position $TITLE_BUTTONS_POSITION"
        fi
    fi
    
    if [ "$CHROME_GTK4" = true ]; then
        routine_cmd="$routine_cmd --chrome-gtk4"
    fi

    echo -e "  ${BOLD}Next Steps:${NC}"
    echo -e "  To make your theme automatically update when you change your wallpaper:"
    echo ""
    echo -e "  1. Install ${CYAN}GNOME Routines${NC} extension"
    echo -e "  2. Create a new routine with:"
    echo -e "     ${DIM}Trigger:${NC} Wallpaper changes"
    echo -e "     ${DIM}Action:${NC}  Run Command"
    echo -e "     ${DIM}Command:${NC} ${MAGENTA}${routine_cmd}${NC}"
    echo ""
    echo -e "  ${BOLD}Quick Commands:${NC}"
    echo -e "    ${CYAN}meowterialyou${NC}                          Apply theme with current wallpaper"
    echo -e "    ${CYAN}meowterialyou --wallpaper ~/img.jpg${NC}    Apply theme with specific wallpaper"
    echo -e "    ${CYAN}meowterialyou --help${NC}                   Show all options"
    echo ""
    echo -e "  ${BOLD}Uninstall:${NC}"
    echo -e "    Run ${CYAN}./install.sh --uninstall${NC} or select Uninstall from the menu"
    echo ""
}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

main() {
    # Parse arguments for non-interactive mode
    while [[ $# -gt 0 ]]; do
        case $1 in
            --wallpaper)   WALLPAPER="$2"; SKIP_INTERACTIVE=true; shift 2 ;;
            --theme)       THEME="$2"; SKIP_INTERACTIVE=true; shift 2 ;;
            --title-buttons) TITLE_BUTTONS="$2"; SKIP_INTERACTIVE=true; shift 2 ;;
            --title-buttons-position) TITLE_BUTTONS_POSITION="$2"; SKIP_INTERACTIVE=true; shift 2 ;;
            --chrome-gtk4) CHROME_GTK4=true; SKIP_INTERACTIVE=true; shift ;;
            --uninstall)   DO_UNINSTALL=true; shift ;;
            --help|-h)
                echo "Usage: ./install.sh [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --wallpaper PATH       Path to wallpaper image"
                echo "  --theme MODE           Theme mode: dark or light"
                echo "  --title-buttons STYLE  Button style: native or mac"
                echo "  --title-buttons-position POS  Position: left or right"
                echo "  --chrome-gtk4          Install Chrome GTK4 theme"
                echo "  --uninstall            Uninstall MeowterialYou"
                echo ""
                echo "Run without options for interactive mode."
                exit 0
                ;;
            *) shift ;;
        esac
    done
    
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
    apply_theme
    print_finale
}

main "$@"
