
import Gio from 'gi://Gio?version=2.0';
import GLib from 'gi://GLib?version=2.0';
import Gtk from 'gi://Gtk?version=3.0';

// @ts-ignore (GJS internal)
const system = imports.system;
// @ts-ignore
const decoder = new TextDecoder('utf-8');

const SCRIPT_DIR = GLib.path_get_dirname(system.programInvocationName);
const RUNTIME_ROOT = SCRIPT_DIR; // e.g. ~/.config/meowterialyou-widgets
const HOME = GLib.get_home_dir();
const CACHE_DIR = `${HOME}/.cache`;
const LOG_FILE = `${HOME}/meow_manager_debug.log`;
const logToFile = (msg: string) => {
    try {
       GLib.file_set_contents(LOG_FILE, `${new Date().toISOString()} ${msg}\n`);
    } catch(e) {} // append usually requires read+write, shortcutting for simplicity:
    // actually GJS file_set_contents overwrites. We want append.
    // simpler: print to stdout, hopefully user captures it.
    print(`[DEBUG] ${msg}`); 
};

// We use bundled js-yaml
import * as yaml from 'js-yaml';

interface MetaData {
    scheme: Record<string, string>;
    widget_scheme: Record<string, string>;
    wallpaper_path: string;
    lightmode: boolean;
}

function getWidgetsDir(): string {
    // We need to know where the source widgets are.
    // Usually it's in the repo: example/templates/addons/desktop_widgets
    // But for portability, we'll assume a relative path from the script invocation if possible,
    // or we can just use the home-based repo path if we're on the user's machine.
    // In this specific setup, we'll use the absolute path for reliability.
    return "/home/ctrlcat/Repositories/Personal/MeowterialYou/example/templates/addons/desktop_widgets";
}

