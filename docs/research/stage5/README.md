# Stage 5 (mic score-follower) without a saxophone — verdict & plan

**Question:** can we build *and validate* the live, mic-based score-follower (grade pitch in
cents + onset timing, green/yellow/red per note) **without owning a saxophone?**

**Verdict: YES for ~85–90% of it.** The algorithm logic, the grader, and octave handling can
be built and validated with zero hardware. Only a thin "real-acoustic robustness + real-time
feel" residual genuinely needs a horn — and that's a *one-time* check, not a dev dependency.

Full sourced detail in this folder:
- [`methodology.md`](./methodology.md) — MIR validation methods, metrics, injected-error testing, octave mitigations, tiered plan.
- [`datasets.md`](./datasets.md) — real-sax audio datasets + licenses.
- [`browser-feasibility.md`](./browser-feasibility.md) — Web Audio / alphaTab / CI specifics.

---

## The key insight (it's an architecture decision, not just a test trick)

A **score follower knows the expected next note**, so it has an *expected-f0 prior* a generic
tuner lacks. That prior **collapses the saxophone's #1 failure mode — octave errors**: if the
raw detector returns `2×f` (an octave flip), it's 1200 cents from the expected note while
`f` is ~0 cents away, so you pick the right octave with confidence. The MIR literature ranks
this as the single most effective octave mitigation (US Patent 9552741; Score-Informed
Networks, arXiv 2008.00203). **And it's fully testable without a sax.** Our detector already
has the other two levers (clarity gating + median smoothing); we'd add the score prior + a
register clamp (`minHz/maxHz` per instrument).

## The no-sax validation pipeline (automated, CI-friendly)

1. **Synth-in-the-loop** — this is MIR-standard (CREPE trains/evals on RWC-synth + MDB-stem-synth;
   score followers like Matchmaker synthesize scores via FluidSynth). alphaTab has a first-class
   **`exportAudio()`** API → render the sax track to PCM (isolate via `trackVolume`). It's
   **browser-only** (AudioWorklet dep, no Node), so: render once in Playwright headless Chromium,
   commit WAV fixtures, then test in Node with **`node-wav` + the pure `detectPitch`** (fast,
   deterministic, no Web Audio). The score IS the ground truth → a clean render should grade ~all green.
2. **Injected-error battery** (LadderSym/RUMAA methodology, monophonic scale): detune ±25/50/100/200¢,
   onset shift ±25/50/100/200 ms, wrong-note ±1/2/12 semitones, vibrato ±30¢@5Hz, silence/breath,
   pp/ff dynamics → assert the grader flags each correctly at the right thresholds.
3. **Metrics** via the `mir_eval` model: RPA, RCA, Voicing R/FA, Overall Acc, onset F-measure (50 ms).
   **`(RCA − RPA)` = octave-error rate** — the one number that proves octave handling works.
4. **Real-sax timbre coverage** (still no instrument) — run the detector offline over free,
   permissively-licensed recordings:
   - **MTG Good-sounds Freesound packs** (CC BY 3.0, no login) — alto E3–G5, tenor B2–E5; start here.
   - **University of Iowa MIS** (no restrictions) — soprano + alto, anechoic, pp/mf/ff.
   - **TinySOL** (CC BY 4.0) — alto, structured CSV + `mirdata` loader for CI regression.
   - **ChoraleBricks** (CC BY 4.0, 2025) — real per-frame f0 contour CSVs for sustained-line drift.
   - (Good-sounds full = all 4 sax types but CC BY-**NC** → offline validation only, don't bundle.)

## Tiered plan

| Tier | What | Needs a sax? |
|---|---|---|
| T1 | Unit tests on synthetic tones (pure logic) | ❌ (the detector core is already here) |
| T2 | Synth-in-the-loop render + injected-error battery + mir_eval metrics | ❌ — most of Stage 5's correctness |
| T3 | Offline accuracy over free real-sax recordings; measure (RCA−RPA) | ❌ |
| T4 | Breath/subtone/altissimo robustness, real-time latency feel, "does grading feel fair" | ✅ — one ~30-min session |

**T4 without owning one:** book a single short session with a local sax student (or a future
"you", whenever a horn is around), record the raw mic to a WAV, and analyze offline. One-time.

## Recommended detector stack (browser, no-GPU)
Keep the current **MPM/NSDF** time-domain detector (fast, pure, already unit-tested) +
**score-expected-f0 prior** (#1 octave fix) + **clarity gate ~0.9** + **3-frame median** +
**register clamp**. pYIN (Viterbi octave-continuity) or CREPE/SwiftF0 via WASM/ONNX are upgrade
paths if synth+dataset testing shows the MPM stack isn't enough — decided by evidence, not upfront.

## Bottom line
Stage 5 is **not blocked** by lacking an instrument. Build T1→T3 now (the follower + the
synth-in-the-loop test harness + the dataset checks); defer only the T4 real-feel session.
