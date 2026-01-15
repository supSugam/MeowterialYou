import os
import subprocess
from configparser import ConfigParser
from pathlib import Path

from pydantic import BaseModel
from rich.console import Console

from src.material_color_utilities_python.closest_folder_color.domain import (
    ClosestFolderColorDomain,
)
from src.icon_theme import IconThemeGenerator
from src.models import MaterialColors
from src.util import Config, Scheme, Theme, reload_apps, set_wallpaper, on_theme_applied


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
    transparent_panel_enabled: bool = False  # Transparent panel addon
    themed_folder_icons_enabled: bool = True  # Themed folder icons (default: enabled)

    silent: bool = False
    scheme: MaterialColors | None = None
    wallpaper_path: str | None = None
    scheme_variant: str = "tonal_spot"


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
            # Icon theme
            os.path.join(home, ".local/share/icons/MeowterialYou"),
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

        # 2d. Apply transparent topbar addon if enabled
        if self._generation_options.transparent_panel_enabled:
            self._apply_transparent_panel_addon(dest_theme, postfix)

        # 3. Generate and copy GTK4 system CSS to BOTH light and dark themes if --chrome-gtk4 flag is set
        # This uses separate Chrome-focused templates from the addons/chrome_gtk4/ folder
        if self._generation_options.chrome_gtk4_enabled:
            # Install both themes for proper mode switching support
            for variant in ["dark", "light"]:
                self._install_system_gtk4_theme(variant, scheme)

        primary_color = scheme["primary"]

        # Generate Material You themed folder icons if enabled
        if self._generation_options.themed_folder_icons_enabled:
            self._generate_material_you_icons(scheme)
        else:
            # Fallback for non-folder icons or if theming disabled
            # We still set Papirus color for compatibility
            print("Skipping themed folder icons (disabled or fallback)")
            # If disabled, we should probably reset to Papirus default or user choice
            # But for now, let's just update the folder color to match theme
            pass

        # set Papirus folder color (always set this as it affects existing Papirus install)
        # It's a good fallback and also handles the non-folder icons in Papirus theme
        folder_color = self._closest_folder_color_domain.get_closest_color(
            primary_color
        )
        self._set_papirus_folder_color(folder_color)

        self._reload_apps()
        on_theme_applied()

    def _generate_material_you_icons(self, scheme: MaterialColors) -> None:
        """Generate custom Material You icon theme from the color scheme."""
        is_dark = not self._generation_options.lightmode_enabled

        # Convert scheme to dict if needed
        colors = (
            dict(scheme)
            if hasattr(scheme, "__iter__")
            else {
                "primary": scheme.get("primary", "#38693d"),
                "primaryContainer": scheme.get("primaryContainer", "#b8f0b8"),
                "surfaceContainerHigh": scheme.get("surfaceContainerHigh", "#e8e9e3"),
                "surfaceContainerHighest": scheme.get(
                    "surfaceContainerHighest", "#e2e3dd"
                ),
            }
        )

        try:
            generator = IconThemeGenerator()
            theme_path = generator.generate(colors, is_dark_mode=is_dark)
            generator.apply_theme()
            print(f"Generated Material You icon theme at: {theme_path}")
        except Exception as e:
            print(f"Warning: Failed to generate icon theme: {e}")
            print("Falling back to Papirus...")

    def _set_papirus_folder_color(self, folder_color: str) -> None:
        """Set Papirus folder color as fallback."""
        print(f"Setting Papirus folder accent: {folder_color}")
        os.system("export PWD=$HOME")
        os.system(f"papirus-folders -C {folder_color} 2>/dev/null || true")

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

        # Icon theme is now set by _generate_material_you_icons()
        # which sets it to MeowterialYou (inherits from Papirus/Papirus-Dark)

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
        theme_data, _ = Theme.get(
            self._generation_options.wallpaper_path,
            style=self._generation_options.scheme_variant,
        )
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

    def _detect_panel_position(self) -> str:
        """Detect panel position (TOP/BOTTOM/LEFT/RIGHT). Defaults to TOP."""
        import subprocess

        try:
            # Check Dash to Panel
            result = subprocess.run(
                [
                    "gsettings",
                    "get",
                    "org.gnome.shell.extensions.dash-to-panel",
                    "panel-position",
                ],
                capture_output=True,
                text=True,
                timeout=1,
            )
            if result.returncode == 0:
                pos = result.stdout.strip().strip("'")
                if pos in ["TOP", "BOTTOM", "LEFT", "RIGHT"]:
                    return pos
        except Exception:
            pass

        # Default to TOP
        return "TOP"

    def _get_screen_height(self) -> int:
        """Get the screen height using xrandr."""
        try:
            # Run xrandr to get screen resolution
            result = subprocess.run(
                ["xrandr"], capture_output=True, text=True, check=True
            )
            # Look for line with '*' (current mode)
            # Output format: "   2880x1800     59.97*+"
            import re

            for line in result.stdout.splitlines():
                if "*" in line:
                    match = re.search(r"(\d+)x(\d+)", line)
                    if match:
                        return int(match.group(2))
        except Exception as e:
            from src.util import log

            log.warning(f"Failed to detect screen height: {e}")

        return 1080  # Default fallback

    def _get_panel_metrics(self) -> tuple[str, float]:
        """Get panel position and height ratio relative to screen."""
        position = self._detect_panel_position()
        screen_height = self._get_screen_height()

        # Determine panel height (pixels)
        # Default GNOME panel is ~32px
        # We add a small safety buffer of 2px
        panel_height_px = 32 + 2

        # Calculate ratio
        height_ratio = panel_height_px / screen_height

        # Ensure minimum safe ratio (e.g. 1%)
        height_ratio = max(height_ratio, 0.01)

        return position, height_ratio

    def _apply_transparent_panel_addon(self, dest_theme: str, postfix: str) -> None:
        """Apply Transparent Panel addon to GLIB Shell CSS.

        This checks brightness of the panel region and applies appropriate contrast CSS.
        """
        import re
        from src.util import log, Theme, Scheme, is_region_dark

        parent_dir = self._generation_options.parent_dir
        addon_dir = os.path.join(
            parent_dir, "example/templates/addons/transparent_panel"
        )
        home = os.path.expanduser("~")

        # Target: the generated GNOME Shell CSS
        theme_name = f"MeowterialYou-{postfix}"
        output_file = os.path.join(
            home, f".themes/{theme_name}/gnome-shell/gnome-shell.css"
        )

        if not os.path.exists(output_file):
            log.warning(f"GNOME Shell CSS not found: {output_file}")
            return

        # --- 1. Detect Metrics & Brightness ---
        wallpaper_path = self._generation_options.wallpaper_path
        position, height_ratio = self._get_panel_metrics()

        # Calculate dynamic region based on ratio
        region = (0, 0, 1.0, height_ratio)  # Default TOP
        if position == "BOTTOM":
            region = (0, 1.0 - height_ratio, 1.0, 1.0)
        elif position == "LEFT":
            region = (0, 0, height_ratio, 1.0)
        elif position == "RIGHT":
            region = (1.0 - height_ratio, 0, 1.0, 1.0)

        is_dark = False
        if wallpaper_path:
            is_dark = is_region_dark(wallpaper_path, region=region)

        # --- 2. Select Addon File & Text Color ---
        if is_dark:
            # Dark region -> Need Light Text -> Use shell_dark.css
            addon_filename = "shell_dark.css"

            theme_dark, _ = Theme.get(
                wallpaper_path, style=self._generation_options.scheme_variant
            )
            scheme_dark = Scheme(theme=theme_dark, lightmode=False).to_hex()
            panel_text_color = scheme_dark.get("onSurface", "#e1e3df")

            log.info(
                f"Transparent panel: Detected DARK region ({height_ratio:.1%}). Using light text."
            )
        else:
            # Light region -> Need Dark Text -> Use shell_light.css
            addon_filename = "shell_light.css"

            theme_light, _ = Theme.get(
                wallpaper_path, style=self._generation_options.scheme_variant
            )
            scheme_light = Scheme(theme=theme_light, lightmode=True).to_hex()
            panel_text_color = scheme_light.get("onSurface", "#191c1a")

            log.info(
                f"Transparent panel: Detected LIGHT region ({height_ratio:.1%}). Using dark text."
            )

        # --- 3. Read Addon File ---
        addon_file = os.path.join(addon_dir, addon_filename)
        if not os.path.exists(addon_file):
            log.warning(f"Transparent Panel addon file not found: {addon_file}")
            return

        try:
            with open(addon_file, "r") as f:
                addon_css = f.read()
        except OSError as e:
            log.error(f"Failed to read addon file {addon_file}: {e}")
            return

        # --- 4. Inject Colors ---
        # Get current scheme for other placeholders if any
        theme_current, _ = Theme.get(
            self._generation_options.wallpaper_path,
            style=self._generation_options.scheme_variant,
        )
        scheme_current = Scheme(
            theme=theme_current, lightmode=self._generation_options.lightmode_enabled
        ).to_hex()

        scheme = dict(scheme_current)
        scheme["panelTextColor"] = panel_text_color

        for key, value in scheme.items():
            pattern_hex = f"@{{{key}.hex}}"
            hex_stripped = value[1:] if value.startswith("#") else value
            rgb_value = f"rgb({','.join(str(c) for c in tuple(int(hex_stripped[i:i+2], 16) for i in (0, 2, 4)))})"
            pattern_rgb = f"@{{{key}.rgb}}"

            # Replace both hex and rgb tokens
            if f"@{{{key}}}" in addon_css:
                addon_css = re.sub(f"@{{{key}}}", hex_stripped, addon_css)
            addon_css = re.sub(pattern_hex, value, addon_css)
            addon_css = re.sub(pattern_rgb, rgb_value, addon_css)

        try:
            with open(output_file, "a") as f:
                f.write(
                    f"\n\n/* ===== Transparent Panel Addon ({addon_filename}) ===== */\n"
                )
                f.write(addon_css)
            log.info(f"Applied Transparent Panel addon to {output_file}")
        except OSError as e:
            log.error(f"Failed to append Transparent Panel addon to {output_file}: {e}")

    def _apply_desktop_widget_addon(self, postfix: str) -> None:
        """Apply Material You desktop widget using AGS."""
        import shutil
        from src.util import log, Theme, Scheme

        parent_dir = self._generation_options.parent_dir
        addon_dir = os.path.join(parent_dir, "example/templates/addons/desktop_widget")
        home = os.path.expanduser("~")
        lightmode_enabled = self._generation_options.lightmode_enabled

        # === Read widget configuration ===
        widget_config_file = os.path.join(addon_dir, "widget.conf")
        widget_cfg = {
            "POSITION": "bottom_left",
            "GAP_X": "24",
            "GAP_Y": "24",
            "BACKGROUND_MODE": "solid",
            "BACKGROUND_OPACITY": "50",
            "CORNER_RADIUS": "24",
            "FONT_FAMILY": "Inter",
            "ICON_FONT": "MesloLGS Nerd Font Mono",
            "TIME_FONT_SIZE": "48",
            "WEATHER_INTERVAL": "900",
            "PADDING": "20",
        }

        if os.path.exists(widget_config_file):
            try:
                with open(widget_config_file, "r") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            key, _, value = line.partition("=")
                            widget_cfg[key.strip()] = (
                                value.strip().strip('"').strip("'")
                            )
            except OSError as e:
                log.warning(f"Could not read widget config: {e}")

        # Check if gjs is installed (part of GNOME, usually available)
        if not shutil.which("gjs"):
            log.warning("gjs not found. Install it via: sudo apt install gjs")
            return

        # Get color scheme
        theme_data, _ = Theme.get(
            self._generation_options.wallpaper_path,
            style=self._generation_options.scheme_variant,
        )
        scheme = Scheme(theme=theme_data, lightmode=lightmode_enabled).to_hex()

        # Process colors
        # Background mode deprecated, using direct opacity in app.ts
        # We just need to provide the base variant color for widget_bg

        bg_hex = scheme.get("surfaceVariant", "#45483d")[1:]
        bg_r = int(bg_hex[0:2], 16)
        bg_g = int(bg_hex[2:4], 16)
        bg_b = int(bg_hex[4:6], 16)

        text_color = scheme.get("onSurfaceVariant", "#c6c8b9")
        primary_color = scheme.get("primary", "#b2d274")

        # Map position to AGS anchor
        position = widget_cfg.get("POSITION", "bottom_left").lower()
        anchor_map = {
            "bottom_left": "Astal.WindowAnchor.BOTTOM | Astal.WindowAnchor.LEFT",
            "bottom_right": "Astal.WindowAnchor.BOTTOM | Astal.WindowAnchor.RIGHT",
            "top_left": "Astal.WindowAnchor.TOP | Astal.WindowAnchor.LEFT",
            "top_right": "Astal.WindowAnchor.TOP | Astal.WindowAnchor.RIGHT",
        }
        anchor = anchor_map.get(position, anchor_map["bottom_left"])

        # Create AGS config directory
        ags_dir = os.path.join(home, ".config/ags/meowterialyou")
        os.makedirs(ags_dir, exist_ok=True)

        # Localized Theme Generation
        # 1. Load config for position
        import yaml
        from PIL import Image, ImageStat
        import math

        config_path = os.path.join(ags_dir, "config.yaml")
        widget_pos = "bottom_left"
        gap_x = 24
        gap_y = 64
        # Default size estimation (approximate, since we don't know exact rendered size yet)
        w_width = 350
        w_height = 200

        if os.path.exists(config_path):
            try:
                with open(config_path, "r") as f:
                    w_conf = yaml.safe_load(f)
                    if w_conf:
                        layout = w_conf.get("layout", {})
                        widget_pos = layout.get("position", widget_pos)
                        gap_x = layout.get("gap_x", gap_x)
                        gap_y = layout.get("gap_y", gap_y)
            except Exception as e:
                log.warning(f"Failed to parse config.yaml for positioning: {e}")

        # 2. Load and crop wallpaper
        wallpaper_path = self._generation_options.wallpaper_path
        scheme_to_use = scheme  # Default to global scheme
        is_dark_bg = True

        if False and os.path.exists(
            wallpaper_path
        ):  # DISABLED: Force use of global scheme for consistency
            try:
                img = Image.open(wallpaper_path)
                sw, sh = img.size

                # Calculate simple crop box based on position
                # Assuming top-left origin
                left = 0
                top = 0

                if widget_pos == "bottom_left":
                    left = gap_x
                    top = sh - w_height - gap_y
                elif widget_pos == "bottom_right":
                    left = sw - w_width - gap_x
                    top = sh - w_height - gap_y
                elif widget_pos == "top_left":
                    left = gap_x
                    top = gap_y
                elif widget_pos == "top_right":
                    left = sw - w_width - gap_x
                    top = gap_y

                # Clamp coordinates
                left = max(0, min(sw - 1, left))
                top = max(0, min(sh - 1, top))
                right = min(sw, left + w_width)
                bottom = min(sh, top + w_height)

                crop = img.crop((left, top, right, bottom))

                # 3. Analyze Luminance (0-255)
                # Convert to grayscale and get mean
                grayscale = crop.convert("L")
                stat = ImageStat.Stat(grayscale)
                mean_lum = stat.mean[0]

                # If luminance > 128 (bright), force LIGHT mode (dark text)
                # If luminance < 128 (dark), force DARK mode (light text)
                required_dark_mode = mean_lum < 128
                log.info(
                    f"Widget Region Luminance: {mean_lum:.2f} -> Using {'Dark' if required_dark_mode else 'Light'} scheme"
                )

                # 4. Generate Local Palette
                # Use mean color of the crop as source? Or standard extraction?
                # Let's use the standard extraction on the crop by resizing it down to 1px to get average color
                # straightforward way:
                avg_color_img = crop.resize((1, 1))
                r, g, b = avg_color_img.getpixel((0, 0))[:3]
                source_color_hex = "#{:02x}{:02x}{:02x}".format(r, g, b)

                # Generate scheme from this local color
                from src.material_color_utilities_python.utils.theme_utils import (
                    themeFromSourceColor,
                )

                theme = themeFromSourceColor(
                    int(f"FF{r:02x}{g:02x}{b:02x}", 16),
                    style=self._generation_options.scheme_variant,
                )

                scheme_to_use = theme["schemes"][
                    "dark" if required_dark_mode else "light"
                ]

                # Flatten the scheme to simple hex values
                # The library returns integers, convert to hex strings
                new_scheme = {}
                for k, v in scheme_to_use.props.items():
                    # v is int ARGB, we need RGB hex (strip alpha if present, usually FF)
                    # actually utils usually returns standard int. format {:06x}
                    new_scheme[k] = "#{:06x}".format(v & 0xFFFFFF)

                scheme_to_use = new_scheme

            except Exception as e:
                log.error(f"Localized theme extraction failed: {e}")

        # 5. Generate theme.css with FULL palette
        css_lines = []
        for name, hex_val in scheme_to_use.items():
            css_lines.append(f"@define-color {name} {hex_val};")

        # Legacy mappings for backward compatibility (if needed)
        # But app.ts will be updated to use new tokens.
        # We also need widget_bg with opacity

        bg_color = scheme_to_use.get("surface", "#000000")  # Base background
        # Convert hex to rgb for rgba usage
        br = int(bg_color[1:3], 16)
        bg = int(bg_color[3:5], 16)
        bb = int(bg_color[5:7], 16)

        # Opacity comes from config usually, but we want config.yaml to control it runtime.
        # However, theme.css defines the base color.
        # We expose @widget_bg_rgb as a color without alpha? No, GTK colors usually include alpha or not.
        # Let's define @surfaceRGBA for the app.ts to use with alpha() function?
        # Actually app.ts uses alpha(@widget_bg, ...) which works if widget_bg is a color.

        css_lines.append(f"@define-color widget_bg rgb({br}, {bg}, {bb});")
        css_lines.append(
            f"@define-color widget_text {scheme_to_use.get('onSurface', '#ffffff')};"
        )
        css_lines.append(
            f"@define-color widget_primary {scheme_to_use.get('primary', '#00ff00')};"
        )

        with open(os.path.join(ags_dir, "theme.css"), "w") as f:
            f.write("\n".join(css_lines))
        log.info(f"Generated localized theme: {ags_dir}/theme.css")

        # 6. Blurred background generation removed (using dynamic compositor blur)

        # Copy config.yaml
        config_src = os.path.join(addon_dir, "config.yaml")
        if os.path.exists(config_src):
            # Always overwrite config to ensure updates apply
            shutil.copy(config_src, os.path.join(ags_dir, "config.yaml"))

        # Remove old config if exists
        old_config = os.path.join(ags_dir, "config.json")
        if os.path.exists(old_config):
            try:
                os.unlink(old_config)
            except Exception:
                pass

        # Generate .desktop file for app identity (Blur My Shell detection)
        desktop_entry_path = os.path.join(
            home, ".local/share/applications/meowterialyou-widget.desktop"
        )
        app_js_path = os.path.join(ags_dir, "app.mjs")

        try:
            desktop_content = f"""[Desktop Entry]
Type=Application
Name=MeowterialYou Widget
Exec=gjs -m {app_js_path}
Icon=preferences-desktop-theme
Terminal=false
Categories=Utility;
StartupNotify=false
NoDisplay=true
X-GNOME-SingleWindow=true
"""
            with open(desktop_entry_path, "w") as f:
                f.write(desktop_content)
            log.info(f"Created desktop entry: {desktop_entry_path}")

            # Refresh database? usually not strictly needed for running apps mapping but good practice
            # subprocess.run(["update-desktop-database", os.path.join(home, ".local/share/applications")], check=False)
        except Exception as e:
            log.warning(f"Failed to create desktop entry: {e}")

        # Compile TS to JS
        app_ts_src = os.path.join(addon_dir, "app.ts")
        if os.path.exists(app_ts_src):
            # Use local esbuild if available
            esbuild_path = os.path.join(addon_dir, "node_modules/.bin/esbuild")
            app_js_out = os.path.join(ags_dir, "app.mjs")

            if os.path.exists(esbuild_path):
                result = subprocess.run(
                    [
                        esbuild_path,
                        app_ts_src,
                        "--bundle",
                        "--format=esm",
                        "--platform=neutral",
                        "--external:gi://*",
                        f"--outfile={app_js_out}",
                    ],
                    capture_output=True,
                )
                if result.returncode != 0:
                    log.warning(f"esbuild failed: {result.stderr.decode()}")
            else:
                log.warning("esbuild not found, skipping build")

        # Kill existing widget and start new one with gjs
        # Use SIGKILL to ensure it dies immediately
        subprocess.run(["pkill", "-9", "-f", "gjs.*meowterialyou"], capture_output=True)

        # Verify it's dead? pkill returns 0 if it matched, 1 if not.

        # Make the script executable and run with gjs
        app_js_path = os.path.join(ags_dir, "app.mjs")
        os.chmod(app_js_path, 0o755)

        # Start detached
        subprocess.Popen(
            ["gjs", "-m", app_js_path],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,  # Detach from parent
        )
        log.info("Started desktop widget (GJS)")

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
        theme_data, _ = Theme.get(
            self._generation_options.wallpaper_path,
            style=self._generation_options.scheme_variant,
        )
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
            theme, top_colors = Theme.get(
                self._generation_options.wallpaper_path,
                style=self._generation_options.scheme_variant,
            )
            self._top_colors = top_colors
        else:
            theme = Theme.get_theme_from_color(
                color, style=self._generation_options.scheme_variant
            )

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
