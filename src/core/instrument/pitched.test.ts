import { describe, it, expect } from 'vitest';
import { PitchedInstrument } from './pitched';

function saxBeat(tick: number, displayValue: number): any {
  return { absolutePlaybackStart: tick, timer: tick, notes: [
    { isPercussion: false, displayValue, realValue: displayValue + 3, dynamics: 5 },
  ] };
}
function mockTrack(): any {
  return { name: 'Alto Sax', staves: [{ bars: [{ voices: [{ beats: [
    saxBeat(0, 60),    // C4
    saxBeat(480, 62),  // D4
    saxBeat(960, 67),  // G4
  ] }] }] }] };
}

describe('PitchedInstrument', () => {
  it('builds a timeline from written pitch (displayValue), skipping percussion', () => {
    const inst = new PitchedInstrument();
    const events = inst.buildTimeline({ tempo: 120 }, mockTrack());
    expect(events.map((e) => e.written)).toEqual([60, 62, 67]);
    expect(events.map((e) => e.laneKey)).toEqual(['60', '62', '67']);
    expect(events[0].sounding).toBe(63); // realValue passed through
  });
  it('lanes are chromatic across the part range (+/-1 pad) with note-name labels', () => {
    const inst = new PitchedInstrument();
    const events = inst.buildTimeline({ tempo: 120 }, mockTrack());
    const lanes = inst.lanes(events);
    expect(lanes[0].key).toBe('59');                 // 60 - 1 pad
    expect(lanes[lanes.length - 1].key).toBe('68');  // 67 + 1 pad
    expect(lanes.find((l) => l.key === '60')?.label).toBe('C4');
    expect(lanes.find((l) => l.key === '61')?.accidental).toBe(true);
    expect(lanes.find((l) => l.key === '60')?.color).toBeTruthy();
  });
});
