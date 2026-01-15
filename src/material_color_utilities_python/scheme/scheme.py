import json

from ..palettes.core_palette import *


# /**
#  * Represents a Material color scheme, a mapping of color roles to colors.
#  */
# Using dictionary instead of JavaScript Object
class Scheme:
    def __init__(self, props):
        self.props = props

    def get_primary(self):
        return self.props["primary"]

    def get_primaryContainer(self):
        return self.props["primaryContainer"]

    def get_onPrimary(self):
        return self.props["onPrimary"]

    def get_onPrimaryContainer(self):
        return self.props["onPrimaryContainer"]

    def get_secondary(self):
        return self.props["secondary"]

    def get_secondaryContainer(self):
        return self.props["secondaryContainer"]

    def get_onSecondary(self):
        return self.props["onSecondary"]

    def get_onSecondaryContainer(self):
        return self.props["onSecondaryContainer"]

    def get_tertiary(self):
        return self.props["tertiary"]

    def get_onTertiary(self):
        return self.props["onTertiary"]

    def get_tertiaryContainer(self):
        return self.props["tertiaryContainer"]

    def get_onTertiaryContainer(self):
        return self.props["onTertiaryContainer"]

    def get_error(self):
        return self.props["error"]

    def get_onError(self):
        return self.props["onError"]

    def get_errorContainer(self):
        return self.props["errorContainer"]

    def get_onErrorContainer(self):
        return self.props["onErrorContainer"]

    def get_background(self):
        return self.props["background"]

    def get_onBackground(self):
        return self.props["onBackground"]

    def get_surface(self):
        return self.props["surface"]

    def get_onSurface(self):
        return self.props["onSurface"]

    def get_surfaceVariant(self):
        return self.props["surfaceVariant"]

    def get_onSurfaceVariant(self):
        return self.props["onSurfaceVariant"]

    def get_outline(self):
        return self.props["outline"]

    def get_shadow(self):
        return self.props["shadow"]

    def get_inverseSurface(self):
        return self.props["inverseSurface"]

    def get_inverseOnSurface(self):
        return self.props["inverseOnSurface"]

    def get_inversePrimary(self):
        return self.props["inversePrimary"]

    def get_surfaceDim(self):
        return self.props["surfaceDim"]

    def get_surfaceBright(self):
        return self.props["surfaceBright"]

    def get_surfaceContainerLowest(self):
        return self.props["surfaceContainerLowest"]

    def get_surfaceContainerLow(self):
        return self.props["surfaceContainerLow"]

    def get_surfaceContainer(self):
        return self.props["surfaceContainer"]

    def get_surfaceContainerHigh(self):
        return self.props["surfaceContainerHigh"]

    def get_surfaceContainerHighest(self):
        return self.props["surfaceContainerHighest"]

    def get_scrim(self):
        return self.props["scrim"]

    def get_outlineVariant(self):
        return self.props["outlineVariant"]

    primary = property(get_primary)
    primaryContainer = property(get_primaryContainer)
    onPrimary = property(get_onPrimary)
    onPrimaryContainer = property(get_onPrimaryContainer)
    secondary = property(get_secondary)
    secondaryContainer = property(get_secondaryContainer)
    onSecondary = property(get_onSecondary)
    onSecondaryContainer = property(get_onSecondaryContainer)
    tertiary = property(get_tertiary)
    onTertiary = property(get_onTertiary)
    tertiaryContainer = property(get_tertiaryContainer)
    onTertiaryContainer = property(get_onTertiaryContainer)
    error = property(get_error)
    onError = property(get_onError)
    errorContainer = property(get_errorContainer)
    onErrorContainer = property(get_onErrorContainer)
    background = property(get_background)
    onBackground = property(get_onBackground)
    surface = property(get_surface)
    onSurface = property(get_onSurface)
    surfaceVariant = property(get_surfaceVariant)
    onSurfaceVariant = property(get_onSurfaceVariant)
    outline = property(get_outline)
    outlineVariant = property(get_outlineVariant)
    shadow = property(get_shadow)
    scrim = property(get_scrim)
    inverseSurface = property(get_inverseSurface)
    inverseOnSurface = property(get_inverseOnSurface)
    inversePrimary = property(get_inversePrimary)
    surfaceDim = property(get_surfaceDim)
    surfaceBright = property(get_surfaceBright)
    surfaceContainerLowest = property(get_surfaceContainerLowest)
    surfaceContainerLow = property(get_surfaceContainerLow)
    surfaceContainer = property(get_surfaceContainer)
    surfaceContainerHigh = property(get_surfaceContainerHigh)
    surfaceContainerHighest = property(get_surfaceContainerHighest)

    # /**
    #  * @param argb ARGB representation of a color.
    #  * @return Light Material color scheme, based on the color's hue.
    #  */
    # Official Google Material Color Utilities tone values
    @staticmethod
    def light(argb, style="tonal_spot"):
        core = CorePalette.of(argb)
        if hasattr(CorePalette, style):
            core = getattr(CorePalette, style)(argb)

        return Scheme(
            {
                "primary": core.a1.tone(40),
                "onPrimary": core.a1.tone(100),
                "primaryContainer": core.a1.tone(90),
                "onPrimaryContainer": core.a1.tone(10),
                "secondary": core.a2.tone(40),
                "onSecondary": core.a2.tone(100),
                "secondaryContainer": core.a2.tone(90),
                "onSecondaryContainer": core.a2.tone(10),
                "tertiary": core.a3.tone(40),
                "onTertiary": core.a3.tone(100),
                "tertiaryContainer": core.a3.tone(90),
                "onTertiaryContainer": core.a3.tone(10),
                "error": core.error.tone(40),
                "onError": core.error.tone(100),
                "errorContainer": core.error.tone(90),
                "onErrorContainer": core.error.tone(10),
                "background": core.n1.tone(99),
                "onBackground": core.n1.tone(10),
                "surface": core.n1.tone(99),
                "onSurface": core.n1.tone(10),
                "surfaceVariant": core.n2.tone(90),
                "onSurfaceVariant": core.n2.tone(30),
                "outline": core.n2.tone(50),
                "outlineVariant": core.n2.tone(80),
                "shadow": core.n1.tone(0),
                "scrim": core.n1.tone(0),
                "inverseSurface": core.n1.tone(20),
                "inverseOnSurface": core.n1.tone(95),
                "inversePrimary": core.a1.tone(80),
                "surfaceDim": core.n1.tone(87),
                "surfaceBright": core.n1.tone(98),
                "surfaceContainerLowest": core.n1.tone(100),
                "surfaceContainerLow": core.n1.tone(96),
                "surfaceContainer": core.n1.tone(94),
                "surfaceContainerHigh": core.n1.tone(92),
                "surfaceContainerHighest": core.n1.tone(90),
            }
        )

    # /**
    #  * @param argb ARGB representation of a color.
    #  * @return Dark Material color scheme, based on the color's hue.
    #  */
    # Official Google Material Color Utilities tone values
    @staticmethod
    def dark(argb, style="tonal_spot"):
        core = CorePalette.of(argb)
        if hasattr(CorePalette, style):
            core = getattr(CorePalette, style)(argb)

        return Scheme(
            {
                "primary": core.a1.tone(80),
                "onPrimary": core.a1.tone(20),
                "primaryContainer": core.a1.tone(30),
                "onPrimaryContainer": core.a1.tone(90),
                "secondary": core.a2.tone(80),
                "onSecondary": core.a2.tone(20),
                "secondaryContainer": core.a2.tone(30),
                "onSecondaryContainer": core.a2.tone(90),
                "tertiary": core.a3.tone(80),
                "onTertiary": core.a3.tone(20),
                "tertiaryContainer": core.a3.tone(30),
                "onTertiaryContainer": core.a3.tone(90),
                "error": core.error.tone(80),
                "onError": core.error.tone(20),
                "errorContainer": core.error.tone(30),
                "onErrorContainer": core.error.tone(80),
                "background": core.n1.tone(10),
                "onBackground": core.n1.tone(90),
                "surface": core.n1.tone(10),
                "onSurface": core.n1.tone(90),
                "surfaceVariant": core.n2.tone(30),
                "onSurfaceVariant": core.n2.tone(80),
                "outline": core.n2.tone(60),
                "outlineVariant": core.n2.tone(30),
                "shadow": core.n1.tone(0),
                "scrim": core.n1.tone(0),
                "inverseSurface": core.n1.tone(90),
                "inverseOnSurface": core.n1.tone(20),
                "inversePrimary": core.a1.tone(40),
                "surfaceDim": core.n1.tone(6),
                "surfaceBright": core.n1.tone(24),
                "surfaceContainerLowest": core.n1.tone(4),
                "surfaceContainerLow": core.n1.tone(10),
                "surfaceContainer": core.n1.tone(12),
                "surfaceContainerHigh": core.n1.tone(17),
                "surfaceContainerHighest": core.n1.tone(22),
            }
        )

    def toJSON(self):
        return json.dumps(self.props)
