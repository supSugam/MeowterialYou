/**
 * MediaWidget - Exact port of GTK mediawidget UI to St widgets
 * Features: Album art, Title/Artist, Controls (Prev/Play/Next), Progress bar
 */

import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';
import { BaseWidget, Monitor } from './BaseWidget.js';
import { SettingsManager, MediaConfig } from '../services/SettingsManager.js';
import { Logger } from '../utils/logger.js';
import { MediaPlayer, PlayerState } from '../services/MediaPlayer.js';

export class MediaWidget extends BaseWidget {
  private _config: MediaConfig;
  private _mediaPlayer: MediaPlayer | null = null;

  // UI Elements
  private _artImage: St.Icon | null = null;
  private _titleLabel: St.Label | null = null;
  private _artistLabel: St.Label | null = null;
  private _prevButton: St.Button | null = null;
  private _playButton: St.Button | null = null;
  private _nextButton: St.Button | null = null;
  private _playIcon: St.Icon | null = null;
  private _progressSlider: any | null = null;
  private _currentTimeLabel: St.Label | null = null;
  private _totalTimeLabel: St.Label | null = null;
  private _isDragging: boolean = false;

  constructor(settings: SettingsManager, logger: Logger, monitor: Monitor) {
    super(settings, logger, monitor);

    this._config = settings.getMediaConfig();
    this._buildUI();
    this._startServices();
  }

  protected _buildUI(): void {
    // Add widget style class
    this._actor.add_style_class_name('meowterialyou-media');

    // Apply position and background
    this._applyPosition({
      x: this._config.x,
      y: this._config.y,
      width: this._config.width,
      height: this._config.height,
    });
    this._applyBackgroundStyle(this._config.cornerRadius, this._config.opacity);

    // Create content with horizontal layout (art | info)
    const content = new St.BoxLayout({
      vertical: false,
      x_expand: true,
      y_expand: true,
      style: 'padding: 16px;',
    });
    this._actor.add_child(content);

    // === Album Art ===
    const artContainer = new St.Bin({
      style_class: 'meowterialyou-media-art-container',
      style: `
        border-radius: ${this._config.cornerRadius}px;
        background-color: rgba(255, 255, 255, 0.1);
        min-width: 120px;
        min-height: 120px;
      `,
      x_align: Clutter.ActorAlign.CENTER,
      y_align: Clutter.ActorAlign.CENTER,
    });
    content.add_child(artContainer);

    this._artImage = new St.Icon({
      icon_name: 'audio-x-generic-symbolic',
      icon_size: 64,
      style_class: 'meowterialyou-media-art',
    });
    artContainer.set_child(this._artImage);

    // === Info Column ===
    const infoColumn = new St.BoxLayout({
      vertical: true,
      x_expand: true,
      style: 'margin-left: 16px;',
    });
    content.add_child(infoColumn);

    // Title
    this._titleLabel = new St.Label({
      text: 'No Media',
      style_class: 'meowterialyou-media-title',
      x_align: Clutter.ActorAlign.START,
      style: `
        font-size: 16px;
        font-weight: 800;
        margin-bottom: 4px;
      `,
    });
    this._titleLabel.clutter_text.set_line_wrap(true);
    this._titleLabel.clutter_text.set_line_wrap_mode(0); // WORD_CHAR
    this._titleLabel.clutter_text.set_ellipsize(3); // END
    infoColumn.add_child(this._titleLabel);

    // Artist
    this._artistLabel = new St.Label({
      text: '',
      style_class: 'meowterialyou-media-artist',
      x_align: Clutter.ActorAlign.START,
      style: `
        font-size: 13px;
        font-weight: 600;
        opacity: 0.8;
        margin-bottom: 12px;
      `,
    });
    this._artistLabel.clutter_text.set_ellipsize(3); // END
    infoColumn.add_child(this._artistLabel);

    // === Controls Row ===
    if (this._config.showControls) {
      const controlsRow = new St.BoxLayout({
        x_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
        style: 'margin-bottom: 8px;',
      });
      infoColumn.add_child(controlsRow);

      // Previous Button
      this._prevButton = this._createControlButton('media-skip-backward-symbolic', () => {
        this._mediaPlayer?.previous();
      });
      controlsRow.add_child(this._prevButton);

      // Play/Pause Button (larger, primary color)
      this._playButton = new St.Button({
        style_class: 'meowterialyou-media-play-btn',
        can_focus: true,
        style: `
          min-width: 52px;
          min-height: 38px;
          border-radius: 19px;
          margin: 0 8px;
          background-color: rgba(139, 92, 246, 1);
        `,
      });
      this._playIcon = new St.Icon({
        icon_name: 'media-playback-start-symbolic',
        icon_size: 20,
        style: 'color: white;',
      });
      this._playButton.set_child(this._playIcon);
      this._playButton.connect('clicked', () => {
        this._mediaPlayer?.playPause();
      });
      controlsRow.add_child(this._playButton);

      // Next Button
      this._nextButton = this._createControlButton('media-skip-forward-symbolic', () => {
        this._mediaPlayer?.next();
      });
      controlsRow.add_child(this._nextButton);
    }

    // === Progress Bar ===
    if (this._config.showProgress) {
      const progressRow = new St.BoxLayout({
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
      });
      infoColumn.add_child(progressRow);

      // Current time
      this._currentTimeLabel = new St.Label({
        text: '0:00',
        style_class: 'meowterialyou-media-time',
        style: `
          font-size: 11px;
          font-weight: 600;
          opacity: 0.7;
          min-width: 35px;
        `,
      });
      progressRow.add_child(this._currentTimeLabel);

      // Slider
      this._progressSlider = new Slider.Slider(0);
      this._progressSlider.actor.x_expand = true;
      this._progressSlider.actor.add_style_class_name(
        'meowterialyou-media-slider',
      );
      this._progressSlider.actor.set_style('margin: 0 8px;');

      this._progressSlider.connect('notify::value', () => {
        if (this._isDragging) return;
        // Value changed by user
      });
      this._progressSlider.connect('drag-begin', () => {
        this._isDragging = true;
      });
      this._progressSlider.connect('drag-end', () => {
        this._isDragging = false;
        const state = this._mediaPlayer?.getState();
        if (state && state.metadata.length > 0) {
          const newPosition = Math.floor(
            this._progressSlider!.value * state.metadata.length,
          );
          this._mediaPlayer?.seek(newPosition);
        }
      });
      progressRow.add_child(this._progressSlider);

      // Total time
      this._totalTimeLabel = new St.Label({
        text: '0:00',
        style_class: 'meowterialyou-media-time',
        style: `
          font-size: 11px;
          font-weight: 600;
          opacity: 0.7;
          min-width: 35px;
          text-align: right;
        `,
      });
      progressRow.add_child(this._totalTimeLabel);
    }
  }

