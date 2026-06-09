# Extending DrumScore to Saxophone and Melodic Wind Instruments: A Technical Implementation Report

## TL;DR
- **Build the wind practice layer on three permissively-licensed pillars: Pitchy (MIT, McLeod Pitch Method) running in an AudioWorklet for real-time monophonic pitch + intonation; an expected-note/expected-onset tolerance-window score follower (the same cents/milliseconds/percentage model SmartMusic uses) rather than full online DTW; and a self-authored, data-driven SVG fingering renderer seeded from the MIT-licensed Eolu/sax-fingering-chart `cfg.ron` table.** Avoid Essentia.js (AGPLv3) and the Bret Pimentel diagrams (CC BY-NC-SA, non-commercial) — both conflict with a free/open app.
- **The transposition rule is the architectural keystone: fingering follows the WRITTEN note, intonation scoring follows the SOUNDING (concert) pitch.** Detected Hz must be reconciled with the instrument's interval (alto −major 6th/Eb, tenor −major 9th/Bb) before comparison to the expected written note, but the fingering panel keys off the written note unchanged. This cleanly separates the two subsystems.
- **Generalize the drum code into an "Instrument Profile" strategy interface** (note→lane, note→colour, note→technique-hint, live-graphic selector), auto-detected from `staff.isPercussion` and `track.playbackInfo.program`. Swap the fixed drum-lane highway for a pitch-roll (piano-roll) highway whose vertical axis is the piece's pitch range.

## Key Findings

### A. Real-time pitch detection
- **Recommended default: Pitchy (npm `pitchy`, v4, MIT license).** Per the official `pitchy` README it "uses the McLeod Pitch Method, described in the paper *A Smarter Way to Find Pitch* by Philip McLeod and Geoff Wyvill." It returns `[pitchHz, clarity]` where clarity (0–1) is a built-in confidence gate. It is pure JS/ESM, ~27 kB, and designed for real-time tuners — the cleanest license/size/latency fit for an AudioWorklet.
- **Alternatives:** `pitchfinder` (MIT; multiple algorithms incl. YIN/AMDF/MPM/Dynamic Wavelet, ported from TarsosDSP); CREPE (deep CNN, MIT model weights from marl/crepe, runs via TF.js/ml5.js) — most accurate but heavy and prone to octave errors in the stripped browser model; Essentia.js (PitchYin/PitchYinProbabilistic/PitchMelodia) — **AGPLv3, disqualified** for a permissive app.
- **Saxophone-specific risk: octave errors.** The sax is overtone-rich and conical-bore; classical detectors confuse the fundamental with the 2nd harmonic, especially in the low register and on subtones. Use clarity gating, median smoothing over a few frames, and an octave-continuity / expected-pitch prior to suppress jumps.
- **Hz→note+cents:** `cents = 1200·log2(f/f_ref)`, where `f_ref = 440·2^((m−69)/12)` for MIDI note m; pick nearest m, display the signed cents remainder for the tuner.

### B. Score following / pitch+timing feedback
- **Commercial apps use note-by-note subtractive scoring against a known score with adjustable tolerance**, not academic DTW. SmartMusic/MakeMusic Cloud assesses "three categories: pitch, onset and duration... measured with pitch in cents, onset in milliseconds, and duration as a percentage," via a four-level tolerance dropdown (Easy, Lenient, Average, Strict), and paints noteheads green ("correct pitch... at the correct time") or red ("incorrect timing or pitch").
- **For a single known monophonic wind line, an expected-note/expected-onset tolerance-window follower is the pragmatic and adequate choice.** Online DTW/OLTW (e.g., the Matchmaker library, Python-only) is overkill and not browser-native.
- **alphaTab already provides the timeline:** its synthesised playback exposes the live MIDI tick/cursor through tempo and speed-slider changes, so the "expected note now" is a direct lookup; the follower just compares detected pitch to expected and grades onset timing against a ms window.

### C. Fingering charts
- **Best permissive data source: Eolu/sax-fingering-chart (MIT), whose `cfg.ron` is a machine-readable note→key-set table** (plus transposition presets). Convert RON→JSON. Saxophone-only.
- **mpho-dev/clarinet_app `fingerings.ts` (45 notes, key mappings, alternates) is structurally ideal but unlicensed** (all-rights-reserved) — request an MIT license before use.
- **Disqualified:** Bret Pimentel Fingering Diagram Builder (CC BY-NC-SA 4.0, non-commercial, closed-source); instrumentbible/Woodwind-Fingerings (no license, images only).
- **Render fingerings yourself as data-driven SVG:** a schema of named key elements + per-note "keys-down" arrays, mirroring how svguitar (MIT) renders fretted diagrams from a data object.
- **Confirmed: fingering follows the written note, identical across Eb/Bb sizes** — all saxes share fingerings; transposition only changes sounding pitch. So the fingering panel needs only the written note; transposition never touches it.

