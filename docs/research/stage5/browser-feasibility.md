# Browser Feasibility Research — Mic-Based Monophonic Pitch Detector / Score Follower

Context: A Vite + TypeScript browser app using alphaTab (`@coderline/alphatab`, which bundles AlphaSynth + a Sonivox GM SoundFont) wants to validate a mic-based monophonic pitch detector / score-follower **without a real instrument**. The detector core is a pure-TS McLeod/NSDF function `detectPitch(Float32Array, sampleRate) -> {hz, clarity}`, already unit-tested on synthetic buffers.

This document confirms concrete, code-level feasibility for three areas:
1. Offline synth-to-detector rendering.
2. CI / headless testing of the live chain.
3. Human stand-ins for a real sax during development.

Each section flags anything that does **NOT** work as hoped.

---

## 1. Offline Synth-to-Detector: Rendering Synthesized Audio to PCM

### 1.1 OfflineAudioContext.startRendering() — Feasibility and Determinism

`OfflineAudioContext.startRendering()` returns a `Promise<AudioBuffer>`. The buffer exposes per-channel `Float32Array` data via `getChannelData(channelIndex)`. This is the correct primitive for rendering a synth graph to PCM and then running the pure detector frame-by-frame over the samples.

There are two API forms (both currently supported for legacy reasons):
- **Promise-based** (current standard): `offlineCtx.startRendering().then(buf => ...)`.
- **Event-based** (legacy): listen for the `complete` event (`OfflineAudioCompletionEvent`), read `event.renderedBuffer`.

Key properties of OfflineAudioContext:
- Renders **as fast as possible**, not paced by the system clock — there is no real-time / latency constraint.
- Output goes to an **in-memory `AudioBuffer`**, never to hardware.
- For an OfflineAudioContext, `currentTime` is not even an approximation to real time (the stream is not played by any device).

**Determinism caveat — IMPORTANT (this is a partial "does not work as hoped"):**
The W3C Web Audio API 1.1 specification does **NOT** guarantee bit-exact results across browsers or across engine versions. The spec defines interface contracts and processing algorithms but does **not** contain any clause mandating that offline rendering produce identical samples across implementations, nor does it declare the output "implementation-defined" — it simply is silent on cross-implementation bit-exactness. DSP internals (SoundFont sample interpolation, resampling filters, convolution kernels) are effectively implementation-defined.

In practice:
- **Within the same browser + same version**, a fixed graph (e.g., an `OscillatorNode`, or an `AudioBufferSourceNode` with a known SoundFont, driven by the same scheduled events) renders **identically on repeated calls**. You CAN rely on this for regression tests, as long as the fixtures are pinned to a specific browser/version.
- **Across browsers** (Chrome vs. Firefox vs. Safari), results will differ numerically for SoundFont-based synthesis because each engine uses different interpolation/resampling.
- `standardized-audio-context` (npm, by chrisguttandin) papers over **API** inconsistencies across browsers but **cannot** force bit-exact DSP parity. Use it for API portability, not for numeric determinism.

**Practical pattern:**
```typescript
// Render a synth graph to mono PCM, then run the pure detector frame-by-frame.
const sampleRate = 44100;
const durationSec = 5;
const offlineCtx = new OfflineAudioContext(1, sampleRate * durationSec, sampleRate);

// ...wire up source nodes (OscillatorNode, or AudioBufferSourceNode fed from a
// decoded SoundFont sample, etc.) and connect to offlineCtx.destination...

const rendered: AudioBuffer = await offlineCtx.startRendering();
const pcm: Float32Array = rendered.getChannelData(0); // mono, float32 in [-1, 1]

const frameSize = 2048;
const hopSize = 512;
for (let i = 0; i + frameSize <= pcm.length; i += hopSize) {
  const frame = pcm.subarray(i, i + frameSize); // zero-copy view
  const result = detectPitch(frame, sampleRate);
  // assert / record result.hz and result.clarity
}
```

Notes:
- `subarray` gives a zero-copy view, which is ideal for the pure detector.
- Choose `frameSize` to give enough periods of the lowest expected pitch. For a baritone sax low note (~69 Hz) at 44.1 kHz, one period ≈ 639 samples; an NSDF window should comfortably contain 2–4 periods (≈ 2048 samples is a reasonable default; consider 4096 for very low notes).

