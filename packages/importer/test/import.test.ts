import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findMainCsv } from '../src/csv.js';
import { runImport, type ImportStats } from '../src/importer.js';
import { fixtureCsv } from './helpers.js';

let tmp: string;
let outPath: string;
let dumpPath: string;
let stats: ImportStats;
let db: Database.Database;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-importer-test-'));
  const srcDir = path.join(tmp, 'export');
  fs.mkdirSync(srcDir);

  fs.writeFileSync(path.join(srcDir, 'sample_20250410_120000.csv'), fixtureCsv());
  // Decoy that must NOT be picked as the main CSV.
  fs.writeFileSync(
    path.join(srcDir, 'project_history_sample_20250410_120000.csv'),
    'occurred_at,description\n',
  );

  // Attachment folder for story 101: one real file, one .DS_Store, one subdir.
  const dir101 = path.join(srcDir, '101');
  fs.mkdirSync(dir101);
  fs.writeFileSync(path.join(dir101, '結果.png'), 'abcdefg'); // 7 bytes
  fs.writeFileSync(path.join(dir101, '.DS_Store'), 'junk');
  fs.mkdirSync(path.join(dir101, 'nested'));
  // Orphan all-digit folder (no matching story id).
  const dir999 = path.join(srcDir, '999');
  fs.mkdirSync(dir999);
  fs.writeFileSync(path.join(dir999, 'orphan.txt'), 'x');
  // Non-digit folder: ignored entirely.
  fs.mkdirSync(path.join(srcDir, 'not-a-story'));

  outPath = path.join(tmp, 'sample.sqlite3');
  dumpPath = path.join(tmp, 'sample.dump.sql');
  stats = runImport({
    slug: 'sample',
    name: 'Sample Project',
    srcDir,
    outPath,
    dumpPath,
  });
  db = new Database(outPath, { readonly: true });
});

