import { describe, it, expect } from 'vitest';
import { detectInstrument } from './detect';

describe('detectInstrument', () => {
  it('returns drums for a percussion track (channel 9 or name)', () => {
    expect(detectInstrument({ playbackInfo: { primaryChannel: 9 } }).id).toBe('drums');
    expect(detectInstrument({ name: 'Drums' }).id).toBe('drums');
  });
  it('returns pitched for a melodic track', () => {
    expect(detectInstrument({ name: 'Guitar', playbackInfo: { primaryChannel: 2 } }).id).toBe('pitched');
  });
  it('returns saxophone for a sax track (program 65 or name)', () => {
    expect(detectInstrument({ name: 'Trumpet', playbackInfo: { program: 65 } }).id).toBe('saxophone');
    expect(detectInstrument({ name: 'Tenor Sax', playbackInfo: { program: 56 } }).id).toBe('saxophone');
  });
  it('a generic melodic track stays pitched', () => {
    expect(detectInstrument({ name: 'Violin', playbackInfo: { program: 40 } }).id).toBe('pitched');
  });
});