### 1.2 alphaTab / AlphaSynth Audio Export — What Actually Works

alphaTab has a **first-class `exportAudio()` API** (documented at https://alphatab.net/docs/guides/audio-export, and tracked in the design issue https://github.com/CoderLine/alphaTab/issues/1962). It uses an **asynchronous pull pattern**: you repeatedly request a chunk of N milliseconds, then destroy the exporter.

**Documented example (browser):**
```typescript
const options = new alphaTab.synth.AudioExportOptions();
options.sampleRate = 44100;
// optional: options.soundFonts, options.masterVolume, options.metronomeVolume,
// options.playbackRange, options.trackVolume, options.trackTranspositionPitches,
// options.useSyncPoints

const exporter = await api.exportAudio(options);
const chunks: Float32Array[] = [];
let chunk;
while ((chunk = await exporter.render(500)) !== undefined) {
  chunks.push(chunk.samples); // Float32Array of 32-bit float PCM
}
exporter.destroy();
```

**AudioExportOptions properties (per the docs):**
- `soundFonts` — specify synthesizer SoundFont(s).
- `sampleRate` — e.g. 44100.
- `masterVolume` — overall output level.
- `metronomeVolume` — metronome tick intensity (set to 0 to exclude).
- `playbackRange` — define the export range.
- `trackVolume` — per-track volume (percentage-based) — use this to isolate the sax track (set everything else to 0).
- `trackTranspositionPitches` — additional pitch transposition.
- `useSyncPoints` — apply song sync points during generation.

**Exporter operations:**
- `exporter.render(<milliseconds>)` — returns a `Promise` resolving to a chunk (with `.samples`), or `undefined` at the end.
- `exporter.destroy()` — cleanup; implements `Disposable` / `IDisposable` / `AutoCloseable`.

**Output format:**
- Chunks are `Float32Array` of **32-bit float PCM**.
- **Stereo, 2 channels** (left + right). The docs state "4 bytes per sample (32-bit float samples)" and "2 audio channels (left and right for stereo sound)".
- The docs do **NOT** explicitly state interleaved vs. planar. Treat it as **interleaved** (the standard for Web Audio Float32 output: L,R,L,R,...) and **verify with a short test**. For mono pitch detection, downmix:
```typescript
// Extract mono from interleaved stereo (take left, or average both).
const stereo = chunk.samples;
const mono = new Float32Array(stereo.length / 2);
for (let i = 0; i < mono.length; i++) {
  mono[i] = 0.5 * (stereo[i * 2] + stereo[i * 2 + 1]); // average L+R
}
```
- Memory: ~21 MB per minute of audio at 44.1 kHz stereo float32. Budget accordingly for long scores.

**Isolating the sax track:** Set `trackVolume` to 0 for all tracks except the sax track, so the exported PCM contains only the synthesized sax line. (Alternatively, export the whole mix if your follower is meant to track against the full backing.)

**Player requirement:** Per the docs, "The audio export can be used regardless of the current mode the alphaTab player is in" and works "even if an external audio backing track or video is used." So it does not strictly need an actively-playing player instance, but it does need a configured `AlphaTabApi` with the score/SoundFont loaded.

**SoundFont note:** alphaTab bundles the Sonivox GM SoundFont. For SF3 support alphaTab includes an **OGG Vorbis decoder** (NVorbis port). There is **NO OGG encoder** available in that ecosystem ("Unfortunately NVorbis has no encoder we could port over"), so you can only export **raw PCM / WAV**, never re-encode to OGG from alphaTab.

### 1.3 HARD BLOCKER — alphaTab audio export is browser-only (does NOT work in Node.js)

This is the biggest "does not work as hoped":

- `exportAudio()` / AlphaSynth synthesis **does NOT work in Node.js**. AlphaSynth's only working output (`AlphaSynthAudioWorkletOutput`) relies on **AudioWorklets**, which are a **browser API unavailable in Node**. The maintainer states directly: *"We currently have no output which would work on node.js."*
  - Source: https://alphatab.net/docs/guides/nodejs and https://github.com/CoderLine/alphaTab/discussions/1606
- The alphaTab Node.js guide covers **only SVG and PNG rendering** (via alphaSkia). There is **no** `exportAudio()`, no AlphaSynth synthesis, no audio playback in Node.
- `AlphaTabApi` is designed for pure-browser environments and will throw if it detects a Node-like context (presence of `process` / `module`).
- This is a **fundamental architectural limitation across versions**, not a bug to be fixed soon.

**Workarounds suggested by the maintainer / community:**
1. Implement a custom `IOutput` by extending the framework (see their `TestOutput.ts` example) — non-trivial.
2. Use a third-party Node audio library such as `node-web-audio-api` (see Section 2, Option C) — but this does not give you AlphaSynth's SoundFont synthesis; you would be rebuilding the synth path.
3. For **Electron**: run alphaTab in the **renderer (Chromium) process**, NOT the Node/main process, since Electron's renderer has full Web Audio.

**Recommended workaround for fixtures:** Run `exportAudio()` once in a **real browser** (or in headless Chromium via Playwright — see Section 2), collect the `Float32Array` chunks, **serialize to a WAV file** (float32 PCM, or convert to 16-bit PCM), and **commit that WAV as a test fixture**. Then your pure-Node CI consumes the WAV with a Node WAV parser and runs `detectPitch` directly — no Web Audio needed in CI.

### 1.4 Gotchas Summary (Area 1)

| Issue | Detail | Mitigation |
|---|---|---|
| Not bit-exact across browsers | OfflineAudioContext / SoundFont DSP is implementation-defined; spec gives no cross-impl guarantee | Pin fixtures to one browser+version; use tolerances (±N cents) not exact equality |
| `exportAudio()` is browser-only | AudioWorklet dependency blocks Node.js; AlphaTabApi throws in Node | Render in browser/Playwright, commit WAV fixtures, test in Node |
| Stereo output needs downmix | `exportAudio` returns 2-channel float32; detector expects mono | Average or pick L channel before `detectPitch` |
| Interleaving unspecified | Docs don't state interleaved vs planar | Assume interleaved; verify with a tiny known-signal test |
| Chunk boundaries | `render(500)` returns 500 ms per call | Concatenate all chunks before slicing analysis frames, to avoid boundary discontinuities |
| No OGG encoder | alphaTab has an SF3/OGG **decoder** but no encoder | Export raw PCM / WAV only |
| Memory | ~21 MB/min at 44.1 kHz stereo float32 | Use `playbackRange` / shorter fixtures |

---

## 2. CI / Headless Testing — Options and Recommendation

**Baseline fact:** `vitest` with `jsdom` (or `happy-dom`) has **NO Web Audio API**. jsdom lacks a layout engine and many browser APIs; AudioContext / OfflineAudioContext / decodeAudioData are simply not present. So you cannot run the *live* Web Audio chain under plain jsdom. (`web-audio-test-api` by mohayonao exists but is a stubbing/mock library for asserting graph construction, not a real renderer — not useful for accuracy tests.)

Three realistic options:

### Option A — Vitest browser mode + Playwright, real headless Chromium
- **Real Chromium has a full Web Audio API**, including `OfflineAudioContext`, `AudioContext`, `decodeAudioData`, `getUserMedia` (with fake-device flags), and AudioWorklets.
- Vitest 3/4 **Browser Mode** runs tests in a real browser via the `playwright` (or `webdriverio`) provider. Headless is **not** the default — you must set it.
- Decode a WAV/MP3 of real sax via `decodeAudioData` in the browser, or run the full mic pipeline with Chromium fake media devices.
- **CI setup:** install browsers, e.g. `npx playwright install --with-deps chromium`. Without `--with-deps` Chromium won't start in CI. Force `headless: true` (CI has no display).
- Example vitest config:
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: 'playwright',
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
});
```
- For deterministic fake mic input in Chromium, launch with:
  `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=/path/to/sax.wav`
  (pass via Playwright launch options). This feeds a WAV file into `getUserMedia` so you can test the **entire** live follower end-to-end.
- **Cons:** Slower startup (~5–30 s), heavier CI, occasionally flaky on constrained runners, requires a browser install step.
- **Best for:** A small set of **integration** tests of the real live chain (mic → AudioContext/AudioWorklet → detector).

### Option B — Parse raw WAV in Node, call the pure detector directly (NO Web Audio)  ← RECOMMENDED for accuracy tests
- Your `detectPitch(Float32Array, sampleRate)` is a **pure function**. For accuracy/regression tests you do **not** need Web Audio at all — you only need to get samples into a `Float32Array`.
- **`node-wav`** (npm, andreasgal) decodes a WAV `Buffer` and returns `{ sampleRate, channelData }` where `channelData` is an **array of `Float32Array`** (one per channel). It is synchronous, returns the result directly (no Promise), has no native build, and is reportedly up to ~750× faster than `wav-decoder`.
- Alternatives: **`wavefile`** (zero deps, works in Node + browser, handles 8/16/24/32-bit and files up to 2 GB), **`als-wave-parser`** (8/16/32-bit, channel split/merge helpers), `wav-decoder` (Promise-based, slower).
- **Pattern (pure Node, no Web Audio polyfill):**
```typescript
import wav from 'node-wav';
import { readFileSync } from 'node:fs';
import { detectPitch } from '../src/pitch/detectPitch';

