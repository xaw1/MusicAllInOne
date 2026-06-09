/* ----------------------------------------------------------------------------
   Settings panel (modal).

   Sections:
   - Appearance: colour-code drum notes on/off + per-voice colour pickers.
     Changes apply live to the score (and will drive the live drum kit too).
   - Keybinds: the drum-entry keys used by the Stage 2 notation editor.
     Editable and persisted now so the editor just reads them.

   More sections (AI model + key, sound packs) arrive with their stages.
---------------------------------------------------------------------------- */

import type { ScoreEngine } from '../core/score-engine';
import {
  loadDrumColors,
  saveDrumColors,
  defaultDrumColorSettings,
  DRUM_VOICES,
  DRUM_VOICE_LABELS,
  type DrumColorSettings,
} from '../core/colors';
import {
  loadKeybinds,
  saveKeybinds,
  DEFAULT_KEYBINDS,
  type KeyMap,
} from '../input/keybinds';
import { getApiKey, setApiKey, getModel, setModel } from '../ai/key-store';
import { listModels, type ModelInfo } from '../ai/openrouter';
import { DEFAULT_MODEL } from '../ai/coach';
import { getStickingMode, setStickingMode } from '../core/sticking-algo';
import { applyAutoSticking } from '../ai/autostick';
import { openAiLog } from './ai-log';
import {
  getViz,
  setViz,
  FLASH_MS_MIN,
  FLASH_MS_MAX,
  HIGHWAY_HEIGHT_MIN,
  HIGHWAY_HEIGHT_MAX,
  LOOKAHEAD_MIN,
  LOOKAHEAD_MAX,
  LANE_MARGIN_MIN,
  LANE_MARGIN_MAX,
} from '../core/viz';

const ACTION_ORDER: string[] = [
  'kick',
  'snare',
  'hihatClosed',
  'hihatOpen',
  'hihatPedal',
  'crash',
  'ride',
  'rideBell',
  'highTom',
  'midTom',
  'floorTom',
  'crossStick',
  'accentModifier',
  'ghostModifier',
];

const ACTION_LABELS: Record<string, string> = {
  kick: 'Kick',
  snare: 'Snare',
  hihatClosed: 'Hi-hat (closed)',
  hihatOpen: 'Hi-hat (open)',
  hihatPedal: 'Hi-hat (pedal)',
  crash: 'Crash',
  ride: 'Ride',
  rideBell: 'Ride bell',
  highTom: 'High tom',
  midTom: 'Mid tom',
  floorTom: 'Floor tom',
  crossStick: 'Cross-stick',
  accentModifier: 'Accent (hold)',
  ghostModifier: 'Ghost (hold)',
};

