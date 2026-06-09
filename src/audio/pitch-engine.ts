/* ----------------------------------------------------------------------------
   Pitch engine — turns live audio into a stream of {hz, clarity, rms} detections.

   v1 runs detection on the main thread: an AnalyserNode taps the input, and an
   rAF loop pulls a time-domain frame and runs the MPM detector (src/audio/mpm).
   That's plenty for a monophonic tuner and avoids Vite AudioWorklet-bundling
   friction; the detector is pure so it can move to a worklet later unchanged.

   The input can be the MICROPHONE or an internal TEST OSCILLATOR — the latter
   lets the tuner be validated end-to-end with no real instrument plugged in.
---------------------------------------------------------------------------- */

import { detectPitch } from './mpm';

export interface Detection {
  hz: number;
  clarity: number;
  rms: number;
}

type Listener = (d: Detection | null) => void;
type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

export class PitchEngine {
  /** Detector frame size (also the AnalyserNode fftSize). */
  frameSize = 2048;
  /** Minimum NSDF clarity to accept a detection. */
  clarityThreshold = 0.92;
  /** Minimum RMS to bother detecting (gates breath noise / silence). */
  rmsFloor = 0.008;

  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mute: GainNode | null = null;
  private input: AudioNode | null = null;
  private buf = new Float32Array(this.frameSize);
  private raf = 0;
  private micStream: MediaStream | null = null;
  private testOsc: OscillatorNode | null = null;
  private readonly recent: number[] = []; // recent Hz, for median smoothing
  private readonly listeners = new Set<Listener>();
  private running = false;

  get active(): boolean { return this.running; }
  get context(): AudioContext | null { return this.ctx; }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as WebkitWindow).webkitAudioContext!;
      this.ctx = new Ctor();
    }
    return this.ctx;
  }

  /** Listen to the microphone (prompts for permission on first use). */
  async startMic(): Promise<void> {
    const ctx = this.ensureCtx();
    await ctx.resume();
    // Disable the browser's voice DSP — it mangles instrument pitch.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.attach(ctx.createMediaStreamSource(stream)); // releases any previous input first…
    this.micStream = stream; // …then register, so attach()'s teardown can't stop it
  }

  /** Feed a known sine into the detector (inaudible) — verifies the chain sans mic. */
  startTestTone(hz: number): void {
    const ctx = this.ensureCtx();
    void ctx.resume();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.value = 0.25;
    osc.connect(g);
    osc.start();
    this.attach(g); // tears down any previous graph first…
    this.testOsc = osc; // …then register, so attach()'s teardown can't stop this osc
  }

  setTestToneHz(hz: number): void {
    if (this.testOsc && this.ctx) this.testOsc.frequency.setValueAtTime(hz, this.ctx.currentTime);
  }

  private attach(node: AudioNode): void {
    const ctx = this.ensureCtx();
    this.stopGraph();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = this.frameSize;
    this.buf = new Float32Array(this.frameSize);
    node.connect(analyser);
    // An AnalyserNode only runs when the graph reaches the destination, so route
    // it through a muted gain — detection works without making the mic or test
    // tone audible (and the mic path stays feedback-free).
    const mute = ctx.createGain();
    mute.gain.value = 0;
    analyser.connect(mute);
    mute.connect(ctx.destination);
    this.analyser = analyser;
    this.mute = mute;
    this.input = node;
    this.recent.length = 0;
    this.running = true;
    this.raf = requestAnimationFrame(this.loop);
  }

  private loop = (): void => {
    if (!this.running || !this.analyser || !this.ctx) return;
    this.analyser.getFloatTimeDomainData(this.buf);

    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);

    let det: Detection | null = null;
    if (rms >= this.rmsFloor) {
      const { hz, clarity } = detectPitch(this.buf, this.ctx.sampleRate, this.clarityThreshold);
      if (hz > 0 && clarity >= this.clarityThreshold) {
        det = { hz: this.smooth(hz), clarity, rms };
      }
    }
    if (!det) this.recent.length = 0;
    for (const l of this.listeners) l(det);
    this.raf = requestAnimationFrame(this.loop);
  };

  /** Median of the last few Hz — suppresses single-frame octave glitches. */
  private smooth(hz: number): number {
    this.recent.push(hz);
    if (this.recent.length > 5) this.recent.shift();
    const sorted = [...this.recent].sort((a, b) => a - b);
    return sorted[sorted.length >> 1];
  }

  private stopGraph(): void {
    cancelAnimationFrame(this.raf);
    if (this.testOsc) { try { this.testOsc.stop(); } catch { /* noop */ } this.testOsc.disconnect(); this.testOsc = null; }
    if (this.input) { try { this.input.disconnect(); } catch { /* noop */ } this.input = null; }
    if (this.analyser) { try { this.analyser.disconnect(); } catch { /* noop */ } this.analyser = null; }
    if (this.mute) { try { this.mute.disconnect(); } catch { /* noop */ } this.mute = null; }
    // Release the microphone whenever the graph is torn down (switching input,
    // or stopping) so the mic indicator never lingers after mic mode ends.
    if (this.micStream) { this.micStream.getTracks().forEach((t) => t.stop()); this.micStream = null; }
  }

  /** Stop detection and release the microphone. */
  stop(): void {
    this.running = false;
    this.stopGraph(); // also releases the microphone
    this.recent.length = 0;
    for (const l of this.listeners) l(null);
  }
}
