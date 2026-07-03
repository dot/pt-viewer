// End-to-end handler tests for the /api routes, running the real SQL
// (schema + FTS5 trigram) against an in-memory SQLite via tests/helpers/d1.

import { beforeAll, describe, expect, it } from "vitest";
import app from "../src/index";
import { SNIPPET_START, SNIPPET_END } from "../src/search";
import { createTestDB } from "./helpers/d1";

let env: { DB: D1Database };

beforeAll(() => {
  env = { DB: createTestDB() };
});

const get = (path: string) => app.request(path, {}, env);
const getJson = async (path: string) => {
  const res = await get(path);
  return { res, body: (await res.json()) as any };
};

describe("GET /api/projects", () => {
  it("lists projects with story counts as JSON", async () => {
    const { res, body } = await getJson("/api/projects");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    expect(body.projects).toEqual([
      { slug: "yasai", name: "家庭菜園プランナー", story_count: 2 },
      { slug: "aozora", name: "青空文庫リーダー", story_count: 8 },
    ]);
  });
});

describe("GET /api/:project/search", () => {
  it("returns FTS results with permalink and marker-free snippet", async () => {
    const { res, body } = await getJson(
      "/api/aozora/search?q=" + encodeURIComponent("しおり")
    );
    expect(res.status).toBe(200);
    expect(body.query).toEqual({ q: "しおり" });
    expect(body.page).toBe(1);
    expect(body.per_page).toBe(50);
    expect(body.has_next).toBe(false);
    expect(body.results.length).toBeGreaterThanOrEqual(2);
    for (const r of body.results) {
      expect(r.permalink).toBe(`/aozora/stories/${r.id}`);
      expect(r.snippet).toBeDefined();
      expect(r.snippet).not.toContain(SNIPPET_START);
      expect(r.snippet).not.toContain(SNIPPET_END);
    }
  });

  it("deep-links comment matches via comment_permalink", async () => {
    const { body } = await getJson(
      "/api/aozora/search?q=" + encodeURIComponent("トライグラム")
    );
    expect(body.results).toHaveLength(1);
    expect(body.results[0].id).toBe(180000004);
    expect(body.results[0].comment_permalink).toBe(
      "/aozora/stories/180000004#comment-1"
    );
  });

  it("supports LIKE fallback for short queries (no snippet field)", async () => {
    const { body } = await getJson(
      "/api/aozora/search?q=" + encodeURIComponent("縦")
    );
    expect(body.results.map((r: any) => r.id).sort()).toEqual([
      180000003, 180000006,
    ]);
    expect(body.results[0].snippet).toBeUndefined();
  });

  it("composes filters and echoes only applied params", async () => {
    const { body } = await getJson(
      "/api/aozora/search?type=bug&state=started&from=2021-01-01&to=bogus"
    );
    // invalid "to" is dropped from both the filter and the echo
    expect(body.query).toEqual({
      type: "bug",
      state: "started",
      from: "2021-01-01",
    });
    expect(body.results.map((r: any) => r.id)).toEqual([180000007]);
  });

  it("browse mode (no q) orders by created_at DESC", async () => {
    const { body } = await getJson("/api/yasai/search");
    expect(body.results.map((r: any) => r.id)).toEqual([190000002, 190000001]);
    expect(body.query).toEqual({});
  });

  describe("ticket-number q", () => {
    it("returns the story as a single result without redirecting", async () => {
      const { res, body } = await getJson("/api/aozora/search?q=180000002");
      expect(res.status).toBe(200); // no 302 in the API
      expect(body.results).toHaveLength(1);
      expect(body.results[0]).toMatchObject({
        id: 180000002,
        title: "しおりを保存できるようにする",
        story_type: "feature",
        permalink: "/aozora/stories/180000002",
      });
      expect(body.has_next).toBe(false);
    });

    it("accepts the #-prefixed form", async () => {
      const { body } = await getJson("/api/aozora/search?q=%23180000002");
      expect(body.results).toHaveLength(1);
      expect(body.results[0].id).toBe(180000002);
    });

    it("returns empty results for a missing ticket number", async () => {
      const { res, body } = await getJson("/api/aozora/search?q=999999");
      expect(res.status).toBe(200);
      expect(body.results).toEqual([]);
    });

    it("is project-scoped (yasai story not visible from aozora)", async () => {
      const { body } = await getJson("/api/aozora/search?q=190000001");
      expect(body.results).toEqual([]);
    });
  });

  it("404s as JSON for an unknown project", async () => {
    const { res, body } = await getJson("/api/nope/search?q=foo");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    expect(body).toEqual({ error: "not_found" });
  });
});

