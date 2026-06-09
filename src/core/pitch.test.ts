import { describe, it, expect } from 'vitest';
import { noteName, isAccidental, pitchClassColour } from './pitch';

describe('pitch helpers', () => {
  it('names MIDI notes in scientific pitch (C4 = 60)', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(69)).toBe('A4');
    expect(noteName(61)).toBe('C#4');
    expect(noteName(58)).toBe('A#3'); // written low Bb3 on sax
  });
  it('flags accidentals by pitch class', () => {
    expect(isAccidental(60)).toBe(false); // C
    expect(isAccidental(61)).toBe(true);  // C#
    expect(isAccidental(66)).toBe(true);  // F#
  });
  it('gives a stable colour per pitch class (octave-independent)', () => {
    expect(pitchClassColour(60)).toBe(pitchClassColour(72)); // C == C
    expect(pitchClassColour(60)).not.toBe(pitchClassColour(61));
  });
});
