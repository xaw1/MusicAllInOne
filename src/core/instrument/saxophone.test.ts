import { describe, it, expect } from 'vitest';
import { SaxophoneInstrument } from './saxophone';

describe('SaxophoneInstrument', () => {
  it('is a pitched instrument with a sax id and fingering lookup', () => {
    const sax = new SaxophoneInstrument();
    expect(sax.id).toBe('saxophone');
    // inherits the pitched highway:
    const events = sax.buildTimeline({ tempo: 120 }, {
      staves: [{ bars: [{ voices: [{ beats: [
        { absolutePlaybackStart: 0, timer: 0, notes: [{ isPercussion: false, displayValue: 67 }] },
      ] }] }] }],
    });
    expect(events[0].written).toBe(67);
    // fingering lookup (G4 is in the sample table):
    expect(sax.fingering(67)).toEqual(['lh1', 'lh2', 'lh3']);
    expect(sax.fingering(999)).toBeNull();
  });
});
