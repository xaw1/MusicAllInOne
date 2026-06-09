/* ----------------------------------------------------------------------------
   Transport bar: play/pause/stop, position, playback-speed, metronome,
   count-in, loop, master volume, zoom and layout.

   The bar mutates settings in the store and calls the engine. main.ts persists
   settings whenever they change.
---------------------------------------------------------------------------- */

import type { ScoreEngine } from '../core/score-engine';
import type { AppStore, PlaybackSettings } from '../core/store';
import { getViz, setViz, subscribeViz } from '../core/viz';
import { runStickingAnalysis } from '../ai/coach';
import { toast } from './toast';

function fmt(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function createTransport(
  container: HTMLElement,
  engine: ScoreEngine,
  store: AppStore,
): void {
  const s = store.get().settings;

  container.innerHTML = `
    <div class="group">
      <button class="btn icon" data-act="stop" title="Stop" disabled>⏮</button>
      <button class="btn icon" data-act="playpause" title="Play / Pause (Space)" disabled>▶</button>
      <span class="position">00:00 / 00:00</span>
    </div>

    <div class="group">
      <span class="label">Speed</span>
      <input class="speed-slider" data-act="speed" type="range" min="25" max="150" step="5" value="${Math.round(
        s.speed * 100,
      )}" />
      <span class="speed-value">${Math.round(s.speed * 100)}%</span>
    </div>

    <div class="group">
      <button class="btn toggle ${s.metronome ? 'active' : ''}" data-act="metronome" title="Metronome">Metronome</button>
      <button class="btn toggle ${s.countIn ? 'active' : ''}" data-act="countin" title="Count-in bar">Count-in</button>
      <button class="btn toggle ${s.looping ? 'active' : ''}" data-act="loop" title="Loop the selected range (drag across bars to select)">Loop</button>
    </div>

    <div class="spacer"></div>

    <div class="group">
      <span class="label">Vol</span>
      <input class="vol-slider" data-act="mastervol" type="range" min="0" max="100" step="1" value="${Math.round(
        s.masterVolume * 100,
      )}" />
    </div>

    <div class="group">
      <span class="label">Zoom</span>
      <select data-act="zoom">
        ${[50, 75, 90, 100, 110, 125, 150, 200]
          .map(
            (z) =>
              `<option value="${z}" ${Math.round(s.zoom * 100) === z ? 'selected' : ''}>${z}%</option>`,
          )
          .join('')}
      </select>
    </div>

    <div class="group">
      <select data-act="layout">
        <option value="page" ${s.layout === 'page' ? 'selected' : ''}>Page</option>
        <option value="horizontal" ${s.layout === 'horizontal' ? 'selected' : ''}>Horizontal</option>
      </select>
    </div>

    <div class="group">
      <button class="btn" data-act="ai" title="AI sticking + practice tips for this song">AI</button>
      <button class="btn" data-act="tuner" title="Tuner &amp; drone — pitch + intonation for wind/melodic practice">Tuner</button>
      <button class="btn toggle" data-act="follow" title="Follow — grade your playing live against the score (melodic instruments; needs a mic)">Follow</button>
      <button class="btn toggle" data-act="kit" title="Show / hide the practice panel">Practice</button>
      <button class="btn icon" data-act="print" title="Print / export PDF">🖨</button>
    </div>
  `;

  const $ = <T extends HTMLElement>(act: string) =>
    container.querySelector(`[data-act="${act}"]`) as T;

  const stopBtn = $<HTMLButtonElement>('stop');
  const playBtn = $<HTMLButtonElement>('playpause');
  const position = container.querySelector('.position') as HTMLElement;
  const speed = $<HTMLInputElement>('speed');
  const speedValue = container.querySelector('.speed-value') as HTMLElement;
  const metronome = $<HTMLButtonElement>('metronome');
  const countin = $<HTMLButtonElement>('countin');
  const loop = $<HTMLButtonElement>('loop');
  const masterVol = $<HTMLInputElement>('mastervol');
  const zoom = $<HTMLSelectElement>('zoom');
  const layout = $<HTMLSelectElement>('layout');
  const print = $<HTMLButtonElement>('print');
  stopBtn.setAttribute('aria-label', 'Stop');
  playBtn.setAttribute('aria-label', 'Play / Pause');
  print.setAttribute('aria-label', 'Print / export PDF');

  const patchSettings = (patch: Partial<PlaybackSettings>) =>
    store.set((st) => ({ settings: { ...st.settings, ...patch } }));

  // ------------------------------------------------------------ wire controls
  playBtn.onclick = () => {
    if (!playBtn.disabled) engine.playPause();
  };
  stopBtn.onclick = () => {
    if (!stopBtn.disabled) engine.stop();
  };

  speed.oninput = () => {
    const v = parseInt(speed.value, 10) / 100;
    speedValue.textContent = `${parseInt(speed.value, 10)}%`;
    engine.setSpeed(v);
    patchSettings({ speed: v });
  };

  metronome.onclick = () => {
    const on = !metronome.classList.contains('active');
    metronome.classList.toggle('active', on);
    engine.setMetronome(on);
    patchSettings({ metronome: on });
  };
  countin.onclick = () => {
    const on = !countin.classList.contains('active');
    countin.classList.toggle('active', on);
    engine.setCountIn(on);
    patchSettings({ countIn: on });
  };
  loop.onclick = () => {
    const on = !loop.classList.contains('active');
    loop.classList.toggle('active', on);
    engine.setLooping(on);
    patchSettings({ looping: on });
  };

  masterVol.oninput = () => {
    const v = parseInt(masterVol.value, 10) / 100;
    engine.setMasterVolume(v);
    patchSettings({ masterVolume: v });
  };

  zoom.onchange = () => {
    const v = parseInt(zoom.value, 10) / 100;
    engine.setZoom(v);
    patchSettings({ zoom: v });
  };
  layout.onchange = () => {
    const v = layout.value === 'horizontal' ? 'horizontal' : 'page';
    engine.setLayout(v);
    patchSettings({ layout: v });
  };

  print.onclick = () => engine.print();

  // Drum-kit show/hide — always available here so the floating panel can never
  // get "lost" if its ✕ is clicked by accident.
  const kit = $<HTMLButtonElement>('kit');
  kit.onclick = () => setViz({ showKit: !getViz().showKit });
  subscribeViz((v) => kit.classList.toggle('active', v.showKit));

  // Live score-follower toggle (the practice panel owns the FollowEngine + mic).
  const follow = $<HTMLButtonElement>('follow');
  follow.onclick = () => setViz({ follow: !getViz().follow });
  subscribeViz((v) => follow.classList.toggle('active', v.follow));

  // AI sticking + tips
  const ai = $<HTMLButtonElement>('ai');
  ai.onclick = async () => {
    if (ai.dataset.busy === '1') return;
    ai.dataset.busy = '1';
    const prev = ai.textContent;
    ai.textContent = '…';
    try {
      await runStickingAnalysis(engine);
    } catch (err: any) {
      toast(err?.message || 'AI request failed.');
    } finally {
      ai.dataset.busy = '';
      ai.textContent = prev || 'AI';
    }
  };

  // Space toggles play/pause globally (unless typing in a field).
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    const el = document.activeElement as HTMLElement | null;
    const typing =
      el &&
      (el.tagName === 'INPUT' ||
        el.tagName === 'SELECT' ||
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'BUTTON' ||
        el.isContentEditable);
    if (typing) return;
    e.preventDefault();
    if (!playBtn.disabled) engine.playPause();
  });

  // ------------------------------------------------------------ reflect state
  store.subscribe((state) => {
    const ready = state.playerReady;
    playBtn.disabled = !ready;
    stopBtn.disabled = !ready;
    playBtn.textContent = state.isPlaying ? '⏸' : '▶';

    if (!ready && state.soundFontProgress > 0 && state.soundFontProgress < 1) {
      position.textContent = `Loading sounds ${Math.floor(
        state.soundFontProgress * 100,
      )}%`;
    } else {
      position.textContent = `${fmt(state.position.currentTime)} / ${fmt(
        state.position.endTime,
      )}`;
    }
  });
}
