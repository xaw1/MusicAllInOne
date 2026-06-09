/* ----------------------------------------------------------------------------
   The "coach": runs an AI sticking + tips analysis on the loaded drum part and
   publishes the result to the sticking store.
---------------------------------------------------------------------------- */

import type { ScoreEngine } from '../core/score-engine';
import { buildDrumTimeline, buildGrid } from '../core/timeline';
import {
  computeAutoSticking,
  computePreciseSticking,
  getStickingMode,
} from '../core/sticking-algo';
import { serializeUniqueBars } from './serialize';
import { chatCompletion, extractJson } from './openrouter';
import { getApiKey, getModel } from './key-store';
import { setSticking, type Hand, type SectionTip } from './sticking';
import { aiLog } from './log';

export const DEFAULT_MODEL = '~anthropic/claude-sonnet-latest';

const SYSTEM_PROMPT =
  'You are an expert drum teacher and clinician. You receive a drum part as a set ' +
  'of unique one-bar PATTERNS (repeated bars are de-duplicated) plus a Form map ' +
  'showing which pattern each bar uses. For EACH pattern, assign a sticking hand ' +
  '("R" or "L") to every hit IN ORDER, optimising for natural hand-to-hand flow, ' +
  'hand economy, minimal awkward crossovers, keeping the lead hand on hi-hat/ride ' +
  'where idiomatic, and playability at tempo. Also give short, practical ' +
  'per-section practice tips (reference bar ranges using the Form map) and one ' +
  'overall note. Respond with ONLY valid JSON (no prose, no code fences) in exactly ' +
  'this shape: {"patterns":[{"id":1,"hands":["R","L"]}],' +
  '"sections":[{"fromBar":1,"toBar":4,"tip":"..."}],"overall":"..."}. ' +
  "Provide hands for every pattern id; each pattern's hands array length must equal " +
  'that pattern\'s hit count.';

export async function runStickingAnalysis(engine: ScoreEngine): Promise<void> {
  const key = getApiKey();
  if (!key) throw new Error('Add your OpenRouter API key in Settings → AI first.');

  const score = engine.api.score;
  if (!score) throw new Error('Load a song first.');

  const timeline = buildDrumTimeline(score);
  const grid = buildGrid(score);
  const { text, patterns, uniqueCount, barCount, totalHandHits } = serializeUniqueBars(
    timeline,
    grid,
  );
  if (uniqueCount === 0) throw new Error('No drum hand-notes found to analyse.');

  const model = getModel() || DEFAULT_MODEL;
  const title = score.title || 'Untitled';
  const tempo = (score as any).tempo ? `~${(score as any).tempo} BPM` : '';
  const user =
    `Song: ${title}${tempo ? ` (${tempo})` : ''}. ${barCount} bars, ` +
    `${uniqueCount} unique hand-patterns, ${totalHandHits} hand hits total.\n\n${text}`;

  aiLog(
    'info',
    `Request → ${model} (${uniqueCount} unique patterns / ${barCount} bars)`,
    `SYSTEM:\n${SYSTEM_PROMPT}\n\nUSER:\n${user}`,
  );

  let content: string;
  try {
    content = await chatCompletion(key, model, [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: user },
    ]);
  } catch (err: any) {
    aiLog('error', 'OpenRouter request failed', err?.message ?? String(err));
    throw err;
  }

  aiLog('info', 'Raw response', content);

  let parsed: any;
  try {
    parsed = extractJson(content);
  } catch {
    aiLog('error', 'Could not parse JSON from the response', content);
    throw new Error('The model did not return valid JSON. See Settings → AI → View log.');
  }

  // Seed with the instant algorithmic sticking so the AI pass REFINES rather
  // than replaces it — any hit the model omits keeps its offline R/L instead of
  // going blank.
  const hands =
    getStickingMode() === 'simple'
      ? computeAutoSticking(timeline)
      : computePreciseSticking(timeline);
  // Map each returned pattern's R/L array back onto EVERY bar that uses it.
  const byId = new Map(patterns.map((p) => [p.id, p]));
  for (const pr of parsed?.patterns ?? []) {
    const pat = byId.get(Number(pr?.id));
    const arr: any[] = Array.isArray(pr?.hands) ? pr.hands : [];
    if (!pat) continue;
    for (const occ of pat.occurrences) {
      for (let k = 0; k < occ.length; k++) {
        const v = arr[k];
        const hand: Hand | null = v === 'L' ? 'L' : v === 'R' ? 'R' : null;
        if (hand) hands.set(`${occ[k].tick}:${occ[k].piece}`, hand);
      }
    }
  }

  const sections: SectionTip[] = Array.isArray(parsed?.sections)
    ? parsed.sections
        .map((x: any) => ({
          fromBar: Number(x?.fromBar) || 0,
          toBar: Number(x?.toBar) || 0,
          tip: String(x?.tip ?? ''),
        }))
        .filter((s: SectionTip) => s.fromBar >= 1 && s.toBar >= 1 && s.tip)
    : [];

  // If the user loaded a different song while this request was in flight, drop
  // the result rather than stamp the wrong song's sticking onto the new one.
  if (engine.api.score !== score) {
    aiLog('info', 'Discarded a stale analysis (the song changed mid-request).');
    return;
  }

  setSticking({
    hands,
    sections,
    overall: String(parsed?.overall ?? ''),
    songTitle: title,
  });

  aiLog(
    'info',
    `Parsed OK: ${hands.size} stickings mapped from ${uniqueCount} patterns, ${sections.length} section tips`,
  );
}
