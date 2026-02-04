import colorsys
from typing import Tuple


class ColorTransformer:
    @staticmethod
    def rgb_to_hex(rgb: int) -> str:
        return "%02x%02x%02x" % rgb

    @staticmethod
    def hex_to_rgb(hexa: str):
        hexa = hexa.lstrip("#")
        return tuple(int(hexa[i : i + 2], 16) for i in (0, 2, 4))

    @staticmethod
    def dec_to_rgb(decimal_value: int) -> Tuple[int, int, int]:
        red = (decimal_value >> 16) & 255
        green = (decimal_value >> 8) & 255
        blue = decimal_value & 255

        return red, green, blue

    @classmethod
    def argb_to_hex(cls, argb: int) -> str:
        if isinstance(argb, str):
            argb = int(argb, 16)
        red = (argb >> 16) & 255
        green = (argb >> 8) & 0xFF
        blue = argb & 0xFF

        return "#{:02x}{:02x}{:02x}".format(red, green, blue)

    @classmethod
    def hex_to_argb(cls, hexa: str) -> int:
        hexa = hexa.lstrip("#")
        return int(hexa, 16)

    @classmethod
    def hex_to_hls(cls, hexa: str) -> Tuple[int, int, int]:
        r, g, b = cls.hex_to_rgb(hexa)
        hue, light, saturation = colorsys.rgb_to_hls(r / 255.0, g / 255.0, b / 255.0)
        return int(hue * 360), int(light * 100), int(saturation * 100)

    @classmethod
    def interpolate_colors(cls, start_hex: str, end_hex: str, steps: int) -> list[str]:
        """Interpolate between two hex colors in a given number of steps."""
        start_rgb = cls.hex_to_rgb(start_hex)
        end_rgb = cls.hex_to_rgb(end_hex)
        gradient = []

        for i in range(steps):
            ratio = i / (steps - 1)
            r = int(start_rgb[0] * (1 - ratio) + end_rgb[0] * ratio)
            g = int(start_rgb[1] * (1 - ratio) + end_rgb[1] * ratio)
            b = int(start_rgb[2] * (1 - ratio) + end_rgb[2] * ratio)
            gradient.append(f"#{r:02x}{g:02x}{b:02x}")

        return gradient
