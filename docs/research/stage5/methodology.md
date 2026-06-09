# Real-Time Monophonic Pitch Detection & Score-Following Validation Without a Saxophone

## A Deep-Research Methodology Report for a Browser-Based Score Follower

**Context:** A solo developer with no saxophone wants to build and validate a real-time, mic-based, monophonic score follower that grades pitch in cents and onset timing against a known saxophone score (green/yellow/red per note) in a browser app. This document covers how real-time monophonic pitch detection and score following are validated *without access to the target instrument*, both in MIR research and in products, and ends with a concrete tiered validation plan a no-sax solo dev can actually run.

---

## 1. SYNTH-IN-THE-LOOP / RESYNTHESIS EVALUATION

### 1.1 What the MIR field does

The standard MIR practice for controlled pitch-detector evaluation is **analysis/synthesis resynthesis**: take a real recording, extract its fundamental-frequency (f0) contour, resynthesize audio from that contour, and use the synthesis parameters as perfect ground truth. This eliminates human-annotation subjectivity entirely, because the ground truth is the synthesis input, not a human estimate. The two canonical datasets built on this principle are:

**MDB-stem-synth** (Zenodo, 2018)
- 230 mono WAV stems extracted from MedleyDB, then resynthesized.
- Sample rate 44.1 kHz; hop size 128/44100 ≈ 2.9 ms.
- Spans 25 instruments (including saxophone family, bass clarinet, bamboo flute), totaling 15.56 hours of audio.
- 230 CSV files contain frame-by-frame f0 in Hz with timestamps; silence marked as 0 Hz.
- File naming convention: `<artist>_<songtitle>_STEM_<stemID>.RESYN.wav`.
- Created with the analysis/synthesis framework from the ISMIR 2017 paper by researchers at NYU Music and Audio Research Lab (MARL) and Universitat Pompeu Fabra Music Technology Group (MTG). The dataset preserves the timbre and dynamics of the original track while obtaining a perfect f0 annotation as a byproduct of resynthesis.
- The dataset description states plainly: "The audio is re-synthesized from its f0 annotations, which means that the f0 annotations are perfect."
- Sources: http://synthdatasets.weebly.com/mdb-stem-synth.html and https://zenodo.org/records/1481172

**RWC-synth**
- 6.16 hours of audio synthesized from the RWC Music Database.
- Signals synthesized using a fixed sum of a small number of sinusoids, making the dataset highly homogeneous in timbre.
- The CREPE authors explicitly describe it as representing "an over-simplified scenario."
- Source: https://ar5iv.labs.arxiv.org/html/1802.06182

Both datasets are used specifically to enable objective comparison. The CREPE paper (Kim, Salamon, Li, Bello, ICASSP 2018) states the rationale directly: "To guarantee a perfectly objective evaluation, datasets of synthesized audio are used in which there is perfect control over the f0 of the resulting signal." RWC-synth serves as the controlled, homogeneous baseline; MDB-stem-synth serves as the diverse-timbre stress test.

The analysis/synthesis framework underlying MDB-stem-synth is described in:
- Salamon, Bittner, Bonada, Bosch, Gómez, Bello, "An Analysis/Synthesis Framework for Automatic F0 Annotation of Multitrack Datasets," ISMIR 2017. ResearchGate landing: https://www.researchgate.net/publication/324922376_An_AnalysisSynthesis_Framework_for_Automatic_F0_Annotation_of_Multitrack_Datasets

### 1.2 Does the MIR field treat synth-in-the-loop as valid?

Yes — explicitly, and as a necessary tool, but with clearly stated boundaries.

Evidence the practice is accepted:
- CREPE (ICASSP 2018) uses RWC-synth and MDB-stem-synth as its two primary evaluation datasets precisely because synthesized audio gives perfect f0 control. https://ar5iv.labs.arxiv.org/html/1802.06182
- The lars76 pitch-benchmark (a 2024-era comprehensive benchmark of 12 detectors) uses Bach10Synth, MDBStemSynth, NSynth, SpeechSynth among its 8 datasets. https://github.com/lars76/pitch-benchmark
- Score following uses the identical pattern: most score followers synthesize the MIDI/MusicXML score to audio (commonly with FluidSynth) and treat tracking as audio-to-audio alignment. Matchmaker (the leading open-source real-time piano score follower) synthesizes scores with FluidSynth at 44.1 kHz, with synthesis tempo set to each performance's average rounded to the nearest 20 BPM. In the pure-MIDI condition the ground-truth warping path is the main diagonal of the DTW cost matrix, i.e., mathematically exact. https://arxiv.org/html/2510.10087v1
- The general principle is endorsed in the multitrack-mixing literature: algorithms evaluated on automatically generated/annotated mixes produce results "statistically indistinguishable" from those produced on the original, manually annotated mixes — i.e., synthesized data can be valid for evaluation.

