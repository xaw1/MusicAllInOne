/* ----------------------------------------------------------------------------
   Falling-notes highway (Guitar-Hero style), drawn on a <canvas>.

   One lane per drum piece. Notes fall toward a hit line near the bottom (just
   above the kit). Position is driven by the live MIDI tick position, so it stays
   in sync through tempo changes and the speed slider. Purely a visual guide
   (no input scoring yet — that comes with the Stage 5 mic follower).
---------------------------------------------------------------------------- */

import type { ScoreEngine } from '../core/score-engine';
import { QUARTER_TICKS } from '../core/drums';
import {
  firstIndexAtOrAfter,
  firstNumAtOrAfter,
  type DrumGrid,
} from '../core/timeline';
import type { PlayEvent, LaneDef } from '../core/instrument/types';
import { getViz } from '../core/viz';
import { getSticking } from '../ai/sticking';

/** Darken a #rrggbb colour by a factor (0..1) — the inner-marker shade. */
function darken(hex: string, f: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}

export class Highway {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly engine: ScoreEngine;
  private events: PlayEvent[] = [];
  private lanes: LaneDef[] = [];
  private laneIndex = new Map<string, number>();
  private grid: DrumGrid = { bars: [], quarters: [], eighths: [] };
  private raf = 0;
  private running = false;
  // a brief hit-line glow when the score-follower grades a note (good/close/bad)
  private flash: { kind: 'good' | 'close' | 'bad'; alpha: number } | null = null;
  // optional: tint recently-graded notes by the follower's verdict as they pass
  private verdictLookup: ((eventIndex: number) => 'good' | 'close' | 'bad' | null) | null = null;

