/* ----------------------------------------------------------------------------
   Floating drum panel: a falling-notes highway on top, the live kit below.

   Kit cues:
   - hit = a coloured ellipse the size of the drum that SHRINKS to a point and
     fades (a collapsing target, so you can read the exact moment of contact);
   - osu-style approach rings that shrink onto each piece, reaching it at hit
     time (driven by the tick clock + drum timeline);
   - connecting lines (limb-coloured) between simultaneous hits + a beat hub;
   - articulation marks (open hi-hat, cross-stick, ride bell).
---------------------------------------------------------------------------- */

import type { ScoreEngine, ActiveDrums, DrumHit } from '../core/score-engine';
import {
  midiToPiece,
  midiToLimb,
  PIECE_VOICE,
  LIMB_COLOURS,
  QUARTER_TICKS,
  type KitPiece,
} from '../core/drums';
import {
  buildGrid,
  firstIndexAtOrAfter,
} from '../core/timeline';
import {
  getViz, subscribeViz, setViz, saveKitGeometry, saveDockWidth, type VizSettings,
} from '../core/viz';
import { getSticking, subscribeSticking, type Hand } from '../ai/sticking';
import { Highway } from './highway';
import { FollowEngine } from '../core/follow-engine';
import { toast } from './toast';
import { detectInstrument } from '../core/instrument/detect';
import type { PlayEvent } from '../core/instrument/types';
import { FingeringChart } from './fingering-chart';
import { SaxophoneInstrument } from '../core/instrument/saxophone';
import type { Instrument } from '../core/instrument/types';
import { noteName } from '../core/pitch';

const SVGNS = 'http://www.w3.org/2000/svg';

const GEO: Record<KitPiece, { x: number; y: number; rx: number; ry: number }> = {
  crash: { x: 120, y: 52, rx: 40, ry: 13 },
  ride: { x: 392, y: 56, rx: 46, ry: 15 },
  hihat: { x: 84, y: 124, rx: 32, ry: 11 },
  hiTom: { x: 210, y: 74, rx: 25, ry: 25 },
  midTom: { x: 270, y: 70, rx: 26, ry: 26 },
  floorTom: { x: 360, y: 138, rx: 33, ry: 33 },
  snare: { x: 156, y: 150, rx: 30, ry: 30 },
  kick: { x: 246, y: 158, rx: 54, ry: 30 },
};
const HUB = { x: 242, y: 112 };
const RING_LEAD = QUARTER_TICKS * 1.25; // how long before a hit the ring appears

