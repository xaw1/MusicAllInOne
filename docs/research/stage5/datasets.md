# Stage 5 — Public Saxophone Audio Datasets for Pitch-Tracker / Score-Follower Validation

**Goal:** Find public audio datasets containing REAL saxophone (and secondarily other wind) recordings with ground-truth pitch (f0) and/or note-onset annotations, usable to validate a monophonic pitch-tracker / score-follower OFFLINE. The app is a FREE, local, browser PWA that grades a saxophone performance against a known score (pitch in cents + onset timing). The developer has no saxophone, so real sax audio with pitch labels is needed to validate the pitch tracker — especially to catch **octave errors**, which require isolated notes across the FULL range (low register + altissimo) with pitch labels.

**License verdict legend:**
- **USABLE** — open license (CC BY / CC BY-SA / public-domain-style), safe for a free/open app
- **NC** — Non-Commercial (CC BY-NC / CC BY-NC-SA); fine for offline validation, NOT for bundling/shipping in a commercial product
- **research-only** — custom restrictive research license (non-transferable, no redistribution)
- **unclear** — login-walled, form-gated, or proprietary; license not cleanly open

---

## 1. MTG / Good-sounds — Freesound Packs (MTG user)

- **URL (alto):** https://freesound.org/people/MTG/packs/20239/
- **URL (tenor):** https://freesound.org/people/MTG/packs/20247/
- **Example files (license/format verified):** https://freesound.org/people/MTG/sounds/358413/ (Sax Alto E3), https://freesound.org/people/MTG/sounds/359184/ (Sax Tenor B2)
- **LICENSE VERDICT: USABLE** — CC BY 3.0 (Attribution 3.0). "Free to share and remix as long as you credit the author." Commercial use permitted.
- **Contents:** Isolated single notes from the Good-sounds.org project (MTG/UPF, Barcelona). Chromatic, note-by-note (NOT phrases). Confirmed pitch coverage from direct source inspection:
  - **Alto sax:** E3 (MIDI 40) up through G5 (MIDI 79) — includes low register and reaches into altissimo territory.
  - **Tenor sax:** B2 (MIDI 35) up through E5 (MIDI 64) — covers the deep low register where octave flips are most common.
  - Both packs cross the octave-error danger zones.
- **Annotation type:** Pitch encoded in filename + Freesound embedded metadata per file (note name, octave integer, MIDI note number, tuning reference 442 Hz). NO f0 contour CSV — pitch is the per-file label.
- **Audio format:** WAV, 48 kHz / 24-bit, mono, ~5–7 s per note. Recorded with Neumann U87 microphone.
- **Approximate size:** Dozens of files per pack. Free direct download from Freesound, no login/registration required for these packs.
- **Octave-error utility: HIGH.** Individual notes, exact MIDI label, spans both registers where octave flips happen. Lowest-friction starting point.

---

## 2. Good-sounds Dataset (Full, Zenodo)

- **URL:** https://zenodo.org/records/4588740
- **Project page:** https://www.upf.edu/web/mtg/good-sounds
- **mirdata loader docs:** https://mirdata.readthedocs.io/en/latest/_modules/mirdata/datasets/good_sounds.html
- **LICENSE VERDICT: NC** — CC BY-NC 4.0 (Creative Commons Attribution-NonCommercial 4.0 International). Fine for offline validation scripts; do NOT bundle the audio in a redistributed/commercial app.
- **Contents:** Monophonic recordings of two exercise types — (a) isolated single notes and (b) scales. Recorded by 15 professional musicians in the UPF / Phonos studio, 1 to 4 microphones. 12 instruments total. **All four saxophone types are present: sax_alto, sax_tenor, sax_baritone, sax_soprano.** Complete playable semitone range captured per instrument, multiple times, with various tonal characteristics. Includes subjective quality classes ("good-sound", "bad", "scale-good", "scale-bad") — useful for robustness testing.
- **Annotation type:** Manual segmentation annotations for single notes — attack (onset), decay, sustain start, release start, offset — all measured in samples. Plus `semitone` (MIDI note) and `pitch_reference`. NO raw f0 contour curve; temporal segmentation + MIDI note label only.
- **Audio format:** FLAC, 48 kHz / 32-bit, mono.
- **Approximate size:** 13.9 GB compressed (the Zenodo record reports 41.4 TB total for the full version, reflecting many takes/variants per note).
- **Octave-error utility: HIGH.** The only dataset covering all four saxophone types with full chromatic range and MIDI labels. Baritone coverage is unique and valuable (baritone sits in the worst octave-error register).

