import { Hono, type Context } from "hono";
import {
  buildSearchQuery,
  parseTicketNumber,
  PAGE_SIZE,
  type SearchResultRow,
} from "./search";
import {
  NotFoundPage,
  ProjectListPage,
  SearchPage,
  StoryPage,
  type SearchFormState,
} from "./views";
import type {
  AttachmentRow,
  CommentRow,
  ProjectRow,
  StoryRow,
  TaskRow,
} from "./types";

type Env = { Bindings: { DB: D1Database } };

const app = new Hono<Env>();

const notFound = (c: Context<Env>) => c.html(<NotFoundPage />, 404);

app.notFound((c) => c.html(<NotFoundPage />, 404));

function getProject(db: D1Database, slug: string): Promise<ProjectRow | null> {
  return db
    .prepare("SELECT id, slug, name FROM projects WHERE slug = ?")
    .bind(slug)
    .first<ProjectRow>();
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET / — single project: jump straight to it; otherwise list projects.
app.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, slug, name FROM projects ORDER BY name"
  ).all<ProjectRow>();
  if (results.length === 1) return c.redirect(`/${results[0]!.slug}`);
  return c.html(<ProjectListPage projects={results} />);
});

// GET /:project — search / browse.
app.get("/:project", async (c) => {
  const db = c.env.DB;
  const project = await getProject(db, c.req.param("project"));
  if (!project) return notFound(c);

  const query = (name: string) => (c.req.query(name) ?? "").trim();
  const q = query("q");

  // Ticket-number fast path: "#123" / "123" jumps to the story if it exists
  // in this project; otherwise fall through to a normal search.
  const ticket = parseTicketNumber(q);
  if (ticket !== null) {
    const hit = await db
      .prepare("SELECT id FROM stories WHERE id = ? AND project_id = ?")
      .bind(ticket, project.id)
      .first<{ id: number }>();
    if (hit) return c.redirect(`/${project.slug}/stories/${hit.id}`);
  }

  const pageNum = Number.parseInt(query("page"), 10);
  const form: SearchFormState = {
    q,
    type: query("type"),
    state: query("state"),
    label: query("label"),
    user: query("user"),
    from: DATE_RE.test(query("from")) ? query("from") : "",
    to: DATE_RE.test(query("to")) ? query("to") : "",
    page: Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1,
  };

  const built = buildSearchQuery({
    projectId: project.id,
    q: form.q,
    type: form.type || undefined,
    state: form.state || undefined,
    label: form.label || undefined,
    user: form.user || undefined,
    from: form.from || undefined,
    to: form.to || undefined,
    page: form.page,
  });

  const [searchRs, typesRs, statesRs, labelsRs, usersRs] = await db.batch<
    Record<string, unknown>
  >([
    db.prepare(built.sql).bind(...built.params),
    db
      .prepare(
        "SELECT DISTINCT story_type AS v FROM stories WHERE project_id = ? ORDER BY 1"
      )
      .bind(project.id),
    db
      .prepare(
        "SELECT DISTINCT current_state AS v FROM stories WHERE project_id = ? AND current_state IS NOT NULL ORDER BY 1"
      )
      .bind(project.id),
    db
      .prepare(
        `SELECT DISTINCT sl.label AS v
           FROM story_labels sl JOIN stories s ON s.id = sl.story_id
          WHERE s.project_id = ? ORDER BY 1`
      )
      .bind(project.id),
    db
      .prepare(
        `SELECT u.name AS v FROM users u
          WHERE EXISTS (SELECT 1 FROM stories s
                         WHERE s.project_id = ?1 AND s.requested_by_id = u.id)
             OR EXISTS (SELECT 1 FROM story_owners so
                          JOIN stories s ON s.id = so.story_id
                         WHERE s.project_id = ?1 AND so.user_id = u.id)
             OR EXISTS (SELECT 1 FROM comments cm
                          JOIN stories s ON s.id = cm.story_id
                         WHERE s.project_id = ?1 AND cm.author_id = u.id)
          ORDER BY u.name`
      )
      .bind(project.id),
  ]);

  const rows = (searchRs!.results ?? []) as unknown as SearchResultRow[];
  const values = (rs: typeof typesRs) =>
    ((rs!.results ?? []) as { v: string }[]).map((r) => r.v);

  return c.html(
    <SearchPage
      project={project}
      form={form}
      options={{
        types: values(typesRs),
        states: values(statesRs),
        labels: values(labelsRs),
        users: values(usersRs),
      }}
      results={rows.slice(0, PAGE_SIZE)}
      hasNext={rows.length > PAGE_SIZE}
    />
  );
});

// GET /:project/stories/:id — story detail.
app.get("/:project/stories/:id", async (c) => {
  const db = c.env.DB;
  const idParam = c.req.param("id");
  if (!/^\d+$/.test(idParam)) return notFound(c);
  const id = Number(idParam);

  const project = await getProject(db, c.req.param("project"));
  if (!project) return notFound(c);

  const [storyRs, ownersRs, labelsRs, tasksRs, commentsRs, attachmentsRs] =
    await db.batch<Record<string, unknown>>([
      db
        .prepare(
          `SELECT s.*, u.name AS requested_by
             FROM stories s LEFT JOIN users u ON u.id = s.requested_by_id
            WHERE s.id = ? AND s.project_id = ?`
        )
        .bind(id, project.id),
      db
        .prepare(
          `SELECT u.name FROM story_owners so
             JOIN users u ON u.id = so.user_id
            WHERE so.story_id = ? ORDER BY so.position`
        )
        .bind(id),
      db
        .prepare("SELECT label FROM story_labels WHERE story_id = ? ORDER BY label")
        .bind(id),
      db
        .prepare(
          "SELECT seq, description, status FROM tasks WHERE story_id = ? ORDER BY seq"
        )
        .bind(id),
      db
        .prepare(
          `SELECT cm.seq, cm.commented_on, cm.body, u.name AS author
             FROM comments cm LEFT JOIN users u ON u.id = cm.author_id
            WHERE cm.story_id = ? ORDER BY cm.seq`
        )
        .bind(id),
      db
        .prepare(
          "SELECT filename, size, rel_path FROM attachments WHERE story_id = ? ORDER BY filename"
        )
        .bind(id),
    ]);

  const story = (storyRs!.results?.[0] ?? null) as unknown as StoryRow | null;
  if (!story) return notFound(c);

  return c.html(
    <StoryPage
      project={project}
      story={story}
      owners={((ownersRs!.results ?? []) as { name: string }[]).map(
        (r) => r.name
      )}
      labels={((labelsRs!.results ?? []) as { label: string }[]).map(
        (r) => r.label
      )}
      tasks={(tasksRs!.results ?? []) as unknown as TaskRow[]}
      comments={(commentsRs!.results ?? []) as unknown as CommentRow[]}
      attachments={(attachmentsRs!.results ?? []) as unknown as AttachmentRow[]}
    />
  );
});

export default app;
