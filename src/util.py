import logging
import os
import re
import subprocess
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
        "-m",
        "--monitor",
        help="start in headless monitor mode",
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

    args: Namespace = parser.parse_args()
    return args


def setup_logging():
    FORMAT = "%(message)s"
    logging.basicConfig(
        level="INFO", format=FORMAT, datefmt="[%X]", handlers=[RichHandler()]
    )

    log = logging.getLogger("rich")
    return log


log = setup_logging()


def reload_apps(lightmode_enabled: bool, scheme: MaterialColors):
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
    color_scheme = "prefer-light" if lightmode_enabled else "prefer-dark"
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

    # Set Gnome Terminal Transparency
    try:
        # Get default profile UUID
        cmd = ["gsettings", "get", "org.gnome.Terminal.ProfilesList", "default"]
        uuid = subprocess.check_output(cmd).decode("utf-8").strip().strip("'")

        profile_path = f"org.gnome.Terminal.Legacy.Profile:/org/gnome/terminal/legacy/profiles:/:{uuid}/"

        log.info(f"Setting Gnome Terminal transparency for profile {uuid}")
        os.system(f"gsettings set {profile_path} use-transparent-background true")
        os.system(f"gsettings set {profile_path} background-transparency-percent 30")

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
        for item in config.sections():
            num = 0
            template_name = config[item].name
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
                pattern_hue = f"@{{{key}.hue}}"
                pattern_sat = f"@{{{key}.sat}}"
                pattern_light = f"@{{{key}.light}}"
                pattern_wallpaper = "@{wallpaper}"

                hex_stripped = value[1:]  # type: ignore
                rgb_value = f"rgb{ColorTransformer.hex_to_rgb(hex_stripped)}"
                hue, light, saturation = ColorTransformer.hex_to_hls(hex_stripped)
                wallpaper_value = os.path.abspath(wallpaper)

                output_data = re.sub(pattern, hex_stripped, output_data)
                output_data = re.sub(pattern_hex, value, output_data)
                output_data = re.sub(pattern_rgb, rgb_value, output_data)
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