Evidence of the stated boundaries (what it does NOT prove):
- CREPE RPA drops from 0.999 on homogeneous RWC-synth to 0.967 on diverse MDB-stem-synth; pYIN drops from 0.990 to 0.919; SWIPE from 0.963 to 0.925. The degradation "was more significant for the baseline algorithms," demonstrating that synthetic homogeneity inflates scores and that diverse resynthesis is far more predictive of real behavior. https://ar5iv.labs.arxiv.org/html/1802.06182
- The piano transcription literature warns that "inference performance has been observed to deteriorate substantially when applied on out-of-distribution data," distinguishing MAPS (which contains synthesized audio) from MAESTRO (real Disklavier recordings). https://arxiv.org/html/2406.08454

### 1.3 What synth-in-the-loop proves vs. does NOT prove

PROVES (relative to real recordings):
- The detector's f0 estimation logic is mathematically correct.
- The detector handles pitch-correct timbre diversity (MDB-stem-synth covers 25 instruments).
- The score-follower's tracking/alignment algorithm is correct given clean pitch input.
- The grader correctly flags injected errors at the specified cents/ms tolerances.

Does NOT PROVE:
- Generalization to real saxophone breath noise, reed squeak, key clicks, mouthpiece/embouchure tonal coloration.
- Behavior in dynamic extremes: pianissimo subtones (fundamental nearly vanishes), fortissimo altissimo (harmonics dominate, no strong fundamental).
- Robustness to real microphone bleed, room reverb, and performer pitch drift during warmup.
- Real-time latency under browser/OS audio-pipeline jitter (offline analysis hides this).

The clean summary: synthesized evaluation validates algorithm LOGIC; real recordings validate ROBUSTNESS to acoustic confounders. For a score follower grading pitch in cents and onset in ms, logic correctness (Tiers 1–2) can be validated fully without a real saxophone.

---

## 2. OBJECTIVE METRICS

All five standard MIR melody-evaluation metrics are implemented in `mir_eval.melody`. Reference docs: https://mir-eval.readthedocs.io/stable/api/melody.html and the source at https://github.com/mir-evaluation/mir_eval/blob/main/mir_eval/melody.py . The library paper is "mir_eval: A Transparent Implementation of Common MIR Metrics" (Raffel, McFee, Humphrey, et al., ISMIR 2014): https://archives.ismir.net/ismir2014/paper/000320.pdf

The five global melody measures were introduced in MIREX 2005 and remain the de facto standard.

### 2.1 Definitions and how to compute each

Preprocessing: `mir_eval.melody.to_cent_voicing(ref_time, ref_freq, est_time, est_freq)` resamples the estimate to the reference timebase, converts frequencies from Hz to cents (base frequency default 10 Hz), and extracts voicing arrays (0 Hz = unvoiced). A negative frequency in the estimate means "predicted unvoiced, but here is the pitch estimate if it were actually voiced." All metric functions require equal-length voicing and frequency arrays after preprocessing.

**Voicing Recall (VR)**
- Proportion of frames labeled voiced (melody) in the reference that are estimated as voiced.
- VR = (frames voiced in both estimate and reference) / (total voiced frames in reference)
- Low VR means the detector is silencing real notes.

**Voicing False Alarm Rate (VFA)**
- Proportion of frames labeled non-melody (unvoiced) in the reference that are mistakenly estimated as voiced.
- VFA = (falsely voiced frames) / (total unvoiced frames in reference)
- High VFA means spurious pitch output during rests/breath gaps.

**Raw Pitch Accuracy (RPA)**
- Over voiced reference frames: proportion where the estimated frequency is within a cent tolerance (default ±50 cents = one quarter-tone) of the reference.
- RPA = (correctly pitched voiced frames) / (total voiced frames in reference)
- The 50-cent (quarter-tone) tolerance is the MIR standard, perceptually motivated: beyond half a semitone a note is typically heard as a different pitch.

**Raw Chroma Accuracy (RCA)**
- Identical to RPA but with octave equivalence: both estimate and reference frequencies are mapped (modulo octave) to a single octave before the ±50-cent comparison.
- RCA ≥ RPA always.
- KEY DIAGNOSTIC: (RCA − RPA) is the octave-error rate. A large gap means octave flips dominate the errors — the central saxophone failure mode.

