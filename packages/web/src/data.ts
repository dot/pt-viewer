// Shared read-only D1 access used by both the HTML pages and the JSON API.

import type {
  AttachmentRow,
  CommentRow,
  ProjectRow,
  StoryRow,
  TaskRow,
} from "./types";

export type AppEnv = { Bindings: { DB: D1Database } };

export function getProject(
  db: D1Database,
  slug: string
): Promise<ProjectRow | null> {
  return db
    .prepare("SELECT id, slug, name FROM projects WHERE slug = ?")
    .bind(slug)
    .first<ProjectRow>();
}

export interface StoryBundle {
  story: StoryRow;
  owners: string[];
  labels: string[];
  tasks: TaskRow[];
  comments: CommentRow[];
  attachments: AttachmentRow[];
}

/** Fetch a story with all sub-resources, or null when it does not exist
 *  in the given project. */
export async function fetchStoryBundle(
  db: D1Database,
  projectId: number,
  storyId: number
): Promise<StoryBundle | null> {
  const [storyRs, ownersRs, labelsRs, tasksRs, commentsRs, attachmentsRs] =
    await db.batch<Record<string, unknown>>([
      db
        .prepare(
          `SELECT s.*, u.name AS requested_by
             FROM stories s LEFT JOIN users u ON u.id = s.requested_by_id
            WHERE s.id = ? AND s.project_id = ?`
        )
        .bind(storyId, projectId),
      db
        .prepare(
          `SELECT u.name FROM story_owners so
             JOIN users u ON u.id = so.user_id
            WHERE so.story_id = ? ORDER BY so.position`
        )
        .bind(storyId),
      db
        .prepare(
          "SELECT label FROM story_labels WHERE story_id = ? ORDER BY label"
        )
        .bind(storyId),
      db
        .prepare(
          "SELECT seq, description, status FROM tasks WHERE story_id = ? ORDER BY seq"
        )
        .bind(storyId),
      db
        .prepare(
          `SELECT cm.seq, cm.commented_on, cm.body, u.name AS author
             FROM comments cm LEFT JOIN users u ON u.id = cm.author_id
            WHERE cm.story_id = ? ORDER BY cm.seq`
        )
        .bind(storyId),
      db
        .prepare(
          "SELECT filename, size, rel_path FROM attachments WHERE story_id = ? ORDER BY filename"
        )
        .bind(storyId),
    ]);

  const story = (storyRs!.results?.[0] ?? null) as unknown as StoryRow | null;
  if (!story) return null;

  return {
    story,
    owners: ((ownersRs!.results ?? []) as { name: string }[]).map(
      (r) => r.name
    ),
    labels: ((labelsRs!.results ?? []) as { label: string }[]).map(
      (r) => r.label
    ),
    tasks: (tasksRs!.results ?? []) as unknown as TaskRow[],
    comments: (commentsRs!.results ?? []) as unknown as CommentRow[],
    attachments: (attachmentsRs!.results ?? []) as unknown as AttachmentRow[],
  };
}
