/**
 * @file GJS/GTK Type Definitions Helper
 * 
 * For VS Code IntelliSense to work with GJS imports like:
 *   imports.gi.Gtk
 *   imports.gi.Gdk  
 *   imports.gi.GLib
 * 
 * The @girs packages provide TypeScript definitions.
 * 
 * Usage: Open app.js and you should see autocomplete for Gtk, Gdk, etc.
 * 
 * Note: The `imports.gi.*` style is GJS-specific and won't have full
 * IntelliSense. For better typing, you can use ESM-style imports in
 * your development file and transpile, or use JSDoc annotations.
 */

// Re-export types for convenience
import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import GLib from 'gi://GLib?version=2.0';
import Gio from 'gi://Gio?version=2.0';

export { Gtk, Gdk, GLib, Gio };
