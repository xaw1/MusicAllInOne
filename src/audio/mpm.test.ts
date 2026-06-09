import { describe, it, expect } from 'vitest';
import { detectPitch } from './mpm';

const SR = 44100;

/** Build a test tone: sum of harmonics (amps[h] = amplitude of the (h+1)th harmonic). */
function tone(freq: number, n = 2048, amps: number[] = [1]): Float32Array {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let h = 0; h < amps.length; h++) {
      s += amps[h] * Math.sin((2 * Math.PI * freq * (h + 1) * i) / SR);
    }
    b[i] = s;
  }
  return b;
}

describe('detectPitch (MPM) — synthetic tones, no instrument needed', () => {
  for (const f of [196, 220, 261.63, 440, 587.33, 880]) {
    it(`detects a clean ${f} Hz sine within 1%`, () => {
      const { hz, clarity } = detectPitch(tone(f), SR);
      expect(hz).toBeGreaterThan(f * 0.99);
      expect(hz).toBeLessThan(f * 1.01);
      expect(clarity).toBeGreaterThan(0.9);
    });
  }

  it('is octave-robust on a harmonic-rich (sax-like) tone', () => {
    // strong 2nd and 3rd harmonics must NOT pull the estimate up an octave
    const { hz } = detectPitch(tone(220, 2048, [1, 0.7, 0.5]), SR);
    expect(hz).toBeGreaterThan(216);
    expect(hz).toBeLessThan(224);
  });

  it('detects a low harmonic-rich tone near 110 Hz', () => {
    const { hz } = detectPitch(tone(110, 2048, [1, 0.6, 0.3]), SR);
    expect(hz).toBeGreaterThan(108);
    expect(hz).toBeLessThan(112);
  });

  it('reports low clarity for white noise', () => {
    const noise = new Float32Array(2048);
    let seed = 12345;
    for (let i = 0; i < noise.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      noise[i] = (seed / 0x40000000) - 1;
    }
    const { clarity } = detectPitch(noise, SR);
    expect(clarity).toBeLessThan(0.9);
  });

  it('returns 0 Hz for silence', () => {
    const { hz } = detectPitch(new Float32Array(2048), SR);
    expect(hz).toBe(0);
  });
});