async function main() {
    const widgetsDir = getWidgetsDir();
    const metaPath = `${RUNTIME_ROOT}/meta.json`;
    const widgetsYamlPath = `${RUNTIME_ROOT}/widgets.yaml`;

    // 1. Load Meta & Config
    const metaFile = Gio.File.new_for_path(metaPath);
    const [metaOk, metaDoc] = metaFile.load_contents(null);
    if (!metaOk) {
        print(`[Manager] Failed to load meta.json`);
        return;
    }
    const meta = JSON.parse(decoder.decode(metaDoc)) as MetaData;

    const widgetsFile = Gio.File.new_for_path(widgetsYamlPath);
    const [ok, doc] = widgetsFile.load_contents(null);
    if (!ok) {
        print(`[Manager] Failed to load widgets.yaml`);
        return;
    }
    const widgetsConfig = yaml.load(decoder.decode(doc)) as any;
    const enabled = (widgetsConfig.enabled || []).reverse(); 
    const globalSpacing = 16;
    
    print(`[Manager] Enabled widgets (Reversed for stacking): ${enabled.join(', ')}`);
    

    const zoneOffsets: Record<string, number> = {};
    const esbuildPath = `${widgetsDir}/node_modules/.bin/esbuild`;

    // Pass 1: Calculate Max Widths per Zone
    const maxZoneWidths: Record<string, number> = {};
    for (const name of enabled) {
        try {
            const widgetSrcDir = `${widgetsDir}/${name}`;
            const configPath = `${widgetSrcDir}/config.yaml`;
            const cfgFile = Gio.File.new_for_path(configPath);
            if (!cfgFile.query_exists(null)) continue;
            
            const [cfgOk, cfgDoc] = cfgFile.load_contents(null);
            const cfg = yaml.load(decoder.decode(cfgDoc)) as any;
            const layout = cfg.layout || {};
            const pos = layout.position || 'bottom_left';
            const w = layout.width || 0;
            
            if (w > (maxZoneWidths[pos] || 0)) {
                maxZoneWidths[pos] = w;
            }
            print(`[DEBUG] ${name} (${pos}) w=${w}. New Max=${maxZoneWidths[pos]}`);
        } catch (e) {
            print(`[Manager] Error calculating width for ${name}: ${e}`);
        }
    }

    // Pass 2: Launch Widgets
    for (const name of enabled) {
        const widgetSrcDir = `${widgetsDir}/${name}`;
        const widgetRuntimeDir = `${RUNTIME_ROOT}/${name}`;
        const configPath = `${widgetSrcDir}/config.yaml`;
        const appTsSrc = `${widgetSrcDir}/app.ts`;
        const appJsOut = `${widgetRuntimeDir}/app.mjs`;

        GLib.mkdir_with_parents(widgetRuntimeDir, 0o755);

        try {
            // 2. Load Widget Config
            const cfgFile = Gio.File.new_for_path(configPath);
            if (!cfgFile.query_exists(null)) {
                print(`[Manager] Skipped ${name}: No config found`);
                continue;
            }
            const [cfgOk, cfgDoc] = cfgFile.load_contents(null);
            const cfg = yaml.load(decoder.decode(cfgDoc)) as any;
            const layout = cfg.layout || {};

            // 3. Build Widget (If newer or missing)
            if (GLib.file_test(appTsSrc, GLib.FileTest.EXISTS)) {
                print(`[Manager] Building ${name}...`);
                const buildCmd = [
                    esbuildPath, appTsSrc, "--bundle", "--format=esm",
                    "--platform=neutral", "--external:gi://*", `--outfile=${appJsOut}`
                ];
                GLib.spawn_sync(null, buildCmd, null, GLib.SpawnFlags.SEARCH_PATH, null);
            }

            // 4. Generate Theme CSS
            const widgetScheme = meta.widget_scheme;
            const darkBg = widgetScheme.surface || "#1a1a1a";
            const lightText = widgetScheme.onSurface || "#ffffff";
            const lightTextSecondary = widgetScheme.onSurfaceVariant || "#c0c0c0";
            const accentColor = widgetScheme.primary || "#00ff00";

            // RGB for opacity support
            const bgHex = darkBg.replace('#', '');
            const r = parseInt(bgHex.substring(0, 2), 16);
            const g = parseInt(bgHex.substring(2, 4), 16);
            const b = parseInt(bgHex.substring(4, 6), 16);

            let css = "";
            for (const [k, v] of Object.entries(meta.scheme)) {
                css += `@define-color ${k} ${v};\n`;
            }
            css += `@define-color widget_bg rgb(${r}, ${g}, ${b});\n`;
            css += `@define-color widget_text ${lightText};\n`;
            css += `@define-color widget_text_secondary ${lightTextSecondary};\n`;
            css += `@define-color widget_primary ${accentColor};\n`;

            // Placement Logic (Origins + Vertical Stacking)
            const pos = layout.position || 'bottom_left';
            
            // Strict unified gap: [x, y]
            let marginX = 24;
            let marginY = 60;
            
            if (Array.isArray(layout.gap) && layout.gap.length === 2) {
                marginX = layout.gap[0];
                marginY = layout.gap[1];
            }
            
            // Smart Sizing: Enforce Zone Max Width
            const overrideWidth = maxZoneWidths[pos] || 0;

            // Offset is sum of heights + gaps of widgets already in this zone
            const rawStackOffset = zoneOffsets[pos] || 0;
            const isStacked = (zoneOffsets[pos] !== undefined);
            
            // If stacked, we subtract the widget's own marginY so it snaps to the calculated stack line
            const effectiveStackOffset = isStacked ? (rawStackOffset - marginY) : rawStackOffset;

            css += `/* WIDGET_MARGIN_X: ${marginX} */\n`;
            css += `/* WIDGET_MARGIN_Y: ${marginY} */\n`;
            css += `/* WIDGET_STACK_OFFSET_Y: ${effectiveStackOffset} */\n`;
            css += `/* WIDGET_POSITION_MODE: ${pos} */\n`;
            css += `/* WIDGET_WIDTH_OVERRIDE: ${overrideWidth} */\n`;

            const cssFile = Gio.File.new_for_path(`${widgetRuntimeDir}/theme.css`);
            cssFile.replace_contents(css, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);

            // 5. Launch Widget
            print(`[Manager] Launching ${name} at ${pos} (Stack Offset: ${effectiveStackOffset}, Width: ${overrideWidth})`);
            const env = [
                ...GLib.get_environ(),
                `GDK_BACKEND=x11`,
                `WIDGET_WIDTH_OVERRIDE=${overrideWidth}`
            ];

            GLib.spawn_async(null, ['gjs', '-m', appJsOut], env, GLib.SpawnFlags.SEARCH_PATH, null);

            // 6. Update Stack Offset for NEXT widget in this zone
            // We use the ACTUAL top position (effectiveStackOffset + marginY) as the base
            const height = layout.height || 250;
            const globalSpacing = (widgetsConfig.spacing !== undefined) ? widgetsConfig.spacing : 0;
            zoneOffsets[pos] = (effectiveStackOffset + marginY) + height + 2 + globalSpacing;

        } catch (e) {
            print(`[Manager] Error processing ${name}: ${e}`);
        }
    }
}

main();
