/* ----------------------------------------------------------------------------
   Minimal OpenRouter client (called client-side; key lives in localStorage).
   Endpoint + auth verified against openrouter.ai/docs.
---------------------------------------------------------------------------- */

const BASE = 'https://openrouter.ai/api/v1';

export interface ModelInfo {
  id: string;
  name: string;
}

function headers(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    // Optional attribution headers (safe to send from the browser).
    'HTTP-Referer': location.origin,
    'X-Title': 'DrumScore',
  };
}

export async function listModels(key?: string): Promise<ModelInfo[]> {
  try {
    const res = await fetch(`${BASE}/models`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.data ?? [])
      .map((m: any) => ({ id: String(m.id), name: String(m.name ?? m.id) }))
      .filter((m: ModelInfo) => m.id);
  } catch {
    return [];
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function chatCompletion(
  key: string,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: headers(key),
    body: JSON.stringify({ model, messages, temperature: 0.3 }),
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 300) || res.statusText}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('OpenRouter returned no content.');
  return content;
}

/** Pull a JSON value out of a model response (tolerates code fences / prose). */
export function extractJson(content: string): any {
  let s = content.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(s);
  if (fence) s = fence[1].trim();
  // Prefer a straight parse — handles clean objects AND top-level arrays, which
  // the old first-"{"/last-"}" slice would have mangled or dropped.
  try {
    return JSON.parse(s);
  } catch {
    /* fall through to a best-effort extraction from surrounding prose */
  }
  // Slice out the outermost embedded object or array, preferring whichever
  // bracket type appears first in the text.
  const candidates: Array<[number, number]> = [];
  const objStart = s.indexOf('{');
  const objEnd = s.lastIndexOf('}');
  if (objStart >= 0 && objEnd > objStart) candidates.push([objStart, objEnd]);
  const arrStart = s.indexOf('[');
  const arrEnd = s.lastIndexOf(']');
  if (arrStart >= 0 && arrEnd > arrStart) candidates.push([arrStart, arrEnd]);
  candidates.sort((a, b) => a[0] - b[0]);
  for (const [a, b] of candidates) {
    try {
      return JSON.parse(s.slice(a, b + 1));
    } catch {
      /* try the next candidate */
    }
  }
  return JSON.parse(s); // no candidate worked → throw for the caller to handle
}
