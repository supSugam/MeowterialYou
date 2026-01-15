import sys
import os

# Add src to path
sys.path.append(os.getcwd())

from src.material_color_utilities_python.utils.theme_utils import themeFromSourceColor, themeFromImage
from PIL import Image

# Google Blue
source_color = 0xff4285F4 
gray_color = 0xFF505050 # Chroma ~0
muted_color = 0xFF566255 # Chroma ~8-12ish
colors = [0xffcfcfcf] # Mock colors list

styles = ["tonal_spot", "neutral", "vibrant", "expressive", "fidelity", "monochrome"]

print(f"Testing Source Color: {hex(source_color)}")

results = {}

for style in styles:
    print(f"\n--- Style: {style} ---")
    try:
        theme = themeFromSourceColor(source_color, style=style)
        scheme = theme["schemes"]["light"] # Check light scheme properties
        
        # Check for new roles
        print(f"Surface Container: {scheme.surfaceContainer}")
        print(f"Surface Dim: {scheme.surfaceDim}")
        
        # Check Primary/Secondary/Tertiary
        p = scheme.primary
        s = scheme.secondary
        t = scheme.tertiary
        
        print(f"Primary: {hex(p)}")
        print(f"Secondary: {hex(s)}")
        print(f"Tertiary: {hex(t)}")
        
        results[style] = {"cnt": scheme.surfaceContainer, "p": p, "s": s, "t": t}
    except Exception as e:
        print(f"FAILED to generate scheme for {style}: {e}")

# Verification Logic
print("\n--- Verification ---")

# Check new roles presence
if results["tonal_spot"]["cnt"] is not None:
    print("SUCCESS: New roles (Surface Container) found in scheme.")
else:
    print("FAILURE: New roles missing.")

# Check differences
if results["tonal_spot"]["s"] != results["neutral"]["s"]:
    print("SUCCESS: Neutral Secondary != Tonal Spot Secondary")
else:
    print("WARNING: Neutral Secondary matches Tonal Spot")

if results["tonal_spot"]["p"] != results["vibrant"]["p"]:
    print("SUCCESS: Vibrant Primary != Tonal Spot Primary")
else:
    print("WARNING: Vibrant Primary matches Tonal Spot (Could be chromacity match)")

if results["tonal_spot"]["t"] != results["expressive"]["t"]:
    print("SUCCESS: Expressive Tertiary != Tonal Spot Tertiary")
else:
    print("WARNING: Expressive Tertiary matches Tonal Spot")

if results["tonal_spot"]["p"] != results["fidelity"]["p"]:
    print("SUCCESS: Fidelity Primary != Tonal Spot Primary")
else:
    print("WARNING: Fidelity Primary matches Tonal Spot")

print("\n--- Testing Smart Style High-Level Logic ---")
try:
    # We can't easily mock topColorsFromImage without an actual image file or mocking the function.
    # But we can verify the logic if we manually trigger themeFromImage with a dummy image if we mock topColorsFromImage
    # Or cleaner: Just trust the unit test of theme_utils logic we just wrote?
    # No, let's create a tiny 1x1 gray image to test.
    img = Image.new('RGB', (1, 1), color='#cfcfcf')
    result_theme, _ = themeFromImage(img)
    # If smart logic works, the primary chroma should be low (neutral style) rather than boosted (tonal spot)
    
    # Calculate chroma of primary color
    from src.material_color_utilities_python.hct.hct import Hct
    # result_theme["schemes"]["light"] is a Scheme object, so .primary returns int color
    primary_int = result_theme["schemes"]["light"].primary
    p = Hct.fromInt(primary_int)
    
    print(f"Generated Primary from Gray Image: {hex(primary_int)}")
    print(f"Chroma of Primary: {p.chroma}")
    
    if p.chroma < 2.0: 
        print("SUCCESS: Smart Style detected VERY low chroma and used monochrome (Chroma ~0).")
    elif p.chroma < 20.0:
        print("PARTIAL SUCCESS: Used Neutral but maybe should have used Monochrome?")
    else:
        print("FAILURE: Smart Style failed. Chroma boosted.")
        
    print("\n--- Testing Muted Color Source ---")
    # Simulation of Tier 2
    img_muted = Image.new('RGB', (1, 1), color='#566255')
    result_muted, _ = themeFromImage(img_muted)
    primary_muted = result_muted["schemes"]["light"].primary
    p_muted = Hct.fromInt(primary_muted)
    print(f"Generated Primary from Muted Image: {hex(primary_muted)} (Chroma: {p_muted.chroma})")
    
    if p_muted.chroma < 20.0 and p_muted.chroma > 1.0:
         print("SUCCESS: Smart Style detected Low Chroma (Tier 2) and used Neutral.")
    elif p_muted.chroma < 1.0:
         print("WARNING: Used Monochrome for Tier 2? acceptable.")
    else:
         print("FAILURE: Used Tonal Spot (High Chroma) for muted source.")

except Exception as e:
    print(f"Smart Style Test Failed: {e}")
