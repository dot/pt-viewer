// Search query builder — pure functions, no D1 dependency, unit-testable.
// The database is read-only; all values are passed as bind parameters.

export const PAGE_SIZE = 50;

// snippet() match markers. Control characters cannot appear in the stored
// text, so they are safe delimiters; the view layer converts them to <mark>.
export const SNIPPET_START = "\u0001";
export const SNIPPET_END = "\u0002";
export const SNIPPET_ELLIPSIS = "…";

export type SearchMode = "fts" | "like" | "browse";

export interface SearchFilters {
  type?: string;
  state?: string;
  label?: string;
  user?: string;
  /** inclusive lower bound on stories.created_at (YYYY-MM-DD) */
  from?: string;
  /** inclusive upper bound on stories.created_at (YYYY-MM-DD) */
  to?: string;
}

export interface SearchInput extends SearchFilters {
  projectId: number;
  q?: string;
  /** 1-based page number */
  page?: number;
}

export interface BuiltQuery {
  sql: string;
  params: (string | number)[];
  mode: SearchMode;
  /** rows requested = PAGE_SIZE + 1; a full result means there is a next page */
  limit: number;
  offset: number;
}

export interface SearchResultRow {
  id: number;
  title: string;
  story_type: string;
  current_state: string | null;
  created_at: string | null;
  /** snippet with SNIPPET_START/END markers when mode === 'fts', else null */
  snippet: string | null;
  /** set when the best FTS hit for the story was a comment */
  comment_seq: number | null;
}

/** `123` / `#123` → 123, anything else → null (ticket-number fast path). */
export function parseTicketNumber(q: string | undefined | null): number | null {
  if (!q) return null;
  const m = /^#?(\d{1,12})$/.exec(q.trim());
  return m ? Number(m[1]) : null;
}

/**
 * Quote user input for FTS5 MATCH as a single phrase string.
 * Wrapping in double quotes (with embedded quotes doubled) neutralises all
 * FTS query syntax (AND/OR/NOT/NEAR, column filters, parens, `*`, `^`, ...).
 */
export function ftsQuote(q: string): string {
  return '"' + q.replaceAll('"', '""') + '"';
}

/** Escape %, _ and \ for use inside a LIKE pattern with ESCAPE '\'. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => "\\" + c);
}

/** Count in code points — the FTS5 trigram tokenizer needs >= 3 characters. */
export function charLength(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

const SELECT_COLS =
  "s.id, s.title, s.story_type, s.current_state, s.created_at";

/** Filter fragments, all referencing the stories alias `s`. Parameterized. */
function filterClauses(f: SearchFilters): {
  where: string[];
  params: (string | number)[];
} {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (f.type) {
    where.push("s.story_type = ?");
    params.push(f.type);
  }
  if (f.state) {
    where.push("s.current_state = ?");
    params.push(f.state);
  }
  if (f.label) {
    where.push(
      "EXISTS (SELECT 1 FROM story_labels sl WHERE sl.story_id = s.id AND sl.label = ?)"
    );
    params.push(f.label);
  }
  if (f.user) {
    where.push(
      `EXISTS (
        SELECT 1 FROM users u
        WHERE u.name = ?
          AND (u.id = s.requested_by_id
            OR EXISTS (SELECT 1 FROM story_owners so
                        WHERE so.story_id = s.id AND so.user_id = u.id)
            OR EXISTS (SELECT 1 FROM comments cu
                        WHERE cu.story_id = s.id AND cu.author_id = u.id))
      )`
    );
    params.push(f.user);
  }
  if (f.from) {
    where.push("s.created_at >= ?");
    params.push(f.from);
  }
  if (f.to) {
    where.push("s.created_at <= ?");
    params.push(f.to);
  }
  return { where, params };
}

export function buildSearchQuery(input: SearchInput): BuiltQuery {
  const q = (input.q ?? "").trim();
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const limit = PAGE_SIZE + 1; // one extra row to detect a next page
  const offset = (page - 1) * PAGE_SIZE;
  const { where, params: filterParams } = filterClauses(input);
  const filterSql = where.length ? " AND " + where.join(" AND ") : "";

  if (q !== "" && charLength(q) >= 3) {
    // FTS mode: stories matched on title/description, unioned with stories
    // whose comments match; best (lowest) rank per story wins. Bare columns
    // with min() select values from the min-rank row (SQLite documented
    // behaviour), so the snippet shown is the best hit's snippet.
    const match = ftsQuote(q);
    const sql = `WITH hits AS (
  SELECT stories_fts.rowid AS story_id,
         stories_fts.rank AS rank,
         snippet(stories_fts, -1, ?, ?, ?, 16) AS snippet,
         NULL AS comment_seq
    FROM stories_fts
   WHERE stories_fts MATCH ?
  UNION ALL
  SELECT c.story_id,
         comments_fts.rank AS rank,
         snippet(comments_fts, 0, ?, ?, ?, 16) AS snippet,
         c.seq AS comment_seq
    FROM comments_fts
    JOIN comments c ON c.rowid = comments_fts.rowid
   WHERE comments_fts MATCH ?
), best AS (
  SELECT story_id, snippet, comment_seq, min(rank) AS rank
    FROM hits
   GROUP BY story_id
)
SELECT ${SELECT_COLS}, b.snippet, b.comment_seq
  FROM best b
  JOIN stories s ON s.id = b.story_id
 WHERE s.project_id = ?${filterSql}
 ORDER BY b.rank, s.id DESC
 LIMIT ? OFFSET ?`;
    const params: (string | number)[] = [
      SNIPPET_START, SNIPPET_END, SNIPPET_ELLIPSIS, match,
      SNIPPET_START, SNIPPET_END, SNIPPET_ELLIPSIS, match,
      input.projectId,
      ...filterParams,
      limit, offset,
    ];
    return { sql, params, mode: "fts", limit, offset };
  }

  if (q !== "") {
    // Short query (1-2 chars): trigram FTS cannot match, fall back to LIKE.
    const pattern = "%" + escapeLike(q) + "%";
    const sql = `SELECT ${SELECT_COLS}, NULL AS snippet, NULL AS comment_seq
  FROM stories s
 WHERE s.project_id = ?
   AND (s.title LIKE ? ESCAPE '\\'
     OR s.description LIKE ? ESCAPE '\\'
     OR EXISTS (SELECT 1 FROM comments c
                 WHERE c.story_id = s.id AND c.body LIKE ? ESCAPE '\\'))${filterSql}
 ORDER BY s.created_at DESC, s.id DESC
 LIMIT ? OFFSET ?`;
    const params: (string | number)[] = [
      input.projectId, pattern, pattern, pattern,
      ...filterParams,
      limit, offset,
    ];
    return { sql, params, mode: "like", limit, offset };
  }

  // Browse mode: filters only.
  const sql = `SELECT ${SELECT_COLS}, NULL AS snippet, NULL AS comment_seq
  FROM stories s
 WHERE s.project_id = ?${filterSql}
 ORDER BY s.created_at DESC, s.id DESC
 LIMIT ? OFFSET ?`;
  const params: (string | number)[] = [
    input.projectId,
    ...filterParams,
    limit, offset,
  ];
  return { sql, params, mode: "browse", limit, offset };
}
