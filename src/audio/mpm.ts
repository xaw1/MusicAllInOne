/* ----------------------------------------------------------------------------
   Monophonic pitch detector — McLeod Pitch Method (MPM).

   Self-authored (dependency-free) from McLeod & Wyvill, "A Smarter Way to Find
   Pitch" (2005). It builds the Normalised Square Difference Function (NSDF) and
   picks the FIRST key maximum above a clarity threshold, which is markedly more
   octave-robust on harmonic-rich tones (a saxophone, a reed) than plain
   autocorrelation — the dominant failure mode there is locking onto the 2nd
   harmonic an octave up.

   Time-domain (no FFT). For a ~2048-sample tuner frame the O(n·maxLag) cost is
   trivial at 60 fps; if profiling ever demands it this can move to an
   AudioWorklet unchanged (the function is pure).
---------------------------------------------------------------------------- */

export interface PitchResult {
  /** Detected fundamental in Hz, or 0 if none found. */
  hz: number;
  /** 0..1 periodicity/confidence (NSDF height at the chosen peak). */
  clarity: number;
}

const DEFAULT_CLARITY_THRESHOLD = 0.9;
const DEFAULT_MIN_HZ = 50; // bounds the longest lag we bother computing

/**
 * Detect the fundamental of a (windowed) mono buffer.
 * @param buf          time-domain samples (−1..1)
 * @param sampleRate   e.g. 44100
 * @param clarityThreshold  fraction of the global NSDF max a key maximum must
 *                          reach to be chosen (0..1); higher = stricter.
 * @param minHz        lowest pitch to consider (bounds the lag search).
 */
export function detectPitch(
  buf: Float32Array,
  sampleRate: number,
  clarityThreshold = DEFAULT_CLARITY_THRESHOLD,
  minHz = DEFAULT_MIN_HZ,
): PitchResult {
  const n = buf.length;
  const maxLag = Math.min(n - 1, Math.ceil(sampleRate / minHz));
  if (maxLag < 2) return { hz: 0, clarity: 0 };

  // NSDF: n'(τ) = 2·Σ x[j]·x[j+τ] / Σ (x[j]² + x[j+τ]²)
  const nsdf = new Float32Array(maxLag + 1);
  for (let tau = 0; tau <= maxLag; tau++) {
    let acf = 0;
    let div = 0;
    for (let j = 0; j < n - tau; j++) {
      acf += buf[j] * buf[j + tau];
      div += buf[j] * buf[j] + buf[j + tau] * buf[j + tau];
    }
    nsdf[tau] = div > 0 ? (2 * acf) / div : 0;
  }

  // Key maxima = the single highest point in each positive lobe AFTER the first
  // descent through zero (which skips the trivial peak at τ=0).
  const maxima: number[] = [];
  let tau = 0;
  while (tau < maxLag && nsdf[tau] > 0) tau++; // walk down off the τ=0 peak
  while (tau < maxLag) {
    if (nsdf[tau] <= 0) {
      tau++;
      continue;
    }
    let peak = tau;
    while (tau < maxLag && nsdf[tau] > 0) {
      if (nsdf[tau] > nsdf[peak]) peak = tau;
      tau++;
    }
    maxima.push(peak);
  }
  if (maxima.length === 0) return { hz: 0, clarity: 0 };

  let globalMax = 0;
  for (const m of maxima) if (nsdf[m] > globalMax) globalMax = nsdf[m];
  if (globalMax <= 0) return { hz: 0, clarity: 0 };

  // First key maximum reaching threshold·globalMax → the fundamental period.
  const cutoff = clarityThreshold * globalMax;
  let chosen = maxima[0];
  for (const m of maxima) {
    if (nsdf[m] >= cutoff) {
      chosen = m;
      break;
    }
  }

  // Parabolic interpolation around the chosen lag for sub-sample precision.
  let period = chosen;
  let clarity = nsdf[chosen];
  if (chosen > 0 && chosen < maxLag) {
    const a = nsdf[chosen - 1];
    const b = nsdf[chosen];
    const c = nsdf[chosen + 1];
    const denom = a - 2 * b + c;
    if (denom !== 0) {
      const shift = (0.5 * (a - c)) / denom;
      period = chosen + shift;
      clarity = b - 0.25 * (a - c) * shift;
    }
  }

  if (period <= 0) return { hz: 0, clarity: 0 };
  return { hz: sampleRate / period, clarity: Math.max(0, Math.min(1, clarity)) };
}
