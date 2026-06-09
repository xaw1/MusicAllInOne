/* ----------------------------------------------------------------------------
   Visualisation settings (live drum kit).

   Tiny pub/sub so the floating kit and the settings panel stay decoupled: the
   panel calls setViz(), the kit subscribes. Also stores the floating panel's
   geometry so it reopens where you left it.
---------------------------------------------------------------------------- */

export interface KitGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface VizSettings {
  /** Whether the floating drum-kit panel is shown. */
  showKit: boolean;
  /** How long a piece stays fully lit before it fades, in milliseconds. */
  flashMs: number;
  /** Draw lines between drums hit at the same time. */
  connectLines: boolean;
  /** Colour those lines by limb (right/left hand, right/left foot). */
  limbColours: boolean;
  /** osu-style rings that shrink onto each piece, reaching it at hit time. */
  approachRings: boolean;
  /** Half-visible "ready" sticks that travel to each hand's next target. */
  ghostSticks: boolean;
  /** Opacity of the ready sticks (0..1). */
  ghostOpacity: number;
  /** Colour the ready sticks by hand (right cyan / left orange) vs neutral. */
  ghostByHand: boolean;
  /** Ghost sticks glide into their next target (vs snap/park). */
  ghostGlide: boolean;
  /** Contact (hit) sticks glide in from the hand's previous position. */
  stickGlide: boolean;
  /** Show the falling-notes highway above the kit. */
  showHighway: boolean;
  /** Highway height in pixels. */
  highwayHeight: number;
  /** How far ahead the highway/rings look, in quarter-note beats. */
  lookaheadBeats: number;
  /** Fraction of a 16th slot a note box fills vertically (1 = no vertical gap). */
  noteFill: number;
  /** Gap in px from a note box edge to its lane edge. */
  laneMargin: number;
  /** Show R/L sticking letters under the sheet notation. */
  sheetSticking: boolean;
  /** Live mic score-follower on (melodic instruments): grade pitch + timing. */
  follow: boolean;
  /** Follower grading strictness (Easy/Average/Strict cents + ms bands). */
  followTolerance: 'easy' | 'average' | 'strict';
  /** 'float' = draggable card; 'right' = pinned to the right edge (no overlap). */
  dock: 'float' | 'right';
  /** Width of the right-docked panel, in pixels. */
  dockWidth: number;
  /** Floating panel geometry (null = default bottom-right). */
  kit: KitGeometry | null;
}

export const DEFAULT_VIZ: VizSettings = {
  showKit: true,
  flashMs: 320,
  connectLines: true,
  limbColours: true,
  approachRings: true,
  ghostSticks: true,
  ghostOpacity: 0.5,
  ghostByHand: false,
  showHighway: true,
  highwayHeight: 240,
  lookaheadBeats: 8,
  noteFill: 0.92,
  laneMargin: 1,
  sheetSticking: true,
  follow: false,
  followTolerance: 'average',
  dock: 'right',
  dockWidth: 360,
  kit: null,
};

export const FLASH_MS_MIN = 100;
export const FLASH_MS_MAX = 1000;
export const HIGHWAY_HEIGHT_MIN = 120;
export const HIGHWAY_HEIGHT_MAX = 1200;
export const LOOKAHEAD_MIN = 2;
export const LOOKAHEAD_MAX = 16;
export const NOTE_FILL_MIN = 0.5;
export const NOTE_FILL_MAX = 1;
export const LANE_MARGIN_MIN = 0;
export const LANE_MARGIN_MAX = 12;

const KEY = 'drumscore.viz';

function load(): VizSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_VIZ };
    return { ...DEFAULT_VIZ, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_VIZ };
  }
}

function save(v: VizSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

let current = load();
const listeners = new Set<(v: VizSettings) => void>();

export function getViz(): VizSettings {
  return current;
}

export function setViz(patch: Partial<VizSettings>): void {
  current = { ...current, ...patch };
  save(current);
  for (const l of listeners) l(current);
}

/** Persist geometry without broadcasting (avoids feedback while dragging). */
export function saveKitGeometry(kit: KitGeometry): void {
  current = { ...current, kit };
  save(current);
}

/** Persist the docked width without broadcasting. */
export function saveDockWidth(dockWidth: number): void {
  current = { ...current, dockWidth };
  save(current);
}

export function subscribeViz(cb: (v: VizSettings) => void): () => void {
  listeners.add(cb);
  cb(current);
  return () => listeners.delete(cb);
}
