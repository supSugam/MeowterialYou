#!/bin/bash
# MeowterialYou Weather Helper
# Fetches weather data from wttr.in with caching
# Auto-installed by MeowterialYou desktop widget

CACHE_FILE="$HOME/.cache/meowterialyou_weather"
CACHE_DURATION=1800  # 30 minutes

# Check if cache exists and is fresh
if [[ -f "$CACHE_FILE" ]]; then
    cache_age=$(($(date +%s) - $(stat -c %Y "$CACHE_FILE" 2>/dev/null || echo 0)))
    if [[ $cache_age -lt $CACHE_DURATION ]]; then
        cat "$CACHE_FILE"
        exit 0
    fi
fi

# Fetch weather (auto-detect location via IP)
# Format: emoji + temperature (e.g., "☀️ 25°C")
weather=$(curl -s --max-time 5 "wttr.in/?format=%c+%t" 2>/dev/null | tr -d '+')

if [[ -n "$weather" && "$weather" != *"Unknown"* && "$weather" != *"error"* ]]; then
    # Cache the result
    mkdir -p "$(dirname "$CACHE_FILE")"
    echo "$weather" > "$CACHE_FILE"
    echo "$weather"
else
    # Return cached data if available, otherwise show placeholder
    if [[ -f "$CACHE_FILE" ]]; then
        cat "$CACHE_FILE"
    else
        echo "🌍 Weather unavailable"
    fi
fi