export function createSettingsPanel(engine: ScoreEngine): { open: () => void } {
  let colors: DrumColorSettings = loadDrumColors();
  let keys: KeyMap = loadKeybinds();
  // Fetched once and reused across re-renders, so editing colours/keybinds does
  // not re-hit the network on every render().
  let cachedModels: ModelInfo[] | null = null;

  // Push the loaded scheme into the engine so it applies on the next score load.
  engine.setDrumColors(colors);

  const overlay = document.createElement('div');
  overlay.className = 'overlay settings-overlay';
  overlay.innerHTML = `
    <div class="settings-card">
      <div class="settings-head">
        <h2>Settings</h2>
        <button class="btn icon settings-close" title="Close">✕</button>
      </div>
      <div class="settings-body"></div>
      <div class="settings-foot">
        <button class="btn btn-primary settings-done">Done</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const body = overlay.querySelector('.settings-body') as HTMLElement;
  const close = () => overlay.classList.remove('is-visible');

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  (overlay.querySelector('.settings-close') as HTMLElement).onclick = close;
  (overlay.querySelector('.settings-done') as HTMLElement).onclick = close;

  function actionToKey(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const [key, action] of Object.entries(keys)) map[action] = key;
    return map;
  }

  function rebind(action: string, newKey: string): void {
    newKey = newKey.trim().toLowerCase();
    const next: KeyMap = {};
    // drop any existing binding for this key or this action
    for (const [k, a] of Object.entries(keys)) {
      if (a === action) continue;
      if (k === newKey) continue;
      next[k] = a;
    }
    if (newKey) next[newKey] = action as KeyMap[string];
    keys = next;
    saveKeybinds(keys);
  }

  function render(): void {
    const a2k = actionToKey();
    const viz = getViz();
    body.innerHTML = `
      <div class="settings-tabs">
        <button class="settings-tab is-active" data-tab="visual">Visualisation</button>
        <button class="settings-tab" data-tab="highway">Highway</button>
        <button class="settings-tab" data-tab="appearance">Appearance</button>
        <button class="settings-tab" data-tab="sticking">Sticking</button>
        <button class="settings-tab" data-tab="ai">AI</button>
        <button class="settings-tab" data-tab="keybinds">Keybinds</button>
      </div>

      <section class="settings-section is-active" data-tabpane="visual">
        <h3>Visualisation</h3>
        <label class="settings-row">
          <input type="checkbox" class="opt-showkit" ${viz.showKit ? 'checked' : ''} />
          <span>Show the live drum kit</span>
        </label>
        <label class="settings-row slider-row">
          <span>Drum lit time</span>
          <input type="range" class="opt-flash" min="${FLASH_MS_MIN}" max="${FLASH_MS_MAX}" step="20" value="${viz.flashMs}" />
          <span class="flash-val">${viz.flashMs} ms</span>
        </label>
        <label class="settings-row">
          <input type="checkbox" class="opt-lines" ${viz.connectLines ? 'checked' : ''} />
          <span>Connect drums hit at the same time</span>
        </label>
        <label class="settings-row">
          <input type="checkbox" class="opt-limbs" ${viz.limbColours ? 'checked' : ''} />
          <span>Colour those lines by limb (hands / feet)</span>
        </label>
        <label class="settings-row">
          <input type="checkbox" class="opt-approach" ${viz.approachRings ? 'checked' : ''} />
          <span>Approach rings on the kit (osu-style)</span>
        </label>
        <label class="settings-row">
          <input type="checkbox" class="opt-sheetstick" ${viz.sheetSticking ? 'checked' : ''} />
          <span>R / L sticking letters under the sheet</span>
        </label>
        <label class="settings-row">
          <span>Follow grading (mic score-follower)</span>
          <select class="opt-followtol">
            <option value="easy" ${viz.followTolerance === 'easy' ? 'selected' : ''}>Easy</option>
            <option value="average" ${viz.followTolerance === 'average' ? 'selected' : ''}>Average</option>
            <option value="strict" ${viz.followTolerance === 'strict' ? 'selected' : ''}>Strict</option>
          </select>
          <input type="checkbox" class="opt-ghost" ${viz.ghostSticks ? 'checked' : ''} />
          <span>Ready-sticks — show where each hand is heading</span>
        </label>
        <label class="settings-row slider-row">
          <span>Ready-stick opacity</span>
          <input type="range" class="opt-ghostop" min="15" max="80" step="5" value="${Math.round(viz.ghostOpacity * 100)}" />
          <span class="ghostop-val">${Math.round(viz.ghostOpacity * 100)}%</span>
        </label>
        <label class="settings-row">
          <input type="checkbox" class="opt-ghosthand" ${viz.ghostByHand ? 'checked' : ''} />
          <span>Colour ready-sticks by hand (R cyan / L orange)</span>
        </label>
      </section>

      <section class="settings-section" data-tabpane="highway">
        <h3>Highway</h3>
        <label class="settings-row">
          <input type="checkbox" class="opt-highway" ${viz.showHighway ? 'checked' : ''} />
          <span>Show the falling-notes highway</span>
        </label>
        <label class="settings-row slider-row">
          <span>Height</span>
          <input type="range" class="opt-hwheight" min="${HIGHWAY_HEIGHT_MIN}" max="${HIGHWAY_HEIGHT_MAX}" step="10" value="${viz.highwayHeight}" />
          <span class="hwheight-val">${viz.highwayHeight} px</span>
        </label>
        <label class="settings-row slider-row">
          <span>Look-ahead</span>
          <input type="range" class="opt-lookahead" min="${LOOKAHEAD_MIN}" max="${LOOKAHEAD_MAX}" step="1" value="${viz.lookaheadBeats}" />
          <span class="lookahead-val">${viz.lookaheadBeats} beats</span>
        </label>
        <label class="settings-row slider-row">
          <span>Note size (vertical gap)</span>
          <input type="range" class="opt-notefill" min="50" max="100" step="2" value="${Math.round(viz.noteFill * 100)}" />
          <span class="notefill-val">${Math.round(viz.noteFill * 100)}%</span>
        </label>
        <label class="settings-row slider-row">
          <span>Side margin</span>
          <input type="range" class="opt-lanemargin" min="${LANE_MARGIN_MIN}" max="${LANE_MARGIN_MAX}" step="1" value="${viz.laneMargin}" />
          <span class="lanemargin-val">${viz.laneMargin} px</span>
        </label>
      </section>

      <section class="settings-section" data-tabpane="appearance">
        <h3>Appearance</h3>
        <label class="settings-row">
          <input type="checkbox" class="opt-colorize" ${colors.enabled ? 'checked' : ''} />
          <span>Colour-code drum notes on the sheet</span>
        </label>
        <div class="color-grid ${colors.enabled ? '' : 'is-disabled'}">
          ${DRUM_VOICES.map(
            (v) => `
            <label class="color-item">
              <input type="color" data-voice="${v}" value="${colors.colors[v]}" />
              <span>${DRUM_VOICE_LABELS[v]}</span>
            </label>`,
          ).join('')}
        </div>
        <button class="btn settings-reset-colors">Reset colours</button>
      </section>

      <section class="settings-section" data-tabpane="sticking">
        <h3>Sticking</h3>
        <label class="settings-row stack">
          <span>Auto sticking style</span>
          <select class="opt-stickmode">
            <option value="precise" ${getStickingMode() === 'precise' ? 'selected' : ''}>Precise — tempo &amp; kit-aware (recommended)</option>
            <option value="simple" ${getStickingMode() === 'simple' ? 'selected' : ''}>Simple — basic hand-economy</option>
          </select>
        </label>
        <p class="settings-hint">Computed instantly on load, no network. The AI button below overrides this and adds coaching tips.</p>
      </section>

      <section class="settings-section" data-tabpane="ai">
        <h3>AI coach <span class="settings-sub">— OpenRouter</span></h3>
        <label class="settings-row stack">
          <span>OpenRouter API key</span>
          <input type="password" class="opt-aikey" placeholder="sk-or-..." value="${getApiKey() ?? ''}" />
        </label>
        <label class="settings-row stack">
          <span>Model</span>
          <input type="text" class="opt-aimodel" list="ai-model-list" spellcheck="false" value="${getModel() || DEFAULT_MODEL}" />
          <datalist id="ai-model-list"></datalist>
        </label>
        <p class="settings-hint">Get a free key at openrouter.ai/keys. Default is the latest Claude Sonnet; type to pick any model your key can use.</p>
        <button class="btn settings-viewlog" type="button">View AI log</button>
      </section>

      <section class="settings-section" data-tabpane="keybinds">
        <h3>Keybinds <span class="settings-sub">— used by the notation editor (Stage 2)</span></h3>
        <div class="keybind-grid">
          ${ACTION_ORDER.map(
            (action) => `
            <label class="keybind-item">
              <span>${ACTION_LABELS[action] ?? action}</span>
              <input type="text" maxlength="1" data-action="${action}" value="${
                a2k[action] ?? ''
              }" />
            </label>`,
          ).join('')}
        </div>
        <button class="btn settings-reset-keys">Reset keybinds</button>
      </section>
    `;

    // Visualisation wiring
    const showKit = body.querySelector('.opt-showkit') as HTMLInputElement;
    showKit.onchange = () => setViz({ showKit: showKit.checked });
    const flash = body.querySelector('.opt-flash') as HTMLInputElement;
    const flashVal = body.querySelector('.flash-val') as HTMLElement;
    flash.oninput = () => {
      const ms = parseInt(flash.value, 10);
      flashVal.textContent = `${ms} ms`;
      setViz({ flashMs: ms });
    };
    const lines = body.querySelector('.opt-lines') as HTMLInputElement;
    lines.onchange = () => setViz({ connectLines: lines.checked });
    const limbs = body.querySelector('.opt-limbs') as HTMLInputElement;
    limbs.onchange = () => setViz({ limbColours: limbs.checked });
    const approach = body.querySelector('.opt-approach') as HTMLInputElement;
    approach.onchange = () => setViz({ approachRings: approach.checked });
    const sheetStick = body.querySelector('.opt-sheetstick') as HTMLInputElement;
    sheetStick.onchange = () => setViz({ sheetSticking: sheetStick.checked });

    const followTol = body.querySelector('.opt-followtol') as HTMLSelectElement;
    followTol.onchange = () =>
      setViz({ followTolerance: followTol.value as 'easy' | 'average' | 'strict' });
    const ghost = body.querySelector('.opt-ghost') as HTMLInputElement;
    ghost.onchange = () => setViz({ ghostSticks: ghost.checked });
    const ghostOp = body.querySelector('.opt-ghostop') as HTMLInputElement;
    const ghostOpVal = body.querySelector('.ghostop-val') as HTMLElement;
    ghostOp.oninput = () => {
      const v = parseInt(ghostOp.value, 10);
      ghostOpVal.textContent = `${v}%`;
      setViz({ ghostOpacity: v / 100 });
    };
    const ghostHand = body.querySelector('.opt-ghosthand') as HTMLInputElement;
    ghostHand.onchange = () => setViz({ ghostByHand: ghostHand.checked });
    const highway = body.querySelector('.opt-highway') as HTMLInputElement;
    highway.onchange = () => setViz({ showHighway: highway.checked });
    const hwHeight = body.querySelector('.opt-hwheight') as HTMLInputElement;
    const hwHeightVal = body.querySelector('.hwheight-val') as HTMLElement;
    hwHeight.oninput = () => {
      const px = parseInt(hwHeight.value, 10);
      hwHeightVal.textContent = `${px} px`;
      setViz({ highwayHeight: px });
    };
    const lookahead = body.querySelector('.opt-lookahead') as HTMLInputElement;
    const lookaheadVal = body.querySelector('.lookahead-val') as HTMLElement;
    lookahead.oninput = () => {
      const beats = parseInt(lookahead.value, 10);
      lookaheadVal.textContent = `${beats} beats`;
      setViz({ lookaheadBeats: beats });
    };
    const noteFill = body.querySelector('.opt-notefill') as HTMLInputElement;
    const noteFillVal = body.querySelector('.notefill-val') as HTMLElement;
    noteFill.oninput = () => {
      const pct = parseInt(noteFill.value, 10);
      noteFillVal.textContent = `${pct}%`;
      setViz({ noteFill: pct / 100 });
    };
    const laneMargin = body.querySelector('.opt-lanemargin') as HTMLInputElement;
    const laneMarginVal = body.querySelector('.lanemargin-val') as HTMLElement;
    laneMargin.oninput = () => {
      const px = parseInt(laneMargin.value, 10);
      laneMarginVal.textContent = `${px} px`;
      setViz({ laneMargin: px });
    };

    // AI coach wiring
    const aikey = body.querySelector('.opt-aikey') as HTMLInputElement;
    const aimodel = body.querySelector('.opt-aimodel') as HTMLInputElement;
    const aiList = body.querySelector('#ai-model-list') as HTMLDataListElement;
    const fillModelList = () => {
      if (!cachedModels) return;
      aiList.innerHTML = cachedModels
        .slice(0, 400)
        .map((m) => `<option value="${m.id}"></option>`)
        .join('');
    };
    const loadModels = async () => {
      cachedModels = await listModels(getApiKey() ?? undefined);
      fillModelList();
    };
    aikey.onchange = () => {
      setApiKey(aikey.value.trim());
      void loadModels(); // refetch only when the key actually changes
    };
    aimodel.onchange = () => setModel(aimodel.value.trim());
    (body.querySelector('.settings-viewlog') as HTMLElement).onclick = () => openAiLog();

    const stickMode = body.querySelector('.opt-stickmode') as HTMLSelectElement;
    stickMode.onchange = () => {
      setStickingMode(stickMode.value === 'simple' ? 'simple' : 'precise');
      applyAutoSticking(engine);
    };

    // Paint from cache synchronously; hit the network only once (or after a key
    // change), never on every re-render.
    fillModelList();
    if (!cachedModels) void loadModels();

    // Appearance wiring
    const colorize = body.querySelector('.opt-colorize') as HTMLInputElement;
    colorize.onchange = () => {
      colors = { ...colors, enabled: colorize.checked };
      saveDrumColors(colors);
      engine.setDrumColors(colors);
      render();
    };
    body.querySelectorAll<HTMLInputElement>('input[type="color"]').forEach((inp) => {
      inp.oninput = () => {
        const v = inp.dataset.voice as keyof typeof colors.colors;
        colors = { ...colors, colors: { ...colors.colors, [v]: inp.value } };
        saveDrumColors(colors);
        engine.setDrumColors(colors);
      };
    });
    (body.querySelector('.settings-reset-colors') as HTMLElement).onclick = () => {
      colors = defaultDrumColorSettings();
      saveDrumColors(colors);
      engine.setDrumColors(colors);
      render();
    };

    // Keybinds wiring
    body.querySelectorAll<HTMLInputElement>('input[data-action]').forEach((inp) => {
      inp.onchange = () => {
        rebind(inp.dataset.action as string, inp.value);
        render();
      };
    });
    (body.querySelector('.settings-reset-keys') as HTMLElement).onclick = () => {
      keys = { ...DEFAULT_KEYBINDS };
      saveKeybinds(keys);
      render();
    };

    // Tab switching
    const tabs = body.querySelectorAll<HTMLElement>('.settings-tab');
    const panes = body.querySelectorAll<HTMLElement>('[data-tabpane]');
    tabs.forEach((tab) => {
      tab.onclick = () => {
        const key = tab.dataset.tab;
        tabs.forEach((t) => t.classList.toggle('is-active', t === tab));
        panes.forEach((p) => p.classList.toggle('is-active', p.getAttribute('data-tabpane') === key));
      };
    });
  }

  return {
    open: () => {
      colors = loadDrumColors();
      keys = loadKeybinds();
      render();
      overlay.classList.add('is-visible');
    },
  };
}
