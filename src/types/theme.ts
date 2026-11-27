/**
 * Core type definitions for MeowterialYou theming and configuration.
 */

export type ThemeMode = 'dark' | 'light';

export type SchemeVariant =
  | 'tonal-spot'
  | 'neutral'
  | 'vibrant'
  | 'expressive'
  | 'rainbow'
  | 'fruit-salad'
  | 'content'
  | 'monochrome'
  | 'fidelity';

export type WindowButtonStyle = 'native' | 'mac';
export type WindowButtonPosition = 'left' | 'right';

export type WallpaperCycleOrder =
  | 'random'
  | 'alphabetical-asc'
  | 'alphabetical-desc'
  | 'date-newest'
  | 'date-oldest';

export type IndicatorSpacing = 'default' | 'relaxed' | 'compact' | 'ultra-compact';

export interface MaterialSchemeColors {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  shadow: string;
  scrim: string;
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;
  surfaceDim: string;
  surfaceBright: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  tertiaryFixedDim: string;
  [key: string]: string;
}

export interface WallpaperImageStats {
  brightness: number;
  variance: number;
  saturation: number;
  averageRgb: [number, number, number];
}

export interface ExtensionConfig {
  themeMode: ThemeMode;
  schemeVariant: SchemeVariant;
  isTransparentPanelEnabled: boolean;
  isWallpaperCycleEnabled: boolean;
  wallpaperCycleDirectory: string;
  wallpaperCycleIntervalMinutes: number;
  wallpaperCycleOrder: WallpaperCycleOrder;
  windowButtonStyle: WindowButtonStyle;
  windowButtonPosition: WindowButtonPosition;
  isThemedIconsEnabled: boolean;
  baseIconTheme: string;
  isGtk3Enabled: boolean;
  isGtk4Enabled: boolean;
  isShellThemeEnabled: boolean;
  isTerminalThemingEnabled: boolean;
  isGhosttyEnabled: boolean;
  isVscodeEnabled: boolean;
  isAntigravityAppEnabled: boolean;
  isObsidianEnabled: boolean;
  isFastfetchEnabled: boolean;
  isFastfetchManageLayout: boolean;
  isFastfetchLogoCycleEnabled: boolean;
  fastfetchLogoDirectory: string;
  isShellPromptEnabled: boolean;
  isPaused: boolean;
}

export type ExtractionStatus =
  | { status: 'success'; seedColorArgb: number; scheme: MaterialSchemeColors }
  | { status: 'error'; errorMessage: string };

export type ThemeApplyStatus =
  | { status: 'success'; appliedMode: 'dark' | 'light'; seedColorHex: string }
  | { status: 'error'; errorMessage: string };
