did not change anything it still warns the same and behaves like an app.

```ctrlcat@LitterBox:~/Repositories/Personal/MeowterialYou/example/templates/addons/desktop_widgets_rust/media_widget (themed-icons)$ cargo run
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.27s
     Running `/home/ctrlcat/Repositories/Personal/MeowterialYou/target/debug/media_widget`
Wayland detected, forcing GDK_BACKEND=wayland

(media_widget:180232): Gtk-WARNING **: 00:11:19.275: Theme parser error: gtk.css:98:2-4: Unknown pseudoclass

(media_widget:180232): Gtk-WARNING **: 00:11:19.275: Theme parser error: gtk.css:98:3-13: Unknown name of pseudo-class
Loading config from: "./config.yaml"
Loaded Config: Config { layout: LayoutConfig { position: "bottom_right", scale: 1.0, padding: 20, gap: [24, 80] }, appearance: AppearanceConfig { corner_radius: 8 }, background: BackgroundConfig { style: "smart_transparency", opacity: 80 }, controls: ControlsConfig { show_next_prev: true } }
Loading Theme variables from: /home/ctrlcat/.config/meowterialyou-widgets/mediawidget/theme.css
it appears your Wayland compositor does not support the Session Lock protocol
Wayland Layer Shell is NOT supported by your compositor (likely GNOME/Unity).
Falling back to regular window with widget-like properties.
```


and please dont make excuses, i was able to achieve it on @example/templates/addons/desktop_widgets  just fine on wayland