---

## 3. TinySOL

- **URL:** https://zenodo.org/records/3685367
- **mirdata loader:** https://mirdata.readthedocs.io/en/stable/_modules/mirdata/datasets/tinysol.html
- **LICENSE VERDICT: USABLE** — CC BY 4.0 (no NC clause). "Can be used for creative purposes insofar as the use complies with the Creative Commons Attribution 4.0 International license."
- **Contents:** 2,913 samples, each a single isolated musical note from one of 14 different instruments. **Alto Saxophone only** (no tenor/soprano/baritone). Ordinary playing style only — no mutes, no extended techniques. Three dynamic levels (pp, mf, ff). Source sounds originally recorded at Ircam, Paris, 1996–1999 as part of the Studio On Line (SOL) project.
- **Annotation type:** CSV metadata file (13 columns) including MIDI pitch number (middle C "C4" = 60), pitch string in American standard notation (A4 = 440 Hz), dynamic level, instrument family/abbreviation/full name, playing technique, fold IDs (0–4), instance IDs, string info (where applicable), and digital-retuning flags. Loadable programmatically via the `mirdata` Python library.
- **Audio format:** WAV, 44.1 kHz / 16-bit, mono, 2–10 s per note.
- **Approximate size:** ~1.0 GB compressed (tar.gz); metadata ~317.6 KB.
- **Caveat:** Alto only. Altissimo coverage likely limited above ~written F5 given the 1996–1999 source recordings.
- **Octave-error utility: MEDIUM-HIGH.** Best fully-open (no NC) structured dataset for scripted/CI regression tests. CSV + mirdata loader makes automated testing across all notes straightforward.

---

## 4. University of Iowa MIS (Musical Instrument Samples)

- **URL:** https://theremin.music.uiowa.edu/MIS.html
- **LICENSE VERDICT: USABLE** — No restrictions whatsoever. Freely available since 1997; explicitly "may be downloaded and used for any projects, without restrictions." (Effectively public-domain-style; cleanest license of any option here.)
- **Contents:** Two saxophones only — **Bb Soprano Saxophone** and **Eb Alto Saxophone** (no tenor, no baritone). Chromatic scales played note-by-note at pp, mf, and ff dynamic levels throughout the range of the instrument. Vibrato and non-vibrato variants. Recorded in the Anechoic Chamber at the Wendell Johnson Speech and Hearing Center, University of Iowa. Each note ~2 s, preceded/followed by ambient silence.
- **Annotation type:** None beyond filename (note name in American notation). NO MIDI file, NO f0 CSV. Pitch must be parsed from filename.
- **Audio format:**
  - Pre-2012: 16-bit / 44.1 kHz, AIFF, mono.
  - Post-2012: 24-bit / 96 kHz stereo (left/right microphones) PLUS 16-bit / 44.1 kHz mono (center microphone).
- **Approximate size:** A few hundred MB total for both saxophones (per-instrument zip downloads).
- **Octave-error utility: MEDIUM.** Cleanest license, excellent anechoic quality (post-2012 24-bit/96 kHz is great for pitch analysis). Limited to soprano + alto; pitch label is filename-only (no CSV); no tenor/baritone.

---

## 5. NSynth (Magenta / Google)

