import { describe, expect, it } from "vitest";
import {
  buildSearchQuery,
  charLength,
  escapeLike,
  ftsQuote,
  parseTicketNumber,
  PAGE_SIZE,
  SNIPPET_START,
  SNIPPET_END,
} from "../src/search";

describe("parseTicketNumber", () => {
  it("accepts plain and #-prefixed numbers", () => {
    expect(parseTicketNumber("165240043")).toBe(165240043);
    expect(parseTicketNumber("#165240043")).toBe(165240043);
    expect(parseTicketNumber("  42  ")).toBe(42);
  });

  it("rejects everything else", () => {
    expect(parseTicketNumber("")).toBeNull();
    expect(parseTicketNumber(undefined)).toBeNull();
    expect(parseTicketNumber("abc")).toBeNull();
    expect(parseTicketNumber("12a")).toBeNull();
    expect(parseTicketNumber("#12 34")).toBeNull();
    expect(parseTicketNumber("##12")).toBeNull();
    expect(parseTicketNumber("1.5")).toBeNull();
  });
});

describe("ftsQuote", () => {
  it("wraps input in double quotes", () => {
    expect(ftsQuote("検索語")).toBe('"検索語"');
  });

  it("doubles embedded double quotes (no query-syntax injection)", () => {
    expect(ftsQuote('foo"bar')).toBe('"foo""bar"');
    expect(ftsQuote('" OR "x')).toBe('""" OR ""x"');
  });

  it("neutralises FTS operators by phrase-quoting", () => {
    expect(ftsQuote("a AND b NOT c*")).toBe('"a AND b NOT c*"');
    expect(ftsQuote("title:^admin")).toBe('"title:^admin"');
  });
});

describe("escapeLike", () => {
  it("escapes %, _ and backslash", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("a\\b")).toBe("a\\\\b");
    expect(escapeLike("%_\\")).toBe("\\%\\_\\\\");
  });
});

describe("charLength", () => {
  it("counts code points, not UTF-16 units", () => {
    expect(charLength("abc")).toBe(3);
    expect(charLength("検索")).toBe(2);
    expect(charLength("𠮷野家")).toBe(3); // surrogate-pair first char
  });
});

describe("buildSearchQuery — mode selection", () => {
  it("uses FTS for queries of >= 3 chars", () => {
    const b = buildSearchQuery({ projectId: 1, q: "しおり機能" });
    expect(b.mode).toBe("fts");
    expect(b.sql).toContain("stories_fts MATCH ?");
    expect(b.sql).toContain("comments_fts MATCH ?");
    expect(b.sql).toContain("snippet(");
    expect(b.params).toContain('"しおり機能"');
  });

  it("uses FTS for exactly 3 Japanese chars", () => {
    expect(buildSearchQuery({ projectId: 1, q: "縦書き" }).mode).toBe("fts");
  });

  it("falls back to LIKE for 1-2 char queries", () => {
    const b = buildSearchQuery({ projectId: 1, q: "縦" });
    expect(b.mode).toBe("like");
    expect(b.sql).not.toContain("MATCH");
    expect(b.sql).toContain("LIKE ? ESCAPE '\\'");
    expect(b.params).toContain("%縦%");
  });

  it("LIKE mode escapes wildcard metacharacters", () => {
    const b = buildSearchQuery({ projectId: 1, q: "5%" });
    expect(b.mode).toBe("like");
    expect(b.params).toContain("%5\\%%");
  });

  it("browses (filters only) when q is empty or whitespace", () => {
    for (const q of [undefined, "", "   "]) {
      const b = buildSearchQuery({ projectId: 1, q });
      expect(b.mode).toBe("browse");
      expect(b.sql).not.toContain("MATCH");
      expect(b.sql).not.toContain("LIKE");
      expect(b.sql).toContain("ORDER BY s.created_at DESC, s.id DESC");
    }
  });

  it("ticket-number-looking queries still build a searchable query (fallthrough)", () => {
    // The redirect happens in the handler; if the story does not exist the
    // same q must still work as a normal search.
    const b = buildSearchQuery({ projectId: 1, q: "12345" });
    expect(b.mode).toBe("fts");
    expect(b.params).toContain('"12345"');
  });
});