const SVG = `
<svg viewBox="0 0 480 200" class="kit-svg" xmlns="${SVGNS}" preserveAspectRatio="xMidYMid meet">
  <defs>
    <radialGradient id="ds-head" cx="40%" cy="32%" r="75%"><stop offset="0%" stop-color="#4b5160"/><stop offset="100%" stop-color="#222730"/></radialGradient>
    <radialGradient id="ds-kick" cx="50%" cy="36%" r="72%"><stop offset="0%" stop-color="#4b5160"/><stop offset="100%" stop-color="#1d212a"/></radialGradient>
    <radialGradient id="ds-cym" cx="44%" cy="38%" r="72%"><stop offset="0%" stop-color="#d8c372"/><stop offset="60%" stop-color="#a8923f"/><stop offset="100%" stop-color="#6c5d2c"/></radialGradient>
    <radialGradient id="ds-floor" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#000" stop-opacity="0.5"/><stop offset="65%" stop-color="#000" stop-opacity="0.18"/><stop offset="100%" stop-color="#000" stop-opacity="0"/></radialGradient>
  </defs>

  <ellipse class="kit-floor" cx="240" cy="172" rx="216" ry="30" fill="url(#ds-floor)"/>

  <ellipse id="kit-crash" class="kit-piece" cx="120" cy="52" rx="40" ry="13" fill="url(#ds-cym)"/>
  <ellipse class="kit-groove" cx="120" cy="52" rx="26" ry="8"/><ellipse class="kit-bell" cx="120" cy="52" rx="6" ry="3"/>
  <text class="kit-label" x="120" y="52">CR</text>

  <ellipse id="kit-ride" class="kit-piece" cx="392" cy="56" rx="46" ry="15" fill="url(#ds-cym)"/>
  <ellipse class="kit-groove" cx="392" cy="56" rx="31" ry="10"/><ellipse id="rd-bell" class="kit-bell" cx="392" cy="56" rx="7" ry="4"/>
  <text class="kit-label" x="392" y="56">RD</text>

  <ellipse class="kit-deco" cx="84" cy="132" rx="30" ry="8"/>
  <ellipse id="kit-hihat" class="kit-piece" cx="84" cy="124" rx="32" ry="11" fill="url(#ds-cym)"/>
  <ellipse class="kit-groove" cx="84" cy="124" rx="20" ry="7"/>
  <text class="kit-label" x="84" y="124">HH</text>

  <circle class="kit-rim" cx="210" cy="74" r="28"/><circle id="kit-hiTom" class="kit-piece" cx="210" cy="74" r="25" fill="url(#ds-head)"/>
  <ellipse class="kit-sheen" cx="202" cy="66" rx="11" ry="6"/><text class="kit-label" x="210" y="74">T1</text>

  <circle class="kit-rim" cx="270" cy="70" r="29"/><circle id="kit-midTom" class="kit-piece" cx="270" cy="70" r="26" fill="url(#ds-head)"/>
  <ellipse class="kit-sheen" cx="261" cy="61" rx="11" ry="6"/><text class="kit-label" x="270" y="70">T2</text>

  <circle class="kit-rim" cx="360" cy="138" r="36"/><circle id="kit-floorTom" class="kit-piece" cx="360" cy="138" r="33" fill="url(#ds-head)"/>
  <ellipse class="kit-sheen" cx="348" cy="126" rx="14" ry="8"/><text class="kit-label" x="360" y="138">FT</text>

  <circle class="kit-rim" cx="156" cy="150" r="33"/><circle id="kit-snare" class="kit-piece" cx="156" cy="150" r="30" fill="url(#ds-head)"/>
  <ellipse class="kit-sheen" cx="146" cy="140" rx="13" ry="7"/><text class="kit-label" x="156" y="150">SN</text>

  <ellipse class="kit-rim-e" cx="246" cy="158" rx="57" ry="33"/><ellipse id="kit-kick" class="kit-piece" cx="246" cy="158" rx="54" ry="30" fill="url(#ds-kick)"/>
  <ellipse class="kit-sheen" cx="228" cy="147" rx="19" ry="9"/><text class="kit-label kit-label-lg" x="246" y="159">KICK</text>

  <g id="kit-overlay"></g>
  <circle id="kit-hub" class="kit-hub" cx="${HUB.x}" cy="${HUB.y}" r="6"/>
</svg>`;

