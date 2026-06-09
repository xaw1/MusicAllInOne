/* ----------------------------------------------------------------------------
   Live score follower (Stage 5).

   Binds the microphone to the score: mic → pitch detection (with the focused
   track's EXPECTED note used as an octave prior, which collapses the saxophone's
   dominant octave-error failure) → the pure grading core (follower.ts) → per-note
   good / close / bad verdicts, timed against the live playhead.

   Pitch detection hears SOUNDING (concert) pitch, so it is graded against each
   note's PlayEvent.sounding — the transposition keystone. (Fingering, elsewhere,
   keys off the WRITTEN note; the two never mix.)
---------------------------------------------------------------------------- */

import type { ScoreEngine } from './score-engine';
import type { PlayEvent } from './instrument/types';
import { PitchEngine, type Detection } from '../audio/pitch-engine';
import { Follower, type NoteTarget, type NoteResult, type Verdict } from './follower';
import { snapToExpectedOctave, hzToReading, midiToHz } from '../audio/pitch';

export type VerdictKind = 'good' | 'close' | 'bad';

/** Collapse the fine-grained verdict into the three feedback colours. */
export function verdictKind(v: Verdict): VerdictKind | null {
  if (v === 'good') return 'good';
  if (v === 'sharp' || v === 'flat' || v === 'late' || v === 'early') return 'close';
  if (v === 'wrong' || v === 'missed') return 'bad';
  return null; // pending
}

/** Forgiving → strict grading bands (cents for pitch, ms for onset), SmartMusic-style. */
export const FOLLOW_PRESETS = {
  easy: { centsGood: 35, centsClose: 70, onsetWindowMs: 220 },
  average: { centsGood: 25, centsClose: 50, onsetWindowMs: 150 },
  strict: { centsGood: 12, centsClose: 30, onsetWindowMs: 90 },
} as const;
export type FollowTolerance = keyof typeof FOLLOW_PRESETS;

type ResolveCb = (result: NoteResult, kind: VerdictKind) => void;

export class FollowEngine {
  readonly pitch = new PitchEngine();
  private readonly follower = new Follower();
  private timeline: PlayEvent[] = [];
  private running = false;
  private readonly resolved = new Set<number>();
  private readonly verdicts = new Map<number, Verdict>();
  private readonly resolveCbs = new Set<ResolveCb>();

  constructor(private readonly engine: ScoreEngine) {
    this.pitch.subscribe((d) => this.onDetection(d));
  }

  get active(): boolean { return this.running; }

  /** The focused melodic track's notes become the grading targets. */
  setTimeline(tl: PlayEvent[]): void {
    this.timeline = tl;
    const targets: NoteTarget[] = tl.map((ev, i) => ({ id: i, midi: ev.sounding, onsetMs: ev.timeMs }));
    this.follower.setTargets(targets);
    this.verdicts.clear();
    this.resolved.clear();
  }

  /** Apply an Easy/Average/Strict grading preset. */
  setTolerance(t: FollowTolerance): void {
    this.follower.setConfig(FOLLOW_PRESETS[t]);
  }

  onResolve(cb: ResolveCb): () => void {
    this.resolveCbs.add(cb);
    return () => this.resolveCbs.delete(cb);
  }

  /** Verdict for a timeline event index (for tinting), or undefined if unresolved. */
  verdictFor(eventIndex: number): Verdict | undefined {
    return this.verdicts.get(eventIndex);
  }

  /** Coarse good/close/bad for a timeline event index (for highway tinting), or null. */
  verdictKindFor(eventIndex: number): VerdictKind | null {
    const v = this.verdicts.get(eventIndex);
    return v ? verdictKind(v) : null;
  }

  summary(): { good: number; close: number; bad: number; total: number } {
    return this.follower.summary();
  }

  async start(): Promise<void> {
    this.follower.reset();
    this.verdicts.clear();
    this.resolved.clear();
    await this.pitch.startMic();
    this.running = true;
  }

  stop(): void {
    this.running = false;
    this.pitch.stop();
  }

  // ------------------------------------------------------------------ internals

  /** Map a playhead tick to song-ms by interpolating the timeline's (tick, timeMs). */
  private tickToMs(tick: number): number {
    const tl = this.timeline;
    if (tl.length === 0) return 0;
    if (tick <= tl[0].tick) return tl[0].timeMs;
    // first event at/after tick
    let lo = 0;
    let hi = tl.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (tl[m].tick < tick) lo = m + 1;
      else hi = m;
    }
    if (lo >= tl.length) {
      // extrapolate past the end at the last local rate
      const a = tl[tl.length - 2] ?? tl[tl.length - 1];
      const b = tl[tl.length - 1];
      const span = b.tick - a.tick;
      const rate = span > 0 ? (b.timeMs - a.timeMs) / span : 0;
      return b.timeMs + rate * (tick - b.tick);
    }
    const b = tl[lo];
    const a = tl[lo - 1] ?? b;
    const span = b.tick - a.tick;
    if (span <= 0) return b.timeMs;
    return a.timeMs + ((tick - a.tick) / span) * (b.timeMs - a.timeMs);
  }

  /** The note whose onset is nearest the playhead — the currently expected pitch. */
  private expectedSoundingHz(nowMs: number): number | null {
    const tl = this.timeline;
    if (tl.length === 0) return null;
    let lo = 0;
    let hi = tl.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (tl[m].timeMs < nowMs) lo = m + 1;
      else hi = m;
    }
    const next = lo < tl.length ? lo : tl.length - 1;
    const prev = next > 0 ? next - 1 : next;
    const pick =
      Math.abs(tl[prev].timeMs - nowMs) <= Math.abs(tl[next].timeMs - nowMs) ? prev : next;
    return midiToHz(tl[pick].sounding);
  }

  private onDetection(d: Detection | null): void {
    if (!this.running || this.timeline.length === 0) return;
    const nowMs = this.tickToMs(this.engine.currentTick);

    let sample: { midi: number | null; cents: number; timeMs: number };
    if (d) {
      const expectedHz = this.expectedSoundingHz(nowMs);
      const hz = expectedHz ? snapToExpectedOctave(d.hz, expectedHz) : d.hz;
      const r = hzToReading(hz);
      sample = r
        ? { midi: r.midi, cents: r.cents, timeMs: nowMs }
        : { midi: null, cents: 0, timeMs: nowMs };
    } else {
      sample = { midi: null, cents: 0, timeMs: nowMs };
    }

    this.follower.feed(sample);
    this.follower.advance(nowMs);

    // Emit each note once, when it resolves from 'pending'.
    for (const res of this.follower.results()) {
      if (res.verdict === 'pending' || this.resolved.has(res.id)) continue;
      const kind = verdictKind(res.verdict);
      if (!kind) continue;
      this.resolved.add(res.id);
      this.verdicts.set(res.id, res.verdict);
      for (const cb of this.resolveCbs) cb(res, kind);
    }
  }
}
