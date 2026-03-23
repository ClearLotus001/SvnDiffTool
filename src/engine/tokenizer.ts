// ─────────────────────────────────────────────────────────────────────────────
// src/engine/tokenizer.ts  —  Syntax tokenizer  [v3 fixed]
//
// AUDIT FIXES (round 3):
//  1. Uint8Array occupation bitmap assumes text.length === byte count, but
//     Unicode chars (e.g. Chinese, emoji) have length > 1 code unit while
//     Uint8Array index is by code-unit.  This is actually correct because
//     RegExp .index and .length are in code units — no change needed, but
//     added clarifying comment.
//  2. Regex for numbers had `(?=\b|[^a-zA-Z])` lookahead which doesn't work
//     after digits — `\b` already handles this; lookahead removed.
//  3. `return` and `const` appeared TWICE in the keyword regex (duplicates
//     waste alternation matching time).  Deduplicated.
//  4. getCached: when cache miss (v undefined), we returned undefined correctly,
//     but the LRU "move to end" path called delete+set even on cache miss if
//     v happened to be falsy (empty array would be [] = truthy — safe).
//     Added explicit `v !== undefined` guard to be safe.
//  5. setCache eviction: `tokenCache.keys().next().value` can be `undefined`
//     when map is somehow empty — added null check (was already there, just
//     made explicit).
//  6. Lines > 5000 chars skip tokenization entirely and return plain — prevents
//     Uint8Array allocation + regex work on minified one-liners.
// ─────────────────────────────────────────────────────────────────────────────

import type { Token, TokenType } from '../types';

const TOKENIZE_LINE_LIMIT = 5000; // skip tokenizing lines longer than this

interface SynRule { re: RegExp; type: TokenType; }

// Compiled once at module load — lastIndex reset per tokenize() call
const RULES: SynRule[] = [
  { re: /\/\/[^\n]*/g,                                                    type: 'comment' },
  { re: /\/\*[\s\S]*?\*\//g,                                              type: 'comment' },
  { re: /#[^\n]*/g,                                                        type: 'comment' },
  { re: /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g,                               type: 'string'  },
  // FIX: removed duplicate `return` and `const` entries
  {
    re: /\b(?:function|const|let|var|return|if|else|for|while|do|class|import|export|from|default|async|await|try|catch|finally|throw|new|this|typeof|instanceof|null|undefined|true|false|public|private|protected|static|extends|implements|interface|type|enum|switch|case|break|continue|of|in|yield|super|readonly|abstract|override|namespace|module|declare|require|def|print|pass|lambda|with|global|nonlocal|and|or|not|is|elif|package|func|struct|make|chan|go|defer|select|range|fallthrough|goto|void|int|float|double|bool|byte|char|long|short|unsigned|signed|auto|register|extern|typedef|sizeof|inline|volatile)\b/g,
    type: 'keyword',
  },
  // FIX: removed `(?=\b|[^a-zA-Z])` lookahead — \b at end handles word boundary
  { re: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g,                           type: 'number'  },
  { re: /[()[\]{};,]/g,                                                    type: 'punctuation' },
];

// ── LRU cache (4096 entries) ──────────────────────────────────────────────────

const CACHE_SIZE = 4096;
const tokenCache = new Map<string, Token[]>();

function getCached(text: string): Token[] | undefined {
  const v = tokenCache.get(text);
  // FIX: explicit `!== undefined` guard
  if (v !== undefined) {
    tokenCache.delete(text);
    tokenCache.set(text, v); // move to end (LRU)
  }
  return v;
}

function setCache(text: string, tokens: Token[]): void {
  if (tokenCache.size >= CACHE_SIZE) {
    const firstKey = tokenCache.keys().next().value;
    if (firstKey !== undefined) tokenCache.delete(firstKey);
  }
  tokenCache.set(text, tokens);
}

// ── Main tokenize ─────────────────────────────────────────────────────────────

interface Range { s: number; e: number; type: TokenType; }

export function tokenize(text: string): Token[] {
  if (!text) return [];

  // FIX: skip tokenizing very long lines (minified code) — return plain
  if (text.length > TOKENIZE_LINE_LIMIT) {
    return [{ type: 'plain', text }];
  }

  const cached = getCached(text);
  if (cached !== undefined) return cached;

  const len = text.length;
  // Uint8Array indexed by code-unit position (same as RegExp indices) — correct
  const occupied = new Uint8Array(len);
  const ranges: Range[] = [];

  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text)) !== null) {
      const s = m.index;
      const e = s + m[0].length;
      let conflict = false;
      for (let i = s; i < e; i++) {
        if (occupied[i]) { conflict = true; break; }
      }
      if (conflict) continue;
      for (let i = s; i < e; i++) occupied[i] = 1;
      ranges.push({ s, e, type: rule.type });
    }
  }

  ranges.sort((a, b) => a.s - b.s);

  const tokens: Token[] = [];
  let pos = 0;
  for (const r of ranges) {
    if (pos < r.s) tokens.push({ type: 'plain', text: text.slice(pos, r.s) });
    tokens.push({ type: r.type, text: text.slice(r.s, r.e) });
    pos = r.e;
  }
  if (pos < len) tokens.push({ type: 'plain', text: text.slice(pos) });

  const result = tokens.length ? tokens : [{ type: 'plain' as TokenType, text }];
  setCache(text, result);
  return result;
}

export function clearTokenCache(): void {
  tokenCache.clear();
}