### D. Learner needs / pedagogy
- Intonation tooling is the wind-specific need drums lack: a real-time cents meter and a **drone/pedal-tone generator** (strongly supported by pedagogy literature for intonation) for long-tone and scale practice.
- High-value practice-science features within the app's vision: slow-down looping, gradual tempo laddering, isolating hard bars, count-in, tendency-note awareness (sax notes that run sharp/flat by design).
- **Scoring must be forgiving and expressive-friendly:** rigid note-by-note grading (the documented tonestro critique) punishes musical phrasing; offer tolerance presets and avoid over-penalizing vibrato/expressive timing.

### E. Architecture
- **InstrumentProfile interface:** `noteToLane`, `noteToColour`, `noteToTechniqueHint` (sticking for drums, fingering for winds), `liveGraphic` (drum-kit SVG vs fingering panel vs keyboard), `pitchDetectionConfig`, `transposition`. Drums = one implementation; Wind/Sax = another.
- **Auto-detect profile:** `staff.isPercussion` → drums; `track.playbackInfo.program` in the GM sax/wind ranges → wind.
- **Highway:** replace fixed drum lanes with a vertical pitch-roll sized to the piece's min/max pitch; this generalizes to any melodic instrument.
- **Performance:** run Pitchy in its own AudioWorklet alongside alphaTab's synth worklet and the rAF canvas; keep frames small, post only results (not audio) to the main thread.

## Details

### (A) Real-time monophonic pitch detection in the browser

**Algorithm landscape.** Time-domain autocorrelation methods dominate real-time browser pitch detection because they are cheap and low-latency:
- **YIN** — autocorrelation with cumulative-mean normalization; the most widely used baseline. Good accuracy/speed balance but occasionally emits wildly wrong values.
- **pYIN (probabilistic YIN)** — YIN plus an HMM smoothing stage producing pitch-probability distributions; more robust, more expensive.
- **McLeod Pitch Method (MPM)** — normalized square-difference function (NSDF) with a clarity measure; designed for instrument/voice tuners (the Tartini tuner). Strong at the stable, sustained tones a wind player produces.
- **CREPE** — a deep CNN operating directly on the raw waveform. Per Kim, Salamon, Li & Bello (NYU), *CREPE: A Convolutional Representation for Pitch Estimation* (arXiv:1802.06182), the input is a "1024-sample excerpt... using a 16 kHz sampling rate," fed through "six convolutional layers that result in a 2048-dimensional latent representation" to a "360-dimensional output vector," the 360 bins covering "six octaves with 20-cent intervals between C1 and B7, corresponding to 32.70 Hz and 1975.5 Hz." State-of-the-art accuracy (outperforms pYIN) but the full model is ~22M parameters / ~89 MB.
- **SPICE** — Google self-supervised pitch model (TF Hub).
- **FFT/HPS, AMDF, Dynamic Wavelet** — simpler/faster, lower accuracy.

**Maintained JS/WASM libraries:**
- **Pitchy** (`pitchy`, MIT, v4 ESM) — MPM; `findPitch(input, sampleRate) → [Hz, clarity]`. Per Snyk's package page, "The npm package pitchy receives a total of 5,515 downloads a week... we scored pitchy popularity level to be Small," and it has been "starred 125 times." Maintenance is quiet (Snyk flags it "inactive"), but the algorithm is stable and the code is small enough to vendor. **Recommended default.**
- **pitchfinder** (`pitchfinder`, MIT) — YIN, AMDF, MPM ("Mcleod"), Dynamic Wavelet; ported from TarsosDSP. Good for offering a selectable algorithm or multi-detector consensus.
- **ml5.js pitchDetection** — wraps the CREPE model (ported by Hannah Davis) on TF.js; easiest CREPE path but a stripped browser model (the marl demo notes it runs "less than 3 percent of parameters" and "may make more octave errors than the full model"); heavier load and Linux/Chrome TF.js caveats.
- **CREPE model (marl/crepe, MIT)** — convertible to TF.js; full model accurate but large.
- **Aubio (aubiojs)** — already rejected by the team; the WASM port lacks an onset detector. For pitch it can work but is less convenient than Pitchy.
- **Essentia.js** — rich (PitchYin, PitchYinProbabilistic, PitchYinFFT, PitchMelodia) but **AGPLv3** — using it in a distributed web app triggers AGPL network-copyleft obligations; **avoid.**

