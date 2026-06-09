/* ----------------------------------------------------------------------------
   Saxophone fingering data.

   VERIFIED against the Woodwind Fingering Guide basic-fingering charts
   (https://www.wfg.woodwind.org/sax/ — first + second octave). Fingerings are
   keyed by WRITTEN MIDI note (C4 = 60); all saxes (alto Eb, tenor Bb, …) share
   identical fingerings — only the sounding pitch differs, which is why a sax
   part written transposed is read at its WRITTEN pitch here.

   One canonical fingering per note is stored. Common alternates exist and are
   noted inline (e.g. forked F#, side-Bb vs bis); altissimo above F6 is out of
   scope. Range: written Bb3 (58) .. F6 (89).
---------------------------------------------------------------------------- */

export const FINGERINGS_VERIFIED = true; // cross-checked vs wfg.woodwind.org

export interface SaxKey {
  id: string;
  label: string;        // short label for tooltips
  hand: 'L' | 'R' | 'thumb';
}

/** The lightable key set on the simplified diagram. */
export const SAX_KEYS: SaxKey[] = [
  { id: 'oct', label: 'Octave', hand: 'thumb' },
  { id: 'lh1', label: 'B (LH 1)', hand: 'L' },
  { id: 'lh2', label: 'A (LH 2)', hand: 'L' },
  { id: 'lh3', label: 'G (LH 3)', hand: 'L' },
  { id: 'bis', label: 'Bis Bb', hand: 'L' },
  { id: 'gsharp', label: 'G#', hand: 'L' },
  { id: 'palmD', label: 'Palm D', hand: 'L' },
  { id: 'palmEb', label: 'Palm Eb', hand: 'L' },
  { id: 'palmF', label: 'Palm F', hand: 'L' },
  { id: 'lowB', label: 'Low B', hand: 'L' },
  { id: 'lowBb', label: 'Low Bb', hand: 'L' },
  { id: 'lowCsharp', label: 'Low C#', hand: 'L' },
  { id: 'rh1', label: 'F (RH 1)', hand: 'R' },
  { id: 'rh2', label: 'E (RH 2)', hand: 'R' },
  { id: 'rh3', label: 'D (RH 3)', hand: 'R' },
  { id: 'fsharp', label: 'F#', hand: 'R' },
  { id: 'sideBb', label: 'Side Bb', hand: 'R' },
  { id: 'sideC', label: 'Side C', hand: 'R' },
  { id: 'sideE', label: 'High E', hand: 'R' },
  { id: 'lowC', label: 'Low C', hand: 'R' },
  { id: 'lowEb', label: 'Low Eb', hand: 'R' },
];

/** WRITTEN MIDI note -> pressed key ids. Verified vs the Woodwind Fingering
 *  Guide. Key order within each entry is cosmetic (octave, LH, RH). */
export const SAX_FINGERINGS: Record<number, string[]> = {
  // ---- first octave (no octave key) — Bb3 .. C#5 ----
  58: ['lh1', 'lh2', 'lh3', 'lowBb', 'rh1', 'rh2', 'rh3'],   // Bb3 (low Bb)
  59: ['lh1', 'lh2', 'lh3', 'lowB', 'rh1', 'rh2', 'rh3'],    // B3  (low B)
  60: ['lh1', 'lh2', 'lh3', 'rh1', 'rh2', 'rh3', 'lowC'],    // C4  (low C)
  61: ['lh1', 'lh2', 'lh3', 'lowCsharp', 'rh1', 'rh2', 'rh3'], // C#4 (low C#)
  62: ['lh1', 'lh2', 'lh3', 'rh1', 'rh2', 'rh3'],            // D4
  63: ['lh1', 'lh2', 'lh3', 'rh1', 'rh2', 'rh3', 'lowEb'],   // Eb4
  64: ['lh1', 'lh2', 'lh3', 'rh1', 'rh2'],                   // E4
  65: ['lh1', 'lh2', 'lh3', 'rh1'],                          // F4
  66: ['lh1', 'lh2', 'lh3', 'rh1', 'fsharp'],                // F#4 (F#-key; alt: forked 123|RH2)
  67: ['lh1', 'lh2', 'lh3'],                                 // G4
  68: ['lh1', 'lh2', 'lh3', 'gsharp'],                       // G#4
  69: ['lh1', 'lh2'],                                        // A4
  70: ['lh1', 'bis'],                                        // Bb4 (bis; alt: side Bb)
  71: ['lh1'],                                               // B4
  72: ['lh2'],                                               // C5  (LH middle alone)
  73: [],                                                    // C#5 (all open)
  // ---- second octave (+ octave key) — D5 .. C#6 ----
  74: ['oct', 'lh1', 'lh2', 'lh3', 'rh1', 'rh2', 'rh3'],     // D5
  75: ['oct', 'lh1', 'lh2', 'lh3', 'rh1', 'rh2', 'rh3', 'lowEb'], // Eb5
  76: ['oct', 'lh1', 'lh2', 'lh3', 'rh1', 'rh2'],           // E5
  77: ['oct', 'lh1', 'lh2', 'lh3', 'rh1'],                  // F5
  78: ['oct', 'lh1', 'lh2', 'lh3', 'rh1', 'fsharp'],        // F#5
  79: ['oct', 'lh1', 'lh2', 'lh3'],                         // G5
  80: ['oct', 'lh1', 'lh2', 'lh3', 'gsharp'],               // G#5
  81: ['oct', 'lh1', 'lh2'],                                // A5
  82: ['oct', 'lh1', 'bis'],                                // Bb5
  83: ['oct', 'lh1'],                                       // B5
  84: ['oct', 'lh2'],                                       // C6
  85: ['oct'],                                              // C#6
  // ---- palm keys — D6 .. F6 ----
  86: ['oct', 'palmD'],                                     // D6
  87: ['oct', 'palmD', 'palmEb'],                           // Eb6
  88: ['oct', 'palmD', 'palmEb', 'sideE'],                  // E6
  89: ['oct', 'palmD', 'palmEb', 'palmF', 'sideE'],         // F6
};

export function fingeringFor(writtenMidi: number): string[] | null {
  return SAX_FINGERINGS[writtenMidi] ?? null;
}
