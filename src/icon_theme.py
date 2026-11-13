"""
Material You Dynamic Icon Theme Generator

This module generates a custom icon theme with folder icons recolored
to match the Material You color palette derived from the wallpaper.
Uses Meowaita icon templates as the base for folder icons.
"""

import os
import re
import shutil
import concurrent.futures
from pathlib import Path
from typing import Dict, List


class IconThemeGenerator:
    """Generates Material You themed icons by recoloring Meowaita SVGs."""

    def __init__(self, base_icon_path: str = None):
        if base_icon_path is None:
            base_icon_path = str(Path(__file__).parent.parent / "assets/meowaita")

        self.base_icon_path = Path(base_icon_path)
        self.output_base = Path.home() / ".local/share/icons/Meowaita"

    def generate(
        self,
        colors: Dict[str, str],
        is_dark_mode: bool = False,
        force_regenerate: bool = False,
    ) -> Path:
        icon_colors = self._calculate_icon_colors(colors, is_dark_mode)

        self._create_theme_structure()
        self._create_index_theme(is_dark_mode)

        all_tasks = []
        with concurrent.futures.ThreadPoolExecutor(
            max_workers=os.cpu_count() or 4
        ) as executor:
            # Only recolor places, apps are just copied/symlinked
            all_tasks.extend(
                self._submit_recolor_tasks(executor, "places/scalable", icon_colors, recolor=True)
            )
            all_tasks.extend(
                self._submit_recolor_tasks(executor, "apps/scalable", icon_colors, recolor=False)
            )
            concurrent.futures.wait(all_tasks)

        return self.output_base

    def _calculate_icon_colors(
        self, colors: Dict[str, str], is_dark_mode: bool
    ) -> Dict[str, str]:
        primary = colors.get("primary", "#38693d")
        
        # Rewaita styling
        back = self._darken_color(primary, 0.3)
        front = primary if is_dark_mode else self._darken_color(primary, -0.2)
        shadow = self._darken_color(primary, 0.5)

        return {
            "back": back,
            "front": front,
            "shadow": shadow,
        }

    def _darken_color(self, hex_color: str, factor: float = 0.2) -> str:
        """Darken a hex color by a factor (0.0-1.0). If factor is negative, lightens."""
        hex_color = hex_color.lstrip("#")
        r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
        
        if factor >= 0:
            r = int(r * (1 - factor))
            g = int(g * (1 - factor))
            b = int(b * (1 - factor))
        else:
            factor = -factor
            r = int(r + (255 - r) * factor)
            g = int(g + (255 - g) * factor)
            b = int(b + (255 - b) * factor)
            
        return f"#{r:02x}{g:02x}{b:02x}"

    def _create_theme_structure(self) -> None:
        if self.output_base.exists():
            shutil.rmtree(self.output_base)
        self.output_base.mkdir(parents=True, exist_ok=True)
        for category in ["places", "apps"]:
            (self.output_base / category / "scalable").mkdir(parents=True, exist_ok=True)

    def _create_index_theme(self, is_dark_mode: bool) -> None:
        index_content = """[Icon Theme]
Name=Meowaita
Comment=Material You dynamic icon theme
Inherits=Adwaita
Example=folder

Directories=apps/scalable,places/scalable

[apps/scalable]
Size=96
Context=Applications
MinSize=16
MaxSize=128
Type=Scalable

[places/scalable]
Size=96
Context=Places
MinSize=16
MaxSize=128
Type=Scalable
"""
        index_file = self.output_base / "index.theme"
        index_file.write_text(index_content)

    def _submit_recolor_tasks(
        self,
        executor: concurrent.futures.ThreadPoolExecutor,
        category_path: str,
        colors: Dict[str, str],
        recolor: bool = True,
    ) -> List[concurrent.futures.Future]:
        tasks = []
        source_dir = self.base_icon_path / category_path
        if not source_dir.exists():
            return []

        output_dir = self.output_base / category_path

        for svg_file in source_dir.glob("*.svg"):
            target_path = output_dir / svg_file.name

            if svg_file.is_symlink():
                link_target = os.readlink(svg_file)
                def create_link(src=link_target, dst=target_path):
                    if dst.exists() or dst.is_symlink():
                        dst.unlink()
                    dst.symlink_to(src)
                tasks.append(executor.submit(create_link))
            else:
                tasks.append(
                    executor.submit(
                        self._process_svg_task, svg_file, target_path, colors, recolor
                    )
                )

        return tasks

    def _process_svg_task(
        self, source: Path, destination: Path, colors: Dict[str, str], recolor: bool
    ):
        try:
            svg_content = source.read_text()
            if recolor:
                svg_content = self._recolor_svg(svg_content, colors)
            destination.write_text(svg_content)
        except Exception as e:
            print(f"Warning: Failed to process {source}: {e}")

    def _recolor_svg(self, svg_content: str, colors: Dict[str, str]) -> str:
        """
        Recolor a Meowaita folder SVG by matching the specific paths.
        """
        import xml.etree.ElementTree as ET
        ET.register_namespace("", "http://www.w3.org/2000/svg")
        ET.register_namespace("sodipodi", "http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd")
        ET.register_namespace("inkscape", "http://www.inkscape.org/namespaces/inkscape")
        
        try:
            root = ET.fromstring(svg_content)
        except Exception:
            return svg_content
            
        for path in root.findall(".//{http://www.w3.org/2000/svg}path"):
            d = path.attrib.get("d", "").strip()
            new_color = None
            
            # Back flap
            if d.startswith("M 21.976562 12") or d.startswith("m 21.976562 12") or d.startswith("m 21.976562,12") or d.startswith("M 21.976562,12"):
                new_color = colors["back"]
            # Shadow flap
            elif d.startswith("M 65.976562 36") or d.startswith("m 65.976562 36") or d.startswith("m 65.976562,36") or d.startswith("M 65.976562,36"):
                new_color = colors["shadow"]
            # Front flap
            elif d.startswith("M 65.976562 32") or d.startswith("m 65.976562 32") or d.startswith("m 65.976562,32") or d.startswith("M 65.976562,32"):
                new_color = colors["front"]
            # Everything else (emblems, symbols) gets the dark accent color
            else:
                new_color = colors["back"]
                
            if new_color:
                if "style" in path.attrib:
                    path.attrib["style"] = re.sub(r"fill:#[0-9a-fA-F]{3,6}", f"fill:{new_color}", path.attrib["style"])
                if "fill" in path.attrib and path.attrib["fill"].startswith("#"):
                    path.attrib["fill"] = new_color
                    
        return ET.tostring(root, encoding="unicode")

    def apply_theme(self) -> None:
        import subprocess
        try:
            subprocess.run(
                ["gtk-update-icon-cache", "-f", "-t", str(self.output_base)],
                check=False, capture_output=True, text=True
            )
        except FileNotFoundError:
            pass

        try:
            subprocess.run(
                ["gsettings", "set", "org.gnome.desktop.interface", "icon-theme", "Meowaita"],
                check=True, capture_output=True, text=True
            )
            print("Applied Meowaita icon theme via gsettings")
        except subprocess.CalledProcessError as e:
            print(f"Warning: Failed to set icon theme via gsettings: {e.stderr}")
        except FileNotFoundError:
            pass


def generate_material_you_icons(
    colors: Dict[str, str],
    is_dark_mode: bool = False,
    apply_theme: bool = True,
) -> Path:
    generator = IconThemeGenerator()
    theme_path = generator.generate(colors, is_dark_mode)
    if apply_theme:
        generator.apply_theme()
    return theme_path

if __name__ == "__main__":
    sample_dark_colors = {
        "primary": "#bb86fc",
    }
    path = generate_material_you_icons(sample_dark_colors, is_dark_mode=True, apply_theme=False)
    print(f"Generated icon theme at: {path}")