**Practical parameters for saxophone.** At 44.1/48 kHz, use a frame of ~2048 samples (~43–46 ms) with a hop of ~512–1024 samples; this resolves the sax range comfortably and keeps perceived latency low. The AudioWorklet delivers 128-sample blocks; accumulate into a ring buffer of the chosen frame size. Expect total detection latency in the tens of milliseconds — well under the threshold where feedback feels laggy.

**Sax timbre pitfalls and mitigations:**
- **Octave errors** (fundamental vs 2nd harmonic) are the dominant failure, worst in the low register, on subtones, and on warbling/under-supported notes. Mitigate with clarity/confidence gating, short median smoothing, and an octave-continuity prior biased toward the expected written note.
- **Breath noise, key clicks, reed squeaks** create noisy onsets — gate on clarity and a minimum RMS, and ignore frames immediately around detected transients.
- **Vibrato** is a real ±cents oscillation; smooth the cents reading (e.g., a short moving average) so the tuner doesn't jitter, but don't over-smooth or you'll hide genuine pitch drift.
- **Altissimo** pushes into a register where harmonics are dense — widen the expected-pitch window and lean harder on the score prior.

**Hz→note+cents.** MIDI number `m = round(69 + 12·log2(f/440))`; reference `f_ref = 440·2^((m−69)/12)`; `cents = 1200·log2(f/f_ref)`, range ±50. Display nearest note name + signed cents for the tuner and intonation feedback.

**Transposition (critical).** Detected Hz is the SOUNDING (concert) pitch. To grade against a written sax part you must account for the instrument: alto/bari are Eb (alto sounds a major 6th below written), tenor/soprano are Bb (tenor sounds a major 9th below written). Two equivalent implementations: (a) transpose the score's written MIDI notes to concert pitch once at load and compare in concert space, or (b) transpose detected concert pitch up into written space per frame. Option (a) is cleaner — store an `expectedConcertMidi` per beat. The tuner display should let the user toggle concert vs transposed note names (as SmartMusic's tuner does — it shows both the "Concert Pitch of the note being played" and the "Transposed note").

### (B) Score following / pitch + timing feedback

**How the gamified apps actually score.** SmartMusic/MakeMusic Cloud assesses three dimensions — pitch (cents), onset (milliseconds), duration (percentage) — with a four-level tolerance dropdown (Easy/Lenient/Average/Strict), and paints noteheads green for correct-pitch-at-correct-time, red otherwise. tonestro "listens" and flags incorrect pitches/rhythms note-by-note; a *Frontiers in Psychology* critique (Current State and Future Directions of Technologies for Music Instrument Pedagogy, 2022) notes that "a very inexpressive performance, in which the notated dynamic and articulation marks were ignored, can achieve very high scores" while "more expressive musical performances... generally earn poorer scores" — a clear design warning against rigid subtractive grading. Yousician grades pitch/rhythm/timing in a Guitar-Hero-style UI with a points/leaderboard layer and an in-app tuner accurate to ±1 cent in "Pro" mode.

**Recommended approach for DrumScore.** Because the score is fully known and the line is monophonic, use an **expected-note / expected-onset tolerance-window follower** keyed off alphaTab's live playback tick:
1. For the current/next expected beat, read `expectedConcertMidi` and the expected onset time (from the cursor/tick).
2. Each frame, take Pitchy's `[Hz, clarity]`; if clarity ≥ threshold and RMS ≥ floor, convert to MIDI + cents.
3. **Pitch correctness:** detected MIDI == expected MIDI (semitone match).
4. **Intonation quality:** |cents| within a band (e.g., ≤15–25 cents = good; configurable).
5. **Timing:** onset of a stable detected pitch within ± an onset window (ms) of the expected onset → hit; early/late/missed otherwise.
6. Combine into per-note hit/miss/quality (green = right pitch + in time; yellow = right pitch but late or slightly out of tune; red = wrong/missed). Advance the highway/cursor as notes are satisfied.

