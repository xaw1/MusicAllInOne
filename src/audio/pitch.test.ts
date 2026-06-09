import { describe, it, expect } from 'vitest';
import { hzToReading, midiToHz, midiToLabel, noteLabel, snapToExpectedOctave } from './pitch';

describe('hzToReading', () => {
  it('A4 = 440 Hz → A4, 0 cents', () => {
    const r = hzToReading(440)!;
    expect(r.midi).toBe(69);
    expect(r.name).toBe('A');
    expect(r.octave).toBe(4);
    expect(r.cents).toBe(0);
  });

  it('middle C ≈ 261.63 Hz → C4', () => {
    const r = hzToReading(261.6256)!;
    expect(noteLabel(r)).toBe('C4');
    expect(Math.abs(r.cents)).toBeLessThanOrEqual(1);
  });

  it('reports sharpness in cents', () => {
    const r = hzToReading(445)!; // ~+20 cents above A4
    expect(r.name).toBe('A');
    expect(r.octave).toBe(4);
    expect(r.cents).toBeGreaterThan(15);
    expect(r.cents).toBeLessThan(25);
  });

  it('reports flatness in cents', () => {
    const r = hzToReading(435)!; // ~−20 cents below A4
    expect(r.name).toBe('A');
    expect(r.cents).toBeLessThan(-15);
    expect(r.cents).toBeGreaterThan(-25);
  });

  it('rejects non-finite / non-positive input', () => {
    expect(hzToReading(0)).toBeNull();
    expect(hzToReading(-5)).toBeNull();
    expect(hzToReading(NaN)).toBeNull();
    expect(hzToReading(Infinity)).toBeNull();
  });
});

describe('midiToHz / midiToLabel', () => {
  it('A4 = 440, A3 = 220, A5 = 880', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 6);
    expect(midiToHz(57)).toBeCloseTo(220, 6);
    expect(midiToHz(81)).toBeCloseTo(880, 6);
  });
  it('labels octaves correctly', () => {
    expect(midiToLabel(60)).toBe('C4');
    expect(midiToLabel(69)).toBe('A4');
    expect(midiToLabel(61)).toBe('C#4');
  });
});

describe('snapToExpectedOctave — collapses octave errors using the expected note', () => {
  it('snaps an octave-up error down to the expected octave', () => {
    expect(snapToExpectedOctave(880, 440)).toBeCloseTo(440, 6); // 2×f → f
  });
  it('snaps an octave-down error up to the expected octave', () => {
    expect(snapToExpectedOctave(220, 440)).toBeCloseTo(440, 6); // f/2 → f
  });
  it('snaps a two-octave error to the expected octave', () => {
    expect(snapToExpectedOctave(110, 440)).toBeCloseTo(440, 6);
  });
  it('leaves an already-nearest frequency unchanged (preserves cents detuning)', () => {
    expect(snapToExpectedOctave(445, 440)).toBe(445); // ~+20¢, no octave shift
    expect(snapToExpectedOctave(440, 440)).toBe(440);
  });
  it('guards non-finite / non-positive input', () => {
    expect(snapToExpectedOctave(0, 440)).toBe(0);
    expect(snapToExpectedOctave(440, 0)).toBe(440);
    expect(Number.isNaN(snapToExpectedOctave(NaN, 440))).toBe(true);
  });
});