- **URL:** https://magenta.tensorflow.org/datasets/nsynth
- **Direct download index:** http://download.magenta.tensorflow.org/datasets/nsynth/
- **LICENSE VERDICT: USABLE** — CC BY 4.0 (made available by Google Inc. under Creative Commons Attribution 4.0 International).
- **Contents:** 305,979 musical notes from 1,006 instruments (commercial sample libraries). 11 instrument families: bass, brass, flute, guitar, keyboard, mallet, organ, reed, string, synth lead, vocal. **Saxophone falls under the "reed" family but is underrepresented** — published analysis notes fewer than ~100 electronic reed samples; reed is one of the least-represented families. Coverage spans MIDI 21–108 where the instrument physically supports it (avg 65.4 pitches per instrument). Five velocities (25, 50, 75, 100, 127). Three source classes: acoustic / electronic / synthetic.
- **Annotation type:** Per-note JSON metadata: MIDI pitch integer, instrument family, instrument source (acoustic/electronic/synthetic), instrument index within family, velocity, and up to 10 qualitative tags (e.g., bright, dark, percussive). NO f0 contour — pitch is a discrete label.
- **Audio format:** WAV, 16 kHz, mono, 4 s fixed length. (Also available as TFRecord.)
- **Approximate size:** ~25 GB across splits — train (289,205), validation (12,678), test (4,096).
- **Critical caveat:** 16 kHz sample rate truncates harmonics above ~7–8 kHz. Saxophone altissimo partials extend above that, so this format is unreliable for high-register octave-error testing. Saxophone subtype is NOT broken out in public metadata — you must filter the JSON to find sax entries.
- **Octave-error utility: MEDIUM-LOW for this use case.** Large and fully labeled, but the 16 kHz cap limits altissimo validity and sax content is sparse and requires manual filtering.

---

## 6. OrchideaSOL

