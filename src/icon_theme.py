"""
Material You Dynamic Icon Theme Generator

This module generates a custom icon theme with folder icons recolored
to match the Material You color palette derived from the wallpaper.
"""

import os
import re
import shutil
from pathlib import Path
from typing import Dict, Optional, List, Tuple


class IconThemeGenerator:
    """Generates Material You themed icons by recoloring Papirus SVGs."""

    # Sizes to generate icons for
    ICON_SIZES = ["16x16", "22x22", "24x24", "32x32", "48x48", "64x64"]
    
    # Base Papirus color variants and their hex colors
    # We use 'blue' as the source template since it's the most common
    PAPIRUS_BLUE_COLORS = {
        "back": "#4877b1",    # Darker back of folder
        "front": "#5294e2",   # Main folder color
        "paper": "#e4e4e4",   # Inside paper color
    }
    
    # Additional color variants found in some icons
    PAPIRUS_SECONDARY_COLORS = {
        "highlight": "#ffffff",  # White highlights (keep as-is)
        "shadow": "opacity:0.2", # Shadow (keep as-is)
    }

    def __init__(self, base_icon_path: str = "/usr/share/icons/Papirus"):
        """
        Initialize the icon theme generator.
        
        Args:
            base_icon_path: Path to the base Papirus icon theme.
        """
        self.base_icon_path = Path(base_icon_path)
        self.output_base = Path.home() / ".local/share/icons/MeowterialYou"
        
    def generate(
        self, 
        colors: Dict[str, str], 
        is_dark_mode: bool = False,
        force_regenerate: bool = False
    ) -> Path:
        """
        Generate the Material You icon theme.
        
        Args:
            colors: Dictionary of Material You colors with hex values.
            is_dark_mode: Whether generating for dark mode.
            force_regenerate: Force regeneration even if cache exists.
            
        Returns:
            Path to the generated icon theme.
        """
        # Calculate the icon colors from the Material You palette
        icon_colors = self._calculate_icon_colors(colors, is_dark_mode)
        
        # Create output directory structure
        self._create_theme_structure()
        
        # Generate index.theme
        self._create_index_theme(is_dark_mode)
        
        # Recolor folder icons for each size
        for size in self.ICON_SIZES:
            self._recolor_folder_icons(size, icon_colors)
        
        # Handle scalable icons
        self._recolor_folder_icons("scalable", icon_colors, is_scalable=True)
        
        return self.output_base
    
    def _calculate_icon_colors(
        self, 
        colors: Dict[str, str], 
        is_dark_mode: bool
    ) -> Dict[str, str]:
        """
        Calculate icon colors from the Material You palette.
        
        Folder icon anatomy:
        - folder_back: The back tab/fold (should be DARKER than front)
        - folder_front: Main folder body (primary color)
        - folder_paper: The paper sheet inside
        - folder_emblem: Icons inside the folder (download arrow, etc.)
        
        Args:
            colors: Material You color palette.
            is_dark_mode: Whether in dark mode.
            
        Returns:
            Dictionary with folder colors.
        """
        if is_dark_mode:
            # Dark mode: folder body is light, with darker accents
            primary = colors.get("primary", "#9dd49e")  # Light green in dark mode
            primaryContainer = colors.get("primaryContainer", "#1f5027")  # Dark green
            
            return {
                # Back tab should be darker than front
                "folder_back": primaryContainer,
                # Front body is the main light color
                "folder_front": primary,
                # Paper is surface color
                "folder_paper": colors.get("surfaceContainerHighest", "#333532"),
                # Emblem on light front needs dark color - use onPrimary
                "folder_emblem": colors.get("onPrimary", "#023912"),
            }
        else:
            # Light mode: folder body is dark green, with light accents
            primary = colors.get("primary", "#38693d")  # Dark green in light mode
            primaryContainer = colors.get("primaryContainer", "#b8f0b8")  # Light green
            
            folder_back = self._darken_color(primary, 0.25)
            return {
                # Back tab is darkened primary
                "folder_back": folder_back,
                # Front body is primary
                "folder_front": primary,
                # Paper is light surface
                "folder_paper": colors.get("surfaceContainerHigh", "#e8e9e3"),
                # Emblem contrasts with dark front, so use light primaryContainer
                "folder_emblem": primaryContainer,
            }
    
    def _darken_color(self, hex_color: str, factor: float = 0.2) -> str:
        """
        Darken a hex color by a factor.
        
        Args:
            hex_color: Hex color string (e.g., "#38693d").
            factor: How much to darken (0.0-1.0).
            
        Returns:
            Darkened hex color.
        """
        hex_color = hex_color.lstrip("#")
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16)
        b = int(hex_color[4:6], 16)
        
        r = int(r * (1 - factor))
        g = int(g * (1 - factor))
        b = int(b * (1 - factor))
        
        return f"#{r:02x}{g:02x}{b:02x}"
    
    def _create_theme_structure(self) -> None:
        """Create the icon theme directory structure."""
        # Remove old theme if exists
        if self.output_base.exists():
            shutil.rmtree(self.output_base)
        
        self.output_base.mkdir(parents=True, exist_ok=True)
        
        # Create size directories
        for size in self.ICON_SIZES + ["scalable"]:
            places_dir = self.output_base / size / "places"
            places_dir.mkdir(parents=True, exist_ok=True)
    
    def _create_index_theme(self, is_dark_mode: bool) -> None:
        """
        Create the index.theme file.
        
        Args:
            is_dark_mode: Whether this is a dark mode theme.
        """
        parent_theme = "Papirus-Dark" if is_dark_mode else "Papirus"
        
        # Build directories list
        directories = []
        for size in self.ICON_SIZES:
            directories.append(f"{size}/places")
        directories.append("scalable/places")
        
        # Build size entries
        size_entries = []
        for size in self.ICON_SIZES:
            pixels = size.split("x")[0]
            size_entries.append(f"""
[{size}/places]
Context=Places
Size={pixels}
Type=Fixed""")
        
        size_entries.append("""
[scalable/places]
Context=Places
Size=64
MinSize=16
MaxSize=512
Type=Scalable""")
        
        index_content = f"""[Icon Theme]
Name=MeowterialYou
Comment=Material You dynamic icon theme
Inherits={parent_theme}
Example=folder

Directories={",".join(directories)}
{"".join(size_entries)}
"""
        
        index_file = self.output_base / "index.theme"
        index_file.write_text(index_content)
    
    def _recolor_folder_icons(
        self, 
        size: str, 
        colors: Dict[str, str],
        is_scalable: bool = False
    ) -> None:
        """
        Recolor all folder icons for a given size.
        
        Args:
            size: Icon size (e.g., "48x48" or "scalable").
            colors: Icon colors to apply.
            is_scalable: Whether this is the scalable directory.
        """
        source_dir = self.base_icon_path / size / "places"
        if not source_dir.exists():
            return
        
        output_dir = self.output_base / size / "places"
        
        # Find all folder-blue-* icons to use as templates
        for svg_file in source_dir.glob("folder-blue*.svg"):
            # Skip symlinks (like folder-blue-desktop.svg -> user-blue-desktop.svg)
            if svg_file.is_symlink():
                continue
                
            # Get the target filename (replace -blue with nothing for base folder icons)
            target_name = svg_file.name
            if target_name == "folder-blue.svg":
                target_name = "folder.svg"
            else:
                # folder-blue-documents.svg -> folder-documents.svg
                target_name = target_name.replace("folder-blue-", "folder-")
            
            # Read and recolor the SVG
            try:
                svg_content = svg_file.read_text()
                recolored = self._recolor_svg(svg_content, colors)
                
                # Write to output
                output_file = output_dir / target_name
                output_file.write_text(recolored)
            except Exception as e:
                print(f"Warning: Failed to recolor {svg_file}: {e}")
        
        # Also process user-blue-* icons (like user-blue-desktop.svg)
        for svg_file in source_dir.glob("user-blue*.svg"):
            if svg_file.is_symlink():
                continue
                
            target_name = svg_file.name
            if target_name == "user-blue.svg":
                target_name = "user-desktop.svg"  # Common case
            else:
                target_name = target_name.replace("user-blue-", "user-")
            
            try:
                svg_content = svg_file.read_text()
                recolored = self._recolor_svg(svg_content, colors)
                output_file = output_dir / target_name
                output_file.write_text(recolored)
                
                # Create folder-desktop symlink for user-desktop
                if target_name == "user-desktop.svg":
                    symlink = output_dir / "folder-desktop.svg"
                    if symlink.exists():
                        symlink.unlink()
                    symlink.symlink_to("user-desktop.svg")
            except Exception as e:
                print(f"Warning: Failed to recolor {svg_file}: {e}")
    
    def _recolor_svg(self, svg_content: str, colors: Dict[str, str]) -> str:
        """
        Recolor an SVG by replacing Papirus blue colors with Material You colors.
        
        Args:
            svg_content: The SVG content as string.
            colors: Dictionary with folder_back, folder_front, folder_paper, folder_emblem.
            
        Returns:
            Recolored SVG content.
        """
        # Replace the main folder colors (case-insensitive)
        recolored = svg_content
        
        # Back color (darker shade)
        recolored = re.sub(
            r'#4877b1',
            colors["folder_back"],
            recolored,
            flags=re.IGNORECASE
        )
        
        # Front color (main color)
        recolored = re.sub(
            r'#5294e2',
            colors["folder_front"],
            recolored,
            flags=re.IGNORECASE
        )
        
        # Paper/inside color
        recolored = re.sub(
            r'#e4e4e4',
            colors["folder_paper"],
            recolored,
            flags=re.IGNORECASE
        )
        
        # Emblem/icon color (dark blue used for icons inside folders)
        recolored = re.sub(
            r'#1d344f',
            colors.get("folder_emblem", colors["folder_back"]),
            recolored,
            flags=re.IGNORECASE
        )
        
        return recolored
    
    def apply_theme(self) -> None:
        """Apply the generated icon theme via gsettings."""
        import subprocess
        
        # Update icon cache
        try:
            result = subprocess.run(
                ["gtk-update-icon-cache", "-f", "-t", str(self.output_base)],
                check=False,
                capture_output=True,
                text=True
            )
            if result.returncode != 0 and result.stderr:
                print(f"Icon cache update warning: {result.stderr}")
        except FileNotFoundError:
            pass  # gtk-update-icon-cache not available
        
        # Set the icon theme
        try:
            result = subprocess.run(
                ["gsettings", "set", "org.gnome.desktop.interface", "icon-theme", "MeowterialYou"],
                check=True,
                capture_output=True,
                text=True
            )
            print("Applied MeowterialYou icon theme via gsettings")
        except subprocess.CalledProcessError as e:
            print(f"Warning: Failed to set icon theme via gsettings: {e.stderr}")
        except FileNotFoundError:
            print("Warning: gsettings not found, cannot apply icon theme automatically")


