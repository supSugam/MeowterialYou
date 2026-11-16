# Roadmap & Future Plans

A centralized document tracking architectural overhauls, feature plans, and engineering to-dos for MeowterialYou.

---

## 1. Chrome / Chromium GTK Theme Overhaul

### Problem & Current State
- Chrome on Wayland uses GTK4 window decorations and queries system theme colors via `GtkSettings` / `org.gnome.desktop.interface gtk-theme`.
- The current solution relies on a ported legacy template (`data/templates/addons/chrome_gtk4/gtk_4_chrome_{dark,light}.css`).
- While functional, it is fragile and not seamless: existing open tabs do not immediately repaint on dynamic theme switches without user interaction (e.g. hovering, switching tabs, or a window focus pulse).

### Plan & Objectives
1. **Reverse-Engineer Chromium's Theme Sampling**:
   - Trace Chromium's Linux UI source code (`ui/gtk/gtk_ui.cc`, `ui/gtk/gtk_color_mixer.cc`, and Views `tab_strip.cc`).
   - Identify the exact GTK resource templates, widget hierarchy, and CSS classes Chromium instantiates to extract theme colors (e.g. `.chromium`, `headerbar`, `window.background`).
   - Understand how Chrome's default theme approaches contrast, active/inactive tab shaders, and toolbar blending.
2. **Build a Clean-Room GTK Theme from Scratch**:
   - Design a dedicated, minimal GTK stylesheet tailored specifically for Chromium with zero legacy baggage or hacky resets.
   - Directly map Material You dynamic color tokens (`surface`, `surfaceContainer`, `onSurface`, `primary`, etc.) to the exact selectors Chromium queries.
3. **Flawless Hot-Reloading**:
   - Achieve seamless, immediate color synchronization across the entire browser chrome (window frame, tab strip, active/inactive tabs, Omnibox) without requiring window restarts or tab manipulations.

---

## 2. Upcoming Plans & Backlog

*(New future initiatives and to-dos will be recorded here.)*
