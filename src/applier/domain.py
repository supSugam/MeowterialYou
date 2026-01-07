import os
import subprocess
from configparser import ConfigParser
from pathlib import Path

from pydantic import BaseModel
from rich.console import Console

from src.material_color_utilities_python.closest_folder_color.domain import (
    ClosestFolderColorDomain,
)
from src.models import MaterialColors
from src.util import Config, Scheme, Theme, reload_apps, set_wallpaper


class GenerationOptions(BaseModel):
    parent_dir: str
    lightmode_enabled: bool = False
    system_install: bool = False
    macbuttons_enabled: bool = False
    buttons_left_enabled: bool = False
    chrome_gtk4_enabled: bool = False
    ui_improvements_enabled: bool = False  # Disabled by default
    desktop_widget_enabled: bool = (
        False  # Widget config is in ~/.config/meowterialyou/widget.conf
    )
    silent: bool = False
    scheme: MaterialColors | None = None
    wallpaper_path: str | None = None


def print_scheme(scheme: MaterialColors):
    console = Console()
    print("Scheme info:")
    for key, value in scheme.items():
        console.print(f"{key}: {value}", style=f"{value}")


class ApplierDomain:
    def __init__(
        self, conf: ConfigParser, generation_options: GenerationOptions
    ) -> None:
        self._generation_options = generation_options
        self._conf = conf
        self._closest_folder_color_domain = ClosestFolderColorDomain()
        self._top_colors: list[str] = []

    @staticmethod
    def uninstall_theme() -> None:
        """Completely remove all MeowterialYou theme files and reset system settings."""
        import shutil

        home = os.path.expanduser("~")

        print("╔═══════════════════════════════════════════════════════════════════╗")
        print("║              🗑️  Uninstalling MeowterialYou                       ║")
        print("╚═══════════════════════════════════════════════════════════════════╝")
        print("")

        # 1. User theme directories
        paths_to_remove = [
            # GTK3 themes in ~/.local/share/themes/
            os.path.join(home, ".local/share/themes/MeowterialYou-dark"),
            os.path.join(home, ".local/share/themes/MeowterialYou-light"),
            os.path.join(home, ".local/share/themes/custom-dark"),
            os.path.join(home, ".local/share/themes/custom-light"),
            # GNOME Shell themes in ~/.themes/
            os.path.join(home, ".themes/MeowterialYou-dark"),
            os.path.join(home, ".themes/MeowterialYou-light"),
            # User GTK3 config overrides
            os.path.join(home, ".config/gtk-3.0/gtk.css"),
            os.path.join(home, ".config/gtk-3.0/gtk-dark.css"),
            os.path.join(home, ".config/gtk-3.0/assets"),
            # User GTK4 config overrides
            os.path.join(home, ".config/gtk-4.0/gtk.css"),
            os.path.join(home, ".config/gtk-4.0/gtk-dark.css"),
            os.path.join(home, ".config/gtk-4.0/assets"),
            # MeowterialYou config directory
            os.path.join(home, ".config/meowterialyou"),
            # Legacy installation directory (old copy-based install)
            os.path.join(home, ".local/share/meowterialyou"),
            # Desktop widget (Conky) files
            os.path.join(home, ".config/conky/meowterialyou.conf"),
            os.path.join(home, ".config/conky/meowterialyou_weather.sh"),
            os.path.join(home, ".cache/meowterialyou_weather"),
        ]

        # Kill any running Conky widget
        subprocess.run(
            ["pkill", "-f", "conky.*meowterialyou"],
            capture_output=True,
        )

        # 2. System paths (require sudo)
        system_paths = [
            "/usr/share/themes/MeowterialYou-dark",
            "/usr/share/themes/MeowterialYou-light",
        ]

        # 3. Remove alias from shell config files
        print("")
        print("  Removing shell alias...")
        marker = "# MeowterialYou"
        for config_file in [".bashrc", ".zshrc"]:
            config_path = os.path.join(home, config_file)
            if os.path.exists(config_path):
                try:
                    with open(config_path, "r") as f:
                        lines = f.readlines()
                    with open(config_path, "w") as f:
                        for line in lines:
                            if marker not in line:
                                f.write(line)
                    print(f"  ✓ Removed alias from ~/{config_file}")
                except OSError as e:
                    print(f"  ✗ Failed to update ~/{config_file}: {e}")

        # Also remove old symlink if it exists
        symlink_path = os.path.join(home, ".local/bin/meowterialyou")
        if os.path.exists(symlink_path):
            try:
                os.remove(symlink_path)
            except OSError:
                pass

        # 4. Remove user paths
        print("")
        print("  Removing theme files...")
        for path in paths_to_remove:
            if os.path.exists(path) or os.path.islink(path):
                try:
                    if os.path.islink(path):
                        os.unlink(path)
                    elif os.path.isdir(path):
                        shutil.rmtree(path)
                    else:
                        os.remove(path)
                    print(f"  ✓ Removed: {path}")
                except OSError as e:
                    print(f"  ✗ Failed to remove {path}: {e}")

        # 5. Remove system paths (require sudo)
        print("")
        print("  Removing system theme files (requires sudo)...")
        for path in system_paths:
            if os.path.exists(path):
                result = subprocess.run(
                    ["sudo", "rm", "-rf", path],
                    capture_output=True,
                    text=True,
                )
                if result.returncode == 0:
                    print(f"  ✓ Removed: {path}")
                else:
                    print(f"  ✗ Failed to remove {path}: {result.stderr}")

        # 6. Reset ALL gsettings to defaults
        print("")
        print("  Resetting GNOME settings to defaults...")
        gsettings_resets = [
            ("org.gnome.desktop.interface", "gtk-theme", "GTK theme"),
            ("org.gnome.desktop.interface", "color-scheme", "Color scheme"),
            ("org.gnome.desktop.interface", "icon-theme", "Icon theme"),
            ("org.gnome.shell.extensions.user-theme", "name", "Shell theme"),
            ("org.gnome.desktop.wm.preferences", "button-layout", "Button layout"),
        ]

        for schema, key, description in gsettings_resets:
            result = subprocess.run(
                ["gsettings", "reset", schema, key],
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                print(f"  ✓ Reset {description}")
            else:
                # Schema might not exist (e.g., user-theme extension not installed)
                pass

        # Send uninstall notification
        os.system(
            "notify-send --app-name='MeowterialYou' -i user-trash 'Theme Uninstalled 😿' 'Optional but recommended: Restart your GNOME shell for fresher start.'"
        )

        print("")
        print("╔═══════════════════════════════════════════════════════════════════╗")
        print("║              ✨ Uninstall Complete!                               ║")
        print("╚═══════════════════════════════════════════════════════════════════╝")
        print("")
        print("  Your system has been reset to default GNOME themes.")
        print("  You may need to log out and back in to see all changes.")
        print("")

    def set_wallpaper_path(self, path: str) -> None:
        self._generation_options.wallpaper_path = path

    def set_lightmode_enabled(self, enabled: bool) -> None:
        self._generation_options.lightmode_enabled = enabled

    def set_scheme_color_based_on_key(self, key: str, color: str) -> None:
        if self._generation_options.scheme is None:
            raise ValueError("Scheme is None")
        self._generation_options.scheme[key] = color

    def reset_scheme(self, color: str | None = None) -> None:
        self._generation_options.scheme = self._get_scheme(color)

    @property
    def lightmode_enabled(self) -> bool:
        return self._generation_options.lightmode_enabled

    @property
    def scheme(self) -> MaterialColors:
        if self._generation_options.scheme is None:
            self._generation_options.scheme = self._get_scheme()
        return self._generation_options.scheme

    def apply_theme(self) -> None:
        if self._generation_options.wallpaper_path is None:
            raise ValueError("Wallpaper path is None")

        lightmode_enabled = self._generation_options.lightmode_enabled
        postfix = "light" if lightmode_enabled else "dark"
        theme_name = f"MeowterialYou-{postfix}"
        legacy_name = f"custom-{postfix}"

        # Paths
        home = os.path.expanduser("~")
        source_asset = os.path.abspath(f"assets/{theme_name}")
        dest_theme = os.path.join(home, ".local/share/themes", theme_name)
        legacy_theme = os.path.join(home, ".local/share/themes", legacy_name)

        # 1. Install/Update Theme Assets
        if os.path.exists(source_asset):
            print(f"Installing theme assets from {source_asset} to {dest_theme}")
            import shutil

            shutil.copytree(source_asset, dest_theme, dirs_exist_ok=True)

            # System-wide installation if requested
            system_theme = f"/usr/share/themes/{theme_name}"
            if self._generation_options.system_install:
                print(f"Installing system-wide theme to {system_theme} (requires sudo)")
                result = subprocess.run(
                    ["sudo", "cp", "-r", source_asset, system_theme],
                    capture_output=True,
                    text=True,
                )
                if result.returncode == 0:
                    print(f"Successfully installed to {system_theme}")
                else:
                    print(f"Failed to install system-wide: {result.stderr}")
            else:
                # Check if the theme is already installed
                if os.path.exists(system_theme):
                    print(f"Deleting old system-wide theme (uses sudo)")
                    result = subprocess.run(
                        ["sudo", "rm", "-rf", system_theme],
                        capture_output=True,
                        text=True,
                    )
                    if result.returncode == 0:
                        print(f"Successfully deleted old system-wide theme")
                    else:
                        print(
                            f"Failed to delete old system-wide theme: {result.stderr}"
                        )
                else:
                    print(f"System-wide theme not found at {system_theme}")
        else:
            print(f"Warning: Theme assets not found at {source_asset}")

        # 2. Cleanup Legacy
        if os.path.exists(legacy_theme):
            print(f"Removing legacy theme: {legacy_theme}")
            import shutil

            shutil.rmtree(legacy_theme)

        scheme = self._generation_options.scheme or self._get_scheme()
        Config.generate(
            scheme=scheme,
            config=self._conf,
            wallpaper=self._generation_options.wallpaper_path,
            lightmode_enabled=self._generation_options.lightmode_enabled,
            parent_dir=self._generation_options.parent_dir,
        )

        # 2. Copy GNOME Shell SVG assets to ~/.themes/ (where CSS is output)
        shell_assets_src = os.path.abspath(f"assets/{theme_name}/gnome-shell")
        shell_assets_dest = os.path.join(home, f".themes/{theme_name}/gnome-shell")
        if os.path.exists(shell_assets_src):
            import shutil
            import glob

            os.makedirs(shell_assets_dest, exist_ok=True)
            for svg_file in glob.glob(os.path.join(shell_assets_src, "*.svg")):
                shutil.copy2(svg_file, shell_assets_dest)

        # 2a. Apply macbuttons addon if enabled
        if self._generation_options.macbuttons_enabled:
            self._apply_macbuttons_addon(dest_theme, postfix)

        # 2b. Apply UI improvements addon if enabled (transparent tray icons, etc.)
        if self._generation_options.ui_improvements_enabled:
            self._apply_ui_improvements_addon(postfix)

        # 2c. Apply desktop widget addon if enabled (Conky clock + weather)
        if self._generation_options.desktop_widget_enabled:
            self._apply_desktop_widget_addon(postfix)

        # 3. Generate and copy GTK4 system CSS to BOTH light and dark themes if --chrome-gtk4 flag is set
        # This uses separate Chrome-focused templates from the addons/chrome_gtk4/ folder
        if self._generation_options.chrome_gtk4_enabled:
            # Install both themes for proper mode switching support
            for variant in ["dark", "light"]:
                self._install_system_gtk4_theme(variant, scheme)

        primary_color = scheme["primary"]
        folder_color = self._closest_folder_color_domain.get_closest_color(
            primary_color
        )

        self._set_papirus_icon_theme(folder_color)
        self._reload_apps()

    def _set_papirus_icon_theme(self, folder_color: str) -> None:
        print(f"Applying Papirus {folder_color}.")
        # Set current directory to home directory. No need for sudo then
        os.system("export PWD=$HOME")
        os.system(f"papirus-folders -C {folder_color}")

        # get a key from the config that contains SPOTIFY in it

        lightmode_enabled = self._generation_options.lightmode_enabled

        if self._has_config_key("SPOTIFY" if lightmode_enabled else "SPOTIFY-DARK"):
            prefs = Config.load_prefs()
            if prefs.get("THEME_SPOTIFY", False):
                import shutil

                if shutil.which("spicetify"):
                    print("Setting up spotify theme")
                    os.system("spicetify config current_theme Matte")
                    os.system("spicetify config color_scheme meowterialyou")
                    os.system("spicetify apply")
                else:
                    print("Spicetify not found. Skipping Spotify theme application.")
            else:
                print("Skipping Spotify theme (disabled in preferences)")

        if lightmode_enabled:
            os.system(
                "gsettings set org.gnome.desktop.interface icon-theme Papirus-Light"
            )
        else:
            os.system(
                "gsettings set org.gnome.desktop.interface icon-theme Papirus-Dark"
            )

    def _apply_macbuttons_addon(self, dest_theme: str, postfix: str) -> None:
        """Apply macOS-style window buttons addon CSS to generated theme files."""
        from src.util import log

        parent_dir = self._generation_options.parent_dir
        addon_dir = os.path.join(parent_dir, "example/templates/addons/macbuttons")

        # Define mappings: (addon_file, output_files_to_append_to)
        # Addon CSS is appended to both the theme dir CSS and user config CSS
        lightmode_enabled = self._generation_options.lightmode_enabled
        home = os.path.expanduser("~")

        if lightmode_enabled:
            # Light mode: gtk_light.css for GTK4, gtk_3_light.css for GTK3
            mappings = [
                # GTK4 light
                (
                    os.path.join(addon_dir, "gtk_light.css"),
                    [
                        os.path.join(dest_theme, "gtk-4.0", "gtk.css"),
                        os.path.join(home, ".config/gtk-4.0/gtk.css"),
                    ],
                ),
                # GTK3 light
                (
                    os.path.join(addon_dir, "gtk_3_light.css"),
                    [
                        os.path.join(dest_theme, "gtk-3.0", "gtk.css"),
                        os.path.join(home, ".config/gtk-3.0/gtk.css"),
                    ],
                ),
            ]
        else:
            # Dark mode: gtk_dark.css for GTK4, gtk_3_dark.css for GTK3
            mappings = [
                # GTK4 dark
                (
                    os.path.join(addon_dir, "gtk_dark.css"),
                    [
                        os.path.join(dest_theme, "gtk-4.0", "gtk.css"),
                        os.path.join(home, ".config/gtk-4.0/gtk.css"),
                    ],
                ),
                # GTK3 dark
                (
                    os.path.join(addon_dir, "gtk_3_dark.css"),
                    [
                        os.path.join(dest_theme, "gtk-3.0", "gtk.css"),
                        os.path.join(home, ".config/gtk-3.0/gtk.css"),
                        os.path.join(home, ".config/gtk-3.0/gtk-dark.css"),
                    ],
                ),
            ]

        for addon_file, output_files in mappings:
            if not os.path.exists(addon_file):
                log.warning(f"Macbuttons addon file not found: {addon_file}")
                continue

            try:
                with open(addon_file, "r") as f:
                    addon_css = f.read()
            except OSError as e:
                log.error(f"Failed to read addon file {addon_file}: {e}")
                continue

            for output_file in output_files:
                if not os.path.exists(output_file):
                    continue

                try:
                    with open(output_file, "a") as f:
                        f.write("\n\n/* ===== macOS Window Buttons Addon ===== */\n")
                        f.write(addon_css)
                    log.info(f"Applied macbuttons addon to {output_file}")
                except OSError as e:
                    log.error(f"Failed to append addon CSS to {output_file}: {e}")

    def _apply_ui_improvements_addon(self, postfix: str) -> None:
        """Apply UI improvements addon (transparent tray icons, etc.) to GNOME Shell CSS."""
        import re
        from src.util import log, Theme, Scheme

        parent_dir = self._generation_options.parent_dir
        addon_dir = os.path.join(parent_dir, "example/templates/addons/ui_improvements")
        home = os.path.expanduser("~")
        lightmode_enabled = self._generation_options.lightmode_enabled

        # Select the appropriate addon file based on theme mode
        addon_file = os.path.join(
            addon_dir, "shell_light.css" if lightmode_enabled else "shell_dark.css"
        )

        # Target: the generated GNOME Shell CSS
        theme_name = f"MeowterialYou-{postfix}"
        output_file = os.path.join(
            home, f".themes/{theme_name}/gnome-shell/gnome-shell.css"
        )

        if not os.path.exists(addon_file):
            log.warning(f"UI improvements addon file not found: {addon_file}")
            return

        if not os.path.exists(output_file):
            log.warning(f"GNOME Shell CSS not found: {output_file}")
            return

        try:
            with open(addon_file, "r") as f:
                addon_css = f.read()
        except OSError as e:
            log.error(f"Failed to read addon file {addon_file}: {e}")
            return

        # Process template placeholders (replace @{colorName.hex} etc.)
        theme_data, _ = Theme.get(self._generation_options.wallpaper_path)
        scheme = Scheme(theme=theme_data, lightmode=lightmode_enabled).to_hex()

        for key, value in scheme.items():
            pattern_hex = f"@{{{key}.hex}}"
            hex_stripped = value[1:]
            rgb_value = f"rgb({','.join(str(c) for c in tuple(int(hex_stripped[i:i+2], 16) for i in (0, 2, 4)))})"
            pattern_rgb = f"@{{{key}.rgb}}"

            addon_css = re.sub(f"@{{{key}}}", hex_stripped, addon_css)
            addon_css = re.sub(pattern_hex, value, addon_css)
            addon_css = re.sub(pattern_rgb, rgb_value, addon_css)

        try:
            with open(output_file, "a") as f:
                f.write("\n\n/* ===== UI Improvements Addon ===== */\n")
                f.write(addon_css)
            log.info(f"Applied UI improvements addon to {output_file}")
        except OSError as e:
            log.error(f"Failed to append UI improvements addon to {output_file}: {e}")

        # Set Dash to Panel window preview title color based on theme mode
        # DTP uses inline styles which CSS can't override, so we use dconf
        try:
            import subprocess

            title_color = scheme.get(
                "onBackground", "#1a1c1e" if lightmode_enabled else "#e2e2e6"
            )
            subprocess.run(
                [
                    "dconf",
                    "write",
                    "/org/gnome/shell/extensions/dash-to-panel/window-preview-title-font-color",
                    f"'{title_color}'",
                ],
                check=False,
                capture_output=True,
            )
            log.info(f"Set DTP window preview title color to {title_color}")
        except Exception as e:
            log.warning(
                f"Failed to set DTP title color (extension may not be installed): {e}"
            )

    def _apply_desktop_widget_addon(self, postfix: str) -> None:
        """Apply Material You desktop widget (Conky clock + weather)."""
        import re
        import shutil
        from src.util import log, Theme, Scheme

        parent_dir = self._generation_options.parent_dir
        addon_dir = os.path.join(parent_dir, "example/templates/addons/desktop_widget")
        home = os.path.expanduser("~")
        lightmode_enabled = self._generation_options.lightmode_enabled
        meowterialyou_dir = os.path.join(home, ".config/meowterialyou")

        # Check if conky is installed
        if not shutil.which("conky"):
            log.warning(
                "Conky not found. Install it with: sudo apt install conky-all (or equivalent)"
            )
            log.warning("Skipping desktop widget addon")
            return

        # === Read widget configuration from repo ===
        widget_config_file = os.path.join(addon_dir, "widget.conf")

        # Default values
        widget_cfg = {
            "POSITION": "bottom_left",
            "GAP_X": "24",
            "GAP_Y": "80",
            "WIDTH": "320",
            "HEIGHT": "200",
            "BACKGROUND_MODE": "solid",
            "BACKGROUND_OPACITY": "55",
            "CORNER_RADIUS": "16",
            "TIME_FORMAT": "12h",
            "SHOW_AMPM": "true",
            "TEMP_UNIT": "C",
            "WEATHER_API_KEY": "",
            "FONT_FAMILY": "Inter",
            "TIME_FONT_SIZE": "56",
            "DATE_FONT_SIZE": "16",
            "WEATHER_FONT_SIZE": "14",
            "UPDATE_INTERVAL": "1",
            "WEATHER_INTERVAL": "900",
            "PADDING": "24",
        }

        # Read config file from repo
        if os.path.exists(widget_config_file):
            try:
                with open(widget_config_file, "r") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            key, _, value = line.partition("=")
                            key = key.strip()
                            value = value.strip().strip('"').strip("'")
                            widget_cfg[key] = value
            except OSError as e:
                log.warning(f"Could not read widget config: {e}")

        # Select the appropriate template based on theme mode
        template_file = os.path.join(
            addon_dir, "conky_light.conf" if lightmode_enabled else "conky_dark.conf"
        )

        if not os.path.exists(template_file):
            log.warning(f"Desktop widget template not found: {template_file}")
            return

        # Read template
        try:
            with open(template_file, "r") as f:
                conky_config = f.read()
        except OSError as e:
            log.error(f"Failed to read widget template {template_file}: {e}")
            return

        # Get color scheme
        theme_data, _ = Theme.get(self._generation_options.wallpaper_path)
        scheme = Scheme(theme=theme_data, lightmode=lightmode_enabled).to_hex()

        # === Process background settings ===
        is_transparent = widget_cfg["BACKGROUND_MODE"].lower() == "transparent"

        # === Analyze wallpaper region for optimal text contrast ===
        def get_widget_region_luminance():
            """Analyze the wallpaper region where the widget will be placed."""
            try:
                from PIL import Image

                wallpaper_path = self._generation_options.wallpaper_path
                if not wallpaper_path or not os.path.exists(wallpaper_path):
                    return None

                # Get screen resolution
                try:
                    result = subprocess.run(
                        ["xrandr", "--current"],
                        capture_output=True,
                        text=True,
                        timeout=5,
                    )
                    for line in result.stdout.split("\n"):
                        if " connected" in line and "x" in line:
                            # Parse resolution like "2880x1800+0+0"
                            import re

                            match = re.search(r"(\d+)x(\d+)", line)
                            if match:
                                screen_w = int(match.group(1))
                                screen_h = int(match.group(2))
                                break
                    else:
                        return None
                except Exception:
                    return None

                # Get widget position and size
                position = widget_cfg.get("POSITION", "bottom_left")
                gap_x = int(widget_cfg.get("GAP_X", "24"))
                gap_y = int(widget_cfg.get("GAP_Y", "80"))
                width = int(widget_cfg.get("WIDTH", "320"))
                height = int(widget_cfg.get("HEIGHT", "200"))

                # Calculate widget bounds based on position
                if "left" in position:
                    x1 = gap_x
                else:  # right
                    x1 = screen_w - gap_x - width

                if "top" in position:
                    y1 = gap_y
                else:  # bottom
                    y1 = screen_h - gap_y - height

                x2 = x1 + width
                y2 = y1 + height

                # Open wallpaper and crop to widget region
                img = Image.open(wallpaper_path)
                img_w, img_h = img.size

                # Scale coordinates if wallpaper resolution differs from screen
                scale_x = img_w / screen_w
                scale_y = img_h / screen_h

                crop_x1 = int(x1 * scale_x)
                crop_y1 = int(y1 * scale_y)
                crop_x2 = int(x2 * scale_x)
                crop_y2 = int(y2 * scale_y)

                # Clamp to image bounds
                crop_x1 = max(0, min(crop_x1, img_w - 1))
                crop_y1 = max(0, min(crop_y1, img_h - 1))
                crop_x2 = max(crop_x1 + 1, min(crop_x2, img_w))
                crop_y2 = max(crop_y1 + 1, min(crop_y2, img_h))

                region = img.crop((crop_x1, crop_y1, crop_x2, crop_y2))

                # Convert to RGB if needed
                if region.mode != "RGB":
                    region = region.convert("RGB")

                # Calculate average luminance (relative luminance formula)
                pixels = list(region.getdata())
                total_luminance = 0
                for r, g, b in pixels:
                    # sRGB to linear, then relative luminance
                    luminance = (
                        0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255)
                    )
                    total_luminance += luminance

                avg_luminance = total_luminance / len(pixels)
                log.info(
                    f"Widget region luminance: {avg_luminance:.3f} (0=dark, 1=light)"
                )
                return avg_luminance

            except Exception as e:
                log.warning(f"Could not analyze wallpaper region: {e}")
                return None

        # Determine if truly transparent or using solid background
        is_fully_transparent = (
            is_transparent or int(widget_cfg.get("BACKGROUND_OPACITY", "55")) == 0
        )

        if is_fully_transparent:
            # Fully transparent - no background at all
            own_window_transparent = "true"
            argb_value = "0"
            background_color = "000000"

            # Analyze wallpaper region for text color
            luminance = get_widget_region_luminance()
            if luminance is not None and luminance > 0.5:
                # Light wallpaper - use dark text (primary from light scheme)
                light_scheme = Scheme(theme=theme_data, lightmode=True).to_hex()
                text_color = light_scheme.get("primary", "#1b5e20")[1:]
                log.info(
                    f"Light wallpaper (lum={luminance:.2f}) → dark text: #{text_color}"
                )
            else:
                # Dark wallpaper - use light text (primary from dark scheme)
                text_color = scheme.get("primary", "#a5d6a7")[1:]
                log.info(f"Dark wallpaper → light text: #{text_color}")
        else:
            # Solid background with transparency
            own_window_transparent = "false"
            opacity_pct = max(
                0, min(100, int(widget_cfg.get("BACKGROUND_OPACITY", "55")))
            )
            argb_value = str(int(opacity_pct * 255 / 100))
            background_color = scheme.get("surface", "#1b1c18")[1:]
            text_color = scheme.get("onSurface", "#e4e3db")[1:]
            log.info(f"Solid background (opacity={opacity_pct}%) → text: #{text_color}")

        # === Widget configuration placeholders ===
        conky_config = conky_config.replace(
            "@{WIDGET_POSITION}", widget_cfg["POSITION"]
        )

        # GAP values: user's value = exact pixel distance from screen edge
        user_gap_x = int(widget_cfg.get("GAP_X", "24"))
        user_gap_y = int(widget_cfg.get("GAP_Y", "24"))
        conky_config = conky_config.replace("@{WIDGET_GAP_X}", str(user_gap_x))
        conky_config = conky_config.replace("@{WIDGET_GAP_Y}", str(user_gap_y))

        # Background settings
        conky_config = conky_config.replace(
            "@{OWN_WINDOW_TRANSPARENT}", own_window_transparent
        )
        conky_config = conky_config.replace("@{ARGB_VALUE}", argb_value)
        conky_config = conky_config.replace("@{BACKGROUND_COLOR}", background_color)

        # Single unified text color
        conky_config = conky_config.replace("@{TEXT_COLOR}", text_color)

        # Font settings
        conky_config = conky_config.replace("@{FONT_FAMILY}", widget_cfg["FONT_FAMILY"])
        conky_config = conky_config.replace(
            "@{ICON_FONT}", widget_cfg.get("ICON_FONT", "MesloLGS Nerd Font Mono")
        )
        conky_config = conky_config.replace(
            "@{TIME_FONT_SIZE}", widget_cfg["TIME_FONT_SIZE"]
        )
        conky_config = conky_config.replace(
            "@{DATE_FONT_SIZE}", widget_cfg["DATE_FONT_SIZE"]
        )
        conky_config = conky_config.replace(
            "@{WEATHER_FONT_SIZE}", widget_cfg["WEATHER_FONT_SIZE"]
        )

        # Behavior settings
        conky_config = conky_config.replace(
            "@{UPDATE_INTERVAL}", widget_cfg["UPDATE_INTERVAL"]
        )
        conky_config = conky_config.replace(
            "@{WEATHER_INTERVAL}", widget_cfg["WEATHER_INTERVAL"]
        )
        conky_config = conky_config.replace("@{PADDING}", widget_cfg["PADDING"])

        # Time format
        if widget_cfg["TIME_FORMAT"] == "24h":
            time_format = "%H:%M"
        else:
            time_format = "%I:%M"
        conky_config = conky_config.replace("@{TIME_FORMAT}", time_format)

        # AM/PM display
        show_ampm = widget_cfg["SHOW_AMPM"].lower() == "true"
        if show_ampm and widget_cfg["TIME_FORMAT"] == "12h":
            ampm_display = "${time %p}"
        else:
            ampm_display = ""
        conky_config = conky_config.replace("@{AMPM_DISPLAY}", ampm_display)

        # === Legacy color substitutions (for any remaining placeholders) ===
        for key, value in scheme.items():
            hex_with_hash = value
            hex_without_hash = value[1:]
            conky_config = re.sub(f"@{{{key}}}", hex_without_hash, conky_config)
            conky_config = re.sub(f"@{{{key}.hex}}", hex_with_hash, conky_config)

        # Create output directories
        conky_dir = os.path.join(home, ".config/conky")
        os.makedirs(conky_dir, exist_ok=True)

        # === Process and install Lua script for rounded corners ===
        lua_script_src = os.path.join(addon_dir, "background.lua")
        lua_script_dest = os.path.join(conky_dir, "meowterialyou_bg.lua")

        if os.path.exists(lua_script_src):
            try:
                with open(lua_script_src, "r") as f:
                    lua_script = f.read()

                # Convert background color hex to RGB floats (0-1 range)
                bg_hex = background_color
                bg_r = int(bg_hex[0:2], 16) / 255.0
                bg_g = int(bg_hex[2:4], 16) / 255.0
                bg_b = int(bg_hex[4:6], 16) / 255.0

                # Get opacity as 0-1 range
                if is_fully_transparent:
                    bg_a = 0.0
                else:
                    opacity_pct = max(
                        0, min(100, int(widget_cfg.get("BACKGROUND_OPACITY", "55")))
                    )
                    bg_a = opacity_pct / 100.0

                # Replace Lua placeholders
                lua_script = lua_script.replace(
                    "@{CORNER_RADIUS}", widget_cfg["CORNER_RADIUS"]
                )
                lua_script = lua_script.replace("@{BG_R}", f"{bg_r:.4f}")
                lua_script = lua_script.replace("@{BG_G}", f"{bg_g:.4f}")
                lua_script = lua_script.replace("@{BG_B}", f"{bg_b:.4f}")
                lua_script = lua_script.replace("@{BG_A}", f"{bg_a:.4f}")

                with open(lua_script_dest, "w") as f:
                    f.write(lua_script)
                log.info(f"Installed background Lua script: {lua_script_dest}")
            except OSError as e:
                log.warning(f"Failed to process Lua script: {e}")

        # Update conky config with Lua script path
        conky_config = conky_config.replace("@{LUA_SCRIPT_PATH}", lua_script_dest)

        # Write processed Conky config
        output_file = os.path.join(conky_dir, "meowterialyou.conf")
        try:
            with open(output_file, "w") as f:
                f.write(conky_config)
            log.info(f"Created desktop widget config: {output_file}")
        except OSError as e:
            log.error(f"Failed to write widget config: {e}")
            return

        # Copy Python weather helper script (uses GWeather like GNOME Weather)
        weather_script_src = os.path.join(addon_dir, "weather.py")
        weather_script_dest = os.path.join(conky_dir, "meowterialyou_weather.py")
        if os.path.exists(weather_script_src):
            try:
                shutil.copy2(weather_script_src, weather_script_dest)
                os.chmod(weather_script_dest, 0o755)
                log.info(f"Installed weather helper script: {weather_script_dest}")
            except OSError as e:
                log.warning(f"Failed to copy weather script: {e}")

        # Kill any existing conky with our config and restart
        subprocess.run(["pkill", "-f", "conky.*meowterialyou"], capture_output=True)

        # Start conky in background
        subprocess.Popen(
            ["conky", "-c", output_file, "-d"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        log.info("Started desktop widget (Conky)")

    def _install_system_gtk4_theme(self, variant: str, scheme: dict) -> None:
        """Install GTK4 system theme for a specific variant (dark/light).

        Args:
            variant: "dark" or "light"
            scheme: Color scheme dictionary with hex values (not used, regenerated per variant)
        """
        import tempfile
        import re
        from src.util import Theme, Scheme

        theme_name = f"MeowterialYou-{variant}"
        system_theme = f"/usr/share/themes/{theme_name}"

        template_path = (
            Path(self._generation_options.parent_dir)
            / f"example/templates/addons/chrome_gtk4/gtk_4_chrome_{variant}.css"
        )

        if not template_path.exists():
            print(f"Warning: System GTK4 template not found at {template_path}")
            return

        # Generate the correct color scheme for this variant
        is_light = variant == "light"
        theme_data, _ = Theme.get(self._generation_options.wallpaper_path)
        variant_scheme = Scheme(theme=theme_data, lightmode=is_light).to_hex()

        print(f"Generating system GTK4 CSS from {template_path.name} for {theme_name}")

        # Read template
        with open(template_path, "r") as f:
            output_data = f.read()

        # Apply color substitutions (same logic as Config.generate)
        for key, value in variant_scheme.items():
            pattern_hex = f"@{{{key}.hex}}"
            hex_stripped = value[1:]
            rgb_value = f"rgb({','.join(str(c) for c in tuple(int(hex_stripped[i:i+2], 16) for i in (0, 2, 4)))})"
            pattern_rgb = f"@{{{key}.rgb}}"

            output_data = re.sub(f"@{{{key}}}", hex_stripped, output_data)
            output_data = re.sub(pattern_hex, value, output_data)
            output_data = re.sub(pattern_rgb, rgb_value, output_data)

        # Append macbuttons CSS if enabled
        if self._generation_options.macbuttons_enabled:
            macbuttons_file = (
                Path(self._generation_options.parent_dir)
                / f"example/templates/addons/macbuttons/gtk_{variant}.css"
            )
            if macbuttons_file.exists():
                with open(macbuttons_file, "r") as f:
                    macbuttons_css = f.read()
                output_data += "\n\n/* ===== macOS Window Buttons Addon ===== */\n"
                output_data += macbuttons_css
                print(f"Applied macbuttons addon to system GTK4 theme ({variant})")

        # Write to temp file then copy with sudo
        with tempfile.NamedTemporaryFile(mode="w", suffix=".css", delete=False) as tmp:
            tmp.write(output_data)
            tmp_path = tmp.name

        # Create gtk-4.0 directory and copy CSS
        # First ensure the base theme directory exists with assets
        source_asset = os.path.abspath(f"assets/{theme_name}")
        if os.path.exists(source_asset):
            subprocess.run(
                ["sudo", "cp", "-r", source_asset, "/usr/share/themes/"],
                capture_output=True,
            )

        # Clean and recreate gtk-4.0 directory
        check_dir = subprocess.run(
            ["test", "-d", f"{system_theme}/gtk-4.0"], capture_output=True
        )
        if check_dir.returncode == 0:
            subprocess.run(
                ["sudo", "rm", "-rf", f"{system_theme}/gtk-4.0"],
                capture_output=True,
            )

        result = subprocess.run(
            ["sudo", "mkdir", "-p", f"{system_theme}/gtk-4.0"],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            print(f"Failed to create gtk-4.0 directory: {result.stderr}")
            os.unlink(tmp_path)
            return

        # Copy CSS as both gtk.css and gtk-dark.css
        for css_name in ["gtk.css", "gtk-dark.css"]:
            result = subprocess.run(
                ["sudo", "cp", tmp_path, f"{system_theme}/gtk-4.0/{css_name}"],
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                subprocess.run(
                    ["sudo", "chmod", "644", f"{system_theme}/gtk-4.0/{css_name}"],
                    capture_output=True,
                )
            else:
                print(f"Failed to copy {css_name}: {result.stderr}")

        print(f"Successfully installed system GTK4 CSS to {system_theme}/gtk-4.0/")

        # Copy assets for title button SVGs
        assets_src = (
            Path(self._generation_options.parent_dir)
            / f"assets/{theme_name}/gtk-3.0/assets"
        )
        if assets_src.exists():
            result = subprocess.run(
                ["sudo", "cp", "-r", str(assets_src), f"{system_theme}/gtk-4.0/"],
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                print(f"Copied assets to {system_theme}/gtk-4.0/assets/")

        # Cleanup temp file
        os.unlink(tmp_path)

    def _has_config_key(self, key: str) -> bool:
        return any(key in self._conf[section].name for section in self._conf.sections())

    def _reload_apps(self) -> None:
        if self._generation_options.wallpaper_path is None:
            raise ValueError("Wallpaper path is None")

        # Set button layout (left or right side)
        if self._generation_options.buttons_left_enabled:
            # macOS style: buttons on left (close, minimize, maximize)
            button_layout = "close,minimize,maximize:"
        else:
            # Default: buttons on right
            button_layout = ":minimize,maximize,close"
        os.system(
            f"gsettings set org.gnome.desktop.wm.preferences button-layout '{button_layout}'"
        )

        reload_apps(
            self._generation_options.lightmode_enabled,
            scheme=self._get_scheme(),
            wallpaper_path=self._generation_options.wallpaper_path,
        )
        set_wallpaper(self._generation_options.wallpaper_path)
        if not self._generation_options.silent:
            os.system(
                "notify-send --app-name='MeowterialYou' -i preferences-desktop-theme 'Theme Applied 😼' 'Please restart your GNOME shell for fresher start 🐾'"
            )

    def _get_scheme(self, color: str | None = None) -> MaterialColors:
        if not color:
            if self._generation_options.wallpaper_path is None:
                raise ValueError("Wallpaper path is None")
            theme, top_colors = Theme.get(self._generation_options.wallpaper_path)
            self._top_colors = top_colors
        else:
            theme = Theme.get_theme_from_color(color)

        return self._get_scheme_from_theme(theme)

    @property
    def top_colors(self) -> list[str]:
        if not self._top_colors:
            self._get_scheme()
        return self._top_colors

    def _get_scheme_from_theme(self, theme: dict) -> MaterialColors:
        scheme = Scheme(
            theme=theme,
            lightmode=self._generation_options.lightmode_enabled,
        )
        colors = scheme.to_hex()
        print_scheme(colors)
        return colors

    @staticmethod
    def get_current_system_wallpaper_path() -> str:
        command = "gsettings get org.gnome.desktop.background picture-uri"
        output = subprocess.check_output(command, shell=True, text=True)

        # Remove leading/trailing whitespace and newline characters from the output
        output = output.strip()
        output = output.replace("'", "")
        # Remove file:// from the output. If exists
        output = output.replace("file://", "")
        return output