  constructor(canvas: HTMLCanvasElement, engine: ScoreEngine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.engine = engine;
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => this.resize()).observe(canvas);
    }
    this.resize();
  }

  setTimeline(events: PlayEvent[]): void {
    this.events = events;
  }

  setLanes(lanes: LaneDef[]): void {
    this.lanes = lanes;
    this.laneIndex = new Map(lanes.map((l, i) => [l.key, i]));
  }

  setGrid(grid: DrumGrid): void {
    this.grid = grid;
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Flash the hit line in the score-follower's verdict colour (fades over ~200ms). */
  flashVerdict(kind: 'good' | 'close' | 'bad'): void {
    this.flash = { kind, alpha: 1 };
  }

  /** Provide a per-event verdict so the highway tints recently-played notes by it. */
  setVerdictLookup(fn: ((eventIndex: number) => 'good' | 'close' | 'bad' | null) | null): void {
    this.verdictLookup = fn;
  }

  private draw(): void {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    const lanes = this.lanes.length;
    if (lanes === 0) return;
    const gutterW = 17;            // left column reserved for the counts ruler
    const labelH = 16;             // bottom strip reserved for lane labels
    const fieldX = gutterW;
    const laneW = (w - gutterW) / lanes;
    const topY = 6;
    const stripY = h - labelH;     // top edge of the bottom label strip
    const hitY = stripY - 8;       // hit line sits just above the labels
    const windowTicks = getViz().lookaheadBeats * QUARTER_TICKS;
    const now = this.engine.currentTick;
    const colours = this.engine.getDrumColors().colors;
    const sixteenthPx = (240 / windowTicks) * (hitY - topY);

    // lane stripes + separators (playfield only — to the right of the gutter)
    for (let i = 0; i < lanes; i++) {
      const x = fieldX + i * laneW;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(x, 0, laneW, stripY);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, stripY);
      ctx.stroke();
    }

    // gutter backing for the counts ruler, with a hairline separator
    ctx.fillStyle = 'rgba(10,8,14,0.55)';
    ctx.fillRect(0, 0, gutterW, stripY);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.moveTo(gutterW + 0.5, 0);
    ctx.lineTo(gutterW + 0.5, stripY);
    ctx.stroke();

    // beat / bar gridlines (horizontal), scrolling with the music
    const drawGrid = (ticks: number[], style: string, lw: number) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = lw;
      for (let gi = firstNumAtOrAfter(ticks, now); gi < ticks.length; gi++) {
        const dt = ticks[gi] - now;
        if (dt > windowTicks) break;
        const y = hitY - (dt / windowTicks) * (hitY - topY);
        ctx.beginPath();
        ctx.moveTo(fieldX, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    };
    drawGrid(this.grid.eighths, 'rgba(255,255,255,0.05)', 1); // "&" off-beats: faint
    drawGrid(this.grid.quarters, 'rgba(255,255,255,0.20)', 1); // numbered beats: clearer
    drawGrid(this.grid.bars, 'rgba(255,255,255,0.45)', 2); // bar lines: clearest

    // hit line — a bright glowing bar (Melodics-style), with a soft fade above it
    const fade = ctx.createLinearGradient(0, hitY - 26, 0, hitY);
    fade.addColorStop(0, 'rgba(255,179,71,0)');
    fade.addColorStop(1, 'rgba(255,179,71,0.10)');
    ctx.fillStyle = fade;
    ctx.fillRect(fieldX, hitY - 26, w - fieldX, 26);
    ctx.save();
    ctx.shadowColor = 'rgba(255,179,71,0.9)';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = 'rgba(255,201,128,0.95)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(fieldX, hitY);
    ctx.lineTo(w, hitY);
    ctx.stroke();
    ctx.restore();
    ctx.lineWidth = 1;

    // score-follower verdict flash on the hit line (good = mint, close = amber, bad = red)
    if (this.flash) {
      const base =
        this.flash.kind === 'good' ? '79,227,196' : this.flash.kind === 'close' ? '255,179,71' : '255,107,107';
      ctx.save();
      ctx.shadowColor = `rgba(${base},0.9)`;
      ctx.shadowBlur = 22;
      ctx.strokeStyle = `rgba(${base},${this.flash.alpha.toFixed(3)})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(fieldX, hitY);
      ctx.lineTo(w, hitY);
      ctx.stroke();
      ctx.restore();
      ctx.lineWidth = 1;
      this.flash.alpha *= 0.9;
      if (this.flash.alpha < 0.05) this.flash = null;
    }

    // counts ruler in the gutter (beat numbers always; e/&/a only when there's room)
    this.drawRuler(now, windowTicks, topY, hitY, gutterW, sixteenthPx);

    // notes within [now, now + window]
    if (this.events.length > 0) {
      const v = getViz();
      const boxH = Math.max(6, sixteenthPx * v.noteFill);
      const boxW = Math.max(6, laneW - 2 * v.laneMargin);
      const sticking = getSticking();

      // Start a beat before "now" so recently-graded notes (verdicts resolve
      // ~150 ms after a note passes) can be tinted by the follower as they slide
      // past the hit line. Without a verdict lookup, passed notes are skipped as before.
      const PAST_TICKS = 960;
      let i = firstIndexAtOrAfter(this.events, now - PAST_TICKS);
      for (; i < this.events.length; i++) {
        const ev = this.events[i];
        const dt = ev.tick - now;
        if (dt > windowTicks) break;
        const verdict = dt < 0 && this.verdictLookup ? this.verdictLookup(i) : null;
        if (dt < 0 && !verdict) continue; // passed + ungraded → don't draw (default)
        const frac = dt / windowTicks; // 0 at hit line, 1 at top, <0 below it
        const lane = this.laneIndex.get(ev.laneKey);
        if (lane === undefined) continue;
        const cx = fieldX + lane * laneW + laneW / 2;
        const cy = hitY - frac * (hitY - topY);
        const laneDef = this.lanes[lane];

        // Uniform box; the inner highlight encodes the 16th position in the beat:
        //   0 (on the beat) = bar,  1 (e) = ▲,  2 (&) = ◆,  3 (a) = ▼
        const sub = Math.round((ev.tick % 960) / 240) % 4;
        let colour: string;
        let alpha: number;
        if (verdict) {
          colour = verdict === 'good' ? '#4fe3c4' : verdict === 'close' ? '#ffb347' : '#ff6b6b';
          alpha = Math.max(0, 1 + dt / PAST_TICKS); // fade out as it slides past
        } else {
          colour = laneDef.color ?? (laneDef.colorVoice ? colours[laneDef.colorVoice] : '#9aa1b1');
          alpha = Math.max(0.4, 1 - frac * 0.45);
        }
        this.drawNote(cx, cy, boxW, boxH, sub, colour, ev.accent, ev.ghost, alpha);

        // sticking letter (R/L) from the AI coach — upcoming notes only
        if (sticking && boxH >= 9 && dt >= 0) {
          const hand = sticking.hands.get(`${ev.tick}:${ev.laneKey}`);
          if (hand) {
            ctx.globalAlpha = alpha;
            ctx.fillStyle = 'rgba(255,255,255,0.96)';
            ctx.font = `700 ${Math.min(12, Math.round(boxH * 0.82))}px -apple-system, Segoe UI, Roboto, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(hand, cx, cy + 0.5);
            ctx.globalAlpha = 1;
          }
        }
      }
      ctx.textBaseline = 'alphabetic';
    }

    // bottom label strip — drawn last so labels stay legible over the notes.
    // Thin the labels out (every Nth lane) when lanes are too narrow to read,
    // e.g. a chromatic pitched highway, instead of crushing them together.
    ctx.fillStyle = 'rgba(10,8,14,0.86)';
    ctx.fillRect(0, stripY, w, labelH);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(0, stripY + 0.5);
    ctx.lineTo(w, stripY + 0.5);
    ctx.stroke();
    const labelStep = Math.max(1, Math.ceil(26 / laneW)); // keep ≥ ~26px between labels
    ctx.fillStyle = 'rgba(231,233,238,0.86)';
    ctx.font = '700 11px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < lanes; i++) {
      if (i % labelStep !== 0) continue;
      ctx.fillText(this.lanes[i].label, fieldX + i * laneW + laneW / 2, stripY + labelH / 2 + 0.5);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  /** A uniform rounded box. Off-beats (e/&/a) get an inner marker — a darker
   *  shade of the note colour, filling the box edge-to-edge. The down-beat (1)
   *  is left as a plain box. */
  private drawNote(
    cx: number, cy: number, w: number, h: number, sub: number,
    colour: string, accent: boolean, ghost: boolean, alpha: number,
  ): void {
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    const hw = w / 2;
    const hh = h / 2;

    // outer box (same size for every note) — filled notes glow in their colour
    this.roundRect(cx - hw, cy - hh, w, h, Math.min(3, hh));
    if (ghost) {
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.shadowColor = colour;
      ctx.shadowBlur = Math.min(14, h * 0.8);
      ctx.fillStyle = colour;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    if (accent) {
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.lineWidth = 1;

    if (sub === 0) {
      ctx.globalAlpha = 1; // down-beat: plain box, no marker
      return;
    }

    // marker fills the box edge-to-edge: corners → centre (triangles) / full ◆
    ctx.fillStyle = ghost ? colour : darken(colour, 0.5);
    ctx.beginPath();
    switch (sub) {
      case 1: // e — ▲ base at bottom, apex at centre
        ctx.moveTo(cx - hw, cy + hh);
        ctx.lineTo(cx + hw, cy + hh);
        ctx.lineTo(cx, cy);
        ctx.closePath();
        break;
      case 2: // & — ◆ full
        ctx.moveTo(cx, cy - hh);
        ctx.lineTo(cx + hw, cy);
        ctx.lineTo(cx, cy + hh);
        ctx.lineTo(cx - hw, cy);
        ctx.closePath();
        break;
      case 3: // a — ▼ base at top, apex at centre
        ctx.moveTo(cx - hw, cy - hh);
        ctx.lineTo(cx + hw, cy - hh);
        ctx.lineTo(cx, cy);
        ctx.closePath();
        break;
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Counts ruler, centred in the left gutter. Beat numbers always show; the
   *  e / & / a subdivisions only appear when 16ths are far enough apart to read
   *  (otherwise they collide into an unreadable stack). */
  private drawRuler(
    now: number, windowTicks: number, topY: number, hitY: number,
    gutterW: number, sixteenthPx: number,
  ): void {
    const ctx = this.ctx;
    const showSub = sixteenthPx >= 13; // below this, e/&/a would overlap
    const cx = gutterW / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const start = Math.ceil(now / 240) * 240; // first 16th at/after now
    for (let t = start; t - now <= windowTicks; t += 240) {
      const m = ((t % 960) + 960) % 960;
      if (m !== 0 && !showSub) continue; // tight spacing → beat numbers only
      const y = hitY - ((t - now) / windowTicks) * (hitY - topY);
      let text: string;
      let strong = false;
      if (m === 0) {
        const bi = firstNumAtOrAfter(this.grid.bars, t + 1) - 1;
        const barStart = bi >= 0 ? this.grid.bars[bi] : 0;
        text = String(Math.round((t - barStart) / 960) + 1);
        strong = true;
      } else if (m === 240) text = 'e';
      else if (m === 480) text = '&';
      else text = 'a';
      ctx.fillStyle = strong ? 'rgba(231,233,238,0.85)' : 'rgba(231,233,238,0.42)';
      ctx.font = strong
        ? '800 11px -apple-system, Segoe UI, Roboto, sans-serif'
        : '600 9px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillText(text, cx, y);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}
