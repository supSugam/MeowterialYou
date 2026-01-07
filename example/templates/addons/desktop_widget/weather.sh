#!/bin/bash
# MeowterialYou Weather Helper
# Smart weather data fetching with gnome-weather integration
#
# Priority order:
# 1. Try gnome-weather location from GSettings → use with wttr.in
# 2. Try auto-detect location via IP → use with wttr.in
# 3. Fallback to cached data or "Weather unavailable"

set -o pipefail

CACHE_FILE="$HOME/.cache/meowterialyou_weather"
CACHE_DURATION=900  # 15 minutes
CONFIG_FILE="$HOME/.config/meowterialyou/widget_config"

# Defaults
TEMP_UNIT="C"
WEATHER_API_KEY=""

# Load configuration
if [[ -f "$CONFIG_FILE" ]]; then
    source "$CONFIG_FILE" 2>/dev/null || true
fi

# Return cached data if fresh
is_cache_fresh() {
    if [[ -f "$CACHE_FILE" ]]; then
        local cache_age=$(($(date +%s) - $(stat -c %Y "$CACHE_FILE" 2>/dev/null || echo 0)))
        [[ $cache_age -lt $CACHE_DURATION ]]
    else
        return 1
    fi
}

if is_cache_fresh; then
    cat "$CACHE_FILE"
    exit 0
fi

# Weather condition → emoji icon
get_weather_icon() {
    local condition="${1,,}"  # lowercase
    case "$condition" in
        *clear*|*sunny*)          echo "☀️" ;;
        *partly*cloudy*)          echo "⛅" ;;
        *cloud*|*overcast*)       echo "☁️" ;;
        *rain*|*drizzle*|*shower*) echo "🌧️" ;;
        *thunder*|*storm*)        echo "⛈️" ;;
        *snow*|*flurr*)           echo "❄️" ;;
        *fog*|*mist*|*haze*)      echo "🌫️" ;;
        *wind*)                   echo "💨" ;;
        *hot*)                    echo "🔥" ;;
        *cold*|*freez*)           echo "🥶" ;;
        *)                        echo "🌤️" ;;
    esac
}

# Format temperature with unit conversion
format_temp() {
    local temp="$1"
    local from_unit="${2:-C}"
    
    # Extract numeric value
    temp=$(echo "$temp" | grep -oE '[+-]?[0-9]+\.?[0-9]*' | head -1)
    [[ -z "$temp" ]] && echo "?" && return
    
    # Convert if needed
    if [[ "$TEMP_UNIT" == "F" && "$from_unit" == "C" ]]; then
        temp=$(awk "BEGIN {printf \"%.0f\", ($temp * 9/5) + 32}")
    elif [[ "$TEMP_UNIT" == "C" && "$from_unit" == "F" ]]; then
        temp=$(awk "BEGIN {printf \"%.0f\", ($temp - 32) * 5/9}")
    else
        temp=$(printf "%.0f" "$temp" 2>/dev/null || echo "$temp")
    fi
    
    echo "${temp}°${TEMP_UNIT}"
}

# Try to get location from GNOME Weather
get_gnome_weather_location() {
    # GNOME Weather stores locations in a GVariant format
    local raw_locations
    raw_locations=$(gsettings get org.gnome.Weather locations 2>/dev/null) || return 1
    
    if [[ -z "$raw_locations" || "$raw_locations" == "@av []" ]]; then
        return 1
    fi
    
    # Extract city name from the GVariant data
    # Format is usually: [<(..., 'CityName', ...)>]
    local city
    city=$(echo "$raw_locations" | grep -oP "'[^']+'" | head -3 | tail -1 | tr -d "'")
    
    if [[ -n "$city" && ${#city} -gt 1 ]]; then
        echo "$city"
        return 0
    fi
    
    return 1
}

# Get location from GNOME settings (location services)
get_gnome_location() {
    # Try geoclue via gdbus
    local lat lon
    
    # Check if location services are enabled
    local location_enabled
    location_enabled=$(gsettings get org.gnome.system.location enabled 2>/dev/null | tr -d "'")
    
    if [[ "$location_enabled" == "true" ]]; then
        # Try to get from geoclue agent
        lat=$(gdbus call --session --dest org.freedesktop.GeoClue2 \
              --object-path /org/freedesktop/GeoClue2/Manager \
              --method org.freedesktop.GeoClue2.Manager.GetClient 2>/dev/null | \
              grep -oP 'Latitude[^,]+' | grep -oP '[0-9.-]+' 2>/dev/null) || true
    fi
    
    if [[ -n "$lat" ]]; then
        echo "lat=$lat"
        return 0
    fi
    
    return 1
}

# Fetch weather from wttr.in
fetch_wttr() {
    local location="${1:-}"
    local url="https://wttr.in/${location}?format=%C+%t"
    
    local response
    response=$(curl -s --max-time 8 "$url" 2>/dev/null) || return 1
    
    # Validate response
    if [[ -z "$response" || "$response" == *"Unknown"* || "$response" == *"error"* || "$response" == *"Sorry"* ]]; then
        return 1
    fi
    
    # Parse: "Partly cloudy +25°C"
    local condition temp_raw
    condition=$(echo "$response" | sed 's/[+-]\?[0-9]*°[CF].*//' | xargs)
    temp_raw=$(echo "$response" | grep -oE '[+-]?[0-9]+' | head -1)
    
    if [[ -z "$temp_raw" ]]; then
        return 1
    fi
    
    local icon temp
    icon=$(get_weather_icon "$condition")
    temp=$(format_temp "$temp_raw" "C")
    
    # Shorten condition if too long
    if [[ ${#condition} -gt 20 ]]; then
        condition="${condition:0:18}…"
    fi
    
    echo "$icon  $temp  $condition"
    return 0
}

# Main logic
main() {
    local weather=""
    local location=""
    
    # 1. Try GNOME Weather location
    location=$(get_gnome_weather_location 2>/dev/null) || true
    
    if [[ -n "$location" ]]; then
        weather=$(fetch_wttr "$location" 2>/dev/null) || true
    fi
    
    # 2. Try auto-detect (empty location = IP-based)
    if [[ -z "$weather" ]]; then
        weather=$(fetch_wttr "" 2>/dev/null) || true
    fi
    
    # 3. Output result
    if [[ -n "$weather" ]]; then
        mkdir -p "$(dirname "$CACHE_FILE")"
        echo "$weather" > "$CACHE_FILE"
        echo "$weather"
    else
        # Return cached data if available
        if [[ -f "$CACHE_FILE" ]]; then
            cat "$CACHE_FILE"
        else
            echo "🌍  Weather unavailable"
        fi
    fi
}

main
