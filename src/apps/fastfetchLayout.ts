/**
 * Fastfetch color mapping and preset module builders using terminal ANSI slots
 * so output automatically adapts during live terminal light/dark switches.
 */

import type { MaterialSchemeColors } from '../types/theme.js';

const DIVIDER_LINE = '──────────────────────────────────────────';
const ANSI_RESET = '\u001b[0m';
const ANSI_MUTED = '\u001b[90m';

const SWATCH_CODES: ReadonlyArray<string> = [
  '\u001b[34m',
  '\u001b[36m',
  '\u001b[35m',
  '\u001b[31m',
  '\u001b[32m',
  '\u001b[33m',
  '\u001b[90m',
  '\u001b[39m',
];

export function buildDisplayColors(_scheme: MaterialSchemeColors): Record<string, string> {
  return {
    keys: 'blue',
    title: 'magenta',
    output: '39',
    separator: 'light_black',
  };
}

export function buildPercentColors(_scheme: MaterialSchemeColors): Record<string, string> {
  return {
    green: 'green',
    yellow: 'yellow',
    red: 'red',
  };
}

export function buildLogoColors(_scheme: MaterialSchemeColors): Record<string, string> {
  return {
    '1': 'blue',
    '2': 'cyan',
    '3': 'magenta',
    '4': '39',
  };
}

function buildPaletteBar(): string {
  return (
    SWATCH_CODES.map((code, index) => `${code}${index === 0 ? '󰮯 ' : '󰊠 '}`).join('') + ANSI_RESET
  );
}

export function buildManagedModules(
  _scheme: MaterialSchemeColors,
  prependedBreaks: number = 0
): unknown[] {
  const divider = `${ANSI_MUTED}${DIVIDER_LINE}${ANSI_RESET}`;
  const breaks = Array.from({ length: Math.max(0, prependedBreaks) }, () => 'break');

  return [
    ...breaks,
    'break',
    { type: 'os', key: 'os', keyColor: 'blue', format: '{name}' },
    { type: 'packages', key: 'pkgs', keyColor: 'blue' },
    { type: 'uptime', key: 'up', keyColor: 'blue' },
    { type: 'custom', format: divider },
    { type: 'display', key: 'res', keyColor: 'cyan', format: '{1}x{2} @ {3}Hz' },
    { type: 'terminal', key: 'term', keyColor: 'cyan', format: '{pretty-name}' },
    { type: 'shell', key: 'sh', keyColor: 'cyan', format: '{pretty-name}' },
    { type: 'custom', format: divider },
    { type: 'cpu', key: 'cpu', keyColor: 'magenta', format: '{name}' },
    { type: 'memory', key: 'ram', keyColor: 'magenta', format: '{used} / {total}' },
    {
      type: 'disk',
      key: 'disk',
      keyColor: 'magenta',
      folders: ['/'],
      format: '{size-used} / {size-total}',
    },
    { type: 'localip', key: 'ip', keyColor: 'magenta', format: '{ipv4}' },
    'break',
    { type: 'custom', format: buildPaletteBar() },
  ];
}

export function recolorCustomModules(modules: unknown[], _scheme: MaterialSchemeColors): unknown[] {
  const tiers = ['blue', 'cyan', 'magenta'];
  const divider = `${ANSI_MUTED}${DIVIDER_LINE}${ANSI_RESET}`;
  let sectionIndex = 0;

  return modules.map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return entry;
    }

    const record = entry as Record<string, unknown>;
    if (record.type === 'custom' && typeof record.format === 'string') {
      if (record.format.includes(DIVIDER_LINE)) {
        sectionIndex += 1;
        return { ...record, format: divider };
      }
      if (record.format.includes('󰮯') || record.format.includes('󰊠')) {
        return { ...record, format: buildPaletteBar() };
      }
      return record;
    }

    if (typeof record.keyColor === 'string') {
      return { ...record, keyColor: tiers[sectionIndex % tiers.length] };
    }
    return record;
  });
}