def generate_material_you_icons(
    colors: Dict[str, str],
    is_dark_mode: bool = False,
    apply_theme: bool = True
) -> Path:
    """
    Convenience function to generate and optionally apply Material You icons.
    
    Args:
        colors: Material You color palette dictionary.
        is_dark_mode: Whether generating for dark mode.
        apply_theme: Whether to also set the icon theme after generation.
        
    Returns:
        Path to the generated icon theme.
    """
    generator = IconThemeGenerator()
    theme_path = generator.generate(colors, is_dark_mode)
    
    if apply_theme:
        generator.apply_theme()
    
    return theme_path


if __name__ == "__main__":
    # Test with sample colors
    sample_light_colors = {
        "primary": "#38693d",
        "primaryContainer": "#b8f0b8",
        "surfaceContainerHigh": "#e8e9e3",
        "surfaceContainerHighest": "#e2e3dd",
    }
    
    sample_dark_colors = {
        "primary": "#9dd49e",
        "primaryContainer": "#215227",
        "surfaceContainerHigh": "#373a36",
        "surfaceContainerHighest": "#424540",
    }
    
    print("Generating light mode icons...")
    path = generate_material_you_icons(sample_light_colors, is_dark_mode=False, apply_theme=False)
    print(f"Generated icon theme at: {path}")
    
    print("\nTest complete! Run with apply_theme=True to actually set the icon theme.")
