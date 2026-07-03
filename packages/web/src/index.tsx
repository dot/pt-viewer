import { Hono, type Context } from "hono";
import {
  buildSearchQuery,
  formToSearchInput,
  parseSearchForm,
  parseTicketNumber,
  PAGE_SIZE,
  type SearchResultRow,
} from "./search";
import { api } from "./api";
import { fetchStoryBundle, getProject, type AppEnv } from "./data";
import { NotFoundPage, ProjectListPage, SearchPage, StoryPage } from "./views";
import type { ProjectRow } from "./types";

const app = new Hono<AppEnv>();

// /api paths must always 404 as JSON — including "/api" itself, which would
// otherwise fall into the HTML /:project wildcard.
const notFound = (c: Context<AppEnv>) =>
  c.req.path === "/api" || c.req.path.startsWith("/api/")
    ? c.json({ error: "not_found" }, 404)
    : c.html(<NotFoundPage />, 404);

// JSON API for machine clients (registered before the HTML wildcards).
// Cloudflare Access authenticates in front of the Worker; no auth here.
app.route("/api", api);

app.notFound(notFound);

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

  const form = parseSearchForm((name) => c.req.query(name));

  // Ticket-number fast path: "#123" / "123" jumps to the story if it exists
  // in this project; otherwise fall through to a normal search.
  const ticket = parseTicketNumber(form.q);
  if (ticket !== null) {
    const hit = await db
      .prepare("SELECT id FROM stories WHERE id = ? AND project_id = ?")
      .bind(ticket, project.id)
      .first<{ id: number }>();
    if (hit) return c.redirect(`/${project.slug}/stories/${hit.id}`);
  }

  const built = buildSearchQuery(formToSearchInput(project.id, form));

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
  const idParam = c.req.param("id");
  if (!/^\d+$/.test(idParam)) return notFound(c);

  const project = await getProject(c.env.DB, c.req.param("project"));
  if (!project) return notFound(c);

  const bundle = await fetchStoryBundle(c.env.DB, project.id, Number(idParam));
  if (!bundle) return notFound(c);

  return c.html(
    <StoryPage
      project={project}
      story={bundle.story}
      owners={bundle.owners}
      labels={bundle.labels}
      tasks={bundle.tasks}
      comments={bundle.comments}
      attachments={bundle.attachments}
    />
  );
});

export default app;
