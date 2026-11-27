/**
 * Async CAVA audio stream runner using isolated widget config and Gio.Subprocess.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { getHomeDirectory, writeTextFile } from '../theme/fileHelper.js';

const CAVA_MAX_RANGE = 100;
const CAVA_FRAMERATE_HZ = 60;
const RESTART_DELAY_MS = 1500;

export function isCavaInstalled(): boolean {
  return GLib.find_program_in_path('cava') !== null;
}

function buildCavaConfigContent(barCount: number): string {
  return `[general]
bars = ${barCount}
framerate = ${CAVA_FRAMERATE_HZ}

[output]
method = raw
raw_target = /dev/stdout
data_format = ascii
ascii_max_range = ${CAVA_MAX_RANGE}
`;
}

function parseCavaAsciiFrame(line: string, expectedBars: number): number[] | null {
  const rawParts = line.trim().split(';');
  if (rawParts.length < expectedBars) return null;

  const normalized: number[] = [];
  for (let i = 0; i < expectedBars; i++) {
    const value = Number.parseInt(rawParts[i] ?? '0', 10);
    normalized.push(Number.isFinite(value) ? Math.max(0, Math.min(1, value / CAVA_MAX_RANGE)) : 0);
  }
  return normalized;
}

export class CavaRunner {
  private _process: Gio.Subprocess | null = null;
  private _stream: Gio.DataInputStream | null = null;
  private _cancellable: Gio.Cancellable | null = null;
  private _restartTimerId: number | null = null;
  private _running = false;
  private _barCount = 48;
  private _onFrame: (bars: number[]) => void;

  constructor(onFrame: (bars: number[]) => void) {
    this._onFrame = onFrame;
  }

  start(barCount: number): void {
    this.stop();
    if (!isCavaInstalled()) return;

    this._barCount = barCount;
    this._running = true;

    const configPath = GLib.build_filenamev([
      getHomeDirectory(), '.config', 'meowterialyou', 'cava-widget.conf',
    ]);
    writeTextFile(configPath, buildCavaConfigContent(barCount));

    try {
      this._process = Gio.Subprocess.new(
        ['cava', '-p', configPath],
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
      );
      const stdout = this._process.get_stdout_pipe();
      if (!stdout) {
        this.stop();
        return;
      }

      this._cancellable = new Gio.Cancellable();
      this._stream = new Gio.DataInputStream({ base_stream: stdout });
      this._readNextLine();
    } catch (error) {
      console.warn('MeowterialYou: Failed to start cava audio visualizer', error);
      this.stop();
    }
  }

  stop(): void {
    this._running = false;
    if (this._restartTimerId !== null) {
      GLib.source_remove(this._restartTimerId);
      this._restartTimerId = null;
    }
    if (this._cancellable) {
      this._cancellable.cancel();
      this._cancellable = null;
    }
    if (this._stream) {
      try {
        this._stream.close(null);
      } catch {
        // Ignore stream close errors during teardown
      }
      this._stream = null;
    }
    if (this._process) {
      try {
        this._process.force_exit();
      } catch {
        // Process may already have exited
      }
      this._process = null;
    }
  }

  private _readNextLine(): void {
    if (!this._running || !this._stream || !this._cancellable) return;
    const stream = this._stream;
    const cancellable = this._cancellable;

    stream.read_line_async(GLib.PRIORITY_DEFAULT, cancellable, (_source, result) => {
      if (!this._running || cancellable.is_cancelled()) return;
      try {
        const [line] = stream.read_line_finish_utf8(result);
        if (line === null) {
          this._scheduleRestart();
          return;
        }
        const parsed = parseCavaAsciiFrame(line, this._barCount);
        if (parsed) this._onFrame(parsed);
        this._readNextLine();
      } catch {
        if (this._running && !cancellable.is_cancelled()) this._scheduleRestart();
      }
    });
  }

  private _scheduleRestart(): void {
    if (!this._running || this._restartTimerId !== null) return;
    const bars = this._barCount;
    this.stop();
    this._running = true;
    this._restartTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, RESTART_DELAY_MS, () => {
      this._restartTimerId = null;
      if (this._running) this.start(bars);
      return GLib.SOURCE_REMOVE;
    });
  }
}
