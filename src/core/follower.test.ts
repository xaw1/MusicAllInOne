import { describe, it, expect, beforeEach } from 'vitest';
import {
  gradeNote,
  gradePerformance,
  Follower,
  DEFAULT_FOLLOW_CONFIG,
} from './follower';
import type { NoteTarget, Sample, FollowConfig } from './follower';

const CFG: FollowConfig = DEFAULT_FOLLOW_CONFIG; // centsGood=25, onsetWindowMs=150, halfWin=75

// Helpers
function target(id: number, midi: number, onsetMs: number): NoteTarget {
  return { id, midi, onsetMs };
}

function sample(midi: number | null, cents: number, timeMs: number): Sample {
  return { midi, cents, timeMs };
}

// ── gradeNote unit tests ──────────────────────────────────────────────────────

describe('gradeNote — perfect performance', () => {
  it('returns good when one matching sample at onset with 0 cents', () => {
    const t = target(1, 60, 1000);
    const s = [sample(60, 0, 1000)];
    const r = gradeNote(t, s, CFG);
    expect(r.verdict).toBe('good');
    expect(r.cents).toBe(0);
    expect(r.onsetDeltaMs).toBe(0);
  });
});

describe('gradeNote — 4-note perfect line', () => {
  const targets: NoteTarget[] = [
    target(1, 60, 0),
    target(2, 62, 500),
    target(3, 64, 1000),
    target(4, 65, 1500),
  ];
  const samples: Sample[] = targets.map((t) => sample(t.midi, 0, t.onsetMs));

  it('all notes grade good', () => {
    for (const t of targets) {
      const r = gradeNote(t, [sample(t.midi, 0, t.onsetMs)], CFG);
      expect(r.verdict).toBe('good');
      expect(r.cents).toBe(0);
      expect(r.onsetDeltaMs).toBe(0);
    }
  });

  it('gradePerformance all good', () => {
    const results = gradePerformance(targets, samples);
    expect(results.every((r) => r.verdict === 'good')).toBe(true);
  });
});

describe('gradeNote — sharp', () => {
  it('+40 cents -> sharp', () => {
    const t = target(1, 60, 1000);
    const s = [sample(60, 40, 1000)];
    const r = gradeNote(t, s, CFG);
    expect(r.verdict).toBe('sharp');
    expect(r.cents).toBe(40);
  });
});

describe('gradeNote — flat', () => {
  it('-40 cents -> flat', () => {
    const t = target(1, 60, 1000);
    const s = [sample(60, -40, 1000)];
    const r = gradeNote(t, s, CFG);
    expect(r.verdict).toBe('flat');
    expect(r.cents).toBe(-40);
  });
});

describe('gradeNote — late', () => {
  it('earliest matching sample at onset+120ms -> late (halfWin=75)', () => {
    const t = target(1, 60, 1000);
    // onset+120 is > halfWin(75), so late
    const s = [sample(60, 0, 1120)];
    const r = gradeNote(t, s, CFG);
    expect(r.verdict).toBe('late');
    expect(r.onsetDeltaMs).toBe(120);
  });
});

describe('gradeNote — early', () => {
  it('earliest matching sample at onset-120ms -> early', () => {
    const t = target(1, 60, 1000);
    const s = [sample(60, 0, 880)];
    const r = gradeNote(t, s, CFG);
    expect(r.verdict).toBe('early');
    expect(r.onsetDeltaMs).toBe(-120);
  });
});

describe('gradeNote — wrong note', () => {
  it('voiced sample one semitone off -> wrong', () => {
    const t = target(1, 60, 1000);
    const s = [sample(61, 0, 1000)]; // midi 61, not 60
    const r = gradeNote(t, s, CFG);
    expect(r.verdict).toBe('wrong');
    expect(r.cents).toBeNull();
    expect(r.onsetDeltaMs).toBeNull();
  });
});

describe('gradeNote — missed', () => {
  it('no samples in window -> missed', () => {
    const t = target(1, 60, 1000);
    const r = gradeNote(t, [], CFG);
    expect(r.verdict).toBe('missed');
    expect(r.cents).toBeNull();
    expect(r.onsetDeltaMs).toBeNull();
  });

  it('null midi (unvoiced) only -> missed not wrong', () => {
    const t = target(1, 60, 1000);
    const s = [sample(null, 0, 1000)];
    const r = gradeNote(t, s, CFG);
    expect(r.verdict).toBe('missed');
  });
});

