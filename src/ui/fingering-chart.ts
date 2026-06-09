import { SAX_KEYS, FINGERINGS_VERIFIED } from '../core/instrument/sax-fingerings';

const SVGNS = 'http://www.w3.org/2000/svg';

type KeyPos = { x: number; y: number; r?: number; rx?: number; ry?: number; lab?: string };

/* Layout on a stylised upright saxophone (viewBox 200x340):
   - mouthpiece + neck at the top, body flaring into a bell at the bottom
   - two "pearl" key stacks down the centre — left hand (upper), right hand (lower)
   - octave key by the neck; palm keys on the left; side keys on the right
   - bis / F# accidental keys offset beside their stacks; pinky clusters near the bell. */
const POS: Record<string, KeyPos> = {
  oct: { x: 78, y: 66, r: 7, lab: '8' },
  // left palm keys (small flat keys)
  palmD: { x: 60, y: 90, rx: 5, ry: 7 },
  palmEb: { x: 60, y: 108, rx: 5, ry: 7 },
  palmF: { x: 60, y: 126, rx: 5, ry: 7 },
  // left-hand pearl stack
  lh1: { x: 100, y: 82, r: 13 },
  bis: { x: 120, y: 97, r: 5 },
  lh2: { x: 100, y: 112, r: 13 },
  lh3: { x: 100, y: 142, r: 13 },
  gsharp: { x: 78, y: 154, r: 5 },
  // right-hand side keys (small flat keys)
  sideBb: { x: 140, y: 94, rx: 5, ry: 7 },
  sideC: { x: 140, y: 112, rx: 5, ry: 7 },
  sideE: { x: 140, y: 130, rx: 5, ry: 7 },
  // right-hand pearl stack
  rh1: { x: 100, y: 178, r: 13 },
  fsharp: { x: 120, y: 193, r: 5 },
  rh2: { x: 100, y: 208, r: 13 },
  rh3: { x: 100, y: 238, r: 13 },
  // pinky clusters near the bell
  lowCsharp: { x: 76, y: 260, r: 5 },
  lowB: { x: 66, y: 271, r: 5 },
  lowBb: { x: 76, y: 282, r: 5 },
  lowC: { x: 124, y: 262, r: 5 },
  lowEb: { x: 124, y: 278, r: 5 },
};

function el(name: string, attrs: Record<string, string>): SVGElement {
  const e = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

export class FingeringChart {
  readonly el: HTMLElement;
  private shapes = new Map<string, SVGElement>();
  private noteEl: HTMLElement;
  private caption: HTMLElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'fingering-chart';

    this.noteEl = document.createElement('div');
    this.noteEl.className = 'fingering-note';
    this.noteEl.textContent = '—';
    this.el.appendChild(this.noteEl);

    const svg = el('svg', { viewBox: '0 0 200 340', class: 'fingering-svg', preserveAspectRatio: 'xMidYMid meet' });

    const defs = el('defs', {});
    const grad = el('linearGradient', { id: 'fc-bodygrad', x1: '0', y1: '0', x2: '0', y2: '1' });
    grad.appendChild(el('stop', { offset: '0%', 'stop-color': '#3a3350' }));
    grad.appendChild(el('stop', { offset: '55%', 'stop-color': '#231d33' }));
    grad.appendChild(el('stop', { offset: '100%', 'stop-color': '#15111d' }));
    defs.appendChild(grad);
    svg.appendChild(defs);

    // mouthpiece + neck
    svg.appendChild(el('ellipse', { cx: '100', cy: '13', rx: '11', ry: '6.5', class: 'fc-mouth' }));
    svg.appendChild(el('path', { class: 'fc-neck', d: 'M90 50 C88 34 92 20 97 18 L103 18 C108 20 112 34 110 50 Z' }));

    // body flaring into a bell
    svg.appendChild(
      el('path', {
        class: 'fc-body',
        d:
          'M76 56 C74 48 82 46 100 46 C118 46 126 48 124 56 L124 248 ' +
          'C124 270 136 292 150 308 C156 316 150 322 142 322 L58 322 ' +
          'C50 322 44 316 50 308 C64 292 76 270 76 248 Z',
      }),
    );
    // bell opening
    svg.appendChild(el('ellipse', { cx: '100', cy: '318', rx: '42', ry: '8', class: 'fc-bell' }));
    // subtle body sheen
    svg.appendChild(el('path', { class: 'fc-sheen', d: 'M84 58 C82 52 86 50 90 50 L90 244 C84 240 84 220 84 200 Z' }));

    for (const key of SAX_KEYS) {
      const p = POS[key.id];
      if (!p) continue;
      const shape =
        p.r !== undefined
          ? el('circle', { cx: String(p.x), cy: String(p.y), r: String(p.r), class: 'fc-key', 'data-key': key.id })
          : el('ellipse', { cx: String(p.x), cy: String(p.y), rx: String(p.rx), ry: String(p.ry), class: 'fc-key', 'data-key': key.id });
      const title = document.createElementNS(SVGNS, 'title');
      title.textContent = key.label;
      shape.appendChild(title);
      svg.appendChild(shape);
      this.shapes.set(key.id, shape);
      if (p.lab) {
        const t = el('text', { x: String(p.x), y: String(p.y), class: 'fc-keylabel' });
        t.textContent = p.lab;
        svg.appendChild(t);
      }
    }
    this.el.appendChild(svg);

    this.caption = document.createElement('div');
    this.caption.className = 'fingering-caption';
    this.el.appendChild(this.caption);
  }

  /** Light the current note's keys; ghost-light the next note's keys. */
  setActive(current: string[] | null, upcoming: string[] | null, noteLabel: string): void {
    const cur = new Set(current ?? []);
    const up = new Set(upcoming ?? []);
    for (const [id, shape] of this.shapes) {
      shape.classList.toggle('is-down', cur.has(id));
      shape.classList.toggle('is-next', !cur.has(id) && up.has(id));
    }
    this.noteEl.textContent = noteLabel || '—';
    if (!current) {
      this.caption.textContent = noteLabel ? 'not charted yet' : 'play a note to see fingering';
    } else {
      this.caption.textContent = FINGERINGS_VERIFIED ? 'fingering' : 'sample · unverified';
    }
  }
}
