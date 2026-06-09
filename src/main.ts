/* ----------------------------------------------------------------------------
   DrumScore — entry point.

   Wires together the store, the score engine (alphaTab), the transport bar and
   the track list, plus file import, a small saved-song library (IndexedDB) and
   settings persistence (localStorage).
---------------------------------------------------------------------------- */

import './styles.css';
import { createInitialState, Store, type AppState } from './core/store';
import { ScoreEngine } from './core/score-engine';
import { createTransport } from './ui/transport';
import { createTrackList } from './ui/track-list';
import { createDrumKit } from './ui/drum-kit';
import { createSettingsPanel } from './ui/settings-panel';
import { createAiPanel } from './ui/ai-panel';
import { Tuner } from './ui/tuner';
import { SheetOverlay } from './ui/sheet-overlay';
import { toast } from './ui/toast';
import { loadDrumColors } from './core/colors';
import { applyAutoSticking } from './ai/autostick';
import { DEMO_TEX } from './data/demo';
import {
  loadSettings,
  saveSettings,
  saveSong,
  getSong,
  getAllSongs,
  getLastSongId,
  setLastSongId,
} from './core/persistence';

// ----------------------------------------------------------------- DOM refs
const $ = <T extends HTMLElement>(sel: string) =>
  document.querySelector(sel) as T;

const mainEl = $<HTMLElement>('#at-main');
const viewportEl = $<HTMLElement>('#at-viewport');
const transportEl = $<HTMLElement>('#transport');
const trackListEl = $<HTMLElement>('#track-list');
const loadingOverlay = $<HTMLElement>('#loading-overlay');
const loadingText = $<HTMLElement>('#loading-text');
const dropOverlay = $<HTMLElement>('#drop-overlay');
const songTitle = $<HTMLElement>('#song-title');
const songArtist = $<HTMLElement>('#song-artist');
const songSelect = $<HTMLSelectElement>('#song-select');
const importBtn = $<HTMLButtonElement>('#import-btn');
const settingsBtn = $<HTMLButtonElement>('#settings-btn');
const fileInput = $<HTMLInputElement>('#file-input');

// ----------------------------------------------------------------- store + engine
const settings = loadSettings();
const drumColors = loadDrumColors();
const store: Store<AppState> = new Store<AppState>(createInitialState(settings));
const engine = new ScoreEngine(mainEl, viewportEl, store, settings, drumColors);

createTransport(transportEl, engine, store);
createTrackList(trackListEl, engine, store);
createDrumKit(engine);
new SheetOverlay(engine, viewportEl, mainEl);
const settingsPanel = createSettingsPanel(engine);
settingsBtn.onclick = () => settingsPanel.open();
createAiPanel(); // coach tips modal — auto-opens after an AI analysis

// Tuner & drone (pitch + intonation for wind/melodic practice), opened from the transport.
const tuner = new Tuner();
const tunerBtn = transportEl.querySelector('[data-act="tuner"]') as HTMLButtonElement | null;
if (tunerBtn) tunerBtn.onclick = () => tuner.open();

// Instant offline sticking on every song load (precise DP by default; "simple"
// heuristic if chosen in Settings). The AI button can override with tips.
engine.onScore(() => applyAutoSticking(engine));

// ----------------------------------------------------------------- loading overlay + song meta
store.subscribe((state) => {
  const showOverlay = state.status === 'booting' || state.status === 'loading';
  loadingOverlay.classList.toggle('is-visible', showOverlay);
  loadingText.textContent = state.loadingText || 'Loading…';

  songTitle.textContent = state.song?.title || 'No song loaded';
  songArtist.textContent = state.song?.artist ? `— ${state.song.artist}` : '';
});

// ----------------------------------------------------------------- persist settings
let lastSettingsJson = JSON.stringify(store.get().settings);
store.subscribe((state) => {
  const json = JSON.stringify(state.settings);
  if (json !== lastSettingsJson) {
    lastSettingsJson = json;
    saveSettings(state.settings);
  }
});

// ----------------------------------------------------------------- song library
function extOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  );
}

async function refreshSongList(selectedId?: number): Promise<void> {
  const songs = await getAllSongs();
  songSelect.innerHTML =
    '<option value="">Saved songs…</option>' +
    songs
      .map(
        (s) =>
          `<option value="${s.id}"${s.id === selectedId ? ' selected' : ''}>${
            escapeHtml(s.name)
          }</option>`,
      )
      .join('');
}

async function loadFile(file: File): Promise<void> {
  store.set({ status: 'loading', loadingText: `Loading ${file.name}…` });
  const buffer = await file.arrayBuffer();
  const ok = engine.loadBytes(buffer);
  if (!ok) {
    store.set({ status: store.get().song ? 'ready' : 'booting' });
    toast(`Couldn't read "${file.name}". Is it a Guitar Pro or MusicXML file?`);
    return;
  }
  try {
    const id = await saveSong({
      name: file.name,
      format: extOf(file.name),
      bytes: buffer,
      addedAt: Date.now(),
    });
    setLastSongId(id);
    await refreshSongList(id);
  } catch (err) {
    console.warn('[DrumScore] could not persist song', err);
  }
}

async function loadSavedSong(id: number): Promise<void> {
  const rec = await getSong(id);
  if (!rec) {
    toast('That saved song could not be found.');
    return;
  }
  store.set({ status: 'loading', loadingText: `Loading ${rec.name}…` });
  const ok = engine.loadBytes(rec.bytes);
  if (ok) setLastSongId(id);
}

// ----------------------------------------------------------------- import wiring
importBtn.onclick = () => fileInput.click();
fileInput.onchange = () => {
  const file = fileInput.files?.[0];
  if (file) void loadFile(file);
  fileInput.value = ''; // allow re-importing the same file
};

songSelect.onchange = () => {
  const id = Number(songSelect.value);
  if (id) void loadSavedSong(id);
};

// Drag & drop anywhere over the app.
let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  dragDepth++;
  dropOverlay.classList.add('is-visible');
});
window.addEventListener('dragover', (e) => {
  if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropOverlay.classList.remove('is-visible');
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropOverlay.classList.remove('is-visible');
  const file = e.dataTransfer?.files?.[0];
  if (file) void loadFile(file);
});

// ----------------------------------------------------------------- boot
async function boot(): Promise<void> {
  try {
    await refreshSongList();
    const lastId = getLastSongId();
    if (lastId != null) {
      const rec = await getSong(lastId);
      if (rec) {
        store.set({ loadingText: `Loading ${rec.name}…` });
        const ok = engine.loadBytes(rec.bytes);
        if (ok) {
          songSelect.value = String(lastId);
          return;
        }
      }
    }
  } catch (err) {
    // IndexedDB can be unavailable (private mode, disabled, quota). Never let
    // that strand the app on the loading overlay — fall through to the demo.
    console.warn('[DrumScore] song library unavailable; loading demo', err);
  }
  // First run (or no saved song, or a storage failure): load the bundled demo.
  store.set({ loadingText: 'Loading demo…' });
  engine.loadTex(DEMO_TEX);
}

void boot();
