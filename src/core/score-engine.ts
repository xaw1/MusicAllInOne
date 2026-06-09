/* ----------------------------------------------------------------------------
   ScoreEngine — the single wrapper around alphaTab's AlphaTabApi.

   ARCHITECTURE RULE (see CLAUDE.md §3): alphaTab's `Score` object is the single
   source of truth. Everything flows through ONE pipeline:

       load/create Score -> render (SVG) -> generate MIDI -> play -> overlays

   Stage 1 fills the Score by *importing* a file. Stage 2 will fill the *same*
   Score via keypresses (through score-commands.ts). Both feed this identical
   render/play pipeline, so the editor can never break play-along.

   The engine owns the alphaTab instance and pushes state into the store. UI
   code talks to this engine and reads the store — never to alphaTab directly.
---------------------------------------------------------------------------- */

import * as alphaTab from '@coderline/alphatab';
import type { AppStore, PlaybackSettings, TrackInfo } from './store';
import type { DrumColorSettings } from './colors';
import { noteDrumMidi, noteDrumVoice } from './drums';
import { detectInstrument } from './instrument/detect';

/** A single drum hit's expressive detail, for the visualisation. */
export interface DrumHit {
  midi: number;
  tick: number; // absolutePlaybackStart — used to look up the AI sticking
  ghost: boolean;
  accent: boolean;
  velocity: number; // 0..1 (from the note's dynamics)
}

/** What's sounding right now plus a peek at the next beat (for the telegraph). */
export interface ActiveDrums {
  hits: DrumHit[];
  next: number[]; // MIDI numbers of the next beat's drums
}

// The alphaTab Vite plugin copies these assets to fixed locations at build time.
const FONT_DIR = '/font/';
const SOUND_FONT = '/soundfont/sonivox.sf2';

function isPercussionTrack(track: any): boolean {
  const pi = track?.playbackInfo;
  const channelIsDrums =
    !!pi && (pi.primaryChannel === 9 || pi.secondaryChannel === 9);
  const nameLooksDrummy = /drum|perc|kit|schlag|bater/i.test(track?.name ?? '');
  return channelIsDrums || nameLooksDrummy;
}

export class ScoreEngine {
  readonly api: alphaTab.AlphaTabApi;
  private store: AppStore;
  private readonly pendingSettings: PlaybackSettings;
  private drumColors: DrumColorSettings;
  private activeDrumListeners = new Set<(info: ActiveDrums) => void>();
  private activeTrackListeners = new Set<(indices: Set<number>) => void>();
  private scoreListeners = new Set<(score: any) => void>();
  // Playhead clock anchored to the actually-sounding beat (activeBeatsChanged),
  // in the SAME tick space as the timeline (beat.absolutePlaybackStart), so the
  // highway can't drift even through repeats/jumps. Interpolated between beats.
  private anchorTick = 0;
  private anchorWall = 0;
  private anchorRate = 0; // song ticks per wall ms, measured between anchors
  private playing = false;

  constructor(
    mainEl: HTMLElement,
    viewportEl: HTMLElement,
    store: AppStore,
    settings: PlaybackSettings,
    drumColors: DrumColorSettings,
  ) {
    this.store = store;
    this.pendingSettings = settings;
    this.drumColors = drumColors;

    const atSettings = {
      core: {
        engine: 'svg', // SVG so we can position overlays from beat bounds (Stage 2/3/5)
        fontDirectory: FONT_DIR,
        logLevel: 1, // warnings + errors only
      },
      display: {
        layoutMode:
          settings.layout === 'horizontal'
            ? alphaTab.LayoutMode.Horizontal
            : alphaTab.LayoutMode.Page,
        scale: settings.zoom,
      },
      player: {
        enablePlayer: true,
        enableCursor: true,
        enableUserInteraction: true, // click-a-bar to seek + drag to select a loop range
        soundFont: SOUND_FONT,
        scrollElement: viewportEl,
      },
    };

    this.api = new alphaTab.AlphaTabApi(mainEl, atSettings as any);
    this.wireEvents();
  }

