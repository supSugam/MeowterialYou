#!/bin/bash

echo "Installing required files..."

echo "Creating required directories..."
mkdir -p ~/.themes
mkdir -p ~/.local/share/themes
mkdir -p ~/.config/spicetify/Themes

echo "Copying dark gtk3 themes..."
cp -r ./assets/MeowterialYou-dark ~/.local/share/themes/

echo "Copying light gtk3 themes..."
cp -r ./assets/MeowterialYou-light ~/.local/share/themes/

echo "Copying GNOME Shell assets..."
mkdir -p ~/.themes/MeowterialYou-dark/gnome-shell
mkdir -p ~/.themes/MeowterialYou-light/gnome-shell
cp ./assets/MeowterialYou-dark/gnome-shell/*.svg ~/.themes/MeowterialYou-dark/gnome-shell/
cp ./assets/MeowterialYou-light/gnome-shell/*.svg ~/.themes/MeowterialYou-light/gnome-shell/

echo "Spotify theme..."
git clone https://github.com/spicetify/spicetify-themes /tmp/spicetify-themes
cp -r /tmp/spicetify-themes/Matte ~/.config/spicetify/Themes

echo "All set!"
