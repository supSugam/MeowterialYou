/**
 * MediaPlayer - MPRIS D-Bus integration for media player control
 * Adapted from reference extension
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import { loadInterfaceXML } from 'resource:///org/gnome/shell/misc/fileUtils.js';
import { Logger } from '../utils/logger.js';

const MPRIS_PLAYER_PREFIX = 'org.mpris.MediaPlayer2.';

export interface MediaMetadata {
  title: string;
  artist: string;
  album: string;
  artUrl: string | null;
  length: number;
  trackId: string;
}

export interface PlayerState {
  isPlaying: boolean;
  canPlay: boolean;
  canPause: boolean;
  canGoNext: boolean;
  canGoPrevious: boolean;
  canSeek: boolean;
  position: number;
  metadata: MediaMetadata;
}

type PlayerCallback = (state: PlayerState) => void;

// D-Bus interface definitions
const MPRIS_PLAYER_INTERFACE = `
<node>
  <interface name="org.mpris.MediaPlayer2.Player">
    <method name="PlayPause"/>
    <method name="Next"/>
    <method name="Previous"/>
    <method name="Play"/>
    <method name="Pause"/>
    <method name="SetPosition">
      <arg type="o" name="TrackId" direction="in"/>
      <arg type="x" name="Position" direction="in"/>
    </method>
    <property name="PlaybackStatus" type="s" access="read"/>
    <property name="Metadata" type="a{sv}" access="read"/>
    <property name="Position" type="x" access="read"/>
    <property name="CanGoNext" type="b" access="read"/>
    <property name="CanGoPrevious" type="b" access="read"/>
    <property name="CanPlay" type="b" access="read"/>
    <property name="CanPause" type="b" access="read"/>
    <property name="CanSeek" type="b" access="read"/>
  </interface>
</node>`;

const PROPS_INTERFACE = `
<node>
  <interface name="org.freedesktop.DBus.Properties">
    <method name="Get">
      <arg type="s" name="interface_name" direction="in"/>
      <arg type="s" name="property_name" direction="in"/>
      <arg type="v" name="value" direction="out"/>
    </method>
    <signal name="PropertiesChanged">
      <arg type="s" name="interface_name"/>
      <arg type="a{sv}" name="changed_properties"/>
      <arg type="as" name="invalidated_properties"/>
    </signal>
  </interface>
</node>`;

const PlayerProxy = Gio.DBusProxy.makeProxyWrapper(MPRIS_PLAYER_INTERFACE);
const PropsProxy = Gio.DBusProxy.makeProxyWrapper(PROPS_INTERFACE);

// D-Bus interface for listing names
const DBusIface = loadInterfaceXML('org.freedesktop.DBus');
const DBusProxy = Gio.DBusProxy.makeProxyWrapper(DBusIface);

export class MediaPlayer {
  private _logger: Logger;
  private _callbacks: Set<PlayerCallback> = new Set();
  private _dbusProxy: any = null;
  private _playerProxy: any = null;
  private _propsProxy: any = null;
  private _currentBusName: string | null = null;
  private _pollTimeoutId: number | null = null;
  private _signalIds: number[] = [];
  private _lastPosition: number = 0;
  private _lastUpdate: number = 0;

  private _currentState: PlayerState = {
    isPlaying: false,
    canPlay: false,
    canPause: false,
    canGoNext: false,
    canGoPrevious: false,
    canSeek: false,
    position: 0,
    metadata: {
      title: 'No Media',
      artist: '',
      album: '',
      artUrl: null,
      length: 0,
      trackId: '',
    },
  };

  constructor(logger: Logger) {
    this._logger = logger;
  }

  /**
   * Subscribe to player state updates
   */
  subscribe(callback: PlayerCallback): void {
    this._callbacks.add(callback);
    callback(this._currentState);
  }

  /**
   * Unsubscribe from updates
   */
  unsubscribe(callback: PlayerCallback): void {
    this._callbacks.delete(callback);
  }

  /**
   * Start listening for media players
   */
  start(): void {
    try {
      const ProxyClass = DBusProxy as any;
      this._dbusProxy = new ProxyClass(
        Gio.DBus.session,
        'org.freedesktop.DBus',
        '/org/freedesktop/DBus',
        this._onDBusReady.bind(this)
      );
    } catch (e) {
      this._logger.error(`Failed to create DBus proxy: ${e}`);
    }
  }

  /**
   * DBus proxy ready callback
   */
  private async _onDBusReady(): Promise<void> {
    try {
      // Connect to name owner changed signal
      this._dbusProxy.connectSignal(
        'NameOwnerChanged',
        this._onNameOwnerChanged.bind(this)
      );

      // List existing players
      const [names] = await this._dbusProxy.ListNamesAsync();
      const players = names.filter((n: string) => n.startsWith(MPRIS_PLAYER_PREFIX));

      if (players.length > 0) {
        // Prefer Spotify if available
        const spotify = players.find((n: string) => n.includes('spotify'));
        this._connectToPlayer(spotify || players[0]);
      }
    } catch (e) {
      this._logger.error(`Failed to list players: ${e}`);
    }
  }

  /**
   * Handle player appearing/disappearing
   */
  private _onNameOwnerChanged(
    _proxy: any,
    _sender: string,
    [name, oldOwner, newOwner]: [string, string, string]
  ): void {
    if (!name.startsWith(MPRIS_PLAYER_PREFIX)) return;

    if (oldOwner && name === this._currentBusName) {
      // Current player disappeared
      this._disconnectPlayer();
      this._resetState();
      this._refreshPlayers();
    }

    if (newOwner && !this._currentBusName) {
      // New player appeared and we have none
      this._connectToPlayer(name);
    }
  }

  /**
   * Refresh player list
   */
  private async _refreshPlayers(): Promise<void> {
    if (!this._dbusProxy) return;

    try {
      const [names] = await this._dbusProxy.ListNamesAsync();
      const players = names.filter((n: string) => n.startsWith(MPRIS_PLAYER_PREFIX));

      if (players.length > 0 && !this._currentBusName) {
        const spotify = players.find((n: string) => n.includes('spotify'));
        this._connectToPlayer(spotify || players[0]);
      }
    } catch (e) {
      this._logger.error(`Failed to refresh players: ${e}`);
    }
  }

  /**
   * Connect to a specific player
   */
  private _connectToPlayer(busName: string): void {
    this._disconnectPlayer();
    this._currentBusName = busName;
    this._logger.info(`Connecting to player: ${busName}`);

    try {
      const PlayerProxyClass = PlayerProxy as any;
      this._playerProxy = new PlayerProxyClass(
        Gio.DBus.session,
        busName,
        '/org/mpris/MediaPlayer2'
      );

      const PropsProxyClass = PropsProxy as any;
      this._propsProxy = new PropsProxyClass(
        Gio.DBus.session,
        busName,
        '/org/mpris/MediaPlayer2'
      );

      // Connect to properties changed signal
      const signalId = this._propsProxy.connectSignal(
        'PropertiesChanged',
        this._onPropertiesChanged.bind(this)
      );
      this._signalIds.push(signalId);

      // Start position polling
      this._startPolling();

      // Initial update
      this._update();
    } catch (e) {
      this._logger.error(`Failed to connect to player: ${e}`);
      this._currentBusName = null;
    }
  }

  /**
   * Disconnect from current player
   */
  private _disconnectPlayer(): void {
    this._stopPolling();

    if (this._propsProxy) {
      for (const signalId of this._signalIds) {
        this._propsProxy.disconnectSignal(signalId);
      }
      this._signalIds = [];
      this._propsProxy = null;
    }

    this._playerProxy = null;
    this._currentBusName = null;
  }

  /**
   * Start position polling
   */
  private _startPolling(): void {
    this._stopPolling();
    this._lastUpdate = GLib.get_monotonic_time();

    this._pollTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
      this._updatePosition();
      return GLib.SOURCE_CONTINUE;
    });
  }

  /**
   * Stop position polling
   */
  private _stopPolling(): void {
    if (this._pollTimeoutId) {
      GLib.source_remove(this._pollTimeoutId);
      this._pollTimeoutId = null;
    }
  }

  /**
   * Handle properties changed signal
   */
  private _onPropertiesChanged(
    _proxy: any,
    _sender: string,
    [iface, changed]: [string, any, any]
  ): void {
    if (iface !== 'org.mpris.MediaPlayer2.Player') return;
    this._update();
  }

  /**
   * Update position (called by polling)
   */
  private _updatePosition(): void {
    if (!this._playerProxy) return;

    try {
      const now = GLib.get_monotonic_time();

      if (this._currentState.isPlaying) {
        const delta = now - this._lastUpdate;
        this._lastPosition += delta;
        this._lastUpdate = now;

        // Clamp to track length
        const length = this._currentState.metadata.length;
        if (length > 0 && this._lastPosition > length) {
          this._lastPosition = length;
        }

        this._currentState.position = this._lastPosition;
        this._notifyCallbacks();
      }
    } catch (e) {
      // Silently ignore position update errors
    }
  }

  /**
   * Update player state
   */
  private _update(): void {
    if (!this._playerProxy) return;

    try {
      // Get playback status
      const status = this._playerProxy.PlaybackStatus;
      this._currentState.isPlaying = status === 'Playing';

      // Get capabilities
      this._currentState.canPlay = this._playerProxy.CanPlay ?? false;
      this._currentState.canPause = this._playerProxy.CanPause ?? false;
      this._currentState.canGoNext = this._playerProxy.CanGoNext ?? false;
      this._currentState.canGoPrevious = this._playerProxy.CanGoPrevious ?? false;
      this._currentState.canSeek = this._playerProxy.CanSeek ?? false;

      // Parse metadata
      this._parseMetadata(this._playerProxy.Metadata);

      // Sync position on track change or status change
      this._syncPosition();

      this._notifyCallbacks();
    } catch (e) {
      this._logger.error(`Failed to update player state: ${e}`);
    }
  }

  /**
   * Parse metadata dictionary
   */
  private _parseMetadata(metadata: any): void {
    if (!metadata) {
      this._currentState.metadata = {
        title: 'Unknown',
        artist: '',
        album: '',
        artUrl: null,
        length: 0,
        trackId: '',
      };
      return;
    }

    const unpack = (v: any) => {
      if (v?.deep_unpack) return v.deep_unpack();
      if (v?.unpack) return v.unpack();
      return v;
    };

    let title = unpack(metadata['xesam:title']);
    if (typeof title !== 'string') title = 'Unknown';

    let artists = unpack(metadata['xesam:artist']);
    let artist = '';
    if (Array.isArray(artists)) {
      artist = artists.join(', ');
    } else if (typeof artists === 'string') {
      artist = artists;
    }

    let album = unpack(metadata['xesam:album']);
    if (typeof album !== 'string') album = '';

    let artUrl = unpack(metadata['mpris:artUrl']);
    if (typeof artUrl !== 'string') artUrl = null;

    let length = unpack(metadata['mpris:length']);
    if (typeof length !== 'number') length = 0;

    let trackId = unpack(metadata['mpris:trackid']);
    if (typeof trackId !== 'string') trackId = '';

    this._currentState.metadata = { title, artist, album, artUrl, length, trackId };
  }

  /**
   * Sync position from player
   */
  private async _syncPosition(): Promise<void> {
    if (!this._currentBusName) return;

    try {
      const result = await Gio.DBus.session.call(
        this._currentBusName,
        '/org/mpris/MediaPlayer2',
        'org.freedesktop.DBus.Properties',
        'Get',
        new GLib.Variant('(ss)', ['org.mpris.MediaPlayer2.Player', 'Position']),
        null,
        Gio.DBusCallFlags.NONE,
        -1,
        null
      );

      const [variant] = result.deep_unpack() as [any];
      this._lastPosition = variant.deep_unpack ? variant.deep_unpack() : variant;
      this._lastUpdate = GLib.get_monotonic_time();
      this._currentState.position = this._lastPosition;
    } catch (e) {
      // Position not available
    }
  }

  /**
   * Notify all callbacks
   */
  private _notifyCallbacks(): void {
    for (const callback of this._callbacks) {
      try {
        callback({ ...this._currentState });
      } catch (e) {
        this._logger.error(`Player callback error: ${e}`);
      }
    }
  }

  /**
   * Reset state to default
   */
  private _resetState(): void {
    this._currentState = {
      isPlaying: false,
      canPlay: false,
      canPause: false,
      canGoNext: false,
      canGoPrevious: false,
      canSeek: false,
      position: 0,
      metadata: {
        title: 'No Media',
        artist: '',
        album: '',
        artUrl: null,
        length: 0,
        trackId: '',
      },
    };
    this._notifyCallbacks();
  }

  // === Control Methods ===

  playPause(): void {
    if (this._playerProxy) {
      this._playerProxy.PlayPauseRemote();
    }
  }

  next(): void {
    if (this._playerProxy) {
      this._playerProxy.NextRemote();
    }
  }

  previous(): void {
    if (this._playerProxy) {
      this._playerProxy.PreviousRemote();
    }
  }

  seek(position: number): void {
    if (this._playerProxy && this._currentState.canSeek) {
      const trackId = this._currentState.metadata.trackId;
      if (trackId) {
        this._playerProxy.SetPositionRemote(trackId, position);
        this._lastPosition = position;
        this._currentState.position = position;
        this._notifyCallbacks();
      }
    }
  }

  /**
   * Get current state
   */
  getState(): PlayerState {
    return { ...this._currentState };
  }

  /**
   * Destroy the service
   */
  destroy(): void {
    this._disconnectPlayer();
    this._callbacks.clear();
    this._dbusProxy = null;
  }
}