**Overall Accuracy (OA)**
- Combines voicing and pitch over ALL frames (voiced and unvoiced).
- OA = (correctly identified unvoiced frames + correctly pitched voiced frames) / (total frames)

### 2.2 Onset detection F-measure

Onset accuracy is evaluated separately via `mir_eval.onset.f_measure`. Docs: https://mir-eval.readthedocs.io/stable/api/onset.html ; worked example: https://musicinformationretrieval.com/content/6_evaluation/evaluation_onset.html
- An estimated onset is "correct" if it falls within a tolerance window of a reference onset; the mir_eval default window is 50 ms (onset detectors are commonly evaluated with windows between 50 and 100 ms).
- Precision, Recall, and F-measure are computed from correct detections, false positives, and false negatives. F-measure is the primary ranking metric.
- Call: `f, p, r = mir_eval.onset.f_measure(reference_onsets, estimated_onsets, window=0.05)`

For note-level transcription (onset + pitch jointly), `mir_eval.transcription` requires the pitch to match within tolerance AND the onset within 50 ms (offset tolerance commonly 50 ms or 20% of the note duration). Docs: https://mir-eval.readthedocs.io/latest/api/transcription.html

### 2.3 The cents/ms tolerance grading model (SmartMusic-style)

SmartMusic / MakeMusic Cloud assesses three categories with adjustable settings: pitch measured in cents, onset measured in milliseconds, duration measured as a percentage. A Tolerance dropdown offers Easy/Lenient, Average, and Strict bands. In the score view, green noteheads indicate the correct pitch played at the correct time; red noteheads indicate incorrect pitch or timing. SmartMusic scores only pitch and rhythm, not dynamics/articulation/tone, and notes that microphone quality affects accuracy.
- Grading docs: https://help.makemusic.com/hc/en-us/articles/360026370553-Grading
- Playing/practicing docs: https://help.makemusic.com/hc/en-us/articles/360026213774-Playing-and-Practicing-Music
- Assessment-tolerance community post: https://help.makemusic.com/hc/en-us/community/posts/360033645714-12-18-18-Assessment-tolerance

Perceptual anchors for choosing thresholds:
- A +50-cent cutoff is justified perceptually: a note off by more than half a semitone is likely perceived as the other note. https://www.acoustics.asn.au/journal/2010/2010_38_1_Gunawan_Schubert.pdf
- Singing accurate to ±25 cents is functionally in tune; deviations beyond ±50 cents are clearly audible as out of tune.

Recommended grading tiers for the browser app:

| Color  | Pitch deviation        | Onset deviation     |
|--------|------------------------|---------------------|
| Green  | ≤ 50 cents             | ≤ 50 ms             |
| Yellow | 51–100 cents           | 51–150 ms           |
| Red    | > 100 cents or wrong chroma | > 150 ms or missed |

### 2.4 mir_eval code pattern

```python
import mir_eval

# Reference (from score) and estimate (from detector), times in seconds, freqs in Hz
ref_v, ref_c, est_v, est_c = mir_eval.melody.to_cent_voicing(
    ref_times, ref_freqs_hz, est_times, est_freqs_hz)

vr, vfa = mir_eval.melody.voicing_measures(ref_v, est_v)
rpa     = mir_eval.melody.raw_pitch_accuracy(ref_v, ref_c, est_v, est_c)
rca     = mir_eval.melody.raw_chroma_accuracy(ref_v, ref_c, est_v, est_c)
oa      = mir_eval.melody.overall_accuracy(ref_v, ref_c, est_v, est_c)

octave_error_rate = rca - rpa   # positive => octave flips present

# Onset grading (times in seconds)
f, p, r = mir_eval.onset.f_measure(ref_onsets_sec, est_onsets_sec, window=0.050)
```

Note: the default melody pitch tolerance in mir_eval is ±50 cents (threshold returns 1 if |Δ| < 50 cents, else 0). Source: https://github.com/mir-evaluation/mir_eval/blob/main/mir_eval/melody.py

---

## 3. INJECTED-ERROR TESTING

### 3.1 Is it a recognized practice?

Yes — explicitly, and with published algorithmic detail in peer-reviewed/preprint MIR work.

**LadderSym** (Chou, Jajal, et al., "LadderSym: A Multimodal Interleaved Transformer for Music Practice Error Detection," arXiv 2510.08580, 2025) formalizes error injection as Algorithm 1:
- Notes are randomly selected with probability λ ~ Uniform(0.1, 0.4).
- Each selected note receives one of four error types:
  - Missed note: the note is removed.
  - Pitch change: pitch offset by ε_p ~ N(0, 1) semitones (truncated). A pitch error = good onset but wrong pitch.
  - Timing shift: onset offset by ε_t ~ N(0, 0.02) beats (truncated). A timing error = correct pitch but wrong onset.
  - Extra note: a new note inserted with sampled pitch and timing offsets (truncated normals).
