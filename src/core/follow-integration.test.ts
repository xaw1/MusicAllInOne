/* ----------------------------------------------------------------------------
   Stage 5 — synth-in-the-loop integration test (Tier 2 of the no-instrument
   validation plan in docs/research/stage5/).

   This exercises the FULL live grading chain — synthesized audio → real MPM
   detector → expected-note octave prior → grading core — on harmonic-rich
   sawtooth tones (a reed-like timbre, far more demanding than the pure sines the
   unit tests use). It mirrors FollowEngine.onDetection() exactly, so a passing
   run proves the whole follower works end-to-end with NO real saxophone, and
   that injected pitch/timing/note errors are flagged correctly.
---------------------------------------------------------------------------- */

import { describe, it, expect } from 'vitest';
import { detectPitch } from '../audio/mpm';
import { snapToExpectedOctave, hzToReading, midiToHz } from '../audio/pitch';
import { gradePerformance, type NoteTarget, type Sample } from './follower';
import { FOLLOW_PRESETS } from './follow-engine';

const SR = 44100;

interface Note {
  midi: number;        // concert pitch
  onsetMs: number;
  durMs: number;
  centsOff?: number;   // intonation error to inject
  octaveShift?: number; // play it N octaves off (a real wrong-octave performance)
  harmonics?: number[]; // amplitude per harmonic (default = sawtooth-ish reed)
}

const SAW = [1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6];

/** Render a monophonic performance to mono PCM (Float32, −1..1). */
function render(notes: Note[]): Float32Array {
  const totalMs = Math.max(...notes.map((n) => n.onsetMs + n.durMs)) + 120;
  const len = Math.ceil((totalMs / 1000) * SR);
  const buf = new Float32Array(len);
  for (const n of notes) {
    const hz = midiToHz(n.midi + (n.octaveShift ?? 0) * 12) * Math.pow(2, (n.centsOff ?? 0) / 1200);
    const amps = n.harmonics ?? SAW;
    const start = Math.floor((n.onsetMs / 1000) * SR);
    const end = Math.min(len, Math.floor(((n.onsetMs + n.durMs) / 1000) * SR));
    const fade = 0.01 * SR; // 10 ms attack/release to avoid clicks
    for (let i = start; i < end; i++) {
      const t = (i - start) / SR;
      let s = 0;
      for (let k = 0; k < amps.length; k++) s += amps[k] * Math.sin(2 * Math.PI * hz * (k + 1) * t);
      const env = Math.min(1, (i - start) / fade) * Math.min(1, (end - i) / fade);
      buf[i] = 0.5 * s * env;
    }
  }
  return buf;
}

/** Run the production follow pipeline over a buffer → a stream of graded Samples. */
function followPipeline(buf: Float32Array, targets: NoteTarget[]): Sample[] {
  const frame = 2048;
  const hop = 512;
  const samples: Sample[] = [];
  for (let i = 0; i + frame <= buf.length; i += hop) {
    const timeMs = ((i + frame / 2) / SR) * 1000; // centre of the frame
    // expected note nearest this time (as FollowEngine does)
    let exp = targets[0];
    let bestErr = Infinity;
    for (const tg of targets) {
      const e = Math.abs(tg.onsetMs - timeMs);
      if (e < bestErr) { bestErr = e; exp = tg; }
    }
    const { hz, clarity } = detectPitch(buf.subarray(i, i + frame), SR, 0.9);
    if (hz > 0 && clarity >= 0.9) {
      const snapped = snapToExpectedOctave(hz, midiToHz(exp.midi));
      const r = hzToReading(snapped);
      samples.push(r ? { midi: r.midi, cents: r.cents, timeMs } : { midi: null, cents: 0, timeMs });
    } else {
      samples.push({ midi: null, cents: 0, timeMs });
    }
  }
  return samples;
}

const SEQ: Note[] = [
  { midi: 69, onsetMs: 0, durMs: 400 },     // A4
  { midi: 72, onsetMs: 500, durMs: 400 },   // C5
  { midi: 76, onsetMs: 1000, durMs: 400 },  // E5
  { midi: 69, onsetMs: 1500, durMs: 400 },  // A4
];
const TARGETS: NoteTarget[] = SEQ.map((n, i) => ({ id: i, midi: n.midi, onsetMs: n.onsetMs }));

function gradeRendered(notes: Note[]) {
  return gradePerformance(TARGETS, followPipeline(render(notes), TARGETS));
}

describe('Stage 5 synth-in-the-loop — full audio→detector→follower chain (no instrument)', () => {
  it('grades a clean sawtooth performance as all good', () => {
    const results = gradeRendered(SEQ);
    for (const r of results) expect(r.verdict).toBe('good');
  });

  it('flags a sharp note (+45¢) and leaves the rest good', () => {
    const results = gradeRendered(SEQ.map((n, i) => (i === 1 ? { ...n, centsOff: 45 } : n)));
    expect(results[1].verdict).toBe('sharp');
    expect(results[0].verdict).toBe('good');
    expect(results[2].verdict).toBe('good');
  });

  it('flags a wrong note (a tone above the target)', () => {
    const results = gradeRendered(SEQ.map((n, i) => (i === 2 ? { ...n, midi: 78 } : n))); // played F#5 not E5
    expect(results[2].verdict).toBe('wrong');
    expect(results[0].verdict).toBe('good');
  });

  it('flags a missed note (silence in its window)', () => {
    // Silence the last note; shorten the previous one so its tail doesn't leak
    // into the missed note's onset window (otherwise it reads as a wrong note,
    // which is itself correct behaviour — see the wrong-note case above).
    const results = gradeRendered(
      SEQ.map((n, i) => (i === 3 ? { ...n, harmonics: [0] } : i === 2 ? { ...n, durMs: 220 } : n)),
    );
    expect(results[3].verdict).toBe('missed');
  });

  it('survives octave ambiguity: a weak-fundamental tone still grades good via the score prior', () => {
    // 2nd harmonic dominates, fundamental nearly gone — a classic octave-error trap.
    // The expected-note prior must pull any 2×f detection back to the right octave.
    const results = gradeRendered(
      SEQ.map((n, i) => (i === 1 ? { ...n, harmonics: [0.12, 1.0, 0.5, 0.3] } : n)),
    );
    expect(results[1].verdict).toBe('good');
  });

  it('tolerance presets change borderline grading (Strict stricter than Easy)', () => {
    const samples = followPipeline(render(SEQ.map((n, i) => (i === 1 ? { ...n, centsOff: 28 } : n))), TARGETS);
    expect(gradePerformance(TARGETS, samples, FOLLOW_PRESETS.easy)[1].verdict).toBe('good'); // +28¢ within Easy (35¢)
    expect(gradePerformance(TARGETS, samples, FOLLOW_PRESETS.strict)[1].verdict).toBe('sharp'); // beyond Strict (12¢)
  });
});
