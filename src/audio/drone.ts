/* ----------------------------------------------------------------------------
   Drone / pedal-tone generator — a sustained reference pitch for intonation and
   long-tone practice (play a scale against a held tonic; the acoustic "beats"
   vanish when you're in tune). Plain Web Audio: two slightly-detuned saw
   oscillators through a low-pass + gentle gain for a warm, non-fatiguing tone.
---------------------------------------------------------------------------- */

import { midiToHz } from './pitch';

export class Drone {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode[] = [];
  private gain: GainNode | null = null;
  private _midi = 57; // A3
  private _playing = false;

  constructor(ctx?: AudioContext) {
    this.ctx = ctx ?? null;
  }

  get playing(): boolean { return this._playing; }
  get midi(): number { return this._midi; }

  setNote(midi: number): void {
    this._midi = midi;
    if (this._playing && this.ctx) {
      const hz = midiToHz(midi);
      for (const o of this.osc) o.frequency.setValueAtTime(hz, this.ctx.currentTime);
    }
  }

  start(): void {
    if (this._playing) return;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    }
    void this.ctx.resume();
    const ctx = this.ctx;
    const hz = midiToHz(this._midi);

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.14, ctx.currentTime + 0.08);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;

    for (const detune of [-4, 4]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz;
      o.detune.value = detune;
      o.connect(lp);
      o.start();
      this.osc.push(o);
    }
    lp.connect(gain);
    gain.connect(ctx.destination);
    this.gain = gain;
    this._playing = true;
  }

  stop(): void {
    if (!this._playing || !this.ctx || !this.gain) return;
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(this.gain.gain.value, t);
    this.gain.gain.linearRampToValueAtTime(0, t + 0.1);
    const stopping = this.osc;
    window.setTimeout(() => {
      for (const o of stopping) { try { o.stop(); } catch { /* already stopped */ } o.disconnect(); }
    }, 140);
    this.osc = [];
    this.gain = null;
    this._playing = false;
  }

  toggle(): boolean {
    if (this._playing) this.stop();
    else this.start();
    return this._playing;
  }
}