  /** Apply persisted playback settings. Called once the synth is ready —
   *  setting these before the player initialises can throw. */
  private applyPendingSettings(): void {
    const ps = this.pendingSettings;
    this.api.playbackSpeed = ps.speed;
    this.api.metronomeVolume = ps.metronome ? 1 : 0;
    this.api.countInVolume = ps.countIn ? 1 : 0;
    this.api.isLooping = ps.looping;
    this.api.masterVolume = ps.masterVolume;
  }

  // ---------------------------------------------------------------- events
  private wireEvents(): void {
    const { api, store } = this;

    api.renderStarted.on(() => {
      store.set({ status: 'rendering' });
    });
    api.renderFinished.on(() => {
      store.set({ status: 'ready' });
      // NOTE (Stage 3/5): overlay positions are invalidated on every render.
      // Recompute sticking letters / cursors here once the overlay layer exists.
    });

    api.scoreLoaded.on((score: any) => this.onScoreLoaded(score));

    api.soundFontLoad.on((e: any) => {
      const progress = e && e.total ? e.loaded / e.total : 0;
      store.set({ soundFontProgress: progress });
    });
    api.playerReady.on(() => {
      this.applyPendingSettings();
      store.set({ playerReady: true, loadingText: '' });
    });

    api.playerStateChanged.on((e: any) => {
      const playing = e.state === alphaTab.synth.PlayerState.Playing;
      this.playing = playing;
      if (playing) this.anchorWall = performance.now(); // avoid a stale extrapolation gap
      store.set({ isPlaying: playing });
      if (!playing) this.emitActiveTracks(new Set()); // clear "now playing" dots
    });
    api.playerPositionChanged.on((e: any) => {
      store.set({
        position: {
          currentTime: e.currentTime,
          endTime: e.endTime,
          currentTick: e.currentTick,
        },
      });
    });

    // Which drums are sounding right now (across ALL tracks, rendered or not).
    // Drives the live drum-kit visualisation.
    const activeBeats = (api as any).activeBeatsChanged;
    if (activeBeats && typeof activeBeats.on === 'function') {
      activeBeats.on((args: any) => this.onActiveBeats(args));
    }

    // Surface load failures (e.g. unsupported / corrupt file) to the user.
    // Guarded: the `error` event exists on AlphaTabApi, but guarding keeps init
    // safe across alphaTab versions.
    const errorEvent = (api as any).error;
    if (errorEvent && typeof errorEvent.on === 'function') {
      errorEvent.on((error: any) => {
        console.error('[alphaTab] error', error);
        store.set({ status: 'ready', loadingText: '' });
      });
    }
  }

  private onScoreLoaded(score: any): void {
    const tracks: TrackInfo[] = (score.tracks as any[]).map((t) => ({
      index: t.index,
      name: t.name && t.name.trim() ? t.name : `Track ${t.index + 1}`,
      isPercussion: isPercussionTrack(t),
      instrument: detectInstrument(t).id,
      volume: 1,
      mute: false,
      solo: false,
      visible: false,
    }));

    // Default the SHEET to drums only — the band still PLAYS in full (alphaTab
    // plays every track regardless of which are rendered). If the file has no
    // percussion track, fall back to showing everything.
    const percussion = tracks.filter((t) => t.isPercussion);
    const showAll = percussion.length === 0;
    for (const t of tracks) t.visible = showAll || t.isPercussion;
    const toRender = (showAll ? tracks : percussion).map(
      (t) => score.tracks[t.index],
    );

    // Colour the drum noteheads before the first render so they come up coloured.
    this.applyDrumColorsToScore(score);

    this.api.renderTracks(toRender);

    this.store.set({
      song: { title: score.title || 'Untitled', artist: score.artist || '' },
      tracks,
      status: 'rendering',
    });

    for (const cb of this.scoreListeners) cb(score);
  }