const buf = readFileSync('fixtures/alto-sax-Bb3.wav');
const { sampleRate, channelData } = wav.decode(buf); // channelData: Float32Array[]
const mono = channelData[0]; // already a Float32Array

const frame = mono.subarray(0, 2048);
const { hz, clarity } = detectPitch(frame, sampleRate);

expect(hz).toBeCloseTo(233.08, 1);  // Bb3 ≈ 233.08 Hz
expect(clarity).toBeGreaterThan(0.85);
```
- **Pros:** Zero browser dependency, no native NAPI build, runs in **milliseconds**, fully **deterministic across all CI environments**. Tests exactly the code under test (the pure detector). Works under the normal vitest Node runner; jsdom is irrelevant.
- **Cons:** Does **not** exercise the surrounding AudioWorklet/ScriptProcessor plumbing or the live mic path — but that is intentionally out of scope for accuracy tests, and is covered by Option A integration tests.

### Option C — node-web-audio-api / web-audio-api / web-audio-engine (Web Audio in Node)
- **`node-web-audio-api`** (IRCAM ISMM, Rust/NAPI): a real Web Audio implementation for Node, **including `OfflineAudioContext`**. Actively maintained (repo https://github.com/ircam-ismm/node-web-audio-api; npm https://www.npmjs.com/package/node-web-audio-api). For headless/Docker (no audio sink) construct the context with `{ sinkId: { type: 'none' } }`.
  - **CRITICAL caveat (flagged by the project itself):** *"AudioBuffer#getChannelData is implemented but not reliable in some situations. You should prefer AudioBuffer#copyToChannel and AudioBuffer#copyFromChannel."* So if you use this, read samples via `copyFromChannel`, not `getChannelData`.
  - Ships a **Rust NAPI prebuilt binary** (platform-specific) — adds a native dependency and complicates Docker / cross-arch CI.
  - Only a **minimal** audio input stream + `MediaStreamSourceNode` are provided.
- **`web-audio-api`** (audiojs, pure JS): supports `AudioContext` and `OfflineAudioContext`, renders faster than real-time. Pure JS, but heavier DSP (convolution, compression) is ~2–4× slower than the Rust impl. Less actively maintained.
- **`web-audio-engine`** (mohayonao, pure JS): another pure-JS Web Audio implementation with offline rendering. Older/less maintained.
- **Best for:** Tests that need the **Web Audio graph topology** itself to run in Node (e.g., verifying an `OfflineAudioContext` graph you also use in the browser). **Not necessary** if your detector is a pure function — Option B is simpler and more robust.

### Recommendation

**Use Option B (`node-wav` + pure `detectPitch`) as the primary CI accuracy-test strategy**, and reserve **Option A (Vitest browser mode + Playwright headless Chromium)** for a small, slower integration suite.

Concrete plan:
1. **Generate reference WAV fixtures once** in a real browser — either via alphaTab `exportAudio()` (then write WAV), via `OfflineAudioContext` rendering, or from real-sax recordings — at known pitches spanning the target sax range (e.g. alto: Bb3 ≈ 233 Hz up to F#5/F#6 region).
2. **Commit those WAVs** under `fixtures/` (16-bit PCM keeps them small; float32 keeps them exact).
3. In **vitest (Node runner)**, decode with `node-wav`, slice into analysis frames, call `detectPitch`, and assert `hz` within a tolerance (e.g. **±5 cents**, i.e. `Math.abs(1200*Math.log2(hz/expected)) < 5`) and `clarity > 0.85`. This is deterministic, fast, and dependency-light.
4. Add a **handful of Option A integration tests** (run on PR/merge or on a schedule, not every commit) that drive the **real** `AudioContext` / `getUserMedia` pipeline in headless Chromium, feeding a WAV via `--use-file-for-fake-audio-capture` to validate the end-to-end live follower.

**Does NOT work for CI:** plain jsdom/happy-dom Web Audio (absent); alphaTab `exportAudio()` in Node (browser-only). `web-audio-test-api` only mocks graph construction, not rendering.

---

## 3. Human Stand-ins for a Real Sax During Development

When you only have a laptop mic, several stand-ins can exercise the **live** follower. The dominant risk for a McLeod/NSDF detector is **octave error**: NSDF picks the first peak above `threshold = k * maxNSDF` (k typically ≈ 0.9–0.93); a strong 2nd harmonic creates a competing peak near `2*f0`, and a weak fundamental can cause selection at `f0/2`. The start and end of notes (attacks/decays) are the most octave-error-prone regions.

### 3.0 Frequency Range Reference (fundamentals)

| Source | Approx. range (Hz) | MIDI notes (approx) |
|---|---|---|
| Soprano sax | 208–1245 | Ab3–Eb6 |
| Alto sax | 139–831 | Db3–Ab5 |
| Tenor sax | 104–622 | Ab2–Eb5 |
| Baritone sax | 69–415 | Db2–Ab4 |
| Soprano voice | 262–1047 | C4–C6 |
| Alto voice | 175–698 | F3–F5 |
| Tenor voice | 131–523 | C3–C5 |
| Baritone voice | 98–392 | G2–G4 |
| Whistling | ~500–4000 | B4–C8 |

(Saxophones roughly match the same-named voice ranges, but extend lower and higher.)
MIDI↔Hz: `f = 440 * 2^((m-69)/12)`; `m = 69 + 12*log2(f/440)`. A4 = 440 Hz = MIDI 69; C4 = MIDI 60.

### 3.1 Singing / Humming the Line
**Pros:**
- Zero setup, instant feedback.
- Correct **fundamental range** for alto/tenor sax lines (for the matching voice type).
- **Humming** (closed mouth) often produces a **cleaner fundamental with weaker upper harmonics** than open singing — this can actually be **easier** for the detector, not harder. QBH research notes humming is detected as accurately as singing.

**Cons / caveats:**
- **Octave errors are real.** Male chest voice singing an alto-sax-register line can trigger sub-harmonic/half-pitch reads when clarity is borderline (strong 2nd harmonic). NSDF is more robust here than naive autocorrelation, but not immune.
- **Timbre mismatch:** vocal formants shape the harmonic envelope differently from a sax reed. NSDF is relatively **timbre-agnostic** (it keys on periodicity, not spectral shape), so this matters **less** than for spectral methods — but attack transients and register breaks still behave differently from a real sax.
- **Range ceiling:** a typical male voice tops out well below alto-sax high notes; above ~Eb5 you need a soprano/alto voice, falsetto, whistle register, or a synth.
- Interesting fact: a saxophone reed mechanically resembles human vocal folds, so the **harmonic structures are comparable** — singing/humming is a more representative stand-in for a sax than, say, a plucked string.

**Mitigations (apply to the detector during dev):**
- **Clamp the search range** to the instrument's register, e.g. [100, 900] Hz for alto sax. This alone eliminates most octave errors.
- **Gate on clarity:** only accept readings with `clarity > 0.90`.
- Optionally bias peak selection toward the expected register (a "voice-type/instrument prior"), which the octave-error literature shows reliably removes octave confusion.

### 3.2 Playing a Real Sax RECORDING from a Phone/Speaker into the Mic
**Pros:**
- **Real sax timbre**, real attack/decay behavior — exercises the full chain as in production.
- Easy to source (any sax recording).

**Cons:**
- **Double room-acoustic degradation** (phone/speaker → room → laptop mic): reverb, comb-filtering, and codec compression artifacts. Variable SNR.
- **Not reproducible** (volume, angle, distance vary) → poor for automated tests, fine for manual verification.

**Better variant:** Route the phone/player **line-out → laptop line-in** (combo headphone jack) or via a **cheap USB audio interface**. This removes room acoustics entirely and gives a **clean, repeatable** signal — the best "no real instrument" stand-in for **timbre fidelity**. (And the resulting clean capture can be saved as a WAV fixture for Section 2 Option B.)

### 3.3 MIDI Keyboard + Virtual-Sax VST / Web-Synth
**Pros:**
- **Reproducible, controllable, scriptable**, covers the **full sax range**, and (with a good sax SoundFont/VST) is the closest controllable approximation to real sax timbre.

**Cons:**
- Requires a **MIDI keyboard** (hardware); Web MIDI prompts for permission.
- **VSTs are desktop-only** — not usable inside a browser. Use a **web synth** instead.

**Recommended web approach (drives the live pipeline, no hardware sax):**
- Use **`soundfont-player`** (npm) or `MIDI.js` with a **General MIDI saxophone** SoundFont, route the synth output to a **`MediaStreamAudioDestinationNode`**, then feed `dest.stream` into your detector's `AudioContext` exactly as if it came from `getUserMedia`:
```typescript
const audioCtx = new AudioContext();
const dest = audioCtx.createMediaStreamDestination();
// connect the soundfont-player / synth output node -> dest
// e.g. instrument.play('C4', audioCtx.currentTime, { gain: 1, destination: dest });
const fakeMicStream: MediaStream = dest.stream; // use in place of getUserMedia output
// feed fakeMicStream into the same AnalyserNode / AudioWorklet the live follower uses
```
- This exercises the **exact live follower path** while being fully reproducible.

### 3.4 Browser Tone Generators (OscillatorNode)
**Pros:**
- **Instant, deterministic, scriptable** — ideal for automated Playwright live-chain tests and for sanity-checking the pipeline.

**Cons:**
- A **pure sine** has only the fundamental — it will always be detected correctly but tells you **nothing** about octave robustness against real harmonics.
- A **sawtooth/square** is closer to a sax's rich harmonics. A real sax (closed conical bore) has a characteristic strong set of harmonics (odd harmonics prominent in the lower register), so a sawtooth is a better stress test than a sine, but still not the real envelope.
- Does **not** validate real-world timbre edge cases (breath noise, vibrato, attack chiff).

### 3.5 Ranked Recommendation for the Live Follower

1. **Fastest for dev:** Hum/sing the line, with the detector's **search range clamped** to the sax register and a **`clarity > 0.90`** gate. No setup, immediate.
2. **Best timbre fidelity without a sax:** Phone/player **via line-in** (no room reverb), or a **`soundfont-player` GM sax → `MediaStreamAudioDestinationNode`** routed into the live pipeline.
3. **Best for automated live-chain CI tests:** `OscillatorNode` (sawtooth) → `MediaStreamAudioDestinationNode` → detector, scripted in Playwright; and/or `--use-file-for-fake-audio-capture` feeding a WAV into `getUserMedia`.
4. **Eventual ground truth:** A **real saxophone** — still required to validate register-break and attack-transient behavior that stand-ins approximate imperfectly.

---

## Consolidated Recommendations

| Goal | Approach | Key API / Package |
|---|---|---|
| Render synth → PCM in browser | `OfflineAudioContext.startRendering()` → `getChannelData(0)` | Web Audio API |
| Get alphaTab sax samples as Float32Array | `api.exportAudio(opts)` → collect `chunk.samples` → downmix stereo→mono | `@coderline/alphatab` (**browser only**) |
| CI accuracy tests of the pure detector | Parse committed WAV fixture in Node, call `detectPitch` directly | `node-wav` (or `wavefile`) |
| CI full-chain integration tests | Vitest Browser Mode + Playwright headless Chromium; fake mic via WAV | `vitest`, `@vitest/browser`, `playwright` |
| Web Audio rendering in Node (if truly needed) | `OfflineAudioContext` in Node; read via `copyFromChannel` (NOT `getChannelData`) | `node-web-audio-api` (IRCAM) |
| Dev stand-in: fastest | Hum/sing + clamped search range [100–900 Hz] + `clarity > 0.90` | existing mic pipeline |
| Dev stand-in: best fidelity (no sax) | GM sax `soundfont-player` → `MediaStreamAudioDestinationNode` → detector | `soundfont-player` + Web Audio API |
| Dev stand-in: clean repeatable real-sax | Phone/player line-out → laptop line-in; also save as WAV fixture | hardware |

### Flagged: things that do NOT work as hoped
- **alphaTab `exportAudio()` / AlphaSynth in Node.js / CI** — browser-only (AudioWorklet dependency; `AlphaTabApi` throws in Node). Must render in a browser/Playwright and commit WAV fixtures.
- **OfflineAudioContext is not bit-exact across browsers** for SoundFont synthesis — pin fixtures to one browser+version and assert with tolerances, not exact equality.
- **jsdom / happy-dom have no Web Audio API** — cannot run the live chain; `web-audio-test-api` only mocks graph construction, not rendering.
- **`node-web-audio-api` `getChannelData()` is unreliable** — use `copyFromChannel` / `copyToChannel` instead.
- **Pure `OscillatorNode` sine waves** do not stress-test octave robustness against real sax harmonic structure — use sawtooth or real/synth sax timbre for meaningful follower tests.
- **No OGG encoder in alphaTab** — export raw PCM / WAV only.

---

## Sources
- OfflineAudioContext: startRendering() — MDN: https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext/startRendering
- OfflineAudioContext — MDN: https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext
- OfflineAudioContext() constructor — MDN: https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext/OfflineAudioContext
- Web Audio API 1.1 — W3C Spec: https://www.w3.org/TR/webaudio-1.1/
- Audio Export | alphaTab: https://alphatab.net/docs/guides/audio-export
- Sample Generation / Audio Export API — alphaTab Issue #1962: https://github.com/CoderLine/alphaTab/issues/1962
- Use in Node.js | alphaTab: https://alphatab.net/docs/guides/nodejs
- Low Level APIs | alphaTab: https://alphatab.net/docs/guides/lowlevel-apis/
- AlphaSynth does not work in Node — alphaTab Discussion #1606: https://github.com/CoderLine/alphaTab/discussions/1606
- Playback in Electron apps — alphaTab Discussion #1933: https://github.com/CoderLine/alphaTab/discussions/1933
- alphaTab AlphaSynth reference: https://www.alphatab.net/docs/reference/alphasynth/
- node-web-audio-api (IRCAM) — GitHub: https://github.com/ircam-ismm/node-web-audio-api
- node-web-audio-api — npm: https://www.npmjs.com/package/node-web-audio-api
- web-audio-api (audiojs) — npm: https://www.npmjs.com/package/web-audio-api
- web-audio-engine (mohayonao): http://mohayonao.github.io/web-audio-engine/
- web-audio-test-api (mock for CI) — GitHub: https://github.com/mohayonao/web-audio-test-api
- standardized-audio-context — GitHub: https://github.com/chrisguttandin/standardized-audio-context
- node-wav — npm: https://www.npmjs.com/package/node-wav
- node-wav (andreasgal) — GitHub: https://github.com/andreasgal/node-wav
- wavefile — npm: https://www.npmjs.com/package/wavefile
- als-wave-parser — npm: https://www.npmjs.com/package/als-wave-parser
- Loading Audio in Node JS: https://dev.to/hughrawlinson/loading-audio-in-node-js-1l7e
- pitchfinder (JS pitch algorithms incl. YIN, operates on Float32Array) — GitHub: https://github.com/peterkhayes/pitchfinder
- Vitest Browser Mode — Guide: https://vitest.dev/guide/browser/
- Vitest — Configuring Playwright: https://vitest.dev/config/browser/playwright
- Playwright Browsers: https://playwright.dev/docs/browsers
- McLeod Pitch Method — pitch-detection/misc/mcleod README (sevagh): https://github.com/sevagh/pitch-detection/blob/master/misc/mcleod/README.md
- "A Smarter Way To Find Pitch" — McLeod & Wyvill (paper PDF): http://dl.icdst.org/pdfs/files4/b56e1f975f0b9b3fca904fb2a7778c15.pdf
- Interactive exploration of McLeod's Pitch Detection Method — Samyak Sarnayak: https://samyak.me/post/mcleod/
- Pitch & frequency ranges of saxophones and human voices — John D. Cook: https://www.johndcook.com/blog/2021/02/26/saxophone-ranges/
- Note names, MIDI numbers and frequencies — UNSW: https://newt.phys.unsw.edu.au/jw/notes.html
- Octave Error Reduction in Pitch Detection Algorithms (Fourier Series Approximation) — IETE Technical Review: https://www.tandfonline.com/doi/full/10.1080/02564602.2018.1465859
- SwiftF0: Fast and Accurate Monophonic Pitch Detection (arXiv): https://arxiv.org/pdf/2508.18440
