/**
 * Minimal comment-preserving JSONC parser and top-level property updater.
 */

export function parseJsonc(rawContent: string): Record<string, unknown> | null {
  try {
    let result = '';
    let inString = false;
    let escaped = false;

    for (let i = 0; i < rawContent.length; i++) {
      const char = rawContent[i] ?? '';
      const next = rawContent[i + 1] ?? '';

      if (inString) {
        result += char;
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        result += char;
      } else if (char === '/' && next === '/') {
        while (i < rawContent.length && rawContent[i] !== '\n') i++;
        result += '\n';
      } else if (char === '/' && next === '*') {
        i += 2;
        while (i < rawContent.length && !(rawContent[i] === '*' && rawContent[i + 1] === '/')) i++;
        i++;
      } else {
        result += char;
      }
    }

    const withoutTrailingCommas = result.replace(/,\s*([}\]])/g, '$1').trim();
    if (!withoutTrailingCommas) return {};
    const parsed: unknown = JSON.parse(withoutTrailingCommas);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function updateJsoncProperties(
  rawContent: string,
  updates: Record<string, string | boolean>
): string {
  let content = rawContent.trim() ? rawContent : '{\n}\n';
  const indentMatch = content.match(/\n([ \t]+)"/);
  const indent = indentMatch?.[1] ?? '    ';

  for (const [key, value] of Object.entries(updates)) {
    const serialized = JSON.stringify(value);
    const keyRegex = new RegExp(
      `^([ \\t]*"${escapeRegExp(key)}"\\s*:\\s*)(?:"(?:\\\\.|[^"\\\\])*"|true|false)`,
      'm'
    );

    if (keyRegex.test(content)) {
      content = content.replace(keyRegex, `$1${serialized}`);
      continue;
    }

    const openBraceIndex = content.indexOf('{');
    if (openBraceIndex === -1) continue;

    const afterBrace = content.slice(openBraceIndex + 1).trim();
    const hasExistingKeys = afterBrace.length > 0 && !afterBrace.startsWith('}');
    const insertion = `\n${indent}"${key}": ${serialized}${hasExistingKeys ? ',' : ''}`;
    content =
      content.slice(0, openBraceIndex + 1) + insertion + content.slice(openBraceIndex + 1);
  }

  return content;
}