  /** Subscribe to raw score loads (for building the drum timeline). */
  onScore(cb: (score: any) => void): () => void {
    this.scoreListeners.add(cb);
    if (this.api.score) cb(this.api.score); // catch up if already loaded
    return () => this.scoreListeners.delete(cb);
  }

  /** Live playhead in MIDI ticks, anchored to the latest sounding beat and
   *  interpolated between beats. Same tick space as the timeline → no drift. */
  get currentTick(): number {
    if (!this.playing) return this.anchorTick;
    const dt = Math.min(800, performance.now() - this.anchorWall);
    return this.anchorTick + (this.anchorRate > 0 ? this.anchorRate * dt : 0);
  }

  // ---------------------------------------------------------------- drum colours
  /** Update the colour scheme, re-apply to the current score and re-render. */
  setDrumColors(settings: DrumColorSettings): void {
    this.drumColors = settings;
    const score = this.api.score;
    if (score) {
      this.applyDrumColorsToScore(score);
      this.api.render();
    }
  }

  /** Walk the score and colour (or clear) percussion noteheads by drum voice. */
  private applyDrumColorsToScore(score: any): void {
    const { enabled, colors } = this.drumColors;
    const NoteStyle = (alphaTab as any).model.NoteStyle;
    const NoteSubElement = (alphaTab as any).model.NoteSubElement;
    const Color = (alphaTab as any).model.Color;

    for (const track of score.tracks) {
      for (const staff of track.staves) {
        for (const bar of staff.bars) {
          for (const voice of bar.voices) {
            for (const beat of voice.beats) {
              for (const note of beat.notes) {
                if (!note.isPercussion) continue;
                if (!enabled) {
                  note.style = undefined; // revert to default (black)
                  continue;
                }
                const voiceName = noteDrumVoice(note, track);
                const hex = colors[voiceName];
                const style = new NoteStyle();
                style.colors.set(
                  NoteSubElement.StandardNotationNoteHead,
                  Color.fromJson(hex),
                );
                note.style = style;
              }
            }
          }
        }
      }
    }
  }

  getDrumColors(): DrumColorSettings {
    return this.drumColors;
  }

  // ---------------------------------------------------------------- live drums
  /** Subscribe to the drums currently sounding (with dynamics) + the next beat. */
  onActiveDrums(cb: (info: ActiveDrums) => void): () => void {
    this.activeDrumListeners.add(cb);
    return () => this.activeDrumListeners.delete(cb);
  }

  /** Subscribe to the set of track indexes currently sounding (any instrument). */
  onActiveTracks(cb: (indices: Set<number>) => void): () => void {
    this.activeTrackListeners.add(cb);
    return () => this.activeTrackListeners.delete(cb);
  }

  private emitActiveTracks(indices: Set<number>): void {
    for (const cb of this.activeTrackListeners) cb(indices);
  }

  private onActiveBeats(args: any): void {
    const hits: DrumHit[] = [];
    const trackIndices = new Set<number>();
    let nextBeat: any = null;
    let maxStart = -1;
    const beats: any[] = args?.activeBeats ?? [];

    for (const beat of beats) {
      const s = beat?.absolutePlaybackStart;
      if (typeof s === 'number' && s > maxStart) maxStart = s;
      const track = beat?.voice?.bar?.staff?.track;
      if (track && typeof track.index === 'number') trackIndices.add(track.index);
      let beatHadPercussion = false;
      for (const note of beat?.notes ?? []) {
        if (!note?.isPercussion) continue;
        beatHadPercussion = true;
        hits.push({
          midi: noteDrumMidi(note, track),
          tick: beat.absolutePlaybackStart,
          ghost: !!note.isGhost,
          accent: !!note.accentuated, // AccentuationType.None === 0 -> falsy
          velocity:
            typeof note.dynamics === 'number'
              ? Math.max(0, Math.min(1, note.dynamics / 7))
              : 0.6,
        });
      }
      // Peek the next beat of the first sounding drum beat (for the telegraph).
      if (beatHadPercussion && !nextBeat) nextBeat = beat.nextBeat ?? null;
    }

    const next: number[] = [];
    if (nextBeat) {
      const nTrack = nextBeat?.voice?.bar?.staff?.track;
      for (const note of nextBeat?.notes ?? []) {
        if (note?.isPercussion) next.push(noteDrumMidi(note, nTrack));
      }
    }

    // Re-anchor the playhead clock to the latest sounding beat.
    if (maxStart >= 0) {
      const wall = performance.now();
      if (this.anchorWall > 0 && maxStart > this.anchorTick) {
        const dW = wall - this.anchorWall;
        const dT = maxStart - this.anchorTick;
        if (dW > 4 && dW < 2000) {
          const inst = dT / dW;
          this.anchorRate = this.anchorRate > 0 ? this.anchorRate * 0.5 + inst * 0.5 : inst;
        }
      }
      this.anchorTick = maxStart;
      this.anchorWall = wall;
    }

    for (const cb of this.activeDrumListeners) cb({ hits, next });
    this.emitActiveTracks(trackIndices);
  }

