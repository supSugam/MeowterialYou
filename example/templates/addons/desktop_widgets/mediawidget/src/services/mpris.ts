
import Gio from 'gi://Gio?version=2.0';
import GLib from 'gi://GLib?version=2.0';
import { State } from '../state.js';
import { log } from '../utils.js';

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

export let currentPlayer: any = null;
export let currentBusName: string | null = null;
let currentProps: any = null;

export const setCallbacks = (callbacks: { updateUI: () => void, renderDots: () => void }) => {
    _callbacks = callbacks;
};

let _callbacks = { updateUI: () => {}, renderDots: () => {} };
let pollTimeoutId: number | null = null;

// Internal updateProgress function matching backup pattern
function updateProgress() {
  if (!currentPlayer) return true;

  // Explicit Polling for Metadata/Status to fix "Not Synced"
  // Many players (e.g. Spotify) are lazy with signals.
  try {
    const metadata = currentPlayer.Metadata;
    parseMetadata(metadata);

    const status = currentPlayer.PlaybackStatus;
    State.isPlaying = status === 'Playing';
  } catch (e) {}

  // Position Update
  try {
    const now = GLib.get_monotonic_time();
    if (State.isPlaying) {
      const delta = now - State.lastUpdate;
      State.position += delta;
      State.lastUpdate = now;
    }
    if (State.position > State.length) State.position = State.length;
  } catch (e) {}

  _callbacks.updateUI(); // Keep UI fresh
  return true;
}

export function connectToPlayer(busName: string) {
  currentBusName = busName;
  _callbacks.renderDots();
  log(`Connecting to ${busName}`);
  currentPlayer = new PlayerProxy(
    Gio.DBus.session,
    busName,
    '/org/mpris/MediaPlayer2',
  );
  currentProps = new PropsProxy(
    Gio.DBus.session,
    busName,
    '/org/mpris/MediaPlayer2',
  );

  currentProps.connectSignal(
    'PropertiesChanged',
    (
      proxy: any,
      senderName: string,
      [iface, changed, invalidated]: [string, any, any],
    ) => {
      // Keep signal handler for responsiveness, but rely on Polling for reliability
      if (iface !== 'org.mpris.MediaPlayer2.Player') return;
      const changedUnpacked = changed.deep_unpack
        ? changed.deep_unpack()
        : changed;
      if (changedUnpacked['PlaybackStatus']) {
        State.isPlaying = changedUnpacked['PlaybackStatus'] === 'Playing';
      }
      if (changedUnpacked['Metadata']) {
        parseMetadata(changedUnpacked['Metadata']);
      }
      _callbacks.updateUI();
    },
  );

  // Start polling timeout (matching backup lines 370-375)
  if (!pollTimeoutId) {
    pollTimeoutId = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      1000,
      updateProgress,
    );
  }
}

export function refreshPlayers() {
  Gio.DBus.session.call(
    'org.freedesktop.DBus',
    '/org/freedesktop/DBus',
    'org.freedesktop.DBus',
    'ListNames',
    null,
    null,
    0,
    -1,
    null,
    (obj, res) => {
      try {
        const result = Gio.DBus.session.call_finish(res);
        const [names] = result.deep_unpack();
        const players = names.filter((n: string) =>
          n.startsWith('org.mpris.MediaPlayer2.'),
        );

        State.players = players;
        _callbacks.renderDots();

        // Auto-select logic
        if (players.length > 0) {
          // If current player is gone, or none selected, pick one
          if (!currentBusName || !players.includes(currentBusName)) {
            const spotify = players.find((n: string) => n.includes('spotify'));
            connectToPlayer(spotify || players[0]);
          }
        } else {
          State.title = 'No Player';
          State.artist = 'Idle';
          State.isPlaying = false;
          currentBusName = null;
          currentPlayer = null;
          _callbacks.updateUI();
        }
      } catch (e) {}
    },
  );
}

export function parseMetadata(metadata: any) {
    if (!metadata) return;
    const unpack = (v: any) => {
        if (v && v.deep_unpack) return v.deep_unpack();
        if (v && v.unpack) return v.unpack();
        return v;
    };
    
    let title = "Unknown Title";
    let artist = "Unknown Artist";
    let artUrl = "";
    let length = 0;
    
    if (metadata['xesam:title']) title = unpack(metadata['xesam:title']);
    if (metadata['xesam:artist']) {
        const artists = unpack(metadata['xesam:artist']);
        if (Array.isArray(artists)) artist = artists.join(", ");
        else artist = String(artists);
    }
    if (metadata['mpris:artUrl']) artUrl = unpack(metadata['mpris:artUrl']);
    if (metadata['mpris:length']) length = unpack(metadata['mpris:length']);
    
    let trackId = '';
    if (metadata['mpris:trackid']) trackId = unpack(metadata['mpris:trackid']);

    
    if (typeof title !== 'string') title = String(title);
    if (typeof artist !== 'string') artist = String(artist);
    
    // Only update state if changed (avoids flickering art)
    if (State.title !== title) {
        State.title = title;
        State.artist = artist;
        State.artUrl = artUrl;
        State.length = Number(length) || 0;
        State.trackId = trackId;
        
        // Force Position Sync on track change
        if (currentPlayer && currentBusName) {
             Gio.DBus.session.call(
                currentBusName!, '/org/mpris/MediaPlayer2', 'org.freedesktop.DBus.Properties',
                'Get', new GLib.Variant('(ss)', ['org.mpris.MediaPlayer2.Player', 'Position']),
                null, 0, -1, null,
                (obj, res) => {
                    try {
                        const val = Gio.DBus.session.call_finish(res);
                        const [unpacked] = val.deep_unpack();
                        State.position = unpacked.deep_unpack ? unpacked.deep_unpack() : unpacked;
                        State.lastUpdate = GLib.get_monotonic_time();
                    } catch(e) {}
                }
            );
        }
    }
}

