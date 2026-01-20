declare module 'resource:///org/gnome/shell/misc/weather.js' {
    import GObject from 'gi://GObject';
    
    export class WeatherClient extends GObject.Object {
        available: boolean;
        loading: boolean;
        hasLocation: boolean;
        info: any;
        update(): void;
        get_temp_summary(): string;
        get_sky(): string;
        get_symbolic_icon_name(): string;
        get_location(): any;
    }
}

declare module 'resource:///org/gnome/shell/misc/fileUtils.js' {
    export function loadInterfaceXML(iface: string): string;
}
