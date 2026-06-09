/* ----------------------------------------------------------------------------
   A tiny framework-agnostic reactive store.

   Why this exists: alphaTab manages its own DOM inside its container. We never
   reach into that container from UI code. Instead, the score engine pushes
   state into this store, and the UI subscribes to it. This keeps the UI fully
   decoupled from alphaTab (and from any future framework choice).
---------------------------------------------------------------------------- */

export type PlaybackSettings = {
  /** Playback speed multiplier. 1 = original tempo. */
  speed: number;
  metronome: boolean;
  countIn: boolean;
  looping: boolean;
  /** Master output volume, 0..1. */
  masterVolume: number;
  /** Notation zoom, 1 = 100%. */
  zoom: number;
  layout: 'page' | 'horizontal';
};

export type TrackInfo = {
  index: number;
  name: string;
  isPercussion: boolean;
  /** Instrument family id: 'drums' | 'saxophone' | 'pitched'. */
  instrument: string;
  /** Per-track gain multiplier applied on top of the authored volume. */
  volume: number;
  mute: boolean;
  solo: boolean;
  /** Whether this track is currently rendered in the score view. */
  visible: boolean;
};

export type Position = {
  currentTime: number; // ms
  endTime: number; // ms
  currentTick: number;
};

export type AppStatus = 'booting' | 'loading' | 'rendering' | 'ready';

export type AppState = {
  status: AppStatus;
  loadingText: string;
  /** alphaTab + soundfont ready for playback. */
  playerReady: boolean;
  soundFontProgress: number; // 0..1
  isPlaying: boolean;
  position: Position;
  song: { title: string; artist: string } | null;
  tracks: TrackInfo[];
  settings: PlaybackSettings;
};

export const DEFAULT_SETTINGS: PlaybackSettings = {
  speed: 1,
  metronome: false,
  countIn: false,
  looping: false,
  masterVolume: 0.9,
  zoom: 1,
  layout: 'page',
};

export function createInitialState(settings: PlaybackSettings): AppState {
  return {
    status: 'booting',
    loadingText: 'Starting up…',
    playerReady: false,
    soundFontProgress: 0,
    isPlaying: false,
    position: { currentTime: 0, endTime: 0, currentTick: 0 },
    song: null,
    tracks: [],
    settings,
  };
}

type Listener<T> = (state: T) => void;

export class Store<T extends object> {
  private state: T;
  private listeners = new Set<Listener<T>>();

  constructor(initial: T) {
    this.state = initial;
  }

  get(): T {
    return this.state;
  }

  /** Shallow-merge a patch (or the result of a patch fn) and notify. */
  set(patch: Partial<T> | ((s: T) => Partial<T>)): void {
    const next = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = { ...this.state, ...next };
    this.emit();
  }

  /** Mutate-in-place helper for nested updates, then notify. */
  update(mutator: (s: T) => void): void {
    mutator(this.state);
    this.state = { ...this.state };
    this.emit();
  }

  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    // Snapshot first: a listener may subscribe/unsubscribe (mutating the Set)
    // while we notify, which would otherwise skip or double-fire listeners.
    for (const l of [...this.listeners]) l(this.state);
  }
}

export type AppStore = Store<AppState>;