describe("GET /api/:project/stories/:id", () => {
  it("returns the full story JSON", async () => {
    const { res, body } = await getJson("/api/aozora/stories/180000002");
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      id: 180000002,
      project: "aozora",
      title: "しおりを保存できるようにする",
      story_type: "feature",
      current_state: "accepted",
      priority: "p1",
      estimate: 2,
      requested_by: "佐藤花子",
      created_at: "2021-06-15",
      accepted_at: "2021-07-20",
      permalink: "/aozora/stories/180000002",
      original_url: "https://www.pivotaltracker.com/story/show/180000002",
    });
    expect(body.labels).toEqual(["ui", "しおり"]);
    expect(body.owners).toEqual(["鈴木一郎", "田中太郎"]);
    expect(body.description).toContain("## 概要"); // raw markdown, not HTML
    expect(body.tasks).toHaveLength(3);
    expect(body.tasks[0]).toEqual({
      seq: 1,
      description: "BookmarkStore の実装",
      status: "completed",
    });
    expect(body.attachments).toHaveLength(2);
    expect(body.attachments.map((a: any) => Object.keys(a).sort())).toEqual([
      ["filename", "rel_path", "size"],
      ["filename", "rel_path", "size"],
    ]);
    expect(body.comments).toHaveLength(3);
    expect(body.comments[0]).toMatchObject({
      seq: 1,
      author: "鈴木一郎",
      commented_on: "2021-06-20",
    });
    expect(body.comments[1].body).toContain("```"); // raw markdown body
    // extra is parsed JSON
    expect(body.extra.pull_requests).toEqual([
      "https://example.com/git/aozora/pull/42",
    ]);
    expect(body.extra.iteration).toBe("2021W28");
  });

  it("returns null extra when the column is NULL", async () => {
    const { body } = await getJson("/api/aozora/stories/180000004");
    expect(body.extra).toBeNull();
  });

  it("404s as JSON for a story missing from the project", async () => {
    for (const path of [
      "/api/aozora/stories/1",
      "/api/aozora/stories/190000001", // exists, but in yasai
      "/api/nope/stories/180000002",
    ]) {
      const { res, body } = await getJson(path);
      expect(res.status).toBe(404);
      expect(body).toEqual({ error: "not_found" });
    }
  });

  it("400s as JSON for a non-numeric id", async () => {
    const { res, body } = await getJson("/api/aozora/stories/abc");
    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "bad_request" });
  });
});

describe("unknown /api paths", () => {
  it("responds with JSON 404, not the HTML page", async () => {
    for (const path of ["/api", "/api/", "/api/unknown/route/x"]) {
      const res = await get(path);
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toMatch(/^application\/json/);
      expect(await res.json()).toEqual({ error: "not_found" });
    }
  });
});

describe("HTML routes still behave (regression)", () => {
  it("HTML search still redirects on ticket-number q", async () => {
    const res = await get("/aozora?q=180000002");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/aozora/stories/180000002");
  });

  it("HTML story page renders", async () => {
    const res = await get("/aozora/stories/180000002");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
    expect(await res.text()).toContain('id="comment-1"');
  });
});