**Why not online DTW/OLTW.** OLTW (the basis of MIREX score followers and the Matchmaker library) is the right tool for polyphonic, unknown-tempo, audio-to-audio alignment. For one monophonic line with a known score and an app-controlled tempo/cursor, it adds latency, complexity, and a Python-shaped dependency (Matchmaker is Python + FluidSynth) for no practical gain. Keep the expected-window follower; it degrades gracefully and is trivial to tune.

**Tempo flexibility, speed slider, repeats, looping.** Drive everything from alphaTab's authoritative tick/cursor rather than wall-clock time. Because alphaTab already syncs its cursor through tempo changes and the speed slider, the expected-onset times scale automatically. For repeats/looping a practice section, reset the follower's expected-pointer when the cursor jumps; treat each loop pass independently for scoring. Provide forgiving onset windows that widen at slow practice speeds.

### (C) Fingering charts

**Data sources and licensing (verified):**
- **Eolu/sax-fingering-chart — MIT (verified via crates.io metadata; crate `sax-fingering-chart`).** Contains `cfg.ron`, a customizable note→supported-keys table plus transposition presets (Alto/Tenor/Baritone/Soprano/Bass/CMelody/Contrabass/Sopranino/Subcontrabass/Sopranissimo). Per its README: "You can now fully customize what notes are supported and what fingerings each note will use. Detailed instructions exist inside the cfg.ron file." **This is the single best permissive, machine-readable saxophone fingering data source.** Convert RON→JSON for the PWA. Saxophone-only.
- **mpho-dev/clarinet_app `fingerings.ts`** — "45 notes with key mappings," alternates, an offline PWA structurally identical to your goal — but **no LICENSE file (all-rights-reserved).** Open an issue requesting MIT/Apache before reuse; meanwhile use only as a structural reference.
- **lightandmatter.com saxophone fingering SVG** — CC-BY-SA; usable with attribution but ShareAlike is mildly copyleft for the diagram artwork.
- **Disqualified:** Bret Pimentel FDB diagrams (CC BY-NC-SA 4.0 — non-commercial + ShareAlike, closed Vue.js/PHP source; SVG behind a donor wall); instrumentbible/Woodwind-Fingerings (no license; PNG images only, Max/MSP).
- **Leads to verify:** ad-si/openmusicdatabase (claims open multi-instrument fingering/range data; license unverified); MJFree34/NOTEbook (open-source iOS fingering app; Swift).

**Rendering approach.** Build your own SVG fingering renderer (the artwork is simple geometry; the *facts* of which keys close for a note are not copyrightable, only specific drawn presentations are). Design schema:
```
instrumentProfile.fingeringLayout = {
  keys: [ { id: "octave", cx, cy, r/shape }, { id: "LH1", ... }, ... ],   // geometry
}
fingeringData[writtenMidi] = { down: ["LH1","LH2","octave"], alternates: [ ... ] }
```
The renderer draws all keys as outlined "pearls"/side-keys/octave key, then fills the `down` set. Swapping `fingeringLayout` + `fingeringData` to a flute/clarinet/trumpet file reuses the entire renderer — the same pattern svguitar (MIT) uses to render any fretted diagram from a data object. This is the wind analog of the drum-voice→colour map and the sticking overlay.

