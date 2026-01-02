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
        ]

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
            self._generation_options.lightmode_enabled, scheme=self._get_scheme()
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