  // ---------------------------------------------------------------- loading
  /** Load a binary score (Guitar Pro / MusicXML / Capella). Returns false if
   *  alphaTab could not recognise the format. */
  loadBytes(bytes: ArrayBuffer | Uint8Array): boolean {
    this.store.set({ status: 'loading', loadingText: 'Loading song…' });
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    try {
      return this.api.load(data);
    } catch (err) {
      console.error('[DrumScore] failed to load file', err);
      this.store.set({ status: 'ready' });
      return false;
    }
  }

  /** Load from alphaTex (used for the bundled demo; Stage 2 will lean on this). */
  loadTex(tex: string): void {
    this.store.set({ status: 'loading', loadingText: 'Loading…' });
    this.api.tex(tex);
  }

  // ---------------------------------------------------------------- transport
  playPause(): void {
    this.api.playPause();
  }
  stop(): void {
    this.api.stop();
  }
  setSpeed(speed: number): void {
    this.api.playbackSpeed = speed;
  }
  setMetronome(on: boolean): void {
    this.api.metronomeVolume = on ? 1 : 0;
  }
  setCountIn(on: boolean): void {
    this.api.countInVolume = on ? 1 : 0;
  }
  setLooping(on: boolean): void {
    this.api.isLooping = on;
  }
  setMasterVolume(v: number): void {
    this.api.masterVolume = v;
  }
  print(): void {
    this.api.print(undefined as any);
  }

  // ---------------------------------------------------------------- display
  setZoom(zoom: number): void {
    this.api.settings.display.scale = zoom;
    this.api.updateSettings();
    this.api.render();
  }
  setLayout(layout: 'page' | 'horizontal'): void {
    this.api.settings.display.layoutMode =
      layout === 'horizontal'
        ? alphaTab.LayoutMode.Horizontal
        : alphaTab.LayoutMode.Page;
    this.api.updateSettings();
    this.api.render();
  }

  /** Re-render the given track indexes (controls what is *displayed*). */
  setVisibleTracks(indexes: number[]): void {
    const score = this.api.score;
    if (!score) return;
    const tracks = indexes
      .map((i) => score.tracks[i])
      .filter((t): t is NonNullable<typeof t> => !!t);
    if (tracks.length === 0) return; // never render an empty score
    this.api.renderTracks(tracks);
  }

  // ---------------------------------------------------------------- mixer
  private trackAt(index: number): any | null {
    return this.api.score?.tracks[index] ?? null;
  }
  setTrackVolume(index: number, volume: number): void {
    const t = this.trackAt(index);
    if (t) this.api.changeTrackVolume([t], volume);
  }
  setTrackMute(index: number, mute: boolean): void {
    const t = this.trackAt(index);
    if (t) this.api.changeTrackMute([t], mute);
  }
  setTrackSolo(index: number, solo: boolean): void {
    const t = this.trackAt(index);
    if (t) this.api.changeTrackSolo([t], solo);
  }
}