**Transposition implication (confirmed and important).** All saxophones share fingerings; a written C is the same finger pattern on every size, only the sounding pitch differs (per Yamaha's instrument guide and multiple sax pedagogy sources: "All saxophones use the same fingerings — a C is always the same finger pattern. Transposition just means each size produces a different sounding pitch for that same fingering"). Therefore the fingering panel is driven solely by the **written** MIDI note from the alphaTab score — transposition logic must never touch it. This is the inverse of intonation scoring (which uses sounding pitch). Architecturally, the two consume different fields off the same note object: fingering ← written note; scoring ← concert/sounding pitch.

**Complements:** alternate fingerings (the data already supports a list), trill fingerings, altissimo fingerings (sax), half-holes (flute/clarinet/oboe/recorder). Animate by simply re-filling the `down` set as the highway advances note to note.

### (D) What melodic-instrument learners need (within the app's vision)

- **A real-time tuner / cents meter** — the single biggest wind-specific need drums don't have. Wind intonation is player-controlled (embouchure, air, voicing), and saxes have inherent tendency notes — sources note Bb tenors "generally begin to deviate at F sharp... and then reach the highest point of deviation at a B above the staff," running progressively sharp. A persistent cents readout during play-along, plus a dedicated tuner mode, directly serves this.
- **Drone / pedal-tone generator** — pedagogy strongly supports practicing scales and long tones against a sustained tonic drone to train interval intonation (acoustical "beats" disappear when in tune); a peer-reviewed study (Zabanal, 2019, *Journal of Research in Music Education*) found short-term tonic-drone practice improved string intonation, and the technique is standard wind pedagogy. Cheap to implement with a Web Audio oscillator or a held SoundFont note; offer equal-tempered and just options. High-value, low-cost, squarely in the practice-companion vision.
- **Long-tone / overtone practice aids** — a steady-tone target with a cents trace; optionally an overtone-matching drill (sax forums repeatedly cite overtone/voicing practice as both essential and frustrating).
- **Practice-science features:** slow-down looping, gradual tempo laddering (auto-increment BPM on success), isolate-a-bar looping, count-in, breath/phrasing markers. All reuse alphaTab's looping/tempo/count-in/metronome.
- **Responsiveness & motivation:** keep end-to-end latency low (tens of ms), make scoring forgiving by default with tolerance presets (don't punish expressive phrasing — the Frontiers critique), and design the falling-notes + intonation feedback to be glanceable (clear green/yellow/red, a smooth non-jittery cents needle).

### (E) Instrument-agnostic architecture and staged plan

**Profile/strategy interface (drums and wind as implementations):**
```
interface InstrumentProfile {
  id: "drums" | "sax" | "flute" | ...
  matches(track, staff): boolean            // auto-detection predicate
  highway: "discrete-lanes" | "pitch-roll"
  noteToLane(note, pieceRange): LaneSpec
  noteToColour(note): Colour
  techniqueHint(note): StickingHint | FingeringSpec | null
  liveGraphic: "drumkit" | "fingering-panel" | "keyboard"
  transposition: { soundingOffsetSemitones: number }   // 0 for drums/flute
  pitchDetection?: { enabled, frameSize, hopSize, clarityThreshold,
                     centsGoodBand, onsetWindowMs }
}
```
- **Drums** → discrete lanes, drum-voice colour map, sticking hints (R/L), drum-kit SVG, no pitch detection.
- **Sax/Wind** → pitch-roll highway, pitch-class colour, fingering hints, fingering panel, pitch detection on, transposition set per instrument.

**Auto-detection from the loaded score.** Check `staff.isPercussion` → drums; else read `track.playbackInfo.program`. **Mind the GM indexing convention:** the General MIDI spec lists the sax family with 1-based program numbers 65 Soprano, 66 Alto, 67 Tenor, 68 Baritone — which correspond to the **0-based program-change bytes 64, 65, 66, 67** that alphaTab's `playbackInfo.program` exposes. So in code, programs 64–67 = soprano/alto/tenor/baritone sax; the broader reed/wind/brass ranges (≈56–79) select other wind profiles with the right transposition; flute/oboe/clarinet programs select their own fingering data. Fall back to a user picker when ambiguous.

**Pitch-roll highway UX.** For a melodic line, fixed lanes don't scale to the chromatic range. Use a vertical piano-roll: compute the piece's min/max written pitch, add a margin, and map pitch→y. Notes fall to the hit line as today, but lane height = semitone spacing. Optionally label rows with note names. This is more legible than many discrete name-lanes and naturally reuses the existing falling-notes engine and the live tick sync.

**Performance (single tab).** Three real-time consumers coexist: alphaTab's synthesis worklet, your Pitchy AudioWorklet, and the rAF canvas. Keep them decoupled: the pitch worklet does only DSP and posts `{Hz, clarity, rms}` (small messages, not audio) to the main thread; the canvas reads the latest result and alphaTab's tick each frame. Use a modest frame size and a single detector (Pitchy) to bound CPU; avoid CREPE/TF.js on the audio path unless a device-capability check passes. Microphone input and synth output share one AudioContext; ensure echo from the backing track doesn't feed the detector (prefer headphones; optionally gate detection to the player's expected register).

**Staged implementation plan (ship saxophone first):**
1. **Profile refactor.** Extract the drum-specific code behind `InstrumentProfile`; make drums the first implementation with no behavior change. Add auto-detection scaffolding (`isPercussion`, `program`).
2. **Wind notation/playback (already works).** Confirm sax MusicXML/GP import renders + plays via the Sonivox GM SoundFont; add the Wind profile with transposition and the pitch-roll highway (visual only, no mic yet).
3. **Fingering panel.** Implement the data-driven SVG renderer; seed sax data from Eolu `cfg.ron`→JSON; wire fingering to the WRITTEN note; show alternates. Generalize schema for flute/clarinet next.
4. **Tuner + pitch detection.** Add the Pitchy AudioWorklet, Hz→note+cents, the cents meter, and the standalone tuner/drone modes (no scoring yet). Validate octave-error handling on real sax input.
5. **Score follower + feedback.** Add the expected-note/expected-onset window follower keyed to alphaTab's tick; combine pitch+timing+intonation into green/yellow/red per-note feedback on the highway and notation; honor speed slider, loops, repeats, tolerance presets (cents for pitch, ms for onset, mirroring SmartMusic's four levels).
6. **Pedagogy polish.** Tempo laddering, isolate-a-bar loop, long-tone/overtone drills, tendency-note hints; optional LLM coaching using local API keys.
7. **Generalize.** Add flute (non-transposing), clarinet (Bb), trumpet (Bb, valve "fingering"), oboe — each is a new profile + data file, no engine changes.

