import { describe, it, expect } from 'vitest';
import { DrumsInstrument } from './drums';

// Minimal mock score: one track/staff/bar/voice/beat with two percussion notes.
function mockScore(): any {
  const note = (artic: number, ghost = false, accent = false) => ({
    isPercussion: true, percussionArticulation: artic, isGhost: ghost,
    accentuated: accent, dynamics: 5,
  });
  const beat = (tick: number, notes: any[]) => ({
    absolutePlaybackStart: tick, timer: tick, notes,
  });
  return {
    tempo: 120,
    tracks: [{
      index: 0, name: 'Drums',
      percussionArticulations: [{ outputMidiNumber: 36 }, { outputMidiNumber: 38 }],
      staves: [{ bars: [{ index: 0, voices: [{ beats: [
        beat(0, [note(0)]),      // kick (36)
        beat(480, [note(1)]),    // snare (38)
      ] }] }] }],
    }],
    masterBars: [{ timeSignatureNumerator: 4, timeSignatureDenominator: 4 }],
  };
}

describe('DrumsInstrument', () => {
  it('maps the drum timeline into PlayEvents preserving tick/laneKey/flags', () => {
    const inst = new DrumsInstrument();
    const events = inst.buildTimeline(mockScore());
    expect(events.length).toBe(2);
    expect(events[0].laneKey).toBe('kick');
    expect(events[0].piece).toBe('kick');
    expect(events[0].tick).toBe(0);
    expect(events[1].laneKey).toBe('snare');
    expect(events[1].tick).toBe(480);
    for (const e of events) expect(e.laneKey).toBe(e.piece);
  });

  it('exposes lanes in the canonical kit order with labels + colour voices', () => {
    const inst = new DrumsInstrument();
    const lanes = inst.lanes([]);
    expect(lanes.map((l) => l.key)).toEqual(
      ['crash', 'hihat', 'snare', 'kick', 'hiTom', 'midTom', 'floorTom', 'ride'],
    );
    expect(lanes.find((l) => l.key === 'snare')?.label).toBe('SN');
    expect(lanes.find((l) => l.key === 'snare')?.colorVoice).toBe('snare');
  });
});
