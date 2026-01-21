/**
 * BaseWidget - Abstract base class for desktop widgets
 */

import St from 'gi://St';
import { SettingsManager } from '../services/SettingsManager.js';
import { Logger } from '../utils/logger.js';

export interface WidgetPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Monitor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export abstract class BaseWidget {
  protected _settings: SettingsManager;
  protected _logger: Logger;
  protected _monitor: Monitor;
  protected _actor: St.BoxLayout;
  protected _destroyed: boolean = false;

  constructor(settings: SettingsManager, logger: Logger, monitor: Monitor) {
    this._settings = settings;
    this._logger = logger;
    this._monitor = monitor;

    // Create the main actor - vertical BoxLayout
    this._actor = new St.BoxLayout({
      vertical: true,
      reactive: true,
      track_hover: true,
    });
  }

  /**
   * Get the St actor for this widget
   */
  get actor(): St.BoxLayout {
    return this._actor;
  }

  /**
   * Calculate absolute position from config values
   * Negative x = offset from right edge
   * Negative y = offset from bottom edge
   */
  protected _calculatePosition(pos: WidgetPosition): { x: number; y: number } {
    let x = pos.x;
    let y = pos.y;

    // Handle negative x (from right edge)
    if (x < 0) {
      x = this._monitor.width + x - pos.width;
    }

    // Handle negative y (from bottom edge)
    if (y < 0) {
      y = this._monitor.height + y - pos.height;
    }

    return { x, y };
  }

  /**
   * Apply position and size to the actor
   * Uses CSS for sizing to allow content to expand the widget
   */
  protected _applyPosition(pos: WidgetPosition): void {
    const { x, y } = this._calculatePosition(pos);

    // Set position explicitly
    this._actor.set_position(x, y);

    // Use CSS for dimensions to allow auto-sizing behavior
    // We treat config width/height as minimums
    const currentStyle = this._actor.get_style() || '';
    this._actor.set_style(`
      ${currentStyle}
      width: ${pos.width}px;
      min-height: ${pos.height}px;
    `);
  }

  /**
   * Apply common styles to the widget background
   */
  protected _applyBackgroundStyle(
    cornerRadius: number,
    opacity: number,
    bgColor: string = 'rgba(30, 30, 46, 1)'
  ): void {
    const alpha = opacity / 100;
    const currentStyle = this._actor.get_style() || '';
    
    // updates style preserving existing layout properties
    this._actor.set_style(`
      ${currentStyle}
      background-color: rgba(30, 30, 46, ${alpha});
      border-radius: ${cornerRadius}px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    `);
  }

  /**
   * Destroy the widget
   */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;

    this._onDestroy();

    if (this._actor) {
      this._actor.destroy();
    }
  }

  /**
   * Subclass cleanup hook
   */
  protected abstract _onDestroy(): void;

  /**
   * Subclass initialization hook
   */
  protected abstract _buildUI(): void;
}
