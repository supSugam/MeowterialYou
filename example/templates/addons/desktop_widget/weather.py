#!/usr/bin/env python3
"""
MeowterialYou Weather Helper
Outputs plain weather data (one value per line) for Conky to format
"""

import math
import os
import gi
gi.require_version('GWeather', '4.0')
gi.require_version('Gio', '2.0')
from gi.repository import GWeather, Gio, GLib

CACHE_FILE = os.path.expanduser('~/.cache/meowterialyou_weather')
CACHE_DURATION = 900
APP_ID = 'io.github.meowterialyou.widget'


def get_cached():
    import time
    try:
        if os.path.exists(CACHE_FILE):
            if time.time() - os.path.getmtime(CACHE_FILE) < CACHE_DURATION:
                with open(CACHE_FILE, 'r') as f:
                    return f.read().strip()
    except Exception:
        pass
    return None


def save_cache(data):
    try:
        os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
        with open(CACHE_FILE, 'w') as f:
            f.write(data)
    except Exception:
        pass


def get_gnome_weather_location():
    try:
        settings = Gio.Settings.new('org.gnome.Weather')
        locations = settings.get_value('locations')
        
        if locations.n_children() > 0:
            child = locations.get_child_value(0)
            inner = child.get_variant()
            loc_data = inner.get_child_value(1).get_variant()
            city = loc_data.get_child_value(0).get_string()
            coords_array = loc_data.get_child_value(3)
            
            if coords_array.n_children() > 0:
                coord = coords_array.get_child_value(0)
                lat = math.degrees(coord.get_child_value(0).get_double())
                lon = math.degrees(coord.get_child_value(1).get_double())
                return city, lat, lon
    except Exception:
        pass
    return None, None, None


def get_weather_icon_char(icon_name):
    """Map GNOME weather icon to Nerd Font character."""
    if not icon_name:
        return ''  # sunny
    
    icon_name = icon_name.lower()
    if 'clear' in icon_name and 'night' in icon_name:
        return ''  # night clear
    elif 'clear' in icon_name or 'sunny' in icon_name:
        return ''  # sunny
    elif 'few-clouds' in icon_name or 'partly' in icon_name:
        return ''  # partly cloudy
    elif 'overcast' in icon_name or 'cloud' in icon_name:
        return ''  # cloudy
    elif 'fog' in icon_name or 'mist' in icon_name:
        return ''  # fog
    elif 'shower' in icon_name:
        return ''  # showers
    elif 'rain' in icon_name:
        return ''  # rain
    elif 'snow' in icon_name:
        return ''  # snow
    elif 'storm' in icon_name or 'thunder' in icon_name:
        return ''  # storm
    else:
        return ''  # default sunny


def get_weather():
    cached = get_cached()
    if cached:
        print(cached)
        return

    city, lat, lon = get_gnome_weather_location()
    
    if not city or lat is None:
        # Output placeholder values
        print("--")  # temp
        print("Unknown")  # condition
        print("Unknown")  # city
        print("--")  # wind
        print("--")  # humidity
        print("")  # icon
        return

    location = GWeather.Location.new_detached(city, None, lat, lon)
    info = GWeather.Info.new(location)
    info.set_application_id(APP_ID)
    info.set_contact_info('meowterialyou@widget')
    info.set_enabled_providers(GWeather.Provider.MET_NO | GWeather.Provider.OWM)

    loop = GLib.MainLoop()
    result = [None]

    def on_updated(info, *args):
        try:
            temp_ok, temp = info.get_value_temp(GWeather.TemperatureUnit.CENTIGRADE)
            sky = info.get_sky() or ""
            icon_name = info.get_icon_name() or ""
            humidity = info.get_humidity() or ""
            wind = info.get_wind() or ""
            
            # Format values
            temp_str = f"{temp:.0f}°" if temp_ok else "--°"
            
            # Get condition from icon name if sky is empty
            if not sky or sky == "-":
                if 'clear' in icon_name.lower():
                    sky = "Clear"
                elif 'cloud' in icon_name.lower():
                    sky = "Cloudy"
                elif 'rain' in icon_name.lower():
                    sky = "Rainy"
                elif 'snow' in icon_name.lower():
                    sky = "Snowy"
                else:
                    sky = "Clear"
            
            city_str = city[:15] if len(city) > 15 else city
            
            # Parse humidity
            if humidity and humidity != "-":
                hum_str = humidity.replace('%', '').strip()
            else:
                hum_str = "--"
            
            # Parse wind
            if wind and wind != "-":
                if "/" in wind:
                    wind_str = wind.split("/")[1].strip().replace(" ", "")
                else:
                    wind_str = wind.strip()
            else:
                wind_str = "--"
            
            # Get icon
            icon_char = get_weather_icon_char(icon_name)
            
            # Output: one value per line
            # Line 1: temperature
            # Line 2: condition
            # Line 3: city
            # Line 4: wind
            # Line 5: humidity
            # Line 6: weather icon character
            output = f"{temp_str}\n{sky}\n{city_str}\n{wind_str}\n{hum_str}\n{icon_char}"
            result[0] = output
            
        except Exception as e:
            result[0] = f"--\nError\n{city}\n--\n--\n"
        finally:
            loop.quit()

    info.connect('updated', on_updated)
    info.update()
    GLib.timeout_add_seconds(12, loop.quit)
    loop.run()

    if result[0]:
        save_cache(result[0])
        print(result[0])
    else:
        print(f"--\nUnknown\n{city}\n--\n--\n")


if __name__ == '__main__':
    try:
        get_weather()
    except Exception:
        print("--\nError\nUnknown\n--\n--\n")