afterAll(() => {
  db?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const count = (sql: string): number => db.prepare(sql).pluck().get() as number;

describe('runImport end to end', () => {
  it('selects the main CSV, not the project_history file', () => {
    expect(path.basename(findMainCsv(path.join(tmp, 'export')))).toBe(
      'sample_20250410_120000.csv',
    );
  });

  it('creates the project row from --project/--name', () => {
    expect(db.prepare('SELECT slug, name FROM projects').get()).toEqual({
      slug: 'sample',
      name: 'Sample Project',
    });
  });

  it('loads stories with converted dates and extra JSON', () => {
    expect(count('SELECT COUNT(*) FROM stories')).toBe(3);
    const s101 = db
      .prepare('SELECT story_type, estimate, created_at, extra FROM stories WHERE id = 101')
      .get() as Record<string, unknown>;
    expect(s101.story_type).toBe('feature');
    expect(s101.estimate).toBe(2);
    expect(s101.created_at).toBe('2021-06-29');
    expect(JSON.parse(s101.extra as string).git_branches).toEqual(['feature/kensa']);
    expect(
      db.prepare('SELECT extra FROM stories WHERE id = 102').pluck().get(),
    ).toBeNull();
  });

  it('normalizes users by exact display name across all sources', () => {
    // 山田 太郎 appears as requester, owner and comment author -> one row.
    expect(count('SELECT COUNT(*) FROM users')).toBe(2);
    const yamadaId = db
      .prepare('SELECT id FROM users WHERE name = ?')
      .pluck()
      .get('山田 太郎') as number;
    expect(
      db.prepare('SELECT requested_by_id FROM stories WHERE id = 101').pluck().get(),
    ).toBe(yamadaId);
    expect(
      db
        .prepare('SELECT user_id FROM story_owners WHERE story_id = 101 AND position = 2')
        .pluck()
        .get(),
    ).toBe(yamadaId);
    expect(
      db
        .prepare('SELECT author_id FROM comments WHERE story_id = 101 AND seq = 1')
        .pluck()
        .get(),
    ).toBe(yamadaId);
  });

  it('loads labels, comments and tasks', () => {
    expect(
      db
        .prepare('SELECT label FROM story_labels WHERE story_id = 101 ORDER BY label')
        .pluck()
        .all(),
    ).toEqual(['api', 'ui', '検査']);
    const c2 = db
      .prepare('SELECT author_id, commented_on, body FROM comments WHERE story_id = 101 AND seq = 2')
      .get() as Record<string, unknown>;
    expect(c2.body).toBe('line1\nline2 (checked)');
    expect(c2.commented_on).toBe('2021-06-29');
    const c3 = db
      .prepare('SELECT author_id, commented_on FROM comments WHERE story_id = 101 AND seq = 3')
      .get() as Record<string, unknown>;
    expect(c3.author_id).toBeNull();
    expect(c3.commented_on).toBeNull();
    expect(count('SELECT COUNT(*) FROM tasks')).toBe(2);
  });

  it('records attachment metadata and skips noise', () => {
    const rows = db.prepare('SELECT * FROM attachments').all();
    expect(rows).toEqual([
      { story_id: 101, filename: '結果.png', size: 7, rel_path: '101/結果.png' },
    ]);
  });

  it('populates FTS tables (trigram, Japanese)', () => {
    expect(
      db
        .prepare('SELECT rowid FROM stories_fts WHERE stories_fts MATCH ?')
        .pluck()
        .all('検査結果'),
    ).toEqual([101]);
    expect(
      count("SELECT COUNT(*) FROM comments_fts WHERE comments_fts MATCH 'ステージング'"),
    ).toBe(1);
  });

  it('reports aggregate stats only', () => {
    expect(stats).toEqual({
      stories: 3,
      storiesByType: { bug: 1, epic: 1, feature: 1 },
      comments: 3,
      users: 2,
      tasks: 2,
      labels: 3,
      attachments: 1,
      unparsedCommentSuffixes: 1,
      orphanAttachmentFolders: 1,
      dumpOversizedStatements: 0,
    });
  });

  it('is re-runnable for another project into a separate file', () => {
    const out2 = path.join(tmp, 'second.sqlite3');
    const stats2 = runImport({
      slug: 'second',
      name: 'Second Project',
      srcDir: path.join(tmp, 'export'),
      outPath: out2,
    });
    expect(stats2.stories).toBe(3);
    const db2 = new Database(out2, { readonly: true });
    expect(db2.prepare('SELECT slug FROM projects').pluck().get()).toBe('second');
    db2.close();
    // First DB untouched.
    expect(db.prepare('SELECT slug FROM projects').pluck().get()).toBe('sample');
  });
});

describe('SQL dump', () => {
  it('contains no PRAGMA/BEGIN/COMMIT statements', () => {
    const dump = fs.readFileSync(dumpPath, 'utf8');
    expect(dump).not.toMatch(/^\s*PRAGMA/im);
    expect(dump).not.toMatch(/^\s*(BEGIN|COMMIT)/im);
  });

  it('recreates an identical dataset when executed from scratch', () => {
    const dump = fs.readFileSync(dumpPath, 'utf8');
    const fresh = new Database(':memory:');
    fresh.exec(dump); // schema DDL + batched INSERTs + FTS rebuilds
    for (const table of [
      'projects',
      'users',
      'stories',
      'story_owners',
      'story_labels',
      'comments',
      'tasks',
      'attachments',
    ]) {
      expect(
        fresh.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get(),
        table,
      ).toBe(count(`SELECT COUNT(*) FROM ${table}`));
    }
    // Single-quote escaping survives the round trip.
    expect(
      fresh.prepare('SELECT title FROM stories WHERE id = 102').pluck().get(),
    ).toBe("バグ修正 (it's broken)");
    // Multi-line bodies survive the round trip.
    expect(
      fresh
        .prepare('SELECT body FROM comments WHERE story_id = 101 AND seq = 2')
        .pluck()
        .get(),
    ).toBe('line1\nline2 (checked)');
    // FTS rebuilt inside the dump.
    expect(
      fresh
        .prepare('SELECT rowid FROM stories_fts WHERE stories_fts MATCH ?')
        .pluck()
        .all('検査結果'),
    ).toEqual([101]);
    fresh.close();
  });
});