- **URL (Zenodo):** https://zenodo.org/records/3686252
- **URL (Ircam Forum project):** https://forum.ircam.fr/projects/detail/orchideasol/
- **Project / datasets page:** https://www.orch-idea.org/datasets/
- **Paper:** https://arxiv.org/pdf/2007.00763
- **LICENSE VERDICT: UNCLEAR / RESTRICTED** — Audio data is governed by the proprietary **Ircam Forum License** and requires a (free) Ircam Forum subscription to download; redistribution of audio is prohibited without Ircam approval. The metadata CSV alone is CC BY 4.0. Some reports indicate full access may require a Premium Forum tier. Not cleanly open for a free/open app.
- **Contents:** 13,265 samples, each a single isolated note, 14 instruments including **Alto Saxophone** (no other sax types). Extends the original SOL dataset with many combinations of mutes and extended playing techniques. Three dynamic levels. Source recordings from Ircam, Paris, 1996–1999.
- **Annotation type:** CSV (13 columns), same structure as TinySOL — MIDI pitch ID, pitch notation string, dynamics level, technique abbreviation/name, instance IDs, string positions (where applicable), digital-retuning flags. (Covers MIDI 0–127 range labeling; example low note A#1.) Altissimo coverage for alto sax not explicitly documented; extended techniques may reach experimental high registers.
- **Audio format:** WAV, 44.1 kHz / 16-bit, mono, 2–10 s per clip.
- **Approximate size:** ~3.3–4.7 GB depending on version.
- **Octave-error utility: MEDIUM.** More technique variety than TinySOL, but the license ambiguity / Ircam Forum gating makes it risky for a free/open app, and audio cannot be redistributed.

---

## 7. URMP (University of Rochester Multi-Modal Music Performance)

- **URL:** https://labsites.rochester.edu/air/projects/URMP.html
- **Documentation PDF:** https://labsites.rochester.edu/air/projects/URMP/URMP_doc.pdf
- **Paper:** https://arxiv.org/pdf/1612.08727
- **LICENSE VERDICT: UNCLEAR** — Download requires filling out a Google Form (gated); no explicit CC license stated on the project page. Academic-use-only by convention. Contact: bochen.li@rochester.edu.
- **Contents:** 44 simple multi-instrument musical pieces assembled from coordinated but separately recorded individual tracks (so isolated per-instrument stems exist). 14 instruments including **soprano saxophone and tenor saxophone** (others: violin, viola, cello, double bass, flute, oboe, clarinet, bassoon, trumpet, horn, trombone, tuba). Piece breakdown: 11 duets, 12 trios, 14 quartets, 7 quintets. Content is musical **phrases/pieces, NOT isolated notes**.
- **Annotation type:** Frame-level ground-truth pitch annotations (46 ms analysis windows, 10 ms hop between frames). MIDI score + sheet-music PDF per piece. Per-piece, not per-note isolated labels.
- **Audio format:** WAV, 48 kHz / 24-bit (individual + mixed). Video: MP4 H.264, 1080p (1920×1080), 29.97 fps.
- **Approximate size:** 12.5 GB (full package). A sample folder is available without registration.
- **Octave-error utility: LOW-MEDIUM.** Phrase-level content makes it hard to unit-test one pitch at a time. Better suited for score-following / onset / audio-score-alignment validation than isolated-note octave-error testing.

---

## 8. MDB-stem-synth (MedleyDB derivative)

- **URL:** https://zenodo.org/records/1481172
- **Project info:** http://synthdatasets.weebly.com/mdb-stem-synth.html
- **mirdata loader:** https://mirdata.readthedocs.io/en/latest/_modules/mirdata/datasets/mdb_stem_synth.html
- **Paper:** Salamon et al., "An analysis/synthesis framework for automatic f0 annotation of multitrack datasets," ISMIR 2017.
- **LICENSE VERDICT: NC** — CC BY-NC 4.0 (Creative Commons Attribution-NonCommercial 4.0 International).
- **Contents:** 230 solo stems (tracks) from MedleyDB spanning a variety of instruments and voices, **resynthesized** (NOT original recordings) to obtain a perfect f0 annotation via analysis/synthesis. Saxophone stems are present but the exact count within the 230 is not enumerated.
- **Annotation type:** Per-stem CSV — two columns: timestamp + f0 in Hz. Hop size ~2.9 ms; unvoiced/silence marked as 0 Hz. **Most precise f0 annotation format of any dataset listed** (true continuous f0 contour).
- **Audio format:** Mono WAV (resynthesized timbre).
- **Approximate size:** ~1.8 GB (Zenodo archive).
- **Caveat:** Audio is resynthesized, so the timbre is NOT natural saxophone — it may not replicate the spectral ambiguity that triggers real octave errors on a physical sax. NC license.
- **Octave-error utility: MEDIUM.** Gold-standard annotation precision and format, but synthetic timbre undermines ecological validity for octave-error testing; saxophone count unclear.

---

## 9. IRMAS

- **URL (Zenodo):** https://zenodo.org/records/1290750
- **Project page:** https://www.upf.edu/web/mtg/irmas
- **LICENSE VERDICT: NC** — CC BY-NC-SA 3.0 (Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported).
- **Contents:** Designed for predominant-instrument recognition in polyphonic music. 11 pitched-instrument classes including **saxophone (sax)** — 626 saxophone samples in the training set. Training data: 6,705 audio files, 3-second excerpts from 2,000+ distinct recordings. **Polyphonic** (mixed music, not isolated sax).
- **Annotation type:** Instrument label only (predominant instrument present/absent). NO pitch annotation, NO onset annotation.
- **Audio format:** WAV, 44.1 kHz / 16-bit, stereo.
- **Approximate size:** ~1.5 GB.
- **Octave-error utility: VERY LOW.** No pitch labels, polyphonic context, short clips. Not usable for pitch-tracker validation.

---

## 10. Philharmonia Orchestra Samples

- **URL:** https://www.philharmonia.co.uk/explore/sound_samples/saxophone
- **Resources page:** https://philharmonia.co.uk/resources/sound-samples/
- **GitHub mirror:** https://github.com/skratchdot/philharmonia-samples
- **Internet Archive mirror:** https://archive.org/details/philharmonicorchestrasamples
- **LICENSE VERDICT: USABLE** — CC BY-SA 3.0 (Creative Commons Attribution-ShareAlike 3.0 Unported). "Free to use as you wish, including releasing them as part of a commercial work. The only restriction is they must not be sold or made available 'as is' (i.e. as samples or as a sampler instrument)."
- **Contents:** Saxophone samples recorded by Philharmonia (UK national orchestra) musicians, organized by instrument with multiple dynamics, articulations (long notes, staccato, etc.), and duration variables per note. Exact saxophone types (alto/tenor/soprano/baritone) not clearly confirmed from public metadata.
- **Annotation type:** Pitch encoded in filename only; NO f0 CSV, NO MIDI annotation file.
- **Audio format:** **MP3 (lossy)** — each instrument downloadable as a zip. MP3 encoding introduces harmonic artifacts at frequencies that matter for precision pitch analysis.
- **Approximate size:** Per-instrument zip files, small.
- **Octave-error utility: LOW-MEDIUM.** The MP3 format is a genuine problem for any precision pitch-tracker validation pipeline; no annotation files; sax types unconfirmed.

---

## 11. Filosax

- **URL (Zenodo, full):** https://zenodo.org/records/5625643
- **URL (Zenodo, Lite/2-track):** https://zenodo.org/records/5603104
- **Docs / home:** https://dave-foster.github.io/filosax/
- **GitHub:** https://github.com/dave-foster/filosax
- **mirdata loader:** https://mirdata.readthedocs.io/en/latest/_modules/mirdata/datasets/filosax.html
- **Paper:** D. Foster and S. Dixon (2021), "Filosax: A Dataset of Annotated Jazz Saxophone Recordings," ISMIR 2021. https://archives.ismir.net/ismir2021/paper/000025.pdf
- **LICENSE VERDICT: research-only** — Restrictive custom research license: non-commercial, limited to the individual and their research organization, non-transferable, no selling/leasing/distributing without written permission, mandatory citation. (The Zenodo record itself is tagged CC BY 4.0, but the actual usage terms you must agree to are restrictive.) Backing tracks must be acquired separately (pre-populated wish lists at jazzbooks.com).
- **Contents:** ~24 hours (some sources say ~35 hours across all stems) of jazz saxophone solos. 5 participants each record themselves playing the melody, interpreting a transcribed solo, and improvising across 48 backing tracks. Each piece has 7 audio files: Bass_Drums mix, Piano_Drums mix, and 5 solo saxophone files (one per participant). Saxophone type not explicitly documented (jazz convention suggests tenor and/or alto). Repertoire concentrates in mid-register.
- **Annotation type:** RICHEST of any sax dataset. Per-note events: onset/offset times, MIDI pitch, duration, bar number. Per-millisecond curves (1 sample/ms): f0 (pitch), loudness, spectral centroid, spectral flux. Vibrato data (frequency + extent). Harmonic analysis (chord changes, scale degrees). Section labels (head / written solo / improvised solo). Provided as JSON per recording, plus MIDI (frame-level + score-level), PDF and MusicXML of typeset solos.
- **Audio format:** Not explicitly specified in public docs (likely WAV).
- **Approximate size:** Zenodo record ~132.3 MB (likely audio-light metadata; full audio requires separate acquisition of backing tracks).
- **Octave-error utility: HIGH annotation quality**, but jazz repertoire stays in mid-register so extreme altissimo is unlikely to be systematically covered; license + third-party backing-track purchase are real barriers for a free/open app.

---

## 12. ChoraleBricks (2025)

- **URL (Zenodo):** https://zenodo.org/records/15081741
- **URL (AudioLabs project):** https://audiolabs-erlangen.de/resources/MIR/2025-ChoraleBricks
- **GitHub:** https://github.com/stefan-balke/choralebricks
- **Paper:** Balke, Berndt, Müller (2025), TISMIR. https://transactions.ismir.net/articles/10.5334/tismir.252
- **LICENSE VERDICT: USABLE** — CC BY 4.0 (Creative Commons Attribution 4.0 International).
- **Contents:** Modular multitrack dataset for wind-music research. 10 different chorales, each arranged in 4 parts (soprano, alto, tenor, bass). Isolated recordings of individual parts performed by a selection of wind/brass instruments including **saxophone** (specific sax type unspecified), plus flute, oboe, clarinet, trumpet, baritone, trombone, tuba. Provides isolated part recordings + ensemble mixes. Published 2025, actively maintained.
- **Annotation type:** Reference fundamental-frequency (f0) annotations as CSV — e.g., `01_as_f0_filled.csv` (processed F0 with unvoiced frames as zeros, the recommended file) plus raw annotation files. Note events. Sheet music + time-aligned symbolic representations + conducting videos. **One of the few open datasets with real per-frame f0 contour CSVs alongside saxophone audio.**
- **Audio format:** WAV (exported from Logic Pro).
- **Approximate size:** ~1.3 GB primary archive; ~54.5 hours total audio (≈2 h 10 m isolated tracks + ≈52 h 18 m ensemble recordings).
- **Octave-error utility: MEDIUM.** Real f0 contour annotations + isolated parts are useful, but chorale-style music stays in a narrow register, so it is unlikely to stress altissimo. Good for sustained-phrase tracking fidelity (a different failure mode from single-note octave errors).

---

# BEST PICKS (Ranked for Saxophone Octave-Error Detection)

### 1. MTG / Good-sounds Freesound Packs — TOP PICK (start here)
- Alto: https://freesound.org/people/MTG/packs/20239/ — Tenor: https://freesound.org/people/MTG/packs/20247/
- **Why:** Downloadable right now with zero login or form. CC BY 3.0 (fully usable in a free app). Confirmed isolated-note coverage — alto E3–G5 (MIDI 40–79) and tenor B2–E5 (MIDI 35–64) — spans every register boundary where a monophonic tracker commits octave errors (e.g., tenor low Bb/B vs. an octave up; alto low register vs. octave up). Real recordings at 48 kHz / 24-bit, MIDI pitch + note name in per-file metadata. Fastest path to a working validation set.

### 2. Good-sounds Full Dataset (Zenodo) — BEST FOR DEPTH (offline only)
- https://zenodo.org/records/4588740
- **Why:** The ONLY dataset covering all four saxophone types — alto, tenor, soprano, AND baritone (baritone sits in the worst octave-error register). Complete chromatic range per instrument, isolated notes + scales, multiple tonal qualities per note, FLAC 48 kHz / 32-bit. CC BY-NC 4.0 means use it freely for offline validation scripts — just do not bundle the audio inside the redistributed/commercial app. Use for systematic coverage of every semitone.

### 3. University of Iowa MIS — BEST ZERO-FRICTION / ZERO-RESTRICTION OPTION
- https://theremin.music.uiowa.edu/MIS.html
- **Why:** No license at all ("any projects, without restrictions"), no login, small download. Soprano + alto, anechoic, pp/mf/ff, vibrato + non-vibrato. Post-2012 24-bit / 96 kHz recordings are excellent quality for pitch analysis. Limitations: soprano + alto only (no tenor/baritone), pitch label is filename-only (no CSV). Perfect for a quick "does the tracker flip an octave on a low note?" test with the alto.

### 4. TinySOL (Zenodo) — BEST FULLY-OPEN STRUCTURED DATASET / AUTOMATED HARNESS
- https://zenodo.org/records/3685367
- **Why:** CC BY 4.0 with NO NC clause, CSV metadata with a MIDI pitch column, integrates with the `mirdata` Python loader out of the box. Alto sax at three dynamics. The structured CSV makes a repeatable CI/regression test suite across all standard notes straightforward. Limitations: alto only, and altissimo range likely limited. Pair with the Freesound packs to also cover tenor.

### 5. ChoraleBricks (2025) — BEST FOR F0-CONTOUR / SUSTAINED-PHRASE TESTING
- https://zenodo.org/records/15081741
- **Why:** The only fully-open (CC BY 4.0) dataset with actual per-frame f0 contour CSV annotations alongside real saxophone audio. Use it to verify the tracker follows a sustained melodic line without drifting an octave mid-phrase — a different failure mode from single-note onset octave errors. 2025 publication, actively maintained.

---

## Practical Workflow Recommendation

- **Octave-error unit tests (single notes):** Use the **MTG Freesound packs** (immediate, no friction, CC BY) + **Iowa MIS** to get real notes across the full standard range with zero legal friction.
- **Automated CI regression coverage:** Add **TinySOL** (alto, structured CSV, CC BY, mirdata loader).
- **Deep/systematic coverage of all four sax types:** Add **Good-sounds full dataset** (NC, offline only) — the only source for tenor + baritone + soprano + alto across the complete chromatic range.
- **Sustained-phrase / f0-contour drift testing:** Add **ChoraleBricks** (CC BY 4.0, real f0 contour CSVs).
- **Avoid:** NSynth (16 kHz truncates altissimo harmonics; sax sparse), Philharmonia (MP3 artifacts; no annotations), IRMAS (no pitch labels; polyphonic), OrchideaSOL (proprietary Ircam Forum audio license), URMP (phrase-level, form-gated, unclear license), MDB-stem-synth (resynthesized — not natural sax timbre, NC), Filosax (research-only license + separate backing-track purchase).

**Key span confirmation:** The MTG Freesound packs together provide tenor B2 (MIDI 35) through alto G5 (MIDI 79) — a 44-semitone span crossing every register boundary where a monophonic tracker is likely to commit an octave error. This is the confirmed lowest-barrier starting point.

---

## Source URLs (consolidated)

- NSynth — https://magenta.tensorflow.org/datasets/nsynth | http://download.magenta.tensorflow.org/datasets/nsynth/
- Good-sounds (Zenodo) — https://zenodo.org/records/4588740
- Good-sounds (MTG/UPF) — https://www.upf.edu/web/mtg/good-sounds
- Good-sounds mirdata — https://mirdata.readthedocs.io/en/latest/_modules/mirdata/datasets/good_sounds.html
- TinySOL — https://zenodo.org/records/3685367
- OrchideaSOL (Zenodo) — https://zenodo.org/records/3686252
- OrchideaSOL (Ircam Forum) — https://forum.ircam.fr/projects/detail/orchideasol/
- Orchidea datasets — https://www.orch-idea.org/datasets/
- MTG Freesound alto pack — https://freesound.org/people/MTG/packs/20239/
- MTG Freesound tenor pack — https://freesound.org/people/MTG/packs/20247/
- MTG Freesound Sax Alto E3 — https://freesound.org/people/MTG/sounds/358413/
- MTG Freesound Sax Tenor B2 — https://freesound.org/people/MTG/sounds/359184/
- University of Iowa MIS — https://theremin.music.uiowa.edu/MIS.html
- URMP — https://labsites.rochester.edu/air/projects/URMP.html
- URMP doc PDF — https://labsites.rochester.edu/air/projects/URMP/URMP_doc.pdf
- MDB-stem-synth (Zenodo) — https://zenodo.org/records/1481172
- MDB-stem-synth info — http://synthdatasets.weebly.com/mdb-stem-synth.html
- IRMAS (Zenodo) — https://zenodo.org/records/1290750
- IRMAS (MTG/UPF) — https://www.upf.edu/web/mtg/irmas
- Philharmonia saxophone — https://www.philharmonia.co.uk/explore/sound_samples/saxophone
- Philharmonia GitHub mirror — https://github.com/skratchdot/philharmonia-samples
- Filosax (Zenodo full) — https://zenodo.org/records/5625643
- Filosax (Zenodo Lite) — https://zenodo.org/records/5603104
- Filosax docs — https://dave-foster.github.io/filosax/
- Filosax paper — https://archives.ismir.net/ismir2021/paper/000025.pdf
- ChoraleBricks (Zenodo) — https://zenodo.org/records/15081741
- ChoraleBricks (AudioLabs) — https://audiolabs-erlangen.de/resources/MIR/2025-ChoraleBricks
- ChoraleBricks paper — https://transactions.ismir.net/articles/10.5334/tismir.252
