import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import type { AttachmentRow, ParsedStory } from './types.js';

/** Repo-level schema shared with packages/web (single source of truth). */
export const SCHEMA_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../db/schema.sql',
);

export function readSchema(): string {
  return fs.readFileSync(SCHEMA_PATH, 'utf8');
}

export interface BuildOptions {
  slug: string;
  name: string;
  stories: ParsedStory[];
  attachments: AttachmentRow[];
}

/**
 * Create a fresh SQLite database at `outPath` (replacing any existing file)
 * and load one project's worth of data. Users are normalized by exact
 * display-name string across Requested By / Owned By / comment authors.
 * Returns the open database handle (caller closes).
 */
export function buildDatabase(
  outPath: string,
  schemaSql: string,
  { slug, name, stories, attachments }: BuildOptions,
): Database.Database {
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.rmSync(outPath, { force: true });
  const db = new Database(outPath);
  db.exec(schemaSql);

  const insertProject = db.prepare(
    'INSERT INTO projects (id, slug, name) VALUES (1, ?, ?)',
  );
  const insertUser = db.prepare('INSERT INTO users (name) VALUES (?)');
  const insertStory = db.prepare(
    `INSERT INTO stories (
       id, project_id, title, story_type, current_state, priority, estimate,
       requested_by_id, created_at, accepted_at, deadline, description, url, extra
     ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertOwner = db.prepare(
    'INSERT OR IGNORE INTO story_owners (story_id, user_id, position) VALUES (?, ?, ?)',
  );
  const insertLabel = db.prepare(
    'INSERT OR IGNORE INTO story_labels (story_id, label) VALUES (?, ?)',
  );
  const insertComment = db.prepare(
    'INSERT INTO comments (story_id, seq, author_id, commented_on, body) VALUES (?, ?, ?, ?, ?)',
  );
  const insertTask = db.prepare(
    'INSERT INTO tasks (story_id, seq, description, status) VALUES (?, ?, ?, ?)',
  );
  const insertAttachment = db.prepare(
    'INSERT INTO attachments (story_id, filename, size, rel_path) VALUES (?, ?, ?, ?)',
  );

  const userIds = new Map<string, number>();
  const userId = (displayName: string): number => {
    const cached = userIds.get(displayName);
    if (cached !== undefined) return cached;
    const id = Number(insertUser.run(displayName).lastInsertRowid);
    userIds.set(displayName, id);
    return id;
  };

  db.transaction(() => {
    insertProject.run(slug, name);
    for (const story of stories) {
      insertStory.run(
        story.id,
        story.title,
        story.storyType,
        story.currentState,
        story.priority,
        story.estimate,
        story.requestedBy === null ? null : userId(story.requestedBy),
        story.createdAt,
        story.acceptedAt,
        story.deadline,
        story.description,
        story.url,
        story.extra,
      );
      story.owners.forEach((owner, i) => {
        insertOwner.run(story.id, userId(owner), i + 1);
      });
      for (const label of story.labels) insertLabel.run(story.id, label);
      for (const c of story.comments) {
        insertComment.run(
          story.id,
          c.seq,
          c.author === null ? null : userId(c.author),
          c.date,
          c.body,
        );
      }
      for (const t of story.tasks) {
        insertTask.run(story.id, t.seq, t.description, t.status);
      }
    }
    for (const a of attachments) {
      insertAttachment.run(a.storyId, a.filename, a.size, a.relPath);
    }
  })();

  // stories_fts / comments_fts are external-content tables: rebuild once
  // after all inserts.
  db.exec(
    "INSERT INTO stories_fts(stories_fts) VALUES('rebuild');\n" +
      "INSERT INTO comments_fts(comments_fts) VALUES('rebuild');",
  );

  return db;
}
