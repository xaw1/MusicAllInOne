import { describe, it, expect } from 'vitest';
import { extractJson } from './openrouter';

describe('extractJson', () => {
  it('parses a clean JSON object', () => {
    expect(extractJson('{"a":1,"b":[2,3]}')).toEqual({ a: 1, b: [2, 3] });
  });

  it('unwraps a ```json fenced block', () => {
    const s = '```json\n{"patterns":[{"id":1,"hands":["R","L"]}]}\n```';
    expect(extractJson(s)).toEqual({ patterns: [{ id: 1, hands: ['R', 'L'] }] });
  });

  it('unwraps a bare ``` fenced block', () => {
    expect(extractJson('```\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  it('extracts an object embedded in prose', () => {
    expect(extractJson('Sure! {"x":42} hope that helps')).toEqual({ x: 42 });
  });

  it('parses a top-level JSON array (previously mangled by the brace slice)', () => {
    expect(extractJson('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('extracts an array embedded in prose', () => {
    expect(extractJson('Result: [{"id":1}] done')).toEqual([{ id: 1 }]);
  });

  it('prefers whichever bracket type appears first', () => {
    expect(extractJson('noise {"a":1} more [9]')).toEqual({ a: 1 });
  });

  it('throws when there is no JSON to extract', () => {
    expect(() => extractJson('totally not json')).toThrow();
  });
});
