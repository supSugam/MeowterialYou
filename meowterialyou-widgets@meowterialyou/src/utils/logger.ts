/**
 * Logger utility for the extension
 */

export class Logger {
  private _prefix: string;
  private _debugEnabled: boolean;

  constructor(prefix: string) {
    this._prefix = prefix;
    this._debugEnabled = false;
  }

  setDebug(enabled: boolean): void {
    this._debugEnabled = enabled;
  }

  info(message: string): void {
    console.log(`[${this._prefix}] ${message}`);
  }

  debug(message: string | (() => string)): void {
    if (!this._debugEnabled) return;
    const msg = typeof message === 'function' ? message() : message;
    console.log(`[${this._prefix}] DEBUG: ${msg}`);
  }

  warn(message: string): void {
    console.warn(`[${this._prefix}] WARN: ${message}`);
  }

  error(message: string): void {
    console.error(`[${this._prefix}] ERROR: ${message}`);
  }
}
