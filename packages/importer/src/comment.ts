import { toIsoDate } from './dates.js';

/**
 * Trailing ` (Author Name - Mon DD, YYYY)` suffix of a comment cell.
 *
 * - Anchored to the end of the (right-trimmed) cell, so parentheses inside the
 *   body never match.
 * - The author part excludes parentheses; combined with the strict date shape
 *   this keeps a final parenthesized remark in the body (e.g. `(see notes)`)
 *   from being mistaken for a suffix.
 * - Author may contain any non-paren characters, including non-ASCII and ` - `
 *   (the greedy match keeps everything up to the last ` - <date>`).
 */
export const COMMENT_SUFFIX_RE =
  /\(([^()]+) - ((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4})\)$/;

export interface ParsedCommentCell {
  body: string;
  author: string | null;
  /** ISO `YYYY-MM-DD`. */
  date: string | null;
  /** False when the suffix was missing or unparseable (body keeps the full text). */
  suffixParsed: boolean;
}

/** Split one comment cell into body and the trailing author/date suffix. */
export function parseCommentCell(cell: string): ParsedCommentCell {
  const trimmed = cell.trim();
  const m = COMMENT_SUFFIX_RE.exec(trimmed);
  if (!m) {
    return { body: trimmed, author: null, date: null, suffixParsed: false };
  }
  const body = trimmed.slice(0, m.index).replace(/\s+$/u, '');
  return {
    body,
    author: (m[1] as string).trim(),
    date: toIsoDate(m[2] as string),
    suffixParsed: true,
  };
}
