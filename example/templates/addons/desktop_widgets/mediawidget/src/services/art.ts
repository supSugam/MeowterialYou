
import Gio from 'gi://Gio?version=2.0';
import GLib from 'gi://GLib?version=2.0';
import Gdk from 'gi://Gdk?version=3.0';
import GdkPixbuf from 'gi://GdkPixbuf?version=2.0';
import Gtk from 'gi://Gtk?version=3.0';
import { State } from '../state.js';
import { defaultConfig } from '../config.js';
import { log } from '../utils.js';


// We need config for corner radius, but config is loaded at runtime.
// We can pass it or check it. 
// Actually, `defaultConfig` is static. The runtime config is in `app.ts` or `src/config.ts`.
// Let's import `loadConfig` or assume the caller handles the radius, OR we move rounding logic to be context aware.
// For now, let's accept radius as arg helper.

export const downloadArt = (url: string, callback: (path: string | null) => void) => {
  if (!url || !url.startsWith('http')) {
      if (url && url.startsWith('file://')) {
          callback(url.replace('file://', ''));
          return;
      }
      callback(null);
      return;
  }
  const hash = GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, url, -1);
  const cachePath = `${GLib.get_user_cache_dir()}/meowterialyou-art-${hash}.jpg`;
  if (GLib.file_test(cachePath, GLib.FileTest.EXISTS)) {
      callback(cachePath);
      return;
  }
  try {
     const proc = Gio.Subprocess.new(['curl', '-L', url, '-o', cachePath], Gio.SubprocessFlags.NONE);
     proc.wait_check_async(null, (obj, res) => {
         try {
             if (proc.wait_check_finish(res)) callback(cachePath);
             else callback(null);
         } catch (e) { callback(null); }
     });
  } catch (e) { callback(null); }
};

export const roundPixbuf = (pixbuf: any, radius: number) => {
  if (!pixbuf) return null;
  // @ts-ignore - GJS legacy import for Cairo
  const Cairo = imports.cairo;

  const w = pixbuf.get_width();
  const h = pixbuf.get_height();
  const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, w, h);
  const cr = new Cairo.Context(surface);

  // Create rounded path
  cr.arc(radius, radius, radius, Math.PI, 1.5 * Math.PI);
  cr.arc(w - radius, radius, radius, 1.5 * Math.PI, 0);
  cr.arc(w - radius, h - radius, radius, 0, 0.5 * Math.PI);
  cr.arc(radius, h - radius, radius, 0.5 * Math.PI, Math.PI);
  cr.closePath();
  cr.clip();

  // Paint pixbuf
  Gdk.cairo_set_source_pixbuf(cr, pixbuf, 0, 0);
  cr.paint();

  // Convert back to pixbuf
  return Gdk.pixbuf_get_from_surface(surface, 0, 0, w, h);
};;

export const updateArtWidget = (artImage: Gtk.Image, path: string | null, size: number, cornerRadius: number) => {
  log(
    `[DEBUG] updateArtWidget: path=${path}, size=${size}, radius=${cornerRadius}`,
  );
  if (!path) {
    artImage.set_from_icon_name('audio-x-generic', Gtk.IconSize.DIALOG);
    return;
  }
  // Optimization could go here (check path/size)

  try {
    let pixbuf = GdkPixbuf.Pixbuf.new_from_file(path);
    let w = pixbuf.get_width();
    let h = pixbuf.get_height();

    let scale = Math.max(size / w, size / h);
    let newW = Math.floor(w * scale);
    let newH = Math.floor(h * scale);

    let scaled = pixbuf.scale_simple(newW, newH, GdkPixbuf.InterpType.BILINEAR);

    let offsetX = Math.floor((newW - size) / 2);
    let offsetY = Math.floor((newH - size) / 2);
    if (offsetX < 0) offsetX = 0;
    if (offsetY < 0) offsetY = 0;

    let cropped = scaled?.new_subpixbuf(
      offsetX,
      offsetY,
      Math.min(size, newW),
      Math.min(size, newH),
    );

    let rounded = roundPixbuf(cropped, cornerRadius);

    if (rounded) artImage.set_from_pixbuf(rounded);
    else artImage.set_from_pixbuf(cropped);

    State.currentArtPath = path;
    State.lastArtSize = size;
  } catch (e) {
    artImage.set_from_icon_name('audio-x-generic', Gtk.IconSize.DIALOG);
  }
};
