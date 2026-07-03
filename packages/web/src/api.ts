// JSON API under /api — machine clients (Claude Code etc.). Authentication
// is enforced at the edge by Cloudflare Access (service tokens); the Worker
// itself performs none. Read-only, JSON responses only, raw markdown bodies.

import { Hono } from "hono";
import {
  buildSearchQuery,
  formToSearchInput,
  parseSearchForm,
  parseTicketNumber,
  PAGE_SIZE,
  SNIPPET_START,
  SNIPPET_END,
  type SearchFormState,
  type SearchResultRow,
} from "./search";
import { fetchStoryBundle, getProject, type AppEnv } from "./data";

/** Remove the <mark> control-char delimiters from an FTS snippet. */
export function stripSnippetMarkers(s: string): string {
  return s.replaceAll(SNIPPET_START, "").replaceAll(SNIPPET_END, "");
}

export interface ApiSearchResult {
  id: number;
  title: string;
  story_type: string;
  current_state: string | null;
  created_at: string | null;
  permalink: string;
  snippet?: string;
  comment_permalink?: string;
}

export function toApiResult(
  projectSlug: string,
  row: SearchResultRow
): ApiSearchResult {
  const permalink = `/${projectSlug}/stories/${row.id}`;
  const result: ApiSearchResult = {
    id: row.id,
    title: row.title,
    story_type: row.story_type,
    current_state: row.current_state,
    created_at: row.created_at,
    permalink,
  };
  if (row.snippet != null) result.snippet = stripSnippetMarkers(row.snippet);
  if (row.comment_seq != null) {
    result.comment_permalink = `${permalink}#comment-${row.comment_seq}`;
  }
  return result;
}

/** Echo of the applied (non-empty, validated) search params. */
export function appliedQuery(form: SearchFormState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ["q", "type", "state", "label", "user", "from", "to"] as const) {
    if (form[key]) out[key] = form[key];
  }
  return out;
}

function parseExtraJson(extra: string | null): unknown {
  if (!extra) return null;
  try {
    return JSON.parse(extra);
  } catch {
    return null;
  }
}

export const api = new Hono<AppEnv>();

// GET /api/projects
api.get("/projects", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT p.slug, p.name,
            (SELECT COUNT(*) FROM stories s WHERE s.project_id = p.id) AS story_count
       FROM projects p ORDER BY p.name`
  ).all<{ slug: string; name: string; story_count: number }>();
  return c.json({ projects: results });
});

// GET /api/:project/search — same params as the HTML search.
api.get("/:project/search", async (c) => {
  const db = c.env.DB;
  const project = await getProject(db, c.req.param("project"));
  if (!project) return c.json({ error: "not_found" }, 404);

  const form = parseSearchForm((name) => c.req.query(name));

  // Ticket-number q: no redirect in the API — return the story as a single
  // result, or an empty result list when it does not exist in this project.
  const ticket = parseTicketNumber(form.q);
  if (ticket !== null) {
    const row = await db
      .prepare(
        `SELECT id, title, story_type, current_state, created_at
           FROM stories WHERE id = ? AND project_id = ?`
      )
      .bind(ticket, project.id)
      .first<Omit<SearchResultRow, "snippet" | "comment_seq">>();
    return c.json({
      query: appliedQuery(form),
      page: 1,
      per_page: PAGE_SIZE,
      has_next: false,
      results: row
        ? [toApiResult(project.slug, { ...row, snippet: null, comment_seq: null })]
        : [],
    });
  }

  const built = buildSearchQuery(formToSearchInput(project.id, form));
  const { results } = await db
    .prepare(built.sql)
    .bind(...built.params)
    .all<SearchResultRow>();

  return c.json({
    query: appliedQuery(form),
    page: form.page,
    per_page: PAGE_SIZE,
    has_next: results.length > PAGE_SIZE,
    results: results
      .slice(0, PAGE_SIZE)
      .map((row) => toApiResult(project.slug, row)),
  });
});

// GET /api/:project/stories/:id — full story JSON.
api.get("/:project/stories/:id", async (c) => {
  const idParam = c.req.param("id");
  if (!/^\d+$/.test(idParam)) return c.json({ error: "bad_request" }, 400);

  const project = await getProject(c.env.DB, c.req.param("project"));
  if (!project) return c.json({ error: "not_found" }, 404);

  const bundle = await fetchStoryBundle(c.env.DB, project.id, Number(idParam));
  if (!bundle) return c.json({ error: "not_found" }, 404);
  const { story, owners, labels, tasks, comments, attachments } = bundle;

  return c.json({
    id: story.id,
    project: project.slug,
    title: story.title,
    story_type: story.story_type,
    current_state: story.current_state,
    priority: story.priority,
    estimate: story.estimate,
    requested_by: story.requested_by,
    created_at: story.created_at,
    accepted_at: story.accepted_at,
    deadline: story.deadline,
    description: story.description,
    labels,
    owners,
    tasks,
    attachments,
    comments,
    extra: parseExtraJson(story.extra),
    permalink: `/${project.slug}/stories/${story.id}`,
    original_url: story.url,
  });
});
