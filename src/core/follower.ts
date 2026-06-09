// Pure monophonic score-grading core — NO DOM, NO audio, NO imports outside this file.

export interface NoteTarget {
  id: number;
  midi: number;
  onsetMs: number;
}

export interface Sample {
  midi: number | null;
  cents: number;
  timeMs: number;
}

export type Verdict = 'pending' | 'good' | 'sharp' | 'flat' | 'late' | 'early' | 'wrong' | 'missed';

export interface NoteResult {
  id: number;
  verdict: Verdict;
  cents: number | null;
  onsetDeltaMs: number | null;
}

export interface FollowConfig {
  centsGood: number;
  centsClose: number;
  onsetWindowMs: number;
}

export const DEFAULT_FOLLOW_CONFIG: FollowConfig = {
  centsGood: 25,
  centsClose: 50,
  onsetWindowMs: 150,
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function gradeNote(
  target: NoteTarget,
  windowSamples: Sample[],
  cfg: FollowConfig,
): NoteResult {
  const matching = windowSamples.filter(
    (s) => s.midi !== null && s.midi === target.midi,
  );

  if (matching.length === 0) {
    const anyVoiced = windowSamples.some((s) => s.midi !== null);
    return {
      id: target.id,
      verdict: anyVoiced ? 'wrong' : 'missed',
      cents: null,
      onsetDeltaMs: null,
    };
  }

  const cents = median(matching.map((s) => s.cents));
  const earliest = matching.reduce((a, b) => (a.timeMs <= b.timeMs ? a : b));
  const onsetDeltaMs = earliest.timeMs - target.onsetMs;

  const halfWin = cfg.onsetWindowMs * 0.5;

  let verdict: Verdict;
  if (Math.abs(cents) <= cfg.centsGood && Math.abs(onsetDeltaMs) <= halfWin) {
    verdict = 'good';
  } else if (onsetDeltaMs > halfWin) {
    verdict = 'late';
  } else if (onsetDeltaMs < -halfWin) {
    verdict = 'early';
  } else if (cents > cfg.centsGood) {
    verdict = 'sharp';
  } else if (cents < -cfg.centsGood) {
    verdict = 'flat';
  } else {
    verdict = 'good';
  }

  return { id: target.id, verdict, cents, onsetDeltaMs };
}

export function gradePerformance(
  targets: NoteTarget[],
  samples: Sample[],
  cfg: FollowConfig = DEFAULT_FOLLOW_CONFIG,
): NoteResult[] {
  return targets.map((target) => {
    const lo = target.onsetMs - cfg.onsetWindowMs;
    const hi = target.onsetMs + cfg.onsetWindowMs;
    const windowSamples = samples.filter((s) => s.timeMs >= lo && s.timeMs <= hi);
    return gradeNote(target, windowSamples, cfg);
  });
}

export class Follower {
  private cfg: FollowConfig;
  private targets: NoteTarget[] = [];
  private resultMap: Map<number, NoteResult> = new Map();
  private buffer: Sample[] = [];

  constructor(cfg?: Partial<FollowConfig>) {
    this.cfg = { ...DEFAULT_FOLLOW_CONFIG, ...cfg };
  }

  /** Update grading tolerances (e.g. an Easy/Average/Strict preset change). */
  setConfig(cfg: Partial<FollowConfig>): void {
    this.cfg = { ...this.cfg, ...cfg };
  }

  setTargets(targets: NoteTarget[]): void {
    this.targets = [...targets].sort((a, b) => a.onsetMs - b.onsetMs);
    this.resultMap = new Map(
      this.targets.map((t) => [
        t.id,
        { id: t.id, verdict: 'pending' as Verdict, cents: null, onsetDeltaMs: null },
      ]),
    );
    this.buffer = [];
  }

  reset(): void {
    this.buffer = [];
    for (const t of this.targets) {
      this.resultMap.set(t.id, {
        id: t.id,
        verdict: 'pending',
        cents: null,
        onsetDeltaMs: null,
      });
    }
  }

  feed(sample: Sample): void {
    this.buffer.push(sample);
    // Prune samples that can no longer be in any pending target's window.
    // Keep anything >= (earliest pending target's onset - onsetWindowMs).
    let minCutoff = -Infinity;
    for (const t of this.targets) {
      const res = this.resultMap.get(t.id);
      if (res && res.verdict === 'pending') {
        minCutoff = t.onsetMs - this.cfg.onsetWindowMs;
        break; // targets are sorted by onsetMs; first pending gives the minimum
      }
    }
    if (isFinite(minCutoff)) {
      this.buffer = this.buffer.filter((s) => s.timeMs >= minCutoff);
    }
  }

  advance(playbackMs: number): void {
    for (const t of this.targets) {
      const res = this.resultMap.get(t.id);
      if (!res || res.verdict !== 'pending') continue;
      // Window has fully passed when playbackMs > onsetMs + onsetWindowMs
      if (playbackMs > t.onsetMs + this.cfg.onsetWindowMs) {
        const lo = t.onsetMs - this.cfg.onsetWindowMs;
        const hi = t.onsetMs + this.cfg.onsetWindowMs;
        const windowSamples = this.buffer.filter(
          (s) => s.timeMs >= lo && s.timeMs <= hi,
        );
        this.resultMap.set(t.id, gradeNote(t, windowSamples, this.cfg));
      }
    }
  }

  result(id: number): NoteResult | undefined {
    return this.resultMap.get(id);
  }

  results(): NoteResult[] {
    return this.targets.map((t) => this.resultMap.get(t.id)!);
  }

  summary(): { good: number; close: number; bad: number; total: number } {
    let good = 0;
    let close = 0;
    let bad = 0;
    for (const [, r] of this.resultMap) {
      if (r.verdict === 'pending') continue;
      if (r.verdict === 'good') good++;
      else if (
        r.verdict === 'sharp' ||
        r.verdict === 'flat' ||
        r.verdict === 'late' ||
        r.verdict === 'early'
      )
        close++;
      else bad++; // wrong | missed
    }
    return { good, close, bad, total: good + close + bad };
  }
}
