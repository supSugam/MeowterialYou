import logging
import os
import re
import subprocess
import sys
import json
from argparse import ArgumentParser, Namespace
from configparser import ConfigParser
from pathlib import Path

from rich.logging import RichHandler

from src.material_color_utilities_python import Image, themeFromImage
from src.material_color_utilities_python.utils.theme_utils import themeFromSourceColor
from src.models import MaterialColors
from src.transformers import ColorTransformer


def parse_arguments():
    parser = ArgumentParser()

    parser.add_argument(
        "--wallpaper",
        help="the wallpaper that will be used",
        type=str,
    )

    parser.add_argument(
        "--theme",
        help="theme mode: light or dark (default: dark)",
        choices=["light", "dark"],
        default="dark",
    )

    parser.add_argument(
        "-i",
        "--ui",
        help="use ui",
        action="store_true",
    )

    parser.add_argument(
        "-s",
        "--system",
        help="also install theme to /usr/share/themes/ (requires sudo)",
        action="store_true",
    )

    parser.add_argument(
        "--title-buttons",
        help="window button style: mac (circular) or native (default: native)",
        choices=["mac", "native"],
        default="native",
    )

    parser.add_argument(
        "--title-buttons-position",
        help="window button position: left or right (default: right)",
        choices=["left", "right"],
        default="right",
    )

    parser.add_argument(
        "--chrome-gtk4",
        help="install GTK4 theme for Chrome/Chromium browser support",
        action="store_true",
    )

    parser.add_argument(
        "--uninstall",
        help="completely remove all MeowterialYou theme files (overrides all other args)",
        action="store_true",
    )

    parser.add_argument(
        "--silent",
        help="disable desktop notifications",
        action="store_true",
    )

    parser.add_argument(
        "--ui-improvements",
        help="enable UI improvements addon (transparent tray icons, etc.)",
        action="store_true",
    )

    # Path to store last arguments (XDG config directory)
    config_dir = Path.home() / ".config/meowterialyou"
    args_file = config_dir / "last_args.json"

    # Migrate from old location if needed
    old_args_file = Path.home() / ".local/share/meowterialyou/last_args.json"
    if not args_file.exists() and old_args_file.exists():
        config_dir.mkdir(parents=True, exist_ok=True)
        import shutil

        shutil.copy(old_args_file, args_file)

    # If run without arguments, try to load last used arguments
    if len(sys.argv) == 1:
        if args_file.exists():
            try:
                with open(args_file, "r") as f:
                    stored_args = json.load(f)
                    print(
                        f"No arguments provided. Using last successful run: {' '.join(stored_args)}"
                    )
                    return parser.parse_args(stored_args)
            except Exception as e:
                print(f"Failed to load last args: {e}")

    args: Namespace = parser.parse_args()

    # Save arguments for next time (unless it's an uninstall or help command)
    # We check sys.argv again to ensure we only save if user actually provided args
    if len(sys.argv) > 1 and not args.uninstall:
        try:
            args_file.parent.mkdir(parents=True, exist_ok=True)
            with open(args_file, "w") as f:
                json.dump(sys.argv[1:], f)
        except Exception as e:
            # warning but don't crash
            print(f"Warning: Could not save arguments: {e}")

    return args


def setup_logging():
    FORMAT = "%(message)s"
    logging.basicConfig(
        level="INFO", format=FORMAT, datefmt="[%X]", handlers=[RichHandler()]
    )

    log = logging.getLogger("rich")
    return log


log = setup_logging()


def _get_image_stats(image_path: str) -> tuple[float, float, float]:
    """
    Analyze image to get brightness, variance (complexity), and saturation.
    Returns: (avg_brightness 0-255, variance 0-1, avg_saturation 0-1)
    """
    try:
        img = Image.open(image_path)
        img = img.resize((64, 64), Image.Resampling.LANCZOS)
        img = img.convert("RGB")

        pixels = list(img.getdata())

        brightnesses = []
        saturations = []

        for r, g, b in pixels:
            # Perceived brightness using luminosity formula
            brightness = 0.299 * r + 0.587 * g + 0.114 * b
            brightnesses.append(brightness)

            # Calculate saturation (how colorful vs gray)
            max_c = max(r, g, b)
            min_c = min(r, g, b)
            if max_c > 0:
                saturation = (max_c - min_c) / max_c
            else:
                saturation = 0
            saturations.append(saturation)

        avg_brightness = sum(brightnesses) / len(brightnesses)
        avg_saturation = sum(saturations) / len(saturations)

        # Variance measures image complexity (busy patterns)
        mean = avg_brightness
        variance = sum((b - mean) ** 2 for b in brightnesses) / len(brightnesses)
        # Normalize variance to 0-1 (max theoretical variance is ~16256)
        normalized_variance = min(variance / 5000, 1.0)

        return avg_brightness, normalized_variance, avg_saturation
    except Exception as e:
        log.warning(f"Could not analyze image: {e}")
        return 128, 0.5, 0.5  # Defaults


