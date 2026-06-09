/* ----------------------------------------------------------------------------
   Track list + mixer.

   - Click a track name to show/hide it in the score (display only).
   - M = mute, S = solo (audio), volume slider per track.
   - The auto-detected drum track is badged and highlighted.

   Audio (mute/solo/volume) and display (show/hide) are kept independent so the
   whole band keeps playing even when you declutter the view.
---------------------------------------------------------------------------- */

import type { ScoreEngine } from '../core/score-engine';
import type { AppStore, TrackInfo } from '../core/store';

export function createTrackList(
  container: HTMLElement,
  engine: ScoreEngine,
  store: AppStore,
): void {
  let structuralKey = '';
  const cards = new Map<number, HTMLElement>();

  function keyFor(tracks: TrackInfo[]): string {
    return tracks.map((t) => `${t.index}:${t.name}`).join('|');
  }

  function setVisibleFromStore(): void {
    const visible = store
      .get()
      .tracks.filter((t) => t.visible)
      .map((t) => t.index);
    engine.setVisibleTracks(visible);
  }

  const instLabel = (id: string) =>
    ({ drums: 'Drums', saxophone: 'Sax', pitched: 'Pitched' } as Record<string, string>)[id] ?? id;

  function build(tracks: TrackInfo[]): void {
    container.innerHTML = '';
    cards.clear();

    for (const t of tracks) {
      const card = document.createElement('div');
      card.className = 'track';
      card.dataset.index = String(t.index);
      card.innerHTML = `
        <div class="track-head">
          <span class="track-live" title="Sounding now"></span>
          <div class="track-name" title="Show / hide in score">
            <span class="eye">👁</span>
            <span class="name-text"></span>
            <span class="badge badge-${t.instrument}">${instLabel(t.instrument)}</span>
          </div>
          <div class="track-buttons">
            <button class="mini-btn mute" title="Mute">M</button>
            <button class="mini-btn solo" title="Solo">S</button>
          </div>
        </div>
        <div class="track-vol">
          <span class="label">🔊</span>
          <input type="range" min="0" max="150" step="1" value="100" />
        </div>
      `;
      (card.querySelector('.name-text') as HTMLElement).textContent = t.name;
      if (t.isPercussion) card.classList.add('is-drums');

      const nameEl = card.querySelector('.track-name') as HTMLElement;
      const muteBtn = card.querySelector('.mute') as HTMLButtonElement;
      const soloBtn = card.querySelector('.solo') as HTMLButtonElement;
      const vol = card.querySelector('input[type="range"]') as HTMLInputElement;

      nameEl.onclick = () => {
        store.set((st) => ({
          tracks: st.tracks.map((x) =>
            x.index === t.index ? { ...x, visible: !x.visible } : x,
          ),
        }));
        setVisibleFromStore();
      };

      muteBtn.onclick = () => {
        const next = !store
          .get()
          .tracks.find((x) => x.index === t.index)?.mute;
        engine.setTrackMute(t.index, next);
        store.set((st) => ({
          tracks: st.tracks.map((x) =>
            x.index === t.index ? { ...x, mute: next } : x,
          ),
        }));
      };

      soloBtn.onclick = () => {
        const next = !store
          .get()
          .tracks.find((x) => x.index === t.index)?.solo;
        engine.setTrackSolo(t.index, next);
        store.set((st) => ({
          tracks: st.tracks.map((x) =>
            x.index === t.index ? { ...x, solo: next } : x,
          ),
        }));
      };

      // Volume is audio-only and high-frequency — talk straight to the engine,
      // don't round-trip through the store (avoids rebuilding while dragging).
      vol.oninput = () => {
        engine.setTrackVolume(t.index, parseInt(vol.value, 10) / 100);
      };

      cards.set(t.index, card);
      container.appendChild(card);
    }
  }

  function reflect(tracks: TrackInfo[]): void {
    for (const t of tracks) {
      const card = cards.get(t.index);
      if (!card) continue;
      card.classList.toggle('is-hidden', !t.visible);
      (card.querySelector('.mute') as HTMLElement).classList.toggle(
        'active',
        t.mute,
      );
      (card.querySelector('.solo') as HTMLElement).classList.toggle(
        'active',
        t.solo,
      );
    }
  }

  store.subscribe((state) => {
    const key = keyFor(state.tracks);
    if (key !== structuralKey) {
      structuralKey = key;
      build(state.tracks);
    }
    reflect(state.tracks);
  });

  // Light up tracks that are currently sounding (any instrument, even if hidden
  // from the sheet) — driven by the engine's activeBeatsChanged stream.
  engine.onActiveTracks((indices) => {
    for (const [index, card] of cards) {
      card.classList.toggle('is-live', indices.has(index));
    }
  });
}
