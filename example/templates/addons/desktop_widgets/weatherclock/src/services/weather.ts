
import GWeather from 'gi://GWeather?version=4.0';
import GLib from 'gi://GLib?version=2.0';
import Gio from 'gi://Gio?version=2.0';
// @ts-ignore
import { log } from '../utils.js';
import { Config } from '../config.js';

let _info: GWeather.Info;
let _location: GWeather.Location;

// Helper to get location from GNOME Shell settings directly
function getGnomeWeatherLocation(): [string, string | null, number, number] | null {
  try {
    const settings = new Gio.Settings({ schema_id: 'org.gnome.Weather' });
    const locations = settings.get_value('locations');

    if (locations.n_children() > 0) {
      const child = locations.get_child_value(0);
      const inner = child.get_variant();
      const locData = inner.get_child_value(1).get_variant();

      const city = locData.get_child_value(0).get_string()[0];
      let code: string | null = null;
      try {
        code = locData.get_child_value(1).get_string()[0];
      } catch (e) {}

      const coordsArray = locData.get_child_value(3);
      if (coordsArray.n_children() > 0) {
        const coord = coordsArray.get_child_value(0);
        const lat = coord.get_child_value(0).get_double();
        const lon = coord.get_child_value(1).get_double();
        return [city, code, lat, lon];
      }
    }
  } catch (e) {
    // log(`Error reading GNOME Weather location: ${e}`);
  }
  return null;
}

export function getWeatherIconChar(iconName: string): string {
  if (!iconName) return '󰖙';
  const lower = iconName.toLowerCase();
  if (lower.includes('clear') && lower.includes('night')) return '';
  if (lower.includes('clear') || lower.includes('sunny')) return '';
  if (lower.includes('few-clouds') || lower.includes('partly')) return '󰖕';
  if (lower.includes('overcast') || lower.includes('cloud')) return '󰖐';
  if (lower.includes('fog') || lower.includes('mist')) return '󰖑';
  if (lower.includes('shower')) return '󰖖';
  if (lower.includes('rain')) return '󰖗';
  if (lower.includes('snow')) return '󰖘';
  if (lower.includes('storm') || lower.includes('thunder')) return '󰖓';
  return '';
}

export const initWeather = (config: Config, onUpdate?: () => void) => {
   const sysLoc = getGnomeWeatherLocation();
   if (sysLoc) {
       const [city, code, lat, lon] = sysLoc;
       log(`Found system weather location: ${city}`);
       _location = GWeather.Location.new_detached(city, code, lat, lon);
   } else {
       log(`System weather location not found, falling back to Pokhara`);
       _location = GWeather.Location.new_detached('Pokhara', 'VNPK', 28.2096 * (Math.PI / 180.0), 83.9856 * (Math.PI / 180.0));
   }
   
   _info = new GWeather.Info({
       location: _location,
       application_id: 'meowterialyou.widget',
       contact_info: 'https://github.com/meowterialyou',
   });
   _info.set_enabled_providers(GWeather.Provider.MET_NO);
   
   _info.connect('updated', () => {
       if (onUpdate) onUpdate();
   });
   _info.update();
};

export const forceWeatherUpdate = () => {
    if (_info) _info.update();
};

export const getWeather = (config: Config) => {
    if (!_info) return { temp: '--', iconChar: '', desc: '...', city: '...', humidity: '', wind: '' };

    const unit = config.weather.unit === 'F' ? GWeather.TemperatureUnit.FAHRENHEIT : GWeather.TemperatureUnit.CENTIGRADE;
    const [ok, temp] = _info.get_value_temp(unit);
    const iconName = _info.get_icon_name();
    const summary = _info.get_weather_summary();

    // @ts-ignore
    const humidity = _info.get_humidity ? _info.get_humidity() : '';
    
    // Wind
    let windStr = '';
    try {
        const speedUnit = config.weather.wind_unit === 'mi' ? GWeather.SpeedUnit.MPH : GWeather.SpeedUnit.KPH;
        const [windOk, windSpeed, windDirEnum] = _info.get_value_wind(speedUnit);
        if (windOk) {
            const unitLabel = config.weather.wind_unit === 'mi' ? 'mph' : 'km/h';
            const rawDir = GWeather.wind_direction_to_string(windDirEnum);
            windStr = `${Math.round(windSpeed)} ${unitLabel} ${rawDir || ''}`;
        }
    } catch(e) {}

    const unitSymbol = config.weather.unit === 'F' ? '°F' : '°';
    const tempStr = ok ? `${Math.round(temp)}${unitSymbol}` : `--${unitSymbol}`;
    const iconChar = getWeatherIconChar(iconName || '');
    
    let desc = summary || '';
    if (!desc || desc.toLowerCase().includes('unknown') || desc === '??') {
         // Fallback based on icon
         if (iconName) {
            const lowerIcon = iconName.toLowerCase();
            if (lowerIcon.includes('clear') || lowerIcon.includes('sunny')) desc = 'Clear';
            else if (lowerIcon.includes('cloud')) desc = 'Cloudy';
            else if (lowerIcon.includes('rain')) desc = 'Rain';
            else desc = '...';
         } else {
             desc = '...';
         }
    }
    
    // Graceful error handling
    if (desc.toLowerCase().includes('failed') || desc.toLowerCase().includes('error')) {
        desc = 'Offline';
    }

    // Clean up desc
    if (_location) {
        const locName = _location.get_name();
        if (locName && desc.includes(locName)) {
            desc = desc.replace(locName, '').trim();
        }
    }
    if (desc.length > 20) desc = desc.substring(0, 20) + '...';

    const city = _location ? _location.get_name() : 'Unknown';

    return { temp: tempStr, iconChar, desc, city, humidity, wind: windStr };
};