def _calculate_contrast_ratio(color1: str, color2_rgb: tuple) -> float:
    """
    Calculate WCAG contrast ratio between a hex color and RGB tuple.
    Returns ratio from 1 (identical) to 21 (max contrast).
    """

    def hex_to_rgb(hex_color: str) -> tuple:
        hex_color = hex_color.lstrip("#")
        return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))

    def relative_luminance(rgb: tuple) -> float:
        def channel(c):
            c = c / 255.0
            return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

        r, g, b = rgb
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

    try:
        rgb1 = hex_to_rgb(color1)
        lum1 = relative_luminance(rgb1)
        lum2 = relative_luminance(color2_rgb)

        lighter = max(lum1, lum2)
        darker = min(lum1, lum2)
        return (lighter + 0.05) / (darker + 0.05)
    except:
        return 10  # Default mid-range contrast


def _calculate_terminal_transparency(
    wallpaper_path: str, lightmode_enabled: bool, surface_color: str = None
) -> int:
    """
    Calculate optimal terminal transparency using multiple factors:

    1. Contrast Ratio: How much the terminal bg contrasts with wallpaper
       - High contrast = can use more transparency
       - Low contrast = need more opacity for readability

    2. Image Variance: How "busy" the wallpaper is
       - High variance/busy = need less transparency (distracting)
       - Low variance/solid = can use more transparency

    3. Saturation: How colorful the wallpaper is
       - High saturation = slightly less transparency
       - Low saturation = can blend better
    """
    brightness, variance, saturation = _get_image_stats(wallpaper_path)

    # Calculate average wallpaper color for contrast comparison
    try:
        img = Image.open(wallpaper_path)
        img = img.resize((32, 32), Image.Resampling.LANCZOS)
        img = img.convert("RGB")
        pixels = list(img.getdata())
        avg_r = sum(p[0] for p in pixels) // len(pixels)
        avg_g = sum(p[1] for p in pixels) // len(pixels)
        avg_b = sum(p[2] for p in pixels) // len(pixels)
        avg_wallpaper_rgb = (avg_r, avg_g, avg_b)
    except:
        avg_wallpaper_rgb = (128, 128, 128)

    # Use actual surface color if provided, otherwise estimate
    if surface_color:
        contrast = _calculate_contrast_ratio(surface_color, avg_wallpaper_rgb)
    else:
        # Estimate based on mode
        estimated_surface = "#1a1c1a" if not lightmode_enabled else "#fdfdf5"
        contrast = _calculate_contrast_ratio(estimated_surface, avg_wallpaper_rgb)

    # Normalize factors to 0-1 range
    normalized_brightness = brightness / 255.0
    contrast_factor = min(contrast / 21.0, 1.0)  # WCAG max is ~21

    # === Calculate base transparency ===
    if lightmode_enabled:
        # Light mode: generally needs less transparency
        base_min, base_max = 5, 35

        # Higher contrast = can use more transparency
        base = base_min + contrast_factor * (base_max - base_min) * 0.6

        # Dark wallpapers with light terminal: increase transparency
        if normalized_brightness < 0.4:
            base += 10
    else:
        # Dark mode: can generally use more transparency
        base_min, base_max = 20, 65

        # Higher contrast = can use more transparency
        base = base_min + contrast_factor * (base_max - base_min) * 0.7

        # Bright wallpapers with dark terminal: reduce transparency for readability
        if normalized_brightness > 0.6:
            base -= 15

    # === Apply modifiers ===

    # High variance (busy wallpaper) = reduce transparency
    variance_penalty = variance * 20  # Up to -20% for very busy images
    base -= variance_penalty

    # High saturation = slight reduction (colorful backgrounds distract)
    saturation_penalty = saturation * 8  # Up to -8% for very colorful
    base -= saturation_penalty

    # Clamp to reasonable range
    if lightmode_enabled:
        transparency = max(0, min(40, int(base)))
    else:
        transparency = max(15, min(70, int(base)))

    log.debug(
        f"Transparency calc: brightness={brightness:.0f}, variance={variance:.2f}, "
        f"saturation={saturation:.2f}, contrast={contrast:.1f} -> {transparency}%"
    )

    return transparency


