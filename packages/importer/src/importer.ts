import fs from 'node:fs';
import { scanAttachments } from './attachments.js';
import { findMainCsv, parseExportCsv } from './csv.js';
import { buildDatabase, readSchema } from './db.js';
import { generateDump } from './dump.js';

export interface ImportOptions {
  slug: string;
  name: string;
  srcDir: string;
  outPath: string;
  dumpPath?: string;
  /** Override for tests; defaults to the repo's db/schema.sql. */
  schemaSql?: string;
}

/**
 * Aggregate counts only — safe to print. Must never carry titles, bodies,
 * filenames, or user names (medical-domain data).
 */
export interface ImportStats {
  stories: number;
  storiesByType: Record<string, number>;
  comments: number;
  users: number;
  tasks: number;
  labels: number;
  attachments: number;
  unparsedCommentSuffixes: number;
  orphanAttachmentFolders: number;
}

/** Run one full import: export dir -> SQLite file (+ optional D1 SQL dump). */
export function runImport(options: ImportOptions): ImportStats {
  const csvPath = findMainCsv(options.srcDir);
  const { stories, unparsedCommentSuffixes } = parseExportCsv(
    fs.readFileSync(csvPath, 'utf8'),
  );

  const storyIds = new Set(stories.map((s) => s.id));
  const { attachments, orphanFolders } = scanAttachments(options.srcDir, storyIds);

  const schemaSql = options.schemaSql ?? readSchema();
  const db = buildDatabase(options.outPath, schemaSql, {
    slug: options.slug,
    name: options.name,
    stories,
    attachments,
  });

  try {
    if (options.dumpPath) {
      fs.writeFileSync(options.dumpPath, generateDump(db, schemaSql));
    }

    const count = (sql: string): number =>
      (db.prepare(sql).pluck().get() as number) ?? 0;
    const storiesByType: Record<string, number> = {};
    for (const [type, n] of db
      .prepare('SELECT story_type, COUNT(*) FROM stories GROUP BY story_type ORDER BY story_type')
      .raw()
      .all() as [string, number][]) {
      storiesByType[type] = n;
    }

    return {
      stories: count('SELECT COUNT(*) FROM stories'),
      storiesByType,
      comments: count('SELECT COUNT(*) FROM comments'),
      users: count('SELECT COUNT(*) FROM users'),
      tasks: count('SELECT COUNT(*) FROM tasks'),
      labels: count('SELECT COUNT(*) FROM story_labels'),
      attachments: count('SELECT COUNT(*) FROM attachments'),
      unparsedCommentSuffixes,
      orphanAttachmentFolders: orphanFolders,
    };
  } finally {
    db.close();
  }
}
