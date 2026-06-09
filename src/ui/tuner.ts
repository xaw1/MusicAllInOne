/* ----------------------------------------------------------------------------
   Tuner & drone panel — a chromatic tuner (note + cents meter) for wind/melodic
   practice, plus a sustained drone for intonation/long-tone work.

   Input comes from the PitchEngine, which can listen to the microphone OR to an
   internal test oscillator — so the whole chain is demonstrable with no real
   instrument: hit "Test tone" and watch the needle lock onto a known pitch.
---------------------------------------------------------------------------- */

import { PitchEngine, type Detection } from '../audio/pitch-engine';
import { Drone } from '../audio/drone';
import { hzToReading, midiToHz, midiToLabel, noteLabel } from '../audio/pitch';
import { toast } from './toast';

const IN_TUNE_CENTS = 5; // |cents| ≤ this → "in tune" (green)
const CLOSE_CENTS = 15; // |cents| ≤ this → amber; beyond → red

const TEST_TONES: { label: string; hz: number }[] = [
  { label: 'A4 · +20¢ sharp', hz: midiToHz(69) * Math.pow(2, 20 / 1200) },
  { label: 'A4 · in tune', hz: midiToHz(69) },
  { label: 'A4 · −20¢ flat', hz: midiToHz(69) * Math.pow(2, -20 / 1200) },
  { label: 'A3', hz: midiToHz(57) },
  { label: 'C5', hz: midiToHz(72) },
];

export class Tuner {
  readonly el: HTMLElement;
  private readonly engine = new PitchEngine();
  private readonly drone = new Drone();
  private readonly noteEl: HTMLElement;
  private readonly freqEl: HTMLElement;
  private readonly centsEl: HTMLElement;
  private readonly needle: HTMLElement;
  private readonly meter: HTMLElement;
  private readonly listenBtn: HTMLButtonElement;
  private readonly testBtn: HTMLButtonElement;
  private readonly testSel: HTMLSelectElement;
  private readonly droneNote: HTMLElement;
  private readonly dronePlay: HTMLButtonElement;
  private droneMidi = 57; // A3
  private mode: 'off' | 'mic' | 'test' = 'off';

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'tuner-overlay';
    this.el.innerHTML = `
      <div class="tuner-box" role="dialog" aria-label="Tuner">
        <div class="tuner-head">
          <span class="tuner-title">Tuner &amp; drone</span>
          <button class="tuner-close" title="Close" aria-label="Close">✕</button>
        </div>

        <div class="tuner-readout">
          <div class="tuner-note">—</div>
          <div class="tuner-freq"></div>
        </div>

        <div class="tuner-meter">
          <div class="tuner-zone"></div>
          ${[-50, -25, 0, 25, 50]
            .map((c) => `<div class="tuner-tick" style="left:${((c + 50) / 100) * 100}%"><span>${c > 0 ? '+' + c : c}</span></div>`)
            .join('')}
          <div class="tuner-needle"></div>
        </div>
        <div class="tuner-cents">play or test a note</div>

        <div class="tuner-controls">
          <button class="tuner-listen" title="Listen to the microphone">🎙 Listen</button>
          <div class="tuner-test">
            <button class="tuner-testbtn" title="Feed a known pitch into the tuner — no mic needed">Test tone</button>
            <select class="tuner-testsel" aria-label="Test-tone pitch">
              ${TEST_TONES.map((t, i) => `<option value="${i}">${t.label}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="tuner-drone">
          <span class="tuner-drone-label">Drone</span>
          <button class="drone-down" title="Lower" aria-label="Lower drone">−</button>
          <span class="drone-note">${midiToLabel(this.droneMidi)}</span>
          <button class="drone-up" title="Raise" aria-label="Raise drone">+</button>
          <button class="drone-play" title="Play / stop the drone">▶ Play</button>
        </div>