function svgEl(name: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVGNS, name) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function createDrumKit(engine: ScoreEngine): void {
  let viz: VizSettings = getViz();
  let timeline: PlayEvent[] = [];

  // ----------------------------------------------------------- floating card
  const card = document.createElement('div');
  card.className = 'kit-float';
  card.innerHTML = `
    <div class="kit-float-head">
      <span class="kit-title">Drum kit</span>
      <span class="kit-grade" hidden></span>
      <span class="kit-head-actions">
        <button class="kit-pin" title="Dock to the right / float">⇥</button>
        <button class="kit-float-close" title="Hide (re-enable from the Practice button)">✕</button>
      </span>
    </div>
    <div class="kit-float-body">
      <canvas class="kit-highway"></canvas>
      <div class="kit-stage">${SVG}</div>
    </div>
    <div class="kit-dock-resize" title="Drag to resize"></div>`;
  document.body.appendChild(card);

  const appEl = document.getElementById('app');
  const persistGeometry = () => {
    const r = card.getBoundingClientRect();
    saveKitGeometry({ left: r.left, top: r.top, width: r.width, height: r.height });
  };

  // drag (float mode only)
  const head = card.querySelector('.kit-float-head') as HTMLElement;
  let dragging = false, sx = 0, sy = 0, bl = 0, bt = 0;
  head.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('.kit-float-close, .kit-pin')) return;
    if (viz.dock === 'right') return;
    dragging = true;
    const r = card.getBoundingClientRect();
    bl = r.left; bt = r.top; sx = e.clientX; sy = e.clientY;
    card.style.right = 'auto'; card.style.bottom = 'auto';
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    card.style.left = `${clamp(bl + e.clientX - sx, 0, window.innerWidth - card.offsetWidth)}px`;
    card.style.top = `${clamp(bt + e.clientY - sy, 0, window.innerHeight - card.offsetHeight)}px`;
  });
  head.addEventListener('pointerup', () => { if (dragging) { dragging = false; persistGeometry(); } });
  head.addEventListener('pointercancel', () => { dragging = false; });

  // resize while docked: drag the left edge to set width
  const dockHandle = card.querySelector('.kit-dock-resize') as HTMLElement;
  let dragW = false;
  dockHandle.addEventListener('pointerdown', (e) => {
    dragW = true; dockHandle.setPointerCapture(e.pointerId); e.preventDefault();
  });
  dockHandle.addEventListener('pointermove', (e) => {
    if (!dragW) return;
    const w = clamp(window.innerWidth - e.clientX, 260, 680);
    card.style.width = `${w}px`;
    if (appEl) appEl.style.paddingRight = `${w}px`;
  });
  dockHandle.addEventListener('pointerup', () => {
    if (!dragW) return;
    dragW = false;
    saveDockWidth(Math.round(card.getBoundingClientRect().width));
  });
  dockHandle.addEventListener('pointercancel', () => { dragW = false; });

  if ('ResizeObserver' in window) {
    let first = true;
    new ResizeObserver(() => {
      if (first) { first = false; return; }
      if (viz.dock === 'right') {
        const w = Math.round(card.getBoundingClientRect().width);
        saveDockWidth(w);
        if (appEl) appEl.style.paddingRight = `${w}px`;
      } else {
        persistGeometry();
      }
      fitHighway(getViz()); // re-fill a pitched highway when the panel resizes
    }).observe(card);
  }

  (card.querySelector('.kit-float-close') as HTMLElement).onclick = () => setViz({ showKit: false });
  (card.querySelector('.kit-pin') as HTMLElement).onclick = () =>
    setViz({ dock: getViz().dock === 'right' ? 'float' : 'right' });

  // ----------------------------------------------------------- refs
  const overlay = card.querySelector('#kit-overlay') as SVGGElement;
  const hub = card.querySelector('#kit-hub') as SVGElement;
  const rideBell = card.querySelector('#rd-bell') as SVGElement;
  const heads = new Map<KitPiece, SVGElement>();
  (Object.keys(GEO) as KitPiece[]).forEach((p) => {
    const el = card.querySelector(`#kit-${p}`) as SVGElement | null;
    if (el) heads.set(p, el);
  });

  // approach rings (one persistent per piece)
  const rings = new Map<KitPiece, SVGElement>();
  (Object.keys(GEO) as KitPiece[]).forEach((p) => {
    const g = GEO[p];
    const ring = svgEl('ellipse', {
      cx: String(g.x), cy: String(g.y), rx: String(g.rx + 2), ry: String(g.ry + 2),
      class: 'approach-ring',
    });
    overlay.appendChild(ring);
    rings.set(p, ring);
  });

  // articulation marks
  const openHatRing = svgEl('ellipse', { cx: String(GEO.hihat.x), cy: String(GEO.hihat.y), rx: '40', ry: '18', class: 'artic' });
  const xstickRing = svgEl('circle', { cx: String(GEO.snare.x), cy: String(GEO.snare.y), r: '34', class: 'artic' });
  overlay.appendChild(openHatRing);
  overlay.appendChild(xstickRing);

  // ghost "ready" sticks — one persistent stick per hand, hovering at that
  // hand's next target and travelling between targets.
  function makeGhost() {
    const grp = svgEl('g', { class: 'ghost-stick' });
    const line = svgEl('line', {});
    const bead = svgEl('circle', { r: '3.2' });
    grp.appendChild(line);
    grp.appendChild(bead);
    grp.style.opacity = '0';
    overlay.appendChild(grp);
    return { grp, line, bead };
  }
  const ghostR = makeGhost();
  const ghostL = makeGhost();

  // per-hand upcoming-hit schedules, rebuilt whenever the sticking changes
  let schedR: { tick: number; piece: KitPiece }[] = [];
  let schedL: { tick: number; piece: KitPiece }[] = [];
  const ghostSuppress = { R: 0, L: 0 }; // wall-clock ms until which to hide each ghost
  function rebuildSchedules(): void {
    schedR = [];
    schedL = [];
    const st = getSticking();
    if (!st) return;
    for (const ev of timeline) {
      const hand = st.hands.get(`${ev.tick}:${ev.piece}`);
      if (hand === 'R') schedR.push({ tick: ev.tick, piece: ev.piece });
      else if (hand === 'L') schedL.push({ tick: ev.tick, piece: ev.piece });
    }
  }
  subscribeSticking(() => rebuildSchedules());

  // highway
  const canvas = card.querySelector('.kit-highway') as HTMLCanvasElement;
  const stage = card.querySelector('.kit-stage') as HTMLElement;
  const highway = new Highway(canvas, engine);

  // Live score-follower (Stage 5): grades the player's mic against the focused
  // melodic track. Flashes the hit line + keeps a running good/total tally.
  const follow = new FollowEngine(engine);
  const gradeEl = card.querySelector('.kit-grade') as HTMLElement;
  let followPending = false;
  follow.onResolve((_res, kind) => {
    highway.flashVerdict(kind);
    const s = follow.summary();
    gradeEl.textContent = `✓${s.good} ~${s.close} ✗${s.bad}`;
    gradeEl.dataset.kind = kind;
  });
  // tint recently-played notes on the highway by their verdict as they slide past
  highway.setVerdictLookup((i) => follow.verdictKindFor(i));

  const fingering = new FingeringChart();
  fingering.el.style.display = 'none';
  stage.parentElement!.appendChild(fingering.el);

  let activeInstrument: Instrument | null = null;
  let allTracks: any[] = [];

  // instrument/track switcher in the header
  const switcher = document.createElement('select');
  switcher.className = 'kit-switcher';
  (card.querySelector('.kit-head-actions') as HTMLElement).prepend(switcher);
  switcher.onchange = () => {
    const idx = Number(switcher.value);
    const t = allTracks[idx];
    if (t) focusTrack(t);
  };

  function focusTrack(track: any): void {
    const score = engine.api.score;
    if (!score) return;
    const instrument = detectInstrument(track);
    activeInstrument = instrument;
    const tl = instrument.buildTimeline(score, track);
    timeline = tl;
    highway.setLanes(instrument.lanes(tl));
    highway.setTimeline(tl);
    highway.setGrid(buildGrid(score));
    follow.setTimeline(tl);
    const isDrums = instrument.id === 'drums';
    const isSax = instrument.id === 'saxophone';
    stage.style.display = isDrums ? 'flex' : 'none';
    fingering.el.style.display = isSax ? 'flex' : 'none';
    // Re-size the highway for the new instrument: fixed height when a kit/chart
    // sits below (drums/sax), or fill the panel for pitched instruments.
    fitHighway(viz);
    requestAnimationFrame(() => fitHighway(viz));
    (card.querySelector('.kit-title') as HTMLElement).textContent = instrument.label;
    if (viz.showKit && (viz.approachRings || isSax)) startRings(); else stopRings();
    syncFollow();
  }

  // Start/stop the live follower to match the Follow toggle + the focused
  // instrument (melodic only). Opening the mic is async + may be denied.
  function syncFollow(): void {
    const want = viz.follow && !!activeInstrument && activeInstrument.id !== 'drums';
    if (want && !follow.active && !followPending) {
      followPending = true;
      gradeEl.textContent = '♪ listening…';
      gradeEl.hidden = false;
      follow
        .start()
        .then(() => { followPending = false; })
        .catch(() => {
          followPending = false;
          gradeEl.hidden = true;
          toast('Follow needs microphone access — check the browser permission.');
          setViz({ follow: false });
        });
    } else if (!want && follow.active) {
      follow.stop();
      gradeEl.hidden = true;
    } else if (!want) {
      gradeEl.hidden = true;
    }
  }

  engine.onScore((score) => {
    allTracks = score?.tracks ?? [];
    // populate switcher (skip empty tracks)
    switcher.innerHTML = allTracks
      .map((t, i) => `<option value="${i}">${(t?.name ?? `Track ${i + 1}`).replace(/[<>&]/g, '')}</option>`)
      .join('');
    const focus =
      allTracks.find((t) => {
        const pi = t?.playbackInfo;
        return (pi && (pi.primaryChannel === 9 || pi.secondaryChannel === 9)) ||
          /drum|perc|kit|schlag|bater/i.test(t?.name ?? '');
      }) ?? allTracks.find((t) => t?.playbackInfo) ?? allTracks[0];
    const focusIdx = allTracks.indexOf(focus);
    if (focusIdx >= 0) switcher.value = String(focusIdx);
    focusTrack(focus);
  });

  // ----------------------------------------------------------- kit cues
  const colourOf = (p: KitPiece) => engine.getDrumColors().colors[PIECE_VOICE[p]];

  function flash(piece: KitPiece, hit: DrumHit): void {
    const g = GEO[piece];
    const color = colourOf(piece);
    const hold = viz.flashMs;

    // brief glow on the drum itself (no fill — keeps it readable)
    const headEl = heads.get(piece);
    if (headEl) {
      headEl.style.transition = 'none';
      headEl.style.filter = `drop-shadow(0 0 ${hit.ghost ? 4 : 9}px ${color})`;
      window.setTimeout(() => {
        headEl.style.transition = 'filter .3s ease';
        headEl.style.filter = '';
      }, hold);
    }

    // the shrinking collapsing circle
    let start = 1.45 + hit.velocity * 0.5;
    if (hit.accent) start += 0.3;
    if (hit.ghost) start = 0.85;
    const disc = svgEl('ellipse', {
      cx: String(g.x), cy: String(g.y), rx: String(g.rx), ry: String(g.ry), class: 'hit-disc',
    });
    disc.style.fill = color;
    disc.style.opacity = hit.ghost ? '0.5' : '0.8';
    disc.style.transform = `scale(${start})`;
    overlay.appendChild(disc);
    requestAnimationFrame(() => {
      disc.style.transition = `transform ${hold}ms cubic-bezier(.4,0,.2,1), opacity ${hold}ms ease`;
      disc.style.transform = 'scale(0)';
      disc.style.opacity = '0';
    });
    window.setTimeout(() => disc.remove(), hold + 120);
  }

  // A diagonal stick over the struck drum, angled by hand:
  //   left hand  → tip points top-right;  right hand → tip points top-left.
  function flashStick(piece: KitPiece, hand: 'R' | 'L'): void {
    const g = GEO[piece];
    // Tip lands ON the drum centre; the body extends away (down-left for the
    // left hand so the tip points top-right, down-right for the right hand).
    const reach = Math.max(g.rx, g.ry) * 0.6 + 40;
    const d = reach * 0.7071;
    const tip = { x: g.x, y: g.y };
    const tail = hand === 'L' ? { x: g.x - d, y: g.y + d } : { x: g.x + d, y: g.y + d };
    const grp = svgEl('g', { class: 'kit-stick' });
    grp.appendChild(
      svgEl('line', {
        x1: String(tail.x), y1: String(tail.y), x2: String(tip.x), y2: String(tip.y),
      }),
    );
    grp.appendChild(svgEl('circle', { cx: String(tip.x), cy: String(tip.y), r: '3.4' }));
    overlay.appendChild(grp);

    // Hold fully visible briefly, then fade out (lingers a little).
    const hold = viz.flashMs;
    const fade = Math.max(500, hold);
    grp.style.opacity = '1';
    window.setTimeout(() => {
      grp.style.transition = `opacity ${fade}ms ease`;
      grp.style.opacity = '0';
    }, hold);
    window.setTimeout(() => grp.remove(), hold + fade + 60);
  }

  function pulseHub(): void {
    hub.style.transition = 'none';
    hub.style.transform = 'scale(2)';
    hub.style.opacity = '0.85';
    requestAnimationFrame(() => {
      hub.style.transition = 'transform .35s ease, opacity .35s ease';
      hub.style.transform = '';
      hub.style.opacity = '';
    });
  }

  function drawLine(piece: KitPiece, midi: number): void {
    const g = GEO[piece];
    const color = viz.limbColours ? LIMB_COLOURS[midiToLimb(midi)] : 'rgba(220,225,235,0.6)';
    const line = svgEl('line', {
      x1: String(HUB.x), y1: String(HUB.y), x2: String(g.x), y2: String(g.y), class: 'kit-line',
    });
    line.style.stroke = color;
    line.style.opacity = '0';
    overlay.appendChild(line);
    requestAnimationFrame(() => { line.style.transition = 'opacity .12s ease'; line.style.opacity = '0.8'; });
    window.setTimeout(() => {
      line.style.transition = 'opacity .3s ease';
      line.style.opacity = '0';
      window.setTimeout(() => line.remove(), 320);
    }, viz.flashMs);
  }

  function showArtic(el: SVGElement, stroke: string): void {
    el.style.stroke = stroke;
    el.style.transition = 'none';
    el.style.opacity = '0.9';
    window.setTimeout(() => { el.style.transition = 'opacity .3s ease'; el.style.opacity = '0'; }, viz.flashMs);
  }
  function handleArticulation(midi: number): void {
    if (midi === 46) showArtic(openHatRing, colourOf('hihat'));
    else if (midi === 37 || midi === 31 || midi === 33)
      showArtic(xstickRing, engine.getDrumColors().colors.crossStick);
    else if (midi === 53 && rideBell) {
      rideBell.style.transition = 'none';
      rideBell.style.fill = colourOf('ride');
      window.setTimeout(() => { rideBell.style.transition = 'fill .3s ease'; rideBell.style.fill = ''; }, viz.flashMs);
    }
  }

  engine.onActiveDrums((info: ActiveDrums) => {
    if (!viz.showKit) return;
    if (info.hits.length > 0) pulseHub();
    const sticking = getSticking();
    const piecesHit = new Set<KitPiece>();
    for (const hit of info.hits) {
      const piece = midiToPiece(hit.midi);
      if (!piece) continue;
      piecesHit.add(piece);
      flash(piece, hit);
      handleArticulation(hit.midi);
      if (sticking) {
        const hand = sticking.hands.get(`${hit.tick}:${piece}`);
        if (hand) {
          flashStick(piece, hand);
          // hide that hand's ghost while the bright contact stick is on screen,
          // so you never see two sticks stacked on the same drum.
          ghostSuppress[hand] = performance.now() + viz.flashMs + Math.max(500, viz.flashMs);
        }
      }
    }
    if (viz.connectLines && piecesHit.size >= 2) {
      const drawn = new Set<KitPiece>();
      for (const hit of info.hits) {
        const piece = midiToPiece(hit.midi);
        if (piece && !drawn.has(piece)) { drawn.add(piece); drawLine(piece, hit.midi); }
      }
    }
  });

  // ----------------------------------------------------------- approach rings (rAF)
  function updateRings(): void {
    if (activeInstrument && activeInstrument.id === 'saxophone') { updateFingering(); return; }
    const show = viz.showKit && viz.approachRings && timeline.length > 0;
    if (!show) {
      rings.forEach((r) => (r.style.opacity = '0'));
      return;
    }
    const now = engine.currentTick;
    const found = new Map<KitPiece, number>(); // piece -> frac (0..1)
    let i = firstIndexAtOrAfter(timeline, now);
    for (; i < timeline.length; i++) {
      const ev = timeline[i];
      if (!ev.piece) continue;
      const dt = ev.tick - now;
      if (dt > RING_LEAD) break;
      if (dt < 0) continue;
      if (!found.has(ev.piece)) found.set(ev.piece, dt / RING_LEAD);
    }
    for (const [piece, ring] of rings) {
      const frac = found.get(piece);
      if (frac === undefined) { ring.style.opacity = '0'; continue; }
      ring.style.transform = `scale(${1 + frac * 1.6})`;
      ring.style.opacity = String(0.18 + (1 - frac) * 0.5);
      ring.style.stroke = colourOf(piece);
    }
  }

  function updateFingering(): void {
    if (!viz.showKit || timeline.length === 0 || !(activeInstrument instanceof SaxophoneInstrument)) {
      fingering.setActive(null, null, '');
      return;
    }
    const now = engine.currentTick;
    // current = the latest note at/just before now; next = first note after now
    let curEv: PlayEvent | null = null;
    let nextEv: PlayEvent | null = null;
    for (const ev of timeline) {
      if (ev.tick <= now) curEv = ev;
      else { nextEv = ev; break; }
    }
    const sax = activeInstrument;
    const curKeys = curEv ? sax.fingering(curEv.written) : null;
    const nextKeys = nextEv ? sax.fingering(nextEv.written) : null;
    const label = curEv ? noteName(curEv.written) : '';
    fingering.setActive(curKeys, nextKeys, label);
  }
  // Drive the rings only while they're actually shown — an always-on rAF would
  // burn a frame every ~16ms for the life of the app even with the kit hidden.
  let ringRaf = 0;
  let ringRunning = false;
  const ringLoop = () => {
    if (!ringRunning) return;
    updateRings();
    ringRaf = requestAnimationFrame(ringLoop);
  };
  function startRings(): void {
    if (ringRunning) return;
    ringRunning = true;
    ringRaf = requestAnimationFrame(ringLoop);
  }
  function stopRings(): void {
    ringRunning = false;
    cancelAnimationFrame(ringRaf);
    rings.forEach((r) => (r.style.opacity = '0'));
  }
  // Where a hand's ghost should be at `now`: travels from its previous hit to
  // its next target (ease-out), then hovers there until the strike.
  function ghostPos(
    sched: { tick: number; piece: KitPiece }[],
    now: number,
  ): { x: number; y: number } | null {
    let lo = 0;
    let hi = sched.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (sched[m].tick < now) lo = m + 1;
      else hi = m;
    }
    const nx = sched[lo];
    if (!nx) return null;
    const nxG = GEO[nx.piece];
    const pv = lo > 0 ? sched[lo - 1] : null;
    if (!pv) return { x: nxG.x, y: nxG.y };
    const pvG = GEO[pv.piece];
    const travel = Math.min((nx.tick - pv.tick) * 0.5, 480);
    let p = travel > 0 ? (now - pv.tick) / travel : 1;
    p = Math.max(0, Math.min(1, p));
    p = 1 - (1 - p) * (1 - p); // ease-out
    return { x: pvG.x + (nxG.x - pvG.x) * p, y: pvG.y + (nxG.y - pvG.y) * p };
  }
  function placeGhost(
    g: { grp: SVGElement; line: SVGElement; bead: SVGElement },
    x: number,
    y: number,
    hand: Hand,
  ): void {
    const d = 50 * 0.7071;
    const ty = y - 6; // hover slightly above the head
    const ax = hand === 'L' ? x - d : x + d;
    g.line.setAttribute('x1', String(ax));
    g.line.setAttribute('y1', String(ty + d));
    g.line.setAttribute('x2', String(x));
    g.line.setAttribute('y2', String(ty));
    g.bead.setAttribute('cx', String(x));
    g.bead.setAttribute('cy', String(ty));
    const col = viz.ghostByHand ? LIMB_COLOURS[hand === 'R' ? 'RH' : 'LH'] : '#f2e4be';
    g.line.style.stroke = col;
    g.grp.style.opacity = String(viz.ghostOpacity);
  }
  function updateGhosts(now: number): void {
    if (!viz.showKit || !viz.ghostSticks) {
      ghostR.grp.style.opacity = '0';
      ghostL.grp.style.opacity = '0';
      return;
    }
    const w = performance.now();
    if (w < ghostSuppress.R) {
      ghostR.grp.style.opacity = '0';
    } else {
      const pr = ghostPos(schedR, now);
      if (pr) placeGhost(ghostR, pr.x, pr.y, 'R');
      else ghostR.grp.style.opacity = '0';
    }
    if (w < ghostSuppress.L) {
      ghostL.grp.style.opacity = '0';
    } else {
      const pl = ghostPos(schedL, now);
      if (pl) placeGhost(ghostL, pl.x, pl.y, 'L');
      else ghostL.grp.style.opacity = '0';
    }
  }

  const loop = () => {
    const now = engine.currentTick;
    updateRings();
    updateGhosts(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // ----------------------------------------------------------- viz wiring
  function applyDock(v: VizSettings): void {
    if (!v.showKit) {
      card.style.display = 'none';
      if (appEl) appEl.style.paddingRight = '';
      return;
    }
    card.style.display = 'flex';
    if (v.dock === 'right') {
      card.classList.add('docked');
      card.style.left = 'auto';
      card.style.right = '0px';
      card.style.top = '0px';
      card.style.bottom = '0px';
      card.style.height = 'auto';
      card.style.width = `${v.dockWidth}px`;
      if (appEl) appEl.style.paddingRight = `${v.dockWidth}px`;
    } else {
      card.classList.remove('docked');
      if (appEl) appEl.style.paddingRight = '';
      if (v.kit) {
        // restore floating geometry (clamped so the highway+kit fit)
        card.style.left = `${Math.max(0, v.kit.left)}px`;
        card.style.top = `${Math.max(0, v.kit.top)}px`;
        card.style.right = 'auto';
        card.style.bottom = 'auto';
        card.style.width = `${Math.max(v.kit.width, 300)}px`;
        card.style.height = `${Math.max(v.kit.height, 380)}px`;
      } else {
        // fall back to the CSS default (bottom-right)
        for (const p of ['left', 'top', 'right', 'bottom', 'width', 'height'] as const) {
          card.style[p] = '';
        }
      }
    }
  }

  // Size the highway canvas. Drums/sax use a fixed height (the kit or fingering
  // chart sits below). Pitched instruments have no diagram below, so the highway
  // is measured to fill the panel — a <canvas> won't reliably flex-grow, so we
  // set an explicit pixel height from the panel's available space.
  function fitHighway(v: VizSettings): void {
    const fill = !!activeInstrument && activeInstrument.id !== 'drums' && activeInstrument.id !== 'saxophone';
    if (!fill) {
      canvas.style.height = `${v.highwayHeight}px`;
    } else {
      const body = canvas.parentElement;
      const cs = body ? getComputedStyle(body) : null;
      const pad = cs ? parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) : 20;
      const avail = (body?.clientHeight ?? v.highwayHeight) - pad;
      canvas.style.height = `${Math.max(160, Math.round(avail))}px`;
    }
    highway.resize();
  }

  function applyHighway(v: VizSettings): void {
    if (v.showKit && v.showHighway) {
      canvas.style.display = 'block';
      fitHighway(v);
      // The panel's final height is only known after layout settles — re-fit next
      // frame so a pitched highway fills the panel exactly (no empty gap below).
      requestAnimationFrame(() => fitHighway(v));
      highway.start();
    } else {
      canvas.style.display = 'none';
      highway.stop();
    }
  }

  subscribeViz((v) => {
    viz = v;
    stage.style.minHeight = '120px';
    applyDock(v);
    applyHighway(v);
    if (v.showKit && (v.approachRings || activeInstrument?.id === 'saxophone')) startRings();
    else stopRings();
    (card.querySelector('.kit-pin') as HTMLElement).classList.toggle('active', v.dock === 'right');
    follow.setTolerance(v.followTolerance);
    syncFollow();
  });
}
