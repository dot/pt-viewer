import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { buildDatabase, readSchema } from '../src/db.js';
import {
  buildInsertStatements,
  generateDump,
  STATEMENT_BYTE_BUDGET,
} from '../src/dump.js';
import type { ParsedStory } from '../src/types.js';

const byteLength = (s: string): number => Buffer.byteLength(s, 'utf8');

/** Single-row statements have exactly one value tuple (bodies are plain kana). */
const isSingleRow = (stmt: string): boolean => !stmt.includes('),\n(');

describe('buildInsertStatements byte budget', () => {
  it('flushes on byte budget before reaching 100 rows', () => {
    // 30 rows x ~9 KB (multibyte: 'あ' is 3 bytes in UTF-8, 1 in .length).
    const rows = Array.from({ length: 30 }, (_, i) => [i + 1, 'あ'.repeat(3000)]);
    const statements = buildInsertStatements('users', ['id', 'name'], rows);

    expect(statements.length).toBeGreaterThan(1); // row cap alone would emit 1
    for (const stmt of statements) {
      expect(byteLength(stmt)).toBeLessThanOrEqual(STATEMENT_BYTE_BUDGET);
    }
    // No rows lost.
    expect(statements.join('\n').match(/\(\d+,'/g)).toHaveLength(30);
  });

  it('still emits a single row that alone exceeds the budget', () => {
    const rows = [
      [1, 'あ'.repeat(1000)],
      [2, 'い'.repeat(40000)], // 120 KB > budget
      [3, 'う'.repeat(1000)],
    ];
    const statements = buildInsertStatements('users', ['id', 'name'], rows);

    expect(statements.join('\n').match(/\(\d+,'/g)).toHaveLength(3);
    const oversized = statements.filter((s) => byteLength(s) > STATEMENT_BYTE_BUDGET);
    expect(oversized).toHaveLength(1);
    expect(oversized.every(isSingleRow)).toBe(true);
  });

  it('still caps batches at 100 rows when bytes allow more', () => {
    const rows = Array.from({ length: 250 }, (_, i) => [i + 1, 'u']);
    const statements = buildInsertStatements('users', ['id', 'name'], rows);
    expect(statements).toHaveLength(3); // 100 + 100 + 50
  });
});

describe('generateDump with large bodies', () => {
  it('keeps every statement within budget and round-trips identically', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-dump-test-'));
    try {
      // 25 stories with ~12 KB descriptions and ~12 KB comments force
      // byte-based flushing; story 9999 has an oversized single row.
      const stories: ParsedStory[] = Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        title: `ストーリー ${i + 1}`,
        storyType: 'feature',
        currentState: 'accepted',
        priority: null,
        estimate: null,
        requestedBy: null,
        createdAt: '2021-06-29',
        acceptedAt: null,
        deadline: null,
        description: 'あ'.repeat(4000),
        url: null,
        labels: [],
        owners: [],
        comments: [
          { seq: 1, author: null, date: null, body: 'い'.repeat(4000) },
        ],
        tasks: [],
        extra: null,
      }));
      stories.push({
        ...stories[0]!,
        id: 9999,
        description: 'う'.repeat(40000), // ~120 KB > budget on its own
        comments: [],
      });

      const schemaSql = readSchema();
      const dbPath = path.join(tmp, 'big.sqlite3');
      const db = buildDatabase(dbPath, schemaSql, {
        slug: 'big',
        name: 'Big',
        stories,
        attachments: [],
      });
      const dump = generateDump(db, schemaSql);

      expect(dump.oversizedStatements).toBe(1);
      // Every INSERT statement respects the budget except single oversize rows.
      const inserts = dump.sql
        .split(/;\n(?=INSERT INTO )/)
        .filter((s) => s.includes('INSERT INTO'));
      const oversized = inserts.filter(
        (s) => byteLength(s) > STATEMENT_BYTE_BUDGET,
      );
      expect(oversized).toHaveLength(1);
      expect(oversized.every(isSingleRow)).toBe(true);

      // Round trip: identical table counts and intact oversized body.
      const fresh = new Database(':memory:');
      fresh.exec(dump.sql);
      for (const table of ['projects', 'users', 'stories', 'comments']) {
        expect(
          fresh.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get(),
          table,
        ).toBe(db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get());
      }
      expect(
        fresh
          .prepare('SELECT length(description) FROM stories WHERE id = 9999')
          .pluck()
          .get(),
      ).toBe(40000);
      fresh.close();
      db.close();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