## Recommendations

**Immediate (Stage 1–2):**
- Adopt **Pitchy (MIT)** as the pitch engine; vendor the source given its quiet maintenance. Keep `pitchfinder` (MIT) available as a fallback/selectable algorithm.
- Refactor to the `InstrumentProfile` interface now, with drums as the reference implementation, before adding wind features.
- Implement the **pitch-roll highway** sized to the piece's pitch range.

**Core wind features (Stage 3–5):**
- Seed saxophone fingerings from **Eolu/sax-fingering-chart (`cfg.ron`, MIT)**; build your own SVG renderer (svguitar-style data-driven). Drive fingering off the **written** note.
- Implement intonation scoring off the **sounding/concert** pitch using the transposition offset; expose Easy/Lenient/Average/Strict tolerance presets (cents for pitch, ms for onset) mirroring SmartMusic.
- Use the **expected-note/expected-onset window follower**, not DTW.
- Ship the **cents meter + drone generator** early — highest-value wind-specific wins.

**Avoid / flag:**
- **Essentia.js (AGPLv3)** and **Bret Pimentel diagrams (CC BY-NC-SA)** — license conflicts with a free/open app.
- **mpho-dev/clarinet_app** data — unlicensed; request MIT before use.
- Heavy ML (CREPE/ml5/TF.js) on the live audio path — keep optional and capability-gated.

**Thresholds that change the plan:**
- If Pitchy octave errors prove unacceptable on real sax even after gating/priors, escalate to a CREPE-tiny TF.js model behind a device-capability check (accept the size/latency cost).
- If users demand expressive/rubato pieces where the app-controlled cursor can't track free tempo, only then consider an OLTW follower (port a minimal JS OLTW; don't pull in Python Matchmaker).
- If a permissive flute/clarinet/oboe dataset can't be sourced, author the tables in-house from public charts (key-combination facts aren't copyrightable).

## Caveats
- **Library maintenance:** Pitchy showed no new npm releases in the recent window and is flagged "inactive" by Snyk (~5,515 weekly downloads, 125 stars); the algorithm is stable but plan to vendor/maintain the code yourself.
- **License verifications:** Eolu MIT was confirmed via crates.io/lib.rs metadata rather than a directly rendered LICENSE file; CREPE MIT (marl/crepe) and Essentia.js AGPLv3 are confirmed from primary sources. Re-confirm any repo's LICENSE file before shipping.
- **Sax pitch detection is genuinely hard** in the extreme low register, on subtones, and in altissimo; expect to tune gating/priors with real recordings, and set user expectations (the tuner is a practice aid, not lab-grade).
- **Proprietary internal formulas:** the cents/ms/duration tolerance model is documented for SmartMusic; tonestro/Yousician's exact internal weightings are not public and are inferred consistently — treat exact weightings as unknown.
- **Echo/bleed:** with speakers, alphaTab's backing track can leak into the mic and confuse the follower; headphones recommended, or gate detection to the expected register/onset windows.
- The **Matchmaker** library and OLTW references are Python/research-oriented; cited to justify *not* using them client-side, not as a dependency.
- **GM indexing:** the soprano/alto/tenor/baritone = 64/65/66/67 mapping is the 0-based program-change encoding (1-based GM names are 65/66/67/68). Confirm which convention alphaTab's `playbackInfo.program` returns against a known sax file during Stage 1.
