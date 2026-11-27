/**
 * Attack/decay frame smoothing and silence fade state for visualizer bars.
 */

const ATTACK_SMOOTHING = 0.52;
const DECAY_SMOOTHING = 0.24;
const SILENCE_FADE_IN_STEP = 0.14;
const SILENCE_FADE_OUT_STEP = 0.035;
export const SILENCE_THRESHOLD = 0.008;

export class VisualizerSmoother {
  private _targetBars: number[] = [];
  private _displayBars: number[] = [];
  private _fadeAlpha = 0;

  constructor(barCount: number) {
    this.reset(barCount);
  }

  get displayBars(): ReadonlyArray<number> {
    return this._displayBars;
  }

  get fadeAlpha(): number {
    return this._fadeAlpha;
  }

  reset(barCount: number): void {
    this._targetBars = new Array<number>(barCount).fill(0);
    this._displayBars = new Array<number>(barCount).fill(0);
  }

  pushTarget(bars: number[]): boolean {
    this._targetBars = bars;
    return bars.some((value) => value > SILENCE_THRESHOLD) || this._fadeAlpha > 0;
  }

  step(): boolean {
    let peak = 0;
    for (let i = 0; i < this._displayBars.length; i++) {
      const target = this._targetBars[i] ?? 0;
      const current = this._displayBars[i] ?? 0;
      const factor = target > current ? ATTACK_SMOOTHING : DECAY_SMOOTHING;
      const next = current + (target - current) * factor;
      this._displayBars[i] = next < SILENCE_THRESHOLD && target === 0 ? 0 : next;
      if (this._displayBars[i] > peak) peak = this._displayBars[i];
    }

    this._fadeAlpha =
      peak > SILENCE_THRESHOLD
        ? Math.min(1, this._fadeAlpha + SILENCE_FADE_IN_STEP)
        : Math.max(0, this._fadeAlpha - SILENCE_FADE_OUT_STEP);

    return peak > SILENCE_THRESHOLD || this._fadeAlpha > 0;
  }
}