- The authors state these distributions "reflect realistic variations observed in human performance."
- Evaluation: Error Detection F1 computed per category (Missed, Extra, Correct), using mir_eval's 50 ms onset tolerance and requiring pitch match.
- Datasets: MAESTRO-E (1000+ tracks, 200k+ injected errors; piano) and CocoChorales-E (40k+ tracks, 25k+ errors; 13 instruments). Results: missed-note F1 on MAESTRO-E more than doubled (26.8% → 56.3%); extra-note detection improved 72.0% → 86.4%.
- Crucially, the authors validate the synthetic-error approach by ALSO collecting a real-world beginner dataset (20 pieces, 161 annotated human errors) to confirm generalization beyond synthetic data.
- Sources: https://arxiv.org/abs/2510.08580 and full HTML https://arxiv.org/html/2510.08580

**RUMAA** ("Repeat-Aware Unified Music Audio Analysis for Score-Performance Alignment, Transcription, and Mistake Detection," arXiv 2507.12175) uses the same paradigm: it systematically introduces performance errors (wrong notes, timing deviations, missed passages) into synthesized performances to evaluate mistake detection, described as a controlled approach that "reveals the system's sensitivity to various error types and magnitudes." It validates on the (n)ASAP and Vienna4x22 datasets and uses synthesized audio for controlled error injection. Source: https://arxiv.org/pdf/2507.12175

**ISMIR 2025 LBD** ("Towards Intelligent Music Education: Score-Informed Transcription and Performance Assessment") detects pitch errors, rhythm errors, tempo deviations, structural mistakes, and intonation issues by aligning transcribed results with reference scores. Source: https://ismir2025program.ismir.net/lbd_482.html

### 3.2 Canonical injected-error test battery for a score grader

1. Detune test: render the score at +0, +25, +50, +75, +100, +150 cents above each target note. Verify the grader transitions green → yellow → red at the correct cents thresholds.
2. Onset shift test: shift each note-on early/late by 0, ±25, ±50, ±75, ±100, ±200 ms. Verify timing grading boundaries.
3. Wrong-note test: substitute the target pitch with ±1, ±2, ±3 semitones and ±1 octave. Verify detection; confirm ±12 semitones registers as an RCA hit (right chroma) but RPA miss (wrong octave), distinguishing octave errors from wrong-chroma errors.
4. Vibrato test: add sinusoidal ±30-cent vibrato at ~5 Hz. Verify the grader uses a per-note median rather than instantaneous pitch (so vibrato is not penalized).
5. Silence/breath test: insert unvoiced frames mid-note. Verify VFA stays near 0 (no spurious voiced output).
6. Dynamic extreme test: render pp (low MIDI velocity) and ff (high velocity). Verify confidence/clarity gating does not falsely silence soft notes.

This battery is methodologically equivalent to the LadderSym/RUMAA injection protocols, scaled down to a monophonic single-line grader.

---

## 4. THE SAXOPHONE OCTAVE-ERROR PROBLEM AND MITIGATIONS

### 4.1 Why saxophone is hard

The saxophone has a conical bore, which produces a rich mix of both even and odd harmonics. The second harmonic (2f, one octave above the fundamental) is often comparable in amplitude to the fundamental — sometimes stronger. This causes octave errors (the detector reports 2× the true frequency) especially in three regimes:

- Low register (around written low Bb up through the bottom of the staff): the fundamental is weak relative to upper partials, so autocorrelation/period-based detectors lock onto the period of the dominant harmonic rather than the true fundamental.
- Subtones (pianissimo below the staff): the fundamental nearly disappears; the 2nd harmonic dominates the spectrum entirely.
- Altissimo (above written C6): the player intentionally drives 3rd/4th and higher harmonics; there is no strong fundamental present by design.

Acoustic note: on saxophone the octave (register) key takes the instrument from the fundamental (lower register) to the FIRST overtone/partial (upper register), with the jump occurring between written C#2 and D2 area of the register break. This even-harmonic richness is exactly what makes 2f-vs-f ambiguity severe, unlike the clarinet (cylindrical bore, odd harmonics, overblows a twelfth).