describe('gradeNote — vibrato (median cents)', () => {
  it('cents oscillating -30,+30,-30,+30 -> median 0 -> good', () => {
    const t = target(1, 60, 1000);
    const s = [
      sample(60, -30, 980),
      sample(60, 30, 990),
      sample(60, -30, 1000),
      sample(60, 30, 1010),
    ];
    const r = gradeNote(t, s, CFG);
    expect(r.verdict).toBe('good');
    expect(r.cents).toBe(0); // median of [-30,-30,30,30] = 0
  });
});

describe('gradeNote — good wins ties', () => {
  it('exactly at centsGood boundary with zero onset delta -> good', () => {
    const t = target(1, 60, 1000);
    const s = [sample(60, 25, 1000)]; // exactly centsGood=25, onsetDelta=0
    const r = gradeNote(t, s, CFG);
    expect(r.verdict).toBe('good');
  });
});

// ── Follower stateful tests ───────────────────────────────────────────────────

describe('Follower stateful', () => {
  const targets: NoteTarget[] = [
    target(1, 60, 0),
    target(2, 62, 500),
    target(3, 64, 1000),
    target(4, 65, 1500),
  ];

  // Synthetic stream: correct notes at onset times, 0 cents, plus one wrong note
  // for target 3 (midi 64 -> send midi 65 instead)
  const allSamples: Sample[] = [
    sample(60, 0, 0),     // note 1 correct
    sample(62, 0, 500),   // note 2 correct
    sample(65, 0, 1000),  // note 3 wrong (expected 64)
    sample(65, 0, 1500),  // note 4 correct
  ];

  let follower: Follower;

  beforeEach(() => {
    follower = new Follower();
    follower.setTargets(targets);
  });

  it('results() after advance matches gradePerformance()', () => {
    for (const s of allSamples) follower.feed(s);
    follower.advance(2000); // past all windows (last window ends at 1500+150=1650)

    const expected = gradePerformance(targets, allSamples);
    const actual = follower.results();

    expect(actual.length).toBe(expected.length);
    for (let i = 0; i < expected.length; i++) {
      expect(actual[i].id).toBe(expected[i].id);
      expect(actual[i].verdict).toBe(expected[i].verdict);
    }
  });

  it('summary() counts are correct', () => {
    for (const s of allSamples) follower.feed(s);
    follower.advance(2000);

    const sum = follower.summary();
    // note1=good, note2=good, note3=wrong, note4=good
    expect(sum.good).toBe(3);
    expect(sum.close).toBe(0);
    expect(sum.bad).toBe(1);
    expect(sum.total).toBe(4);
  });

  it('pending results are not counted in summary', () => {
    // advance only past note 1's window
    follower.feed(sample(60, 0, 0));
    follower.advance(200); // > 0+150

    const sum = follower.summary();
    expect(sum.total).toBe(1);
    expect(sum.good).toBe(1);
  });

  it('reset() clears buffer and sets all verdicts to pending', () => {
    for (const s of allSamples) follower.feed(s);
    follower.advance(2000);
    follower.reset();

    const sum = follower.summary();
    expect(sum.total).toBe(0);

    const r1 = follower.result(1);
    expect(r1?.verdict).toBe('pending');
  });

  it('result(id) returns undefined for unknown id', () => {
    expect(follower.result(999)).toBeUndefined();
  });

  it('incremental advance commits verdicts one by one', () => {
    for (const s of allSamples) follower.feed(s);

    follower.advance(160); // past note 1 window only
    expect(follower.result(1)?.verdict).toBe('good');
    expect(follower.result(2)?.verdict).toBe('pending');

    follower.advance(660); // past note 2 window
    expect(follower.result(2)?.verdict).toBe('good');
    expect(follower.result(3)?.verdict).toBe('pending');
  });

  it('constructor merges cfg over DEFAULT_FOLLOW_CONFIG', () => {
    const f = new Follower({ centsGood: 10 });
    f.setTargets([target(1, 60, 0)]);
    f.feed(sample(60, 15, 0)); // 15 cents > custom centsGood=10 -> sharp
    f.advance(200);
    expect(f.result(1)?.verdict).toBe('sharp');
  });
});
