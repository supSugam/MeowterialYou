#!/bin/bash
# MeowterialYou Weather Helper

CACHE_FILE="$HOME/.cache/meowterialyou_weather"
CACHE_DURATION=900

# Check cache
if [[ -f "$CACHE_FILE" ]]; then
    cache_age=$(($(date +%s) - $(stat -c %Y "$CACHE_FILE" 2>/dev/null || echo 0)))
    if [[ $cache_age -lt $CACHE_DURATION ]]; then
        cat "$CACHE_FILE"
        exit 0
    fi
fi

# Fetch weather
result=$(curl -s --max-time 10 "https://wttr.in/?format=%l:+%C+%t" 2>/dev/null | head -1)

if [[ -n "$result" && "$result" != *"Unknown"* && "$result" != *"error"* && "$result" != *"Sorry"* ]]; then
    mkdir -p "$(dirname "$CACHE_FILE")"
    echo "$result" > "$CACHE_FILE"
    echo "$result"
else
    # Try cache as fallback
    if [[ -f "$CACHE_FILE" ]]; then
        cat "$CACHE_FILE"
    else
        echo "Sunny 20C"
    fi
fi