Mechanism, stated by practitioners and patents:
- "When a pitch detector makes an 'octave error', it is because there really is an objective ambiguity of what the fundamental frequency of the note is." Adding even a -80 dB component at f/2 to an A-440 tone creates mathematical ambiguity even though humans hear A-440. https://www.cycfi.com/2017/10/fast-and-efficient-pitch-detection/
- "When the first harmonic of a signal is not visible, the pitch may be erroneously estimated as the frequency of the second harmonic, or twice the value of the actual pitch — such an error is referred to as an octave error." (US Patent 9530434, "Reducing octave errors during pitch determination for noisy audio signals.")
- A saxophone's conical shape allows a mix of even and odd harmonics; the second harmonic is one octave above the fundamental, which aligns with simple musical intervals and makes octave confusion likely.

Diagnostic: if RCA >> RPA on saxophone audio, the dominant failure is octave flip.

Empirical note from CREPE on the saxophone family specifically: CREPE was evaluated per-track on MDB-stem-synth; it performs worse for instruments with higher average frequencies, and performance depends on timbre. "There are 5 instruments (bass clarinet, bamboo flute, and the family of saxophones) that occur only once in the dataset, but their performance is decent, because their timbres do not deviate too far from other instruments in the dataset." https://ar5iv.labs.arxiv.org/html/1802.06182

### 4.2 Concrete mitigations, ranked by effectiveness (for a score follower)

**1. Expected-pitch prior from the score — MOST powerful, and unique to a score follower.**
Because the follower knows the next expected note, the expected f0 is known before the player sounds it. Weight pitch candidates by proximity (in cents) to the score-expected f0. If the raw detector outputs f0\* = 2 × f_score (a one-octave flip), then |f0\* − f_score| = 1200 cents while |f0\*/2 − f_score| = 0 cents, so select f0\*/2 with confidence. This collapses the dominant saxophone error mode that a general-purpose detector cannot solve.
- "Integrating an original musical score into the pitch detection algorithm serves as a reference and enhances pitch detection by providing shorter windows and more accurate determination of the octave." (US Patent 9552741.)
- Score-Informed Networks for Music Performance Assessment (arXiv 2008.00203) stack aligned pitch-contour + score pairs as CNN input; the score directly constrains pitch/octave. https://arxiv.org/pdf/2008.00203 ; group page: https://musicinformatics.gatech.edu/publication/score-informed-networks-for-music-performance-assessment/
- "An expected-performance-value of the current frame can be generated referring to score-information in real time," used to compare against the live signal.