describe("buildSearchQuery — FTS details", () => {
  it("quotes user input against FTS syntax injection", () => {
    const b = buildSearchQuery({ projectId: 1, q: 'x" OR title:admin' });
    expect(b.params).toContain('"x"" OR title:admin"');
    // raw input must never appear unquoted in params
    expect(b.params).not.toContain('x" OR title:admin');
  });

  it("never interpolates values into SQL", () => {
    const evil = "'; DROP TABLE stories; --";
    const b = buildSearchQuery({ projectId: 1, q: evil, label: evil });
    expect(b.sql).not.toContain(evil);
    expect(b.sql.match(/\?/g)!.length).toBe(b.params.length);
  });

  it("passes snippet markers as parameters", () => {
    const b = buildSearchQuery({ projectId: 1, q: "検索対象" });
    expect(b.params.filter((p) => p === SNIPPET_START)).toHaveLength(2);
    expect(b.params.filter((p) => p === SNIPPET_END)).toHaveLength(2);
  });

  it("orders by rank and exposes comment_seq for deep links", () => {
    const b = buildSearchQuery({ projectId: 1, q: "検索対象" });
    expect(b.sql).toContain("ORDER BY b.rank");
    expect(b.sql).toContain("comment_seq");
  });
});

describe("buildSearchQuery — filter composition", () => {
  const filters = {
    type: "bug",
    state: "accepted",
    label: "ui",
    user: "佐藤花子",
    from: "2021-01-01",
    to: "2021-12-31",
  };

  it.each(["fts", "like", "browse"] as const)(
    "applies all filters in %s mode",
    (mode) => {
      const q = mode === "fts" ? "表示崩れ" : mode === "like" ? "縦" : "";
      const b = buildSearchQuery({ projectId: 7, q, ...filters });
      expect(b.mode).toBe(mode);
      expect(b.sql).toContain("s.story_type = ?");
      expect(b.sql).toContain("s.current_state = ?");
      expect(b.sql).toContain("sl.label = ?");
      expect(b.sql).toContain("u.name = ?");
      expect(b.sql).toContain("s.created_at >= ?");
      expect(b.sql).toContain("s.created_at <= ?");
      for (const v of Object.values(filters)) {
        expect(b.params).toContain(v);
      }
      expect(b.params).toContain(7); // projectId is bound too
      expect(b.sql.match(/\?/g)!.length).toBe(b.params.length);
    }
  );

  it("filter params appear in clause order after projectId", () => {
    const b = buildSearchQuery({ projectId: 7, q: "", ...filters });
    expect(b.params).toEqual([
      7,
      "bug",
      "accepted",
      "ui",
      "佐藤花子",
      "2021-01-01",
      "2021-12-31",
      PAGE_SIZE + 1,
      0,
    ]);
  });

  it("user filter matches requester OR owner OR comment author", () => {
    const b = buildSearchQuery({ projectId: 1, user: "佐藤花子" });
    expect(b.sql).toContain("s.requested_by_id");
    expect(b.sql).toContain("story_owners");
    expect(b.sql).toMatch(/comments\s+cu/);
  });

  it("omits filter clauses when filters are absent", () => {
    const b = buildSearchQuery({ projectId: 1 });
    expect(b.sql).not.toContain("story_type = ?");
    expect(b.sql).not.toContain("story_labels");
    expect(b.params).toEqual([1, PAGE_SIZE + 1, 0]);
  });
});

describe("buildSearchQuery — pagination", () => {
  it("fetches PAGE_SIZE+1 rows to detect a next page", () => {
    const b = buildSearchQuery({ projectId: 1 });
    expect(b.limit).toBe(PAGE_SIZE + 1);
    expect(b.params).toContain(PAGE_SIZE + 1);
  });

  it("computes the offset from the 1-based page", () => {
    expect(buildSearchQuery({ projectId: 1, page: 1 }).offset).toBe(0);
    expect(buildSearchQuery({ projectId: 1, page: 3 }).offset).toBe(
      2 * PAGE_SIZE
    );
  });

  it("clamps invalid pages to 1", () => {
    expect(buildSearchQuery({ projectId: 1, page: 0 }).offset).toBe(0);
    expect(buildSearchQuery({ projectId: 1, page: -5 }).offset).toBe(0);
  });
});
