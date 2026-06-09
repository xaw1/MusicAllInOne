/* ----------------------------------------------------------------------------
   Sheet overlay — R/L sticking letters positioned UNDER the rendered notation
   using alphaTab's boundsLookup. A scroll-synced absolutely-positioned DOM layer
   over the score viewport; it never reaches inside alphaTab's own container.

   Bounds are invalidated on every re-render, so we recompute on `renderFinished`
   (and whenever the sticking changes). Positions are content-space coordinates
   from boundsLookup; the layer is translated by the viewport scroll so the
   letters track the music as it scrolls.
---------------------------------------------------------------------------- */

import type { ScoreEngine } from '../core/score-engine';
import { midiToPiece, noteDrumMidi } from '../core/drums';
import { getSticking, subscribeSticking } from '../ai/sticking';
import { getViz, subscribeViz } from '../core/viz';

export class SheetOverlay {
  private readonly layer: HTMLDivElement;
  private raf = 0;

  constructor(
    private readonly engine: ScoreEngine,
    private readonly viewport: HTMLElement,
    private readonly atMain: HTMLElement,
  ) {
    this.layer = document.createElement('div');
    this.layer.className = 'sheet-overlay';
    viewport.appendChild(this.layer);

    viewport.addEventListener('scroll', () => this.syncScroll(), { passive: true });
    engine.api.renderFinished.on(() => this.schedule());
    subscribeSticking(() => this.schedule());
    subscribeViz(() => this.schedule());
  }

  private syncScroll(): void {
    this.layer.style.transform = `translate(${-this.viewport.scrollLeft}px, ${-this.viewport.scrollTop}px)`;
  }

  private schedule(): void {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.draw());
  }

  private draw(): void {
    this.layer.replaceChildren();
    const api = this.engine.api;
    const score: any = api.score;
    const lookup = api.boundsLookup;
    const sticking = getSticking();
    if (!getViz().sheetSticking || !score || !lookup || !sticking || sticking.hands.size === 0) return;

    // content-space origin of the rendered notation within the viewport
    const mainRect = this.atMain.getBoundingClientRect();
    const vpRect = this.viewport.getBoundingClientRect();
    const baseX = mainRect.left - vpRect.left + this.viewport.scrollLeft;
    const baseY = mainRect.top - vpRect.top + this.viewport.scrollTop;
    const frag = document.createDocumentFragment();

    for (const track of score.tracks ?? []) {
      for (const staff of track.staves ?? []) {
        for (const bar of staff.bars ?? []) {
          for (const voice of bar.voices ?? []) {
            for (const beat of voice.beats ?? []) {
              const tick = beat.absolutePlaybackStart;
              let r = false;
              let l = false;
              for (const note of beat.notes ?? []) {
                if (!note?.isPercussion) continue;
                const piece = midiToPiece(noteDrumMidi(note, track));
                if (!piece) continue;
                const h = sticking.hands.get(`${tick}:${piece}`);
                if (h === 'R') r = true;
                else if (h === 'L') l = true;
              }
              if (!r && !l) continue;
              const bounds = lookup.findBeat(beat);
              if (!bounds) continue;
              const vb = bounds.visualBounds;
              const tag = document.createElement('span');
              if (r && l) {
                tag.className = 'sheet-stick';
                tag.innerHTML = '<i class="ss-r">R</i><i class="ss-l">L</i>';
              } else {
                tag.className = `sheet-stick ${r ? 'ss-r' : 'ss-l'}`;
                tag.textContent = r ? 'R' : 'L';
              }
              tag.style.left = `${baseX + vb.x + vb.w / 2}px`;
              tag.style.top = `${baseY + vb.y + vb.h + 1}px`;
              frag.appendChild(tag);
            }
          }
        }
      }
    }
    this.layer.appendChild(frag);
    this.syncScroll();
  }
}
