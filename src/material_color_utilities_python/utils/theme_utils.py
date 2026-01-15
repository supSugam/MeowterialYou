from src.transformers import ColorTransformer

from ..blend.blend import *
from ..palettes.core_palette import *
from ..scheme.scheme import *
from .image_utils import *
from .string_utils import *


# /**
#  * Generate custom color group from source and target color
#  *
#  * @param source Source color
#  * @param color Custom color
#  * @return Custom color group
#  *
#  * @link https://m3.material.io/styles/color/the-color-system/color-roles
#  */
# NOTE: Changes made to output format to be Dictionary
def customColor(source, color):
    value = color["value"]
    from_v = value
    to = source
    if color["blend"]:
        value = Blend.harmonize(from_v, to)
    palette = CorePalette.of(value)
    tones = palette.a1
    return {
        "color": color,
        "value": value,
        "light": {
            "color": tones.tone(40),
            "onColor": tones.tone(100),
            "colorContainer": tones.tone(90),
            "onColorContainer": tones.tone(10),
        },
        "dark": {
            "color": tones.tone(80),
            "onColor": tones.tone(20),
            "colorContainer": tones.tone(30),
            "onColorContainer": tones.tone(90),
        },
    }


# /**
#  * Generate a theme from a source color
#  *
#  * @param source Source color
#  * @param customColors Array of custom colors
#  * @return Theme object
#  */
# NOTE: Changes made to output format to be Dictionary
def themeFromSourceColor(source: int, customColors=[], style="tonal_spot"):
    palette = CorePalette.of(source)
    if hasattr(CorePalette, style):
        palette = getattr(CorePalette, style)(source)

    return {
        "source": source,
        "schemes": {
            "light": Scheme.light(source, style),
            "dark": Scheme.dark(source, style),
        },
        "palettes": {
            "primary": palette.a1,
            "secondary": palette.a2,
            "tertiary": palette.a3,
            "neutral": palette.n1,
            "neutralVariant": palette.n2,
            "error": palette.error,
        },
        "customColors": [customColor(source, c) for c in customColors],
    }


# /**
#  * Generate a theme from an image source
#  *
#  * @param image Image element
#  * @param customColors Array of custom colors
#  * @return Theme object
#  */
def themeFromImage(image, customColors=[], style="tonal_spot"):
    colors = topColorsFromImage(image)
    source = colors[0]

    # Smart Style Logic
    # If the user hasn't strictly chosen a style (default "tonal_spot"), we analyze the source color
    # to find the "best matching" palette.
    if style == "tonal_spot":
        from ..hct.hct import Hct

        hct = Hct.fromInt(source)

        # Tier 1: True Monochrome / Near Grayscale
        # If the source color is practically grayscale (chroma < 1.5), we force "monochrome"
        # to ensure a clean, tint-free grayscale theme.
        if hct.chroma < 1.5:
            print(
                f"Info: Near-grayscale source ({hct.chroma:.1f}) detected. Switching style to 'monochrome'."
            )
            style = "monochrome"

        # Tier 2: Low Chroma / Subtle Tint
        # If the source has subtle color (chroma 1.5-18, e.g. cream, platinum, beige),
        # "tonal_spot" would boost chroma to ~36 (too fake), and "neutral" forces it to 12.
        # We switch to "content" (Fidelity) which preserves the EXACT source chroma.
        elif hct.chroma < 18.0:
            print(
                f"Info: Low chroma source ({hct.chroma:.1f}) detected. Switching style to 'content' to preserve tint."
            )
            style = "content"

        # Tier 3: Colorful
        # For chroma >= 18.0, we stick to the requested "tonal_spot" (or whatever default)
        # which provides the standard Material You vibrancy.

    return themeFromSourceColor(source, customColors, style), [
        ColorTransformer.argb_to_hex(color) for color in colors
    ]


# Not really applicable to python CLI
# # /**
# #  * Apply a theme to an element
# #  *
# #  * @param theme Theme object
# #  * @param options Options
# #  */
# export function applyTheme(theme, options) {
#     var _a;
#     const target = (options === null || options === void 0 ? void 0 : options.target) || document.body;
#     const isDark = (_a = options === null || options === void 0 ? void 0 : options.dark) !== null && _a !== void 0 ? _a : false;
#     const scheme = isDark ? theme.schemes.dark : theme.schemes.light;
#     for (const [key, value] of Object.entries(scheme.toJSON())) {
#         const token = key.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
#         const color = hexFromArgb(value);
#         target.style.setProperty(`--md-sys-color-${token}`, color);
#     }
# }
# //# sourceMappingURL=theme_utils.js.map