        <div class="tuner-hint">No instrument handy? Hit <b>Test tone</b> to watch the needle lock onto a known pitch.</div>
      </div>`;

    const q = <T extends HTMLElement>(sel: string) => this.el.querySelector(sel) as T;
    this.noteEl = q('.tuner-note');
    this.freqEl = q('.tuner-freq');
    this.centsEl = q('.tuner-cents');
    this.needle = q('.tuner-needle');
    this.meter = q('.tuner-meter');
    this.listenBtn = q('.tuner-listen');
    this.testBtn = q('.tuner-testbtn');
    this.testSel = q('.tuner-testsel');
    this.droneNote = q('.drone-note');
    this.dronePlay = q('.drone-play');

    q('.tuner-close').onclick = () => this.close();
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) this.close(); // click backdrop
    });

    this.listenBtn.onclick = () => void this.toggleMic();
    this.testBtn.onclick = () => this.toggleTest();
    this.testSel.onchange = () => {
      if (this.mode === 'test') this.engine.setTestToneHz(TEST_TONES[Number(this.testSel.value)].hz);
    };

    q<HTMLButtonElement>('.drone-down').onclick = () => this.nudgeDrone(-1);
    q<HTMLButtonElement>('.drone-up').onclick = () => this.nudgeDrone(1);
    this.dronePlay.onclick = () => this.toggleDrone();

    this.engine.subscribe((d) => this.render(d));
    document.body.appendChild(this.el);
  }

  open(): void {
    this.el.classList.add('is-open');
  }

  close(): void {
    this.el.classList.remove('is-open');
    this.engine.stop();
    this.drone.stop();
    this.mode = 'off';
    this.syncButtons();
    this.render(null);
  }

  // ----------------------------------------------------------------- input modes
  private async toggleMic(): Promise<void> {
    if (this.mode === 'mic') {
      this.engine.stop();
      this.mode = 'off';
      this.syncButtons();
      return;
    }
    try {
      await this.engine.startMic();
      this.mode = 'mic';
      this.syncButtons();
    } catch {
      toast('Microphone unavailable — check the browser permission, or use Test tone.');
    }
  }

  private toggleTest(): void {
    if (this.mode === 'test') {
      this.engine.stop();
      this.mode = 'off';
      this.syncButtons();
      return;
    }
    this.engine.startTestTone(TEST_TONES[Number(this.testSel.value)].hz);
    this.mode = 'test';
    this.syncButtons();
  }

  private syncButtons(): void {
    this.listenBtn.classList.toggle('active', this.mode === 'mic');
    this.listenBtn.textContent = this.mode === 'mic' ? '🎙 Stop' : '🎙 Listen';
    this.testBtn.classList.toggle('active', this.mode === 'test');
    this.testBtn.textContent = this.mode === 'test' ? 'Stop tone' : 'Test tone';
  }

  // ----------------------------------------------------------------- drone
  private nudgeDrone(delta: number): void {
    this.droneMidi = Math.max(36, Math.min(84, this.droneMidi + delta));
    this.droneNote.textContent = midiToLabel(this.droneMidi);
    this.drone.setNote(this.droneMidi);
  }

  private toggleDrone(): void {
    const playing = this.drone.toggle();
    this.dronePlay.classList.toggle('active', playing);
    this.dronePlay.textContent = playing ? '⏸ Stop' : '▶ Play';
  }

  // ----------------------------------------------------------------- meter
  private render(d: Detection | null): void {
    const reading = d ? hzToReading(d.hz) : null;
    if (!d || !reading) {
      this.noteEl.textContent = '—';
      this.noteEl.className = 'tuner-note';
      this.freqEl.textContent = '';
      this.centsEl.textContent = this.mode === 'off' ? 'play or test a note' : 'listening…';
      this.needle.style.left = '50%';
      this.needle.className = 'tuner-needle';
      return;
    }
    const cents = reading.cents;
    const tier = Math.abs(cents) <= IN_TUNE_CENTS ? 'in' : Math.abs(cents) <= CLOSE_CENTS ? 'close' : 'off';
    this.noteEl.textContent = noteLabel(reading);
    this.noteEl.className = `tuner-note tier-${tier}`;
    this.freqEl.textContent = `${d.hz.toFixed(1)} Hz`;
    this.centsEl.textContent = `${cents > 0 ? '+' : ''}${cents}¢`;
    this.centsEl.className = `tuner-cents tier-${tier}`;
    const pct = Math.max(0, Math.min(100, ((cents + 50) / 100) * 100));
    this.needle.style.left = `${pct}%`;
    this.needle.className = `tuner-needle tier-${tier}`;
  }
}
