import { describe, it, expect } from 'vitest';
import { SAX_KEYS, SAX_FINGERINGS, fingeringFor, FINGERINGS_VERIFIED } from './sax-fingerings';

describe('sax fingerings', () => {
  it('every key id used in the table is a known key', () => {
    const known = new Set(SAX_KEYS.map((k) => k.id));
    for (const [midi, keys] of Object.entries(SAX_FINGERINGS)) {
      for (const k of keys) expect(known.has(k), `note ${midi} uses unknown key ${k}`).toBe(true);
    }
  });

  it('fingeringFor returns the key list or null when not charted', () => {
    expect(Array.isArray(fingeringFor(62))).toBe(true);
    expect(fingeringFor(999)).toBeNull();
  });

  it('is flagged verified (cross-checked vs the Woodwind Fingering Guide)', () => {
    expect(FINGERINGS_VERIFIED).toBe(true);
  });

  it('charts the full written range Bb3..F6 (58..89) with no gaps', () => {
    for (let m = 58; m <= 89; m++) {
      expect(fingeringFor(m), `note ${m} should be charted`).not.toBeNull();
    }
  });

  it('matches reference fingerings for anchor notes', () => {
    expect(fingeringFor(62)).toEqual(['lh1', 'lh2', 'lh3', 'rh1', 'rh2', 'rh3']); // D4
    expect(fingeringFor(67)).toEqual(['lh1', 'lh2', 'lh3']);                       // G4
    expect(fingeringFor(72)).toEqual(['lh2']);                                     // C5 (LH middle)
    expect(fingeringFor(73)).toEqual([]);                                          // C#5 (open)
    expect(fingeringFor(58)).toContain('lowBb');                                   // Bb3 bell key
    expect(fingeringFor(86)).toEqual(['oct', 'palmD']);                            // D6 palm
    expect(fingeringFor(89)).toEqual(['oct', 'palmD', 'palmEb', 'palmF', 'sideE']); // F6 palm
  });

  it('upper octave equals the lower-octave fingering plus the octave key', () => {
    expect(fingeringFor(74)).toEqual(['oct', ...(fingeringFor(62) as string[])]); // D5 = oct + D4
    expect(fingeringFor(79)).toEqual(['oct', ...(fingeringFor(67) as string[])]); // G5 = oct + G4
  });
});
