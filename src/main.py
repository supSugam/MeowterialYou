import os

from src.applier.domain import ApplierDomain, GenerationOptions
from src.ui.app import GtkApp
from src.monitor import Monitor
from src.util import Config, parse_arguments


def main():  # sourcery skip: raise-specific-error
    parent_dir = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
    arguments = parse_arguments()
    lightmode_enabled: bool = arguments.theme == "light"

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
            wallpaper_path=arguments.wallpaper
            or ApplierDomain.get_current_system_wallpaper_path(),
        ),
    )

    # --uninstall overrides all other operations
    if arguments.uninstall:
        ApplierDomain.uninstall_theme()
        return

    if arguments.ui:
        app = GtkApp(
            application_id="com.picker.Mitsugen", applier_domain=applier_domain
        )
        app.run(None)
        import time

        time.sleep(2000)
    elif arguments.monitor:
        monitor = Monitor(applier_domain)
        monitor.start()
    else:
        applier_domain.apply_theme()


if __name__ == "__main__":
    main()
