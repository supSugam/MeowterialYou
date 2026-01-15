from ..hct.hct import *
from ..palettes.tonal_palette import *


# /**
#  * An intermediate concept between the key color for a UI theme, and a full
#  * color scheme. 5 sets of tones are generated, all except one use the same hue
#  * as the key color, and all vary in chroma.
#  */
class CorePalette:

    def __init__(self, a1, a2, a3, n1, n2, error):
        self.a1 = a1
        self.a2 = a2
        self.a3 = a3
        self.n1 = n1
        self.n2 = n2
        self.error = error

    @staticmethod
    def of(argb: int):
        return CorePalette.tonal_spot(argb)

    @staticmethod
    def tonal_spot(argb: int):
        hct = Hct.fromInt(argb)
        hue = hct.hue
        chroma = hct.chroma
        return CorePalette(
            TonalPalette.fromHueAndChroma(hue, max(36.0, chroma)),
            TonalPalette.fromHueAndChroma(hue, 16.0),
            TonalPalette.fromHueAndChroma(hue + 60.0, 24.0),
            TonalPalette.fromHueAndChroma(hue, 4.0),
            TonalPalette.fromHueAndChroma(hue, 8.0),
            TonalPalette.fromHueAndChroma(25.0, 84.0),
        )

    @staticmethod
    def neutral(argb: int):
        """
        Neutral style: for muted, understated themes.
        N2 chroma increased to 6.0 for visible surfaceVariant distinction.
        """
        hct = Hct.fromInt(argb)
        hue = hct.hue
        return CorePalette(
            TonalPalette.fromHueAndChroma(hue, 12.0),
            TonalPalette.fromHueAndChroma(hue, 8.0),
            TonalPalette.fromHueAndChroma(hue + 60.0, 16.0),
            TonalPalette.fromHueAndChroma(hue, 2.0),
            # N2: Increased from 2.0 to 6.0 for visible surfaceVariant
            TonalPalette.fromHueAndChroma(hue, 6.0),
            TonalPalette.fromHueAndChroma(25.0, 84.0),
        )

    @staticmethod
    def vibrant(argb: int):
        hct = Hct.fromInt(argb)
        hue = hct.hue
        chroma = hct.chroma
        return CorePalette(
            TonalPalette.fromHueAndChroma(hue, max(48.0, chroma)),
            TonalPalette.fromHueAndChroma(hue, 24.0),
            TonalPalette.fromHueAndChroma(hue + 30.0, 32.0),
            TonalPalette.fromHueAndChroma(hue, 10.0),
            TonalPalette.fromHueAndChroma(hue, 12.0),
            TonalPalette.fromHueAndChroma(25.0, 84.0),
        )

    @staticmethod
    def expressive(argb: int):
        hct = Hct.fromInt(argb)
        hue = hct.hue
        return CorePalette(
            TonalPalette.fromHueAndChroma(hue + 240.0, 40.0),
            TonalPalette.fromHueAndChroma(hue + 15.0, 24.0),
            TonalPalette.fromHueAndChroma(hue + 180.0, 32.0),
            TonalPalette.fromHueAndChroma(hue + 15.0, 8.0),
            TonalPalette.fromHueAndChroma(hue + 15.0, 12.0),
            TonalPalette.fromHueAndChroma(25.0, 84.0),
        )

    @staticmethod
    def rainbow(argb: int):
        hct = Hct.fromInt(argb)
        hue = hct.hue
        chroma = hct.chroma
        return CorePalette(
            TonalPalette.fromHueAndChroma(hue, 48.0),
            TonalPalette.fromHueAndChroma(hue, 16.0),
            TonalPalette.fromHueAndChroma(hue + 60.0, 24.0),
            TonalPalette.fromHueAndChroma(hue, 0.0),
            TonalPalette.fromHueAndChroma(hue, 0.0),
            TonalPalette.fromHueAndChroma(25.0, 84.0),
        )

    @staticmethod
    def fruit_salad(argb: int):
        hct = Hct.fromInt(argb)
        hue = hct.hue
        return CorePalette(
            TonalPalette.fromHueAndChroma(hue - 50.0, 48.0),
            TonalPalette.fromHueAndChroma(hue - 50.0, 36.0),
            TonalPalette.fromHueAndChroma(hue, 36.0),
            TonalPalette.fromHueAndChroma(hue, 10.0),
            TonalPalette.fromHueAndChroma(hue, 16.0),
            TonalPalette.fromHueAndChroma(25.0, 84.0),
        )

    @staticmethod
    def content(argb: int):
        """
        Content/Fidelity style: preserves the input chroma for primary.
        For neutral palettes (N1, N2), we ensure minimum chroma values
        to guarantee visible contrast between surface roles, especially
        in light mode where low-chroma colors can appear washed out.
        """
        hct = Hct.fromInt(argb)
        hue = hct.hue
        chroma = hct.chroma
        return CorePalette(
            TonalPalette.fromHueAndChroma(hue, chroma),
            TonalPalette.fromHueAndChroma(hue, max(8.0, chroma / 3.0)),
            TonalPalette.fromHueAndChroma(hue + 60.0, max(12.0, chroma / 2.0)),
            # N1: Minimum chroma of 2.0 for subtle but visible tint
            TonalPalette.fromHueAndChroma(hue, max(2.0, chroma / 12.0)),
            # N2: Minimum chroma of 6.0 for clear surfaceVariant distinction
            TonalPalette.fromHueAndChroma(hue, max(6.0, chroma / 6.0)),
            TonalPalette.fromHueAndChroma(25.0, 84.0),
        )

    @staticmethod
    def monochrome(argb: int):
        hct = Hct.fromInt(argb)
        hue = hct.hue
        return CorePalette(
            TonalPalette.fromHueAndChroma(hue, 0.0),
            TonalPalette.fromHueAndChroma(hue, 0.0),
            TonalPalette.fromHueAndChroma(hue, 0.0),
            TonalPalette.fromHueAndChroma(hue, 0.0),
            TonalPalette.fromHueAndChroma(hue, 0.0),
            TonalPalette.fromHueAndChroma(25.0, 84.0),
        )

    @staticmethod
    def fidelity(argb: int):
        return CorePalette.content(argb)
