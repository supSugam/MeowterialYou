import logging
import os
import re
import subprocess
import sys
import json
import numpy as np
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
        help="theme mode: system (auto-detect), light, or dark (default: system)",
        choices=["system", "light", "dark"],
        default="system",
    )

    parser.add_argument(
        "--scheme",
        help="Material You dynamic scheme variant",
        choices=[
            "tonal_spot",
            "neutral",
            "vibrant",
            "expressive",
            "rainbow",
            "fruit_salad",
            "content",
            "monochrome",
            "fidelity",
        ],
        default="tonal_spot",
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

    parser.add_argument(
        "--desktop-widget",
        help="enable Material You desktop widget (clock + weather, uses gtk-rust)",
        action="store_true",
    )

    parser.add_argument(
        "--transparent-panel",
        "--transparent-topbar",
        dest="transparent_panel",
        help="enable transparent panel addon",
        action="store_true",
    )

    parser.add_argument(
        "--themed-folder-icons",
        help="enable themed folder icons (recolored SVG icons)",
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


def on_theme_applied() -> None:
    """Execute maintenance tasks after theme is successfully applied."""
    try:
        # Quit Nautilus to force icon refresh for folder icons
        subprocess.run(
            ["nautilus", "-q"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
    except Exception as e:
        log.warning(f"Failed to refresh Nautilus: {e}")

    # Restart DING extension to refresh desktop rubberband selection colors
    # DING caches GTK accent colors and needs a restart to pick up new theme colors
    try:
        subprocess.run(
            ["gnome-extensions", "disable", "ding@rastersoft.com"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=3,
        )
        subprocess.run(
            ["gnome-extensions", "enable", "ding@rastersoft.com"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=3,
        )
    except Exception:
        pass  # DING may not be installed, silently ignore


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


def is_region_dark(
    image_path: str,
    region: tuple[float, float, float, float] | None = None,
    threshold: float = 150.0,
) -> bool:
    """
    Determine if a specific region of the wallpaper is dark.

    Uses perceptual luminance (Rec. 709) to evaluate brightness, which better
    matches human perception than simple RGB averaging.

    Args:
        image_path: Path to wallpaper image
        region: (left, top, right, bottom) in normalized coordinates [0.0-1.0].
                If None, defaults to top 10% (0, 0, 1, 0.1).
        threshold: Brightness threshold (0-255). Below = dark.

    Returns:
        True if region is dark (needs light text for topbar)
    """
    try:
        img = Image.open(image_path)

        # Convert to RGB early to handle RGBA, grayscale, etc.
        if img.mode != "RGB":
            img = img.convert("RGB")

        width, height = img.size

        # Determine crop region
        if region:
            l, t, r, b = region
            # Validate normalized coordinates
            if not all(0.0 <= val <= 1.0 for val in region):
                log.warning(f"Region coords must be in [0,1]: {region}")
                region = None

        if region is None:
            # Default: top 10%, minimum 50px
            l, t, r, b = 0.0, 0.0, 1.0, max(0.1, 50 / height)

        # Convert to pixel coordinates
        l_px = int(l * width)
        t_px = int(t * height)
        r_px = int(r * width)
        b_px = int(b * height)

        # Ensure valid crop region
        l_px = max(0, min(l_px, width - 1))
        t_px = max(0, min(t_px, height - 1))
        r_px = max(l_px + 1, min(r_px, width))
        b_px = max(t_px + 1, min(b_px, height))

        # Crop and downsample for performance
        crop = img.crop((l_px, t_px, r_px, b_px))

        # Adaptive downsampling: maintain aspect ratio, cap at ~4K pixels
        aspect = crop.width / crop.height
        target_pixels = 4096
        if crop.width * crop.height > target_pixels:
            new_height = int((target_pixels / aspect) ** 0.5)
            new_width = int(new_height * aspect)
            crop = crop.resize((new_width, new_height), Image.Resampling.LANCZOS)

        # Calculate perceptual luminance (Rec. 709 coefficients)
        pixels = np.array(crop, dtype=np.float32)
        luminance = (
            0.2126 * pixels[:, :, 0]
            + 0.7152 * pixels[:, :, 1]
            + 0.0722 * pixels[:, :, 2]
        )

        # Use median instead of mean (more robust to outliers like bright UI elements)
        avg_brightness = np.median(luminance)

        log.debug(
            f"Region brightness: {avg_brightness:.1f} (threshold: {threshold}, "
            f"sampled {crop.width}x{crop.height}px)"
        )

        return avg_brightness < threshold

    except Exception as e:
        log.warning(f"Could not analyze region brightness: {e}")
        return False  # Safe default: assume light wallpaper (use dark text)


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
            # Light mode: we now generate gtk.css via config.ini, so just remove any stale symlink
            # that might point to gtk-dark.css from a previous dark mode run
            if config_gtk_css.is_symlink():
                log.info(f"Removing stale symlink: {config_gtk_css}")
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

    # Set Gnome Terminal with full Material You theming (if enabled in preferences)
    # Load preferences to check if terminal theming is enabled (default: true)
    prefs = Config.load_prefs()
    if not prefs.get("THEME_GNOME_TERMINAL", True):
        log.info("Skipping GNOME Terminal theming (disabled in preferences)")
    else:
        try:
            # Get default profile UUID
            cmd = ["gsettings", "get", "org.gnome.Terminal.ProfilesList", "default"]
            uuid = subprocess.check_output(cmd).decode("utf-8").strip().strip("'")

            profile_path = f"org.gnome.Terminal.Legacy.Profile:/org/gnome/terminal/legacy/profiles:/:{uuid}/"

            # Helper to get scheme color
            def get_color(key: str, fallback: str = "#000000") -> str:
                if isinstance(scheme, dict):
                    return scheme.get(key, fallback)
                return getattr(scheme, key, fallback)

            # Disable use-theme-colors to allow custom Material You colors
            os.system(f"gsettings set {profile_path} use-theme-colors false")

            # Calculate adaptive transparency based on wallpaper analysis
            surface_color = get_color("surface")
            transparency = _calculate_terminal_transparency(
                wallpaper_path, lightmode_enabled, surface_color=surface_color
            )

            log.info(f"Setting Gnome Terminal theme for profile {uuid}")

            # === Background & Foreground ===
            background = get_color(
                "surface", "#1a1c1a" if not lightmode_enabled else "#fdfdf5"
            )
            foreground = get_color(
                "onSurface", "#e2e2e6" if not lightmode_enabled else "#1a1c18"
            )
            os.system(f"gsettings set {profile_path} background-color '{background}'")
            os.system(f"gsettings set {profile_path} foreground-color '{foreground}'")

            # === Transparency ===
            os.system(f"gsettings set {profile_path} use-transparent-background true")
            os.system(
                f"gsettings set {profile_path} background-transparency-percent {transparency}"
            )

            # === Bold Color ===
            bold_color = get_color("primary", foreground)
            os.system(f"gsettings set {profile_path} bold-color-same-as-fg false")
            os.system(f"gsettings set {profile_path} bold-color '{bold_color}'")

            # === Cursor Colors ===
            cursor_bg = get_color("primary", foreground)
            cursor_fg = get_color("onPrimary", background)
            os.system(f"gsettings set {profile_path} cursor-colors-set true")
            os.system(
                f"gsettings set {profile_path} cursor-background-color '{cursor_bg}'"
            )
            os.system(
                f"gsettings set {profile_path} cursor-foreground-color '{cursor_fg}'"
            )

            # === Highlight/Selection Colors ===
            highlight_bg = get_color("primaryContainer")
            highlight_fg = get_color("onPrimaryContainer")
            os.system(f"gsettings set {profile_path} highlight-colors-set true")
            os.system(
                f"gsettings set {profile_path} highlight-background-color '{highlight_bg}'"
            )
            os.system(
                f"gsettings set {profile_path} highlight-foreground-color '{highlight_fg}'"
            )

            # === 16-Color Palette ===
            # Standard terminal palette: 8 normal + 8 bright colors
            # ANSI order: black, red, green, yellow, blue, magenta, cyan, white (then bright variants)
            #
            # Design principles:
            # - Normal colors: Primary/accent colors for visibility
            # - Bright colors: Lighter/more vibrant versions
            # - Red/Magenta: Use error colors for consistency
            # - Green: Use primary (matches Material You accent)
            # - Yellow: Use inversePrimary/tertiary for warmth
            # - Blue: Keep traditional blue for familiarity
            # - Cyan: Use tertiary
            if lightmode_enabled:
                # Light mode: darker normal colors, lighter bright colors
                palette = [
                    get_color("outline", "#74796d"),  # 0: Black (gray)
                    get_color("error", "#ba1b1b"),  # 1: Red
                    get_color("primary", "#496636"),  # 2: Green
                    "#7c6f00",  # 3: Yellow (warm)
                    "#0061a4",  # 4: Blue (classic blue)
                    "#9a4057",  # 5: Magenta
                    get_color("tertiary", "#386666"),  # 6: Cyan
                    get_color("onSurface", "#1a1c18"),  # 7: White (actually dark text)
                    get_color("outlineVariant", "#c4c8bb"),  # 8: Bright Black
                    get_color("errorContainer", "#ffdad4"),  # 9: Bright Red
                    get_color("primaryContainer", "#cbedb0"),  # 10: Bright Green
                    "#fff0c3",  # 11: Bright Yellow
                    "#d1e4ff",  # 12: Bright Blue
                    "#ffd8e4",  # 13: Bright Magenta
                    get_color("tertiaryContainer", "#bbeceb"),  # 14: Bright Cyan
                    get_color("surface", "#fdfdf5"),  # 15: Bright White
                ]
            else:
                # Dark mode: visible normal colors, brighter bright colors
                palette = [
                    get_color("outlineVariant", "#43483e"),  # 0: Black (dark gray)
                    get_color("error", "#ffb4a9"),  # 1: Red
                    get_color("primary", "#afd096"),  # 2: Green
                    "#e4c54a",  # 3: Yellow (warm, visible)
                    "#aac7ff",  # 4: Blue (light blue)
                    "#ffafd0",  # 5: Magenta (pink)
                    get_color("tertiary", "#a0cfce"),  # 6: Cyan
                    get_color("onSurface", "#e3e3dc"),  # 7: White
                    get_color("outline", "#8e9386"),  # 8: Bright Black (lighter gray)
                    get_color(
                        "errorContainer", "#930006"
                    ),  # 9: Bright Red (darker for contrast)
                    get_color(
                        "primaryContainer", "#334e21"
                    ),  # 10: Bright Green (container)
                    "#635000",  # 11: Bright Yellow (darker)
                    "#0061a4",  # 12: Bright Blue (darker)
                    "#9a4057",  # 13: Bright Magenta (darker)
                    get_color(
                        "tertiaryContainer", "#1e4e4e"
                    ),  # 14: Bright Cyan (container)
                    get_color("surface", "#1a1c18"),  # 15: Bright White (surface)
                ]

            palette_str = "[" + ", ".join(f"'{c}'" for c in palette) + "]"
            os.system(f'gsettings set {profile_path} palette "{palette_str}"')

            log.info(
                f"Applied full Material You terminal theme (transparency: {transparency}%)"
            )

            # Generate themed terminal prompt (PS1)
            generate_terminal_prompt(scheme)

        except Exception as e:
            log.error(f"Failed to set terminal settings: {e}")


def generate_terminal_prompt(scheme: dict):
    """
    Generate a comprehensive Material You themed terminal environment.
    Creates ~/.config/meowterialyou/prompt.sh with:
    - Colored PS1 prompt (username, hostname, path, git branch, exit status)
    - LS_COLORS for file listings (ls, tree, etc.)
    - GCC_COLORS for compiler output
    - GREP_COLORS for search highlighting
    - Man page colors
    """

    def hex_to_rgb(hex_color: str) -> tuple:
        """Convert hex color to RGB tuple."""
        hex_color = hex_color.lstrip("#")
        return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))

    def hex_to_ansi256(hex_color: str) -> int:
        """Convert hex to closest ANSI 256 color for compatibility."""
        r, g, b = hex_to_rgb(hex_color)
        # Use 6x6x6 color cube (16-231)
        return (
            16
            + (36 * round(r / 255 * 5))
            + (6 * round(g / 255 * 5))
            + round(b / 255 * 5)
        )

    # Get Material You colors from scheme
    primary = scheme.get("primary", "#496636")
    on_primary = scheme.get("onPrimary", "#ffffff")
    primary_container = scheme.get("primaryContainer", "#cbedb0")
    on_primary_container = scheme.get("onPrimaryContainer", "#082100")
    secondary = scheme.get("secondary", "#56624b")
    on_secondary = scheme.get("onSecondary", "#ffffff")
    secondary_container = scheme.get("secondaryContainer", "#d9e7ca")
    tertiary = scheme.get("tertiary", "#386666")
    on_tertiary = scheme.get("onTertiary", "#ffffff")
    tertiary_container = scheme.get("tertiaryContainer", "#bbeceb")
    error = scheme.get("error", "#ba1b1b")
    error_container = scheme.get("errorContainer", "#ffdad4")
    surface = scheme.get("surface", "#fdfdf5")
    on_surface = scheme.get("onSurface", "#1a1c18")
    surface_variant = scheme.get("surfaceVariant", "#e0e4d6")
    on_surface_variant = scheme.get("onSurfaceVariant", "#43483e")
    outline = scheme.get("outline", "#74796d")
    outline_variant = scheme.get("outlineVariant", "#c4c8bb")

    # Convert to RGB for 24-bit ANSI
    primary_rgb = hex_to_rgb(primary)
    secondary_rgb = hex_to_rgb(secondary)
    tertiary_rgb = hex_to_rgb(tertiary)
    error_rgb = hex_to_rgb(error)
    outline_rgb = hex_to_rgb(outline)
    on_surface_rgb = hex_to_rgb(on_surface)
    primary_container_rgb = hex_to_rgb(primary_container)

    # ANSI 256 colors for LS_COLORS compatibility
    primary_256 = hex_to_ansi256(primary)
    secondary_256 = hex_to_ansi256(secondary)
    tertiary_256 = hex_to_ansi256(tertiary)
    error_256 = hex_to_ansi256(error)
    outline_256 = hex_to_ansi256(outline)

    prompt_script = f"""#!/bin/bash
# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║  MeowterialYou - Material You Terminal Theme                              ║
# ║  Auto-generated - do not edit, will be overwritten on theme change        ║
# ╚═══════════════════════════════════════════════════════════════════════════╝

# ═══════════════════════════════════════════════════════════════════════════════
# COLOR DEFINITIONS (24-bit True Color)
# ═══════════════════════════════════════════════════════════════════════════════

# Material You palette (using $'...' for proper escape interpretation)
_MY_PRIMARY=$'\\e[38;2;{primary_rgb[0]};{primary_rgb[1]};{primary_rgb[2]}m'
_MY_SECONDARY=$'\\e[38;2;{secondary_rgb[0]};{secondary_rgb[1]};{secondary_rgb[2]}m'
_MY_TERTIARY=$'\\e[38;2;{tertiary_rgb[0]};{tertiary_rgb[1]};{tertiary_rgb[2]}m'
_MY_ERROR=$'\\e[38;2;{error_rgb[0]};{error_rgb[1]};{error_rgb[2]}m'
_MY_OUTLINE=$'\\e[38;2;{outline_rgb[0]};{outline_rgb[1]};{outline_rgb[2]}m'
_MY_TEXT=$'\\e[38;2;{on_surface_rgb[0]};{on_surface_rgb[1]};{on_surface_rgb[2]}m'
_MY_PRIMARY_BG=$'\\e[48;2;{primary_rgb[0]};{primary_rgb[1]};{primary_rgb[2]}m'
_MY_ERROR_BG=$'\\e[48;2;{error_rgb[0]};{error_rgb[1]};{error_rgb[2]}m'
_MY_RESET=$'\\e[0m'
_MY_BOLD=$'\\e[1m'
_MY_DIM=$'\\e[2m'
_MY_ITALIC=$'\\e[3m'
_MY_UNDERLINE=$'\\e[4m'

# ═══════════════════════════════════════════════════════════════════════════════
# GIT BRANCH FUNCTION
# ═══════════════════════════════════════════════════════════════════════════════

# Non-printing character wrappers for readline (\\001 = \\[, \\002 = \\])
# These MUST be used when outputting colors from functions called via $() in PS1
# Otherwise bash miscalculates line length, causing issues with arrow keys/history
_NP_START=$'\\001'
_NP_END=$'\\002'

__meowterialyou_git_info() {{
    local branch status_color
    branch=$(git symbolic-ref --short HEAD 2>/dev/null || git describe --tags --exact-match 2>/dev/null)
    
    if [ -n "$branch" ]; then
        # Check for uncommitted changes
        if git diff --quiet 2>/dev/null && git diff --staged --quiet 2>/dev/null; then
            status_color="${{_MY_PRIMARY}}"  # Clean
        else
            status_color="${{_MY_ERROR}}"    # Dirty (uncommitted changes)
        fi
        # Wrap escape sequences in non-printing markers for proper readline width calculation
        echo -e " ${{_NP_START}}${{status_color}}${{_NP_END}}($branch)${{_NP_START}}${{_MY_RESET}}${{_NP_END}}"
    fi
}}

# ═══════════════════════════════════════════════════════════════════════════════
# EXIT STATUS INDICATOR
# ═══════════════════════════════════════════════════════════════════════════════

__meowterialyou_exit_status() {{
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        # Wrap escape sequences in non-printing markers for proper readline width calculation
        echo -e " ${{_NP_START}}${{_MY_ERROR}}${{_NP_END}}✗$exit_code${{_NP_START}}${{_MY_RESET}}${{_NP_END}}"
    fi
}}

# ═══════════════════════════════════════════════════════════════════════════════
# BASH PROMPT (PS1)
# ═══════════════════════════════════════════════════════════════════════════════

if [ -n "$BASH_VERSION" ]; then
    # Prompt: username@hostname:path (branch) [exitcode]$
    # Using \\[ \\] for readline non-printing character markers
    PS1="\\[${{_MY_PRIMARY}}\\]\\u\\[${{_MY_OUTLINE}}\\]@\\[${{_MY_TERTIARY}}\\]\\h\\[${{_MY_RESET}}\\]:\\[${{_MY_SECONDARY}}\\]\\w\\[${{_MY_RESET}}\\]\\$(__meowterialyou_git_info)\\$(__meowterialyou_exit_status)\\$ "
fi

# ═══════════════════════════════════════════════════════════════════════════════
# ZSH PROMPT
# ═══════════════════════════════════════════════════════════════════════════════

if [ -n "$ZSH_VERSION" ]; then
    setopt PROMPT_SUBST 2>/dev/null
    PROMPT="%F{{{primary}}}%n%F{{{outline}}}@%F{{{tertiary}}}%m%f:%F{{{secondary}}}%~%f\\$(__meowterialyou_git_info)\\$(__meowterialyou_exit_status)%# "
fi

# ═══════════════════════════════════════════════════════════════════════════════
# LS_COLORS - File Type Colors for ls, tree, fd, etc.
# ═══════════════════════════════════════════════════════════════════════════════

export LS_COLORS="\\
di=38;5;{primary_256};1:\\
ln=38;5;{tertiary_256}:\\
so=38;5;{secondary_256}:\\
pi=38;5;{outline_256}:\\
ex=38;5;{primary_256};1:\\
bd=38;5;{outline_256};1:\\
cd=38;5;{outline_256}:\\
su=38;5;{error_256};1:\\
sg=38;5;{error_256}:\\
tw=38;5;{primary_256};4:\\
ow=38;5;{primary_256};4:\\
*.tar=38;5;{tertiary_256}:\\
*.gz=38;5;{tertiary_256}:\\
*.zip=38;5;{tertiary_256}:\\
*.7z=38;5;{tertiary_256}:\\
*.rar=38;5;{tertiary_256}:\\
*.jpg=38;5;{secondary_256}:\\
*.jpeg=38;5;{secondary_256}:\\
*.png=38;5;{secondary_256}:\\
*.gif=38;5;{secondary_256}:\\
*.svg=38;5;{secondary_256}:\\
*.webp=38;5;{secondary_256}:\\
*.mp3=38;5;{tertiary_256}:\\
*.mp4=38;5;{tertiary_256}:\\
*.mkv=38;5;{tertiary_256}:\\
*.pdf=38;5;{error_256}:\\
*.md=38;5;{primary_256}:\\
*.txt=38;5;{outline_256}:\\
*.py=38;5;{primary_256}:\\
*.js=38;5;{secondary_256}:\\
*.ts=38;5;{tertiary_256}:\\
*.json=38;5;{outline_256}:\\
*.yaml=38;5;{outline_256}:\\
*.yml=38;5;{outline_256}:\\
*.sh=38;5;{primary_256}:\\
*.css=38;5;{tertiary_256}:\\
*.html=38;5;{secondary_256}:\\
"

# ═══════════════════════════════════════════════════════════════════════════════
# GCC_COLORS - Compiler Output Colors
# ═══════════════════════════════════════════════════════════════════════════════

export GCC_COLORS="\\
error=38;5;{error_256};1:\\
warning=38;5;{secondary_256};1:\\
note=38;5;{tertiary_256}:\\
caret=38;5;{primary_256};1:\\
locus=38;5;{outline_256}:\\
quote=38;5;{primary_256}\\
"

# ═══════════════════════════════════════════════════════════════════════════════
# GREP_COLORS - Search Result Highlighting
# ═══════════════════════════════════════════════════════════════════════════════

export GREP_COLORS="\\
ms=38;5;{primary_256};1:\\
mc=38;5;{primary_256};1:\\
sl=:\\
cx=38;5;{outline_256}:\\
fn=38;5;{secondary_256}:\\
ln=38;5;{tertiary_256}:\\
bn=38;5;{tertiary_256}:\\
se=38;5;{outline_256}\\
"

# ═══════════════════════════════════════════════════════════════════════════════
# MAN PAGE COLORS (using less)
# ═══════════════════════════════════════════════════════════════════════════════

export LESS_TERMCAP_mb=$'\\E[1;38;5;{primary_256}m'      # Begin blinking
export LESS_TERMCAP_md=$'\\E[1;38;5;{primary_256}m'      # Begin bold
export LESS_TERMCAP_me=$'\\E[0m'                          # End mode
export LESS_TERMCAP_se=$'\\E[0m'                          # End standout
export LESS_TERMCAP_so=$'\\E[38;5;{tertiary_256};48;5;{outline_256}m'  # Standout
export LESS_TERMCAP_ue=$'\\E[0m'                          # End underline
export LESS_TERMCAP_us=$'\\E[4;38;5;{secondary_256}m'    # Underline

# ═══════════════════════════════════════════════════════════════════════════════
# ALIASES WITH COLORS
# ═══════════════════════════════════════════════════════════════════════════════

alias ls='ls --color=auto'
alias ll='ls -lah --color=auto'
alias la='ls -A --color=auto'
alias l='ls -CF --color=auto'
alias grep='grep --color=auto'
alias fgrep='fgrep --color=auto'
alias egrep='egrep --color=auto'
alias diff='diff --color=auto'
alias ip='ip --color=auto'

# ═══════════════════════════════════════════════════════════════════════════════
# COLORED OUTPUT FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

# Success message
_my_success() {{ echo -e "${{_MY_PRIMARY}}✓ $1${{_MY_RESET}}"; }}

# Error message  
_my_error() {{ echo -e "${{_MY_ERROR}}✗ $1${{_MY_RESET}}"; }}

# Warning message
_my_warn() {{ echo -e "${{_MY_SECONDARY}}⚠ $1${{_MY_RESET}}"; }}

# Info message
_my_info() {{ echo -e "${{_MY_TERTIARY}}ℹ $1${{_MY_RESET}}"; }}

# Header/title
_my_header() {{ echo -e "${{_MY_BOLD}}${{_MY_PRIMARY}}══ $1 ══${{_MY_RESET}}"; }}
"""

    # Write prompt.sh to config directory
    config_dir = Path.home() / ".config/meowterialyou"
    config_dir.mkdir(parents=True, exist_ok=True)
    prompt_file = config_dir / "prompt.sh"

    with open(prompt_file, "w") as f:
        f.write(prompt_script)

    prompt_file.chmod(0o755)
    log.info(f"Generated Material You terminal theme at {prompt_file}")

    # Add source line to shell configs
    source_line = "[ -f ~/.config/meowterialyou/prompt.sh ] && source ~/.config/meowterialyou/prompt.sh"

    for shell_rc in [Path.home() / ".bashrc", Path.home() / ".zshrc"]:
        if shell_rc.exists():
            content = shell_rc.read_text()
            if "meowterialyou/prompt.sh" not in content:
                with open(shell_rc, "a") as f:
                    f.write(f"\n# MeowterialYou themed prompt\n{source_line}\n")
                log.info(f"Added prompt source to {shell_rc}")


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
    def get(cls, image: str, style: str = "tonal_spot"):
        log.info(f"Using image {image}")

        img = cls._get_image_from_file(image)

        theme, colors = themeFromImage(img, style=style)
        return theme, colors

    @staticmethod
    def get_theme_from_color(color: str, style: str = "tonal_spot") -> dict:
        rgb_color = ColorTransformer.hex_to_argb(color)
        return themeFromSourceColor(rgb_color, style=style)

    @classmethod
    def _get_image_from_file(cls, image: str):
        """Get image from file and resample it"""
        img = Image.open(image)
        basewidth = 128
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