  /**
   * Create a control button
   */
  private _createControlButton(iconName: string, onClick: () => void): St.Button {
    const button = new St.Button({
      style_class: 'meowterialyou-media-control-btn',
      can_focus: true,
      style: `
        min-width: 38px;
        min-height: 38px;
        border-radius: 14px;
        background-color: rgba(255, 255, 255, 0.1);
      `,
    });

    const icon = new St.Icon({
      icon_name: iconName,
      icon_size: 18,
    });
    button.set_child(icon);
    button.connect('clicked', onClick);

    return button;
  }

  /**
   * Start media player service
   */
  private _startServices(): void {
    this._mediaPlayer = new MediaPlayer(this._logger);
    this._mediaPlayer.subscribe((state) => this._updateUI(state));
    this._mediaPlayer.start();
  }

  /**
   * Update UI from player state
   */
  private _updateUI(state: PlayerState): void {
    if (this._destroyed) return;

    // Update title/artist
    if (this._titleLabel) {
      this._titleLabel.set_text(state.metadata.title || 'No Media');
    }
    if (this._artistLabel) {
      this._artistLabel.set_text(state.metadata.artist || '');
    }

    // Update play/pause icon
    if (this._playIcon) {
      this._playIcon.set_icon_name(
        state.isPlaying ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic'
      );
    }

    // Update button states
    if (this._prevButton) {
      this._prevButton.reactive = state.canGoPrevious;
      this._prevButton.opacity = state.canGoPrevious ? 255 : 128;
    }
    if (this._nextButton) {
      this._nextButton.reactive = state.canGoNext;
      this._nextButton.opacity = state.canGoNext ? 255 : 128;
    }

    // Update progress
    if (this._progressSlider && !this._isDragging) {
      const length = state.metadata.length;
      if (length > 0) {
        this._progressSlider.value = state.position / length;
      } else {
        this._progressSlider.value = 0;
      }
    }

    // Update time labels
    if (this._currentTimeLabel) {
      this._currentTimeLabel.set_text(this._formatTime(state.position));
    }
    if (this._totalTimeLabel) {
      this._totalTimeLabel.set_text(this._formatTime(state.metadata.length));
    }

    // Update album art
    this._updateAlbumArt(state.metadata.artUrl);
  }

  /**
   * Update album art image
   */
  private _updateAlbumArt(artUrl: string | null): void {
    if (!this._artImage) return;

    if (!artUrl) {
      this._artImage.set_icon_name('audio-x-generic-symbolic');
      this._artImage.set_gicon(null);
      return;
    }

    try {
      // Handle file:// URLs
      let path = artUrl;
      if (artUrl.startsWith('file://')) {
        path = artUrl.substring(7);
      } else if (artUrl.startsWith('http')) {
        // For HTTP URLs, we'd need to download - for now just show generic
        this._artImage.set_icon_name('audio-x-generic-symbolic');
        return;
      }

      const file = Gio.File.new_for_path(path);
      if (file.query_exists(null)) {
        const icon = new Gio.FileIcon({ file });
        this._artImage.set_gicon(icon);
        this._artImage.set_icon_size(100);
      } else {
        this._artImage.set_icon_name('audio-x-generic-symbolic');
      }
    } catch (e) {
      this._logger.error(`Failed to load album art: ${e}`);
      this._artImage.set_icon_name('audio-x-generic-symbolic');
    }
  }

  /**
   * Format microseconds to MM:SS
   */
  private _formatTime(microseconds: number): string {
    if (!microseconds || microseconds < 0) return '0:00';
    const totalSeconds = Math.floor(microseconds / 1000000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  protected _onDestroy(): void {
    if (this._mediaPlayer) {
      this._mediaPlayer.destroy();
      this._mediaPlayer = null;
    }
  }
}
