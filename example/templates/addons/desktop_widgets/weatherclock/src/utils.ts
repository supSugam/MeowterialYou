
import GLib from 'gi://GLib?version=2.0';
import Gio from 'gi://Gio?version=2.0';

export const log = (msg: string) => print(msg);

export const readFileAsync = (path: string): string => {
    try {
        const file = Gio.File.new_for_path(path);
        const [ok, content] = file.load_contents(null);
        if (ok) {
            const decoder = new TextDecoder('utf-8');
            return decoder.decode(content).trim();
        }
    } catch (e) {}
    return '';
};
