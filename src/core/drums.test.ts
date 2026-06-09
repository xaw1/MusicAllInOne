import { describe, it, expect } from 'vitest';
import { noteDrumMidi, midiToPiece } from './drums';

describe('noteDrumMidi', () => {
  it('resolves a custom percussion articulation to its output MIDI number', () => {
    const track = {
      percussionArticulations: [{ outputMidiNumber: 38 }, { outputMidiNumber: 42 }],
    };
    expect(noteDrumMidi({ percussionArticulation: 0 }, track)).toBe(38);
    expect(noteDrumMidi({ percussionArticulation: 1 }, track)).toBe(42);
  });

  it('falls back to the articulation index when the track has no articulation table', () => {
    expect(noteDrumMidi({ percussionArticulation: 38 }, {})).toBe(38);
  });

  it('returns -1 (not undefined) when the articulation is missing', () => {
    // Regression: undefined used to leak into the MIDI maps and silently drop
    // the hit from the highway / approach rings / live kit.
    expect(noteDrumMidi({}, {})).toBe(-1);
    expect(noteDrumMidi({ percussionArticulation: undefined }, {})).toBe(-1);
  });
});

describe('midiToPiece', () => {
  it('maps the -1 sentinel to null (no phantom lane)', () => {
    expect(midiToPiece(-1)).toBeNull();
  });

  it('maps standard GM drums to kit pieces', () => {
    expect(midiToPiece(38)).toBe('snare');
    expect(midiToPiece(36)).toBe('kick');
    expect(midiToPiece(42)).toBe('hihat');
  });
});
