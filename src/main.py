import os
import subprocess

from src.applier.domain import ApplierDomain, GenerationOptions
from src.ui.app import GtkApp
from src.util import Config, parse_arguments


def get_system_color_scheme() -> str:
    """Detect the current system color scheme from gsettings."""
    try:
        result = subprocess.run(
            ["gsettings", "get", "org.gnome.desktop.interface", "color-scheme"],
            capture_output=True,
            text=True,
        )
        scheme = result.stdout.strip().strip("'")
        # prefer-dark or default (light)
        return "dark" if "dark" in scheme else "light"
    except Exception:
        return "dark"  # Default to dark if detection fails


def main():  # sourcery skip: raise-specific-error
    parent_dir = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
    arguments = parse_arguments()

    # Resolve 'system' theme to actual light/dark based on current system setting
    theme = arguments.theme
    if theme == "system":
        theme = get_system_color_scheme()
        print(f"Detected system color scheme: {theme}")

    lightmode_enabled: bool = theme == "light"

    conf = Config.read(f"{parent_dir}/example/config.ini")
    if not conf:
        raise Exception("Could not find config file")

    applier_domain = ApplierDomain(
        conf=conf,
        generation_options=GenerationOptions(
            parent_dir=parent_dir,
            lightmode_enabled=lightmode_enabled,
            system_install=arguments.system,
            macbuttons_enabled=arguments.title_buttons == "mac",
            buttons_left_enabled=arguments.title_buttons_position == "left",
            chrome_gtk4_enabled=arguments.chrome_gtk4,
            ui_improvements_enabled=arguments.ui_improvements,
            desktop_widget_enabled=getattr(arguments, "desktop_widget", False),
            transparent_panel_enabled=getattr(arguments, "transparent_panel", False),
            wallpaper_path=arguments.wallpaper
            or ApplierDomain.get_current_system_wallpaper_path(),
            silent=arguments.silent,
        ),
    )

    # --uninstall overrides all other operations
    if arguments.uninstall:
        ApplierDomain.uninstall_theme()
        return

    if arguments.ui:
        app = GtkApp(
            application_id="com.picker.MeowterialYou", applier_domain=applier_domain
        )
        app.run(None)
    else:
        applier_domain.apply_theme()


if __name__ == "__main__":
    main()