def reload_apps(lightmode_enabled: bool, scheme: MaterialColors, wallpaper_path: str):
    postfix = "dark" if not lightmode_enabled else "light"

    log.info(f"Restarting GTK {postfix}")

    # Force gtk-dark.css to point to gtk.css in the theme folder
    # This ensures that apps requesting the dark variant get the themed styles
    # (Critical for dark mode: without this, gtk-dark.css contains hardcoded Adwaita colors)
    theme_dir = Path(
        f"~/.local/share/themes/MeowterialYou-{postfix}/gtk-3.0"
    ).expanduser()
    if theme_dir.exists():
        dark_css = theme_dir / "gtk-dark.css"
        if dark_css.exists() or dark_css.is_symlink():
            dark_css.unlink()

        # Create symlink
        try:
            os.symlink(theme_dir / "gtk.css", dark_css)
            log.info(f"Symlinked gtk-dark.css to gtk.css in {theme_dir}")
        except Exception as e:
            log.error(f"Failed to symlink gtk-dark.css: {e}")

    # Set color preference for Libadwaita/GTK4 apps
    color_scheme = "default" if lightmode_enabled else "prefer-dark"
    os.system(
        f"gsettings set org.gnome.desktop.interface color-scheme '{color_scheme}'"
    )

    # In dark mode, create gtk.css symlink to gtk-dark.css in ~/.config/gtk-3.0/
    # GTK3 loads gtk.css even when prefer-dark is set, so we need this symlink
    # for Terminal and other GTK3 apps to apply the dark theme correctly
    config_gtk3_dir = Path("~/.config/gtk-3.0").expanduser()
    if config_gtk3_dir.exists():
        config_gtk_css = config_gtk3_dir / "gtk.css"
        config_gtk_dark_css = config_gtk3_dir / "gtk-dark.css"

        if not lightmode_enabled and config_gtk_dark_css.exists():
            # Dark mode: symlink gtk.css -> gtk-dark.css
            if config_gtk_css.exists() or config_gtk_css.is_symlink():
                config_gtk_css.unlink()
            try:
                os.symlink(config_gtk_dark_css, config_gtk_css)
                log.info(f"Symlinked gtk.css to gtk-dark.css in {config_gtk3_dir}")
            except Exception as e:
                log.error(f"Failed to symlink config gtk.css: {e}")
        elif lightmode_enabled:
            # Light mode: remove gtk.css override (let theme handle it)
            if config_gtk_css.exists() or config_gtk_css.is_symlink():
                log.info(f"Removing config override: {config_gtk_css}")
                config_gtk_css.unlink()

    # Symlink assets folder to ~/.config/gtk-3.0/assets
    # This is required because CSS in ~/.config/gtk-3.0/ (like gtk-dark.css) uses relative paths (url("assets/..."))
    # Without this, pixbuf loading fails (causing DING issues)
    if config_gtk3_dir.exists():
        config_assets = config_gtk3_dir / "assets"
        theme_assets = theme_dir / "assets"

        if config_assets.exists() or config_assets.is_symlink():
            config_assets.unlink()

        if theme_assets.exists():
            try:
                os.symlink(theme_assets, config_assets)
                log.info(f"Symlinked assets to {config_assets}")
            except Exception as e:
                log.error(f"Failed to symlink assets: {e}")

    os.system(f"gsettings set org.gnome.desktop.interface gtk-theme Adwaita")
    os.system("sleep 0.5")
    os.system(
        f"gsettings set org.gnome.desktop.interface gtk-theme MeowterialYou-{postfix}"
    )

    # Symlink assets folder to ~/.config/gtk-4.0/assets
    # This is required because CSS in ~/.config/gtk-4.0/ (like gtk.css) uses relative paths (url("assets/..."))
    config_gtk4_dir = Path("~/.config/gtk-4.0").expanduser()
    if config_gtk4_dir.exists():
        config_assets_4 = config_gtk4_dir / "assets"
        theme_assets = theme_dir / "assets"

        if config_assets_4.exists() or config_assets_4.is_symlink():
            config_assets_4.unlink()

        if theme_assets.exists():
            try:
                os.symlink(theme_assets, config_assets_4)
                log.info(f"Symlinked assets to {config_assets_4}")
            except Exception as e:
                log.error(f"Failed to symlink GTK4 assets: {e}")

    log.info("Restarting Gnome Shell theme")
    os.system(f"gsettings set org.gnome.shell.extensions.user-theme name 'Default'")
    os.system("sleep 0.5")
    os.system(
        f"gsettings set org.gnome.shell.extensions.user-theme name 'MeowterialYou-{postfix}'"
    )

    # Set Tiling Assistant extension accent color to match theme
    try:
        primary_hex = scheme.primary.hex
        # Convert hex to rgb format that Tiling Assistant expects
        r = int(primary_hex[1:3], 16)
        g = int(primary_hex[3:5], 16)
        b = int(primary_hex[5:7], 16)
        rgb_color = f"rgb({r},{g},{b})"
        result = subprocess.run(
            [
                "gsettings",
                "set",
                "org.gnome.shell.extensions.tiling-assistant",
                "active-window-hint-color",
                rgb_color,
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            log.info(f"Set Tiling Assistant accent color to {rgb_color}")
    except Exception as e:
        # Extension may not be installed, that's fine
        pass

    # Set Gnome Terminal Transparency (adaptive based on wallpaper brightness)
    try:
        # Get default profile UUID
        cmd = ["gsettings", "get", "org.gnome.Terminal.ProfilesList", "default"]
        uuid = subprocess.check_output(cmd).decode("utf-8").strip().strip("'")

        profile_path = f"org.gnome.Terminal.Legacy.Profile:/org/gnome/terminal/legacy/profiles:/:{uuid}/"

        # Calculate adaptive transparency based on wallpaper analysis and scheme colors
        # Get surface color from scheme for accurate contrast calculation
        surface_color = (
            scheme.get("surface", None)
            if isinstance(scheme, dict)
            else getattr(scheme, "surface", None)
        )
        transparency = _calculate_terminal_transparency(
            wallpaper_path, lightmode_enabled, surface_color=surface_color
        )

        log.info(
            f"Setting Gnome Terminal transparency for profile {uuid} to {transparency}%"
        )
        os.system(f"gsettings set {profile_path} use-transparent-background true")
        os.system(
            f"gsettings set {profile_path} background-transparency-percent {transparency}"
        )

    except Exception as e:
        log.error(f"Failed to set terminal transparency: {e}")


def set_wallpaper(path: str):
    if not path.startswith("file://"):
        path = f"file://{path}"
    log.info("Setting wallpaper in gnome")
    os.system("gsettings set org.gnome.desktop.background picture-options 'zoom'")
    os.system(f"gsettings set org.gnome.desktop.background picture-uri {path}")
    os.system(f"gsettings set org.gnome.desktop.background picture-uri-dark {path}")


class Config:
    # Map template names to preference keys
    OPTIONAL_APPS = {
        "SPOTIFY": "THEME_SPOTIFY",
        "DISCORD": "THEME_DISCORD",
        "VSCODE": "THEME_VSCODE",
        "OBSIDIAN": "THEME_OBSIDIAN",
        "VIVALDI": "THEME_VIVALDI",
    }

    @staticmethod
    def load_prefs() -> dict:
        """Load user preferences from XDG config directory."""
        import shutil

        prefs = {}
        # New XDG-compliant location
        prefs_path = Path.home() / ".config/meowterialyou/prefs.conf"
        # Old location for migration
        old_prefs_path = Path.home() / ".local/share/meowterialyou/prefs.conf"

        # Migrate from old location if needed
        if not prefs_path.exists() and old_prefs_path.exists():
            prefs_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(old_prefs_path, prefs_path)

        if prefs_path.exists():
            with open(prefs_path, "r") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, value = line.split("=", 1)
                        prefs[key.strip()] = value.strip().lower() == "true"
        return prefs

    @classmethod
    def _should_skip_template(cls, template_name: str, prefs: dict) -> bool:
        """Check if a template should be skipped based on user preferences"""
        template_upper = template_name.upper()
        for app_key, pref_key in cls.OPTIONAL_APPS.items():
            if app_key in template_upper:
                # Skip if preference is not set to true
                if not prefs.get(pref_key, False):
                    return True
        return False

    @staticmethod
    def read(filename: str):
        config = ConfigParser()
        try:
            print(config.read(filename))
        except OSError as err:
            logging.exception(f"Could not open {err.filename}")
        else:
            logging.info(f"Loaded {len(config.sections())} templates from config file")
            return config

    @classmethod
    def generate(
        cls,
        scheme: MaterialColors,
        config: ConfigParser,
        wallpaper: str,
        lightmode_enabled: bool,
        parent_dir: str,
    ) -> dict | None:
        """Generate a config file from a template

        Args:
            scheme (MaterialColors): The color scheme to use
            config (ConfigParser): The config file to use
            wallpaper (str): The path to the wallpaper

        Returns:
            dict | None: The generated config file. None if error
        """
        # Load user preferences for optional apps
        prefs = cls.load_prefs()

        for item in config.sections():
            num = 0
            template_name = config[item].name

            # Skip optional app templates if not enabled
            if cls._should_skip_template(template_name, prefs):
                logging.debug(f"Skipping {template_name} (not enabled in preferences)")
                continue

            template_path_str = config[item]["template_path"]
            if template_path_str.startswith("."):
                template_path_str = f"{parent_dir}/{template_path_str[1:]}"
            template_path = Path(template_path_str).expanduser()
            # if its a relative path use parent dir as base.
            output_path = Path(config[item]["output_path"]).expanduser()

            if lightmode_enabled and cls._is_dark_theme(template_name):
                continue

            if not lightmode_enabled and not cls._is_dark_theme(template_name):
                continue

            try:
                with open(template_path, "r") as input:  # Template file
                    input_data = input.read()
            except OSError as err:
                logging.exception(f"Could not open {err.filename}, skipping...")
                num += 1
                continue

            output_data = input_data

            for key, value in scheme.items():
                pattern = f"@{{{key}}}"
                pattern_hex = f"@{{{key}.hex}}"
                pattern_rgb = f"@{{{key}.rgb}}"
                pattern_rgba50 = f"@{{{key}.rgba50}}"
                pattern_hue = f"@{{{key}.hue}}"
                pattern_sat = f"@{{{key}.sat}}"
                pattern_light = f"@{{{key}.light}}"
                pattern_wallpaper = "@{wallpaper}"

                hex_stripped = value[1:]  # type: ignore
                rgb_tuple = ColorTransformer.hex_to_rgb(hex_stripped)
                rgb_value = f"rgb{rgb_tuple}"
                rgba50_value = (
                    f"rgba({rgb_tuple[0]}, {rgb_tuple[1]}, {rgb_tuple[2]}, 0.5)"
                )
                hue, light, saturation = ColorTransformer.hex_to_hls(hex_stripped)
                wallpaper_value = os.path.abspath(wallpaper)

                output_data = re.sub(pattern, hex_stripped, output_data)
                output_data = re.sub(pattern_hex, value, output_data)
                output_data = re.sub(pattern_rgb, rgb_value, output_data)
                output_data = re.sub(pattern_rgba50, rgba50_value, output_data)
                output_data = re.sub(pattern_wallpaper, wallpaper_value, output_data)
                output_data = re.sub(pattern_hue, f"{hue}", output_data)
                output_data = re.sub(pattern_sat, f"{saturation}", output_data)
                output_data = re.sub(pattern_light, f"{light}", output_data)

                num += 1

            try:
                # Ensure the directory exists
                output_path.parent.mkdir(parents=True, exist_ok=True)
                with open(output_path, "w") as output:
                    output.write(output_data)
            except OSError as err:
                logging.warning(
                    f"Could not write {template_name} template to {output_path}: {err}"
                )
            else:
                log.info(f"Exported {template_name} template to {output_path}")

    @staticmethod
    def _is_dark_theme(name: str) -> bool:
        upper_name = name.upper()
        return upper_name.endswith("DARK")


class Theme:
    @classmethod
    def get(cls, image: str):
        log.info(f"Using image {image}")

        img = cls._get_image_from_file(image)

        theme, colors = themeFromImage(img)
        return theme, colors

    @staticmethod
    def get_theme_from_color(color: str) -> dict:
        rgb_color = ColorTransformer.hex_to_argb(color)
        return themeFromSourceColor(rgb_color)

    @classmethod
    def _get_image_from_file(cls, image: str):
        """Get image from file and resample it"""
        img = Image.open(image)
        basewidth = 64
        wpercent = basewidth / float(img.size[0])
        hsize = int((float(img.size[1]) * float(wpercent)))
        return img.resize((basewidth, hsize), Image.Resampling.LANCZOS)


class Scheme:
    def __init__(self, theme: dict, lightmode: bool):
        if lightmode:
            log.info("Using light scheme")
            self.scheme_dict = theme["schemes"]["light"].props
        else:
            log.info("Using dark scheme")
            self.scheme_dict = theme["schemes"]["dark"].props

    def get(self) -> dict:
        return self.scheme_dict

    def to_rgb(self) -> dict:
        scheme = self.scheme_dict

        for key, value in scheme.items():
            scheme[key] = ColorTransformer.dec_to_rgb(value)
        return scheme

    def to_hex(self) -> MaterialColors:
        scheme = self.scheme_dict

        # Need to convert to rgb first
        self.to_rgb()

        for key, value in scheme.items():
            scheme[key] = "#{value}".format(value=ColorTransformer.rgb_to_hex(value))
        return scheme
