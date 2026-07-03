-- pt-viewer schema (SQLite / Cloudflare D1)
-- Read-only dataset built once by packages/importer from a PivotalTracker export.
-- Dates are day-precision (the export has no time component); stored as 'YYYY-MM-DD'.

CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  -- Display name is the only identity in the export (no emails / user ids).
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE stories (
  id INTEGER PRIMARY KEY,              -- PivotalTracker story/epic id (permalink key)
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  story_type TEXT NOT NULL,            -- feature | bug | chore | release | epic
  current_state TEXT,
  priority TEXT,
  estimate INTEGER,
  requested_by_id INTEGER REFERENCES users(id),
  created_at TEXT,
  accepted_at TEXT,
  deadline TEXT,
  description TEXT,
  url TEXT,                            -- original pivotaltracker.com URL
  extra TEXT                           -- JSON: blockers, reviews, pull_requests, git_branches, iteration
);

CREATE TABLE story_owners (
  story_id INTEGER NOT NULL REFERENCES stories(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (story_id, user_id)
);

CREATE TABLE story_labels (
  story_id INTEGER NOT NULL REFERENCES stories(id),
  label TEXT NOT NULL,
  PRIMARY KEY (story_id, label)
);

-- Comments have no id in the export; seq is the 1-based occurrence order
-- within the story row and is the stable permalink anchor (#comment-{seq}).
CREATE TABLE comments (
  story_id INTEGER NOT NULL REFERENCES stories(id),
  seq INTEGER NOT NULL,
  author_id INTEGER REFERENCES users(id),
  commented_on TEXT,
  body TEXT NOT NULL,
  PRIMARY KEY (story_id, seq)
);

CREATE TABLE tasks (
  story_id INTEGER NOT NULL REFERENCES stories(id),
  seq INTEGER NOT NULL,
  description TEXT NOT NULL,
  status TEXT,
  PRIMARY KEY (story_id, seq)
);

-- Metadata only; file bodies are NOT served. rel_path is relative to the
-- export root (e.g. "165240043/screenshot.png") for manual retrieval.
CREATE TABLE attachments (
  story_id INTEGER NOT NULL REFERENCES stories(id),
  filename TEXT NOT NULL,
  size INTEGER,
  rel_path TEXT NOT NULL,
  PRIMARY KEY (story_id, filename)
);

CREATE INDEX idx_stories_project ON stories(project_id);
CREATE INDEX idx_stories_created ON stories(created_at);
CREATE INDEX idx_stories_requested_by ON stories(requested_by_id);
CREATE INDEX idx_comments_author ON comments(author_id);
CREATE INDEX idx_story_labels_label ON story_labels(label);

-- Full-text search. trigram tokenizer handles Japanese; queries shorter than
-- 3 chars must fall back to LIKE in the app layer.
CREATE VIRTUAL TABLE stories_fts USING fts5(
  title, description,
  content='stories', content_rowid='id',
  tokenize='trigram'
);

CREATE VIRTUAL TABLE comments_fts USING fts5(
  body,
  content='comments',
  tokenize='trigram'
);