**2. Octave-continuity prior via HMM/Viterbi (pYIN).**
pYIN (Mauch & Dixon, "PYIN: A fundamental frequency estimator using probabilistic threshold distributions," ICASSP 2014) replaces YIN's single threshold with a distribution, yielding multiple f0 candidates per frame; an HMM is Viterbi-decoded over time so that octave jumps between frames are penalized — an implicit octave-continuity prior. The Viterbi path does not average pitches; it selects among genuine YIN candidates. A second HMM Viterbi pass produces note segmentation.
- IEEE Xplore: https://ieeexplore.ieee.org/document/6853678/
- Code (Vamp plugin + project): https://code.soundsoftware.ac.uk/projects/pyin and https://github.com/c4dm/pyin
- Practical octave heuristic in monophonic material: discard a new onset if a note was already detected exactly one octave (12 semitones) below the current value. (DAFx-16: https://www.dafx.de/paper-archive/2016/dafxpapers/35-DAFx-16_paper_22-PN.pdf)

**3. Confidence/clarity gating.**
Derive a confidence score from how concentrated the probability mass is around the peak, and declare frames below threshold UNVOICED instead of emitting a guess. This stops subtones and weak fundamentals from producing spurious octave-flipped outputs.
- SwiftF0 derives "a voicing confidence score based on how much total probability mass lies within the local window," thresholding around 90%. https://arxiv.org/html/2508.18440v1
- CREPE outputs a probability distribution over 360 pitch bins; confidence = peak probability. Practical gate: if confidence < ~0.70, emit unvoiced. https://github.com/marl/crepe
- For MPM/NSDF (McLeod Pitch Method), the NSDF clarity value at the chosen peak serves the same role; gate on a clarity threshold.

**4. Median smoothing.**
Apply a median filter over ~3–5 frames (≈60–150 ms at a 32 ms hop) to the pitch-in-cents stream. Octave flips are isolated transient outliers; a median filter removes them while preserving legato contour. A "smart-median post-processing algorithm" is a recognized fix for incorrect pitches. Caveat: SwiftF0's authors note that for CNN detectors "smoothing produces fewer improvements than the regression loss itself," so median smoothing matters MORE for classical detectors (YIN, MPM) than for CREPE/SwiftF0. https://arxiv.org/html/2508.18440v1

**5. Detector choice.**
Benchmark (lars76/pitch-benchmark, harmonic-mean accuracy across 8 datasets incl. MDBStemSynth): https://github.com/lars76/pitch-benchmark

| Detector     | Avg accuracy | Octave handling                              | Real-time viable | Notes |
|--------------|--------------|----------------------------------------------|------------------|-------|
| SwiftF0      | 90.2%        | Classification + regression loss; conf gate  | Yes              | Best overall (2025) |
| RMVPE        | 87.2%        | Robust model architecture                    | Moderate         | Strong, robust across SNR |
| CREPE (large)| 85.3%        | 360-bin confidence distribution              | Yes (~CNN cost)  | Best noise robustness; sax family "decent" on MDB-stem-synth |
| pYIN         | 78.7%        | HMM Viterbi (explicit octave-continuity prior)| Yes             | Best classical; built-in temporal coherence |
| SWIPE        | 65.9%        | Uses first + prime harmonics only            | Yes              | Avoids even-harmonic confusion (attractive for sax) but low overall accuracy |
| YIN / MPM    | ~70% (typ.)  | None built-in                                | Fastest          | Needs post-processing (median + gating) |

Additional comparison facts:
- CREPE performs equally or better than pYIN and is more robust to complex timbres than pYIN and SWIPE; CREPE keeps the highest accuracy across SNR levels for pub/white noise (exception: pYIN/YIN is nearly unaffected by brown noise). On RWC-synth CREPE RPA = 0.999 at 50 cents, 0.999 at 25 cents, 0.995 at 10 cents — over an order of magnitude lower error than baselines. https://ar5iv.labs.arxiv.org/html/1802.06182
- On real-world iKala vocals, pYIN = 91% RPA and CREPE = 90.5% RPA — useful real-recording baselines for a monophonic pitch tracker.
- SWIPE deliberately uses cross-correlation against a sawtooth and exploits only first/prime harmonics to reduce octave errors — conceptually good for saxophone's even harmonics, but its low overall accuracy makes it a poor standalone choice.

RECOMMENDED PRODUCTION STACK: pYIN or CREPE (detector) + score-expected-f0 prior (octave disambiguation, #1) + confidence/clarity gate at ~0.70 (#3) + 3-frame median smoother (#4). This pairs an algorithmic octave-continuity mechanism (pYIN's Viterbi or CREPE's confidence) with the score follower's unique knowledge advantage. For a pure-browser, no-GPU deployment, pYIN (or an MPM/NSDF time-domain detector with gating + median + score prior) is the most practical real-time choice; CREPE/SwiftF0 via ONNX/WebAssembly are options if compute allows.

---

## 5. CONCRETE TIERED VALIDATION PLAN (No Saxophone Required)

The plan moves from pure logic (no hardware, no recordings) to the irreducible residual that genuinely needs a real instrument.

### Tier 1 — Unit / Synthetic: pure algorithm correctness (0 instrument, 0 recordings)

Goal: verify the pitch detector, onset detector, and grader logic are mathematically correct.

Tests:
- Generate pure sine waves at exact MIDI frequencies (A4 = 440 Hz, etc.) via scipy.signal or the Web Audio `OscillatorNode`. Feed to the detector; expect RPA = 1.00.
- Generate sines at target ±25/±50/±75/±100/±150 cents; verify the cents-error output and the green/yellow/red assignment at the correct thresholds.
- Generate pure silence and white-noise-only buffers; verify VFA ≈ 0 (no spurious voiced frames).
- Generate onset impulses at known ms timestamps; verify `mir_eval.onset.f_measure(window=0.05)` = 1.00.
- Compute (RCA − RPA) on all clean-sine tests; it must be 0.00 (no octave errors are possible with pure tones).

Tooling: Python + scipy + mir_eval. Effort ≈ half a day. No audio hardware.

### Tier 2 — Synth-in-the-loop + injected errors (0 instrument, 0 recordings)

Goal: validate the full pipeline (SoundFont render → detector → score follower → grader) on a controlled sax-like timbre, and verify the grader correctly flags every injected error type.

Step 2a — SoundFont rendering:
- Download a freely licensed saxophone SoundFont (e.g., GeneralUser GS, which contains alto/tenor sax patches; or a dedicated sax .sf2 from FreePats). GeneralUser GS is the same family used in score-following research (training sets generated from MIDI via the GeneralUser GS SoundFont).
- Render the target score MIDI via FluidSynth: `fluidsynth -F output.wav GeneralUser.sf2 score.mid` (FluidSynth is the standard synth used by Matchmaker and other score followers).
- Use an 8–16 note excerpt spanning the instrument's full written range (e.g., low Bb to high F#).
- Run the detector; compute RPA/RCA/VR/VFA/OA via mir_eval. Targets: RPA ≥ 0.92 (matching CREPE's 0.967 on MDB-stem-synth as an upper reference for diverse timbre), and (RCA − RPA) < 0.03 with the score prior active.

Step 2b — Injected-error battery (the LadderSym/RUMAA methodology, monophonic scale):
- Detune: render with pitch-bend at +25/+50/+100/+200 cents; verify grader thresholds.
- Onset shift: offset MIDI note-on by ±25/±50/±100/±200 ms via mido / pretty_midi; verify timing grading.
- Wrong notes: substitute MIDI pitches by ±1/±2/±12 semitones; verify detection, and confirm ±12 registers as RCA-correct / RPA-incorrect (octave error) rather than wrong chroma.
- Vibrato: apply ±30-cent LFO at ~5 Hz via pitch-bend; verify per-note median grading is stable (vibrato not penalized).
- Dynamic extremes: render velocity ~20 (pp) and ~110 (ff); verify the confidence/clarity gate does not silence pp notes.
- Octave-flip stress test: render a note one octave below the expected (e.g., written E4 → E3); verify the score prior corrects it and the octave-error metric catches any residual.

Pass criteria for Tier 2: all injected errors classified correctly; RPA ≥ 0.92 on the clean render; octave-error rate (RCA − RPA) < 0.03 with the score prior on.

Tooling: FluidSynth, Python, mir_eval, mido/pretty_midi. Effort ≈ 1–2 days.

### Tier 3 — Real-recording datasets (0 instrument; uses existing public recordings)

Goal: validate generalization from SoundFont timbre to real acoustic recordings.

Free datasets containing saxophone or close monophonic wind/voice:
- MDB-stem-synth — includes saxophone-family stems (sparse but present); compare RPA on the resynthesized stems and, where available, on the corresponding MedleyDB original stems. https://zenodo.org/records/1481172
- RWC Music Database (RWC-MDB-I-2001, Instrument Sound) — includes saxophone; free with registration. https://staff.aist.go.jp/m.goto/RWC-MDB/
- Bach10 — 10 Bach chorales with soprano saxophone as one of four instruments; ground-truth f0 annotations included (the synthesized variant Bach10Synth appears in lars76/pitch-benchmark). https://github.com/lars76/pitch-benchmark
- iKala — real monophonic vocal stems; documents baselines pYIN = 91% RPA, CREPE = 90.5% RPA, useful as a real-recording sanity check for the pitch tracker.
- URMP — multi-instrument recordings with aligned scores and f0 (woodwind/brass timbres) for cross-instrument generalization, even though it lacks saxophone.

Tests:
- Run the detector + score prior on available sax stems; compute RPA/RCA/OA.
- Compare (RCA − RPA) between SoundFont renders (Tier 2) and real sax (Tier 3); a gap > 0.05 quantifies the real-sax octave-error exposure that the score prior must absorb in production.
- Where annotations allow, test across dynamics/registers.

Tooling: Python + mir_eval + the datasets above. Effort ≈ 1 day (plus dataset registration time).

### Tier 4 — The true residual (genuinely needs a real saxophone)

After Tiers 1–3, everything that can be validated without an instrument has been. The irreducible residual:

1. Breath noise and reed squeak/key clicks — not modeled by SoundFonts; can confuse onset detection at soft dynamics.
2. Subtone and altissimo extremes — SoundFont velocity-127 is not real altissimo; the real-sax octave-flip rate in pp low Bb may far exceed any synthesized proxy.
3. Intonation drift — a real saxophone drifts ~±20 cents during warmup and with temperature/humidity; SoundFonts are perfectly stable.
4. Microphone placement effects — proximity effect, reflections/room modes, stand vibration — only testable with a real mic + real instrument.
5. Browser real-time latency — WebAudio `MediaStreamSource` latency (typically ~20–100 ms depending on OS/buffer/browser) can only be measured with a live input signal.
6. Perceptual validity of the grading — whether green/yellow/red feedback feels correct to a player requires human testing with an instrument.

Pragmatic Tier 4 path without owning a saxophone: book a single ~30-minute paid session with a local saxophone student (TaskRabbit, Fiverr, or a university music department). Have them play scales plus your test score into the browser app while you simultaneously record the raw microphone input to a file for offline mir_eval analysis. This is a one-time validation session, not a continuous development dependency.

---

## SOURCES (all URLs)

Datasets and resynthesis:
- MDB-stem-synth dataset page: http://synthdatasets.weebly.com/mdb-stem-synth.html
- MDB-stem-synth on Zenodo (record 1481172): https://zenodo.org/records/1481172
- Analysis/Synthesis Framework for Automatic F0 Annotation of Multitrack Datasets (ISMIR 2017): https://www.researchgate.net/publication/324922376_An_AnalysisSynthesis_Framework_for_Automatic_F0_Annotation_of_Multitrack_Datasets
- RWC Music Database: https://staff.aist.go.jp/m.goto/RWC-MDB/

Pitch detectors and benchmarks:
- CREPE: A Convolutional Representation for Pitch Estimation (ar5iv HTML): https://ar5iv.labs.arxiv.org/html/1802.06182
- CREPE (arXiv abstract 1802.06182): https://arxiv.org/abs/1802.06182
- CREPE code (marl/crepe): https://github.com/marl/crepe
- SwiftF0: Fast and Accurate Monophonic Pitch Detection (HTML): https://arxiv.org/html/2508.18440v1
- RMVPE: A Robust Model for Vocal Pitch Estimation (arXiv 2306.15412): https://arxiv.org/abs/2306.15412
- pitch-benchmark (lars76): https://github.com/lars76/pitch-benchmark
- pYIN (ICASSP 2014, IEEE Xplore): https://ieeexplore.ieee.org/document/6853678/
- pYIN code/project: https://code.soundsoftware.ac.uk/projects/pyin
- pYIN Vamp plugin (c4dm/pyin): https://github.com/c4dm/pyin
- Cycfi Research, Fast and Efficient Pitch Detection (octave ambiguity, MPM/YIN): https://www.cycfi.com/2017/10/fast-and-efficient-pitch-detection/
- Monophonic pitch detection by evaluation of individually... (DAFx-16): https://www.dafx.de/paper-archive/2016/dafxpapers/35-DAFx-16_paper_22-PN.pdf
- High accuracy and octave-error immune pitch detection algorithms (Archives of Acoustics): https://acoustics.ippt.pan.pl/index.php/aa/article/download/464/395
- Octave Error Reduction Using Fourier Series Approximation (IETE Technical Review): https://www.tandfonline.com/doi/abs/10.1080/02564602.2018.1465859

Metrics (mir_eval):
- mir_eval.melody docs: https://mir-eval.readthedocs.io/stable/api/melody.html
- mir_eval.melody source: https://github.com/mir-evaluation/mir_eval/blob/main/mir_eval/melody.py
- mir_eval.onset docs: https://mir-eval.readthedocs.io/stable/api/onset.html
- mir_eval.transcription docs: https://mir-eval.readthedocs.io/latest/api/transcription.html
- mir_eval paper (ISMIR 2014): https://archives.ismir.net/ismir2014/paper/000320.pdf
- Onset detection evaluation example: https://musicinformationretrieval.com/content/6_evaluation/evaluation_onset.html
- NOTEVIEW (±50-cent perceptual cutoff rationale): https://www.acoustics.asn.au/journal/2010/2010_38_1_Gunawan_Schubert.pdf

Score following and performance assessment:
- Matchmaker: Open-source Real-time Piano Score Following (HTML): https://arxiv.org/html/2510.10087v1
- Matchmaker (arXiv abstract 2510.10087): https://arxiv.org/abs/2510.10087
- Score-Informed Networks for Music Performance Assessment (arXiv 2008.00203): https://arxiv.org/pdf/2008.00203
- Score-Informed Networks (group page): https://musicinformatics.gatech.edu/publication/score-informed-networks-for-music-performance-assessment/
- ISMIR 2025 LBD: Score-Informed Transcription and Performance Assessment: https://ismir2025program.ismir.net/lbd_482.html
- Towards Musically Informed Evaluation of Piano Transcription Models (real vs synth caveat): https://arxiv.org/html/2406.08454

Injected-error testing:
- LadderSym (arXiv abstract 2510.08580): https://arxiv.org/abs/2510.08580
- LadderSym (full HTML): https://arxiv.org/html/2510.08580
- RUMAA: Repeat-Aware Unified Music Audio Analysis (arXiv 2507.12175): https://arxiv.org/pdf/2507.12175

Products / grading model:
- SmartMusic / MakeMusic Cloud Grading: https://help.makemusic.com/hc/en-us/articles/360026370553-Grading
- MakeMusic Cloud Playing and Practicing Music: https://help.makemusic.com/hc/en-us/articles/360026213774-Playing-and-Practicing-Music
- SmartMusic assessment-tolerance community post: https://help.makemusic.com/hc/en-us/community/posts/360033645714-12-18-18-Assessment-tolerance
