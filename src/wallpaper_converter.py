import os
import json
import random
import numpy as np
from PIL import Image
from pathlib import Path

class WallpaperConverter:
    THEMES_FILE = Path(__file__).parent.parent / "assets/themes.json"

    def __init__(self):
        try:
            with open(self.THEMES_FILE, "r") as f:
                self.themes_data = json.load(f)
        except Exception as e:
            print(f"Warning: Could not load themes.json: {e}")
            self.themes_data = {}
        
        # Convert flat lists to (N, 3) numpy arrays
        self.palettes = {}
        for name, flat_list in self.themes_data.items():
            palette = np.array(flat_list).reshape(-1, 3)
            self.palettes[name] = palette

    def _normalize(self, s):
        if not s:
            return ""
        return s.lower().replace("-", " ").replace("_", " ").strip()

    def resolve_next_theme(self, theme_config: str, current_idx: int = 0) -> tuple[str | None, int]:
        """
        Determines the next theme based on config and index.
        Returns (selected_theme_name, next_index).
        """
        if not theme_config or theme_config.lower() == "false":
            return None, current_idx
        
        if theme_config.lower() == "randomize":
            return random.choice(list(self.palettes.keys())), current_idx
        
        # Split by comma and clean up
        choices = [t.strip() for t in theme_config.split(",")]
        
        if not choices:
            return None, current_idx

        # Calculate selection
        idx = current_idx % len(choices)
        selected = choices[idx]
        
        # Next index
        next_idx = (idx + 1) % len(choices)
            
        # Find internal canonical name if possible
        norm_selected = self._normalize(selected)
        for name in self.palettes.keys():
            if self._normalize(name) == norm_selected:
                return name, next_idx
            
        return selected, next_idx

    def convert(
        self, image_path: str, theme_config: str, output_name: str | None = None, cycle_idx: int = 0
    ) -> tuple[str, str | None, int]:
        """
        Converts the image at image_path based on theme_config.
        Returns (output_path, actual_theme_name, new_cycle_index).
        """
        theme_name, next_idx = self.resolve_next_theme(theme_config, cycle_idx)
        
        if not theme_name:
            return image_path, None, cycle_idx
            
        target_palette = None
        norm_theme = self._normalize(theme_name)
        
        # Match theme name case-insensitively and handle separators
        actual_name = None
        for name, palette in self.palettes.items():
            if self._normalize(name) == norm_theme:
                target_palette = palette
                actual_name = name
                break
        
        if target_palette is None:
            print(f"Warning: Theme '{theme_name}' not found. Skipping conversion.")
            return image_path, theme_name, next_idx

        print(f"🎨 Converting wallpaper to '{actual_name}'...")
        
        try:
            img = Image.open(image_path).convert("RGB")
            img_np = np.array(img, dtype=np.float32)
            h, w, _ = img_np.shape
            
            img_flat = img_np.reshape(-1, 3) 
            
            # Batch processing to avoid high memory usage on large images
            batch_size = 1000000 
            new_pixels = []
            
            for i in range(0, img_flat.shape[0], batch_size):
                batch = img_flat[i:i+batch_size]
                diff = batch[:, np.newaxis, :] - target_palette[np.newaxis, :, :] 
                dist_sq = np.sum(diff**2, axis=2) 
                idx = np.argmin(dist_sq, axis=1) 
                new_pixels.append(target_palette[idx])
                
            img_converted = np.concatenate(new_pixels).reshape(h, w, 3).astype(np.uint8)
            
            # Save to stable cache file (GNOME handles ~/.cache better than /tmp for wallpapers)
            cache_dir = Path.home() / ".cache/meowterialyou"
            cache_dir.mkdir(parents=True, exist_ok=True)
            filename = output_name or "wallpaper_converted.png"
            output_path = str(cache_dir / filename)
            
            Image.fromarray(img_converted).save(output_path)
            print(f"  🎨 Saved converted wallpaper to: {output_path}")
            
            return output_path, actual_name, next_idx
        except Exception as e:
            print(f"Error during image conversion: {e}")
            return image_path, actual_name, next_idx
