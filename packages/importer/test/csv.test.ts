import { describe, expect, it } from 'vitest';
import { parseExportCsv } from '../src/csv.js';
import { fixtureCsv } from './helpers.js';

describe('parseExportCsv', () => {
  const { stories, unparsedCommentSuffixes } = parseExportCsv(fixtureCsv());
  const s101 = stories.find((s) => s.id === 101)!;
  const s102 = stories.find((s) => s.id === 102)!;
  const s103 = stories.find((s) => s.id === 103)!;

  it('parses every data row', () => {
    expect(stories).toHaveLength(3);
    expect(s101.title).toBe('検査結果画面の改善');
    expect(s101.storyType).toBe('feature');
    expect(s102.storyType).toBe('bug');
    expect(s103.storyType).toBe('epic');
  });

  it('treats omitted trailing cells as empty (variable-length rows)', () => {
    expect(s102.comments).toHaveLength(0);
    expect(s102.tasks).toHaveLength(0);
    expect(s102.owners).toHaveLength(0);
    expect(s102.extra).toBeNull();
    expect(s103.url).toBeNull();
  });

  it('converts story dates to ISO', () => {
    expect(s101.createdAt).toBe('2021-06-29');
    expect(s101.acceptedAt).toBe('2021-07-05');
    expect(s101.deadline).toBeNull();
    expect(s102.deadline).toBe('2021-07-30');
    expect(s103.createdAt).toBe('2022-01-01');
  });

  it('parses estimate as int or null', () => {
    expect(s101.estimate).toBe(2);
    expect(s102.estimate).toBeNull();
  });

  it('splits labels, trimming and skipping empties', () => {
    expect(s101.labels).toEqual(['api', '検査', 'ui']);
    expect(s102.labels).toEqual([]);
  });

  it('collects owners in column order, skipping empties', () => {
    expect(s101.owners).toEqual(['Alice Smith', '山田 太郎']);
  });

  it('extracts comments in column order with 1-based seq', () => {
    expect(s101.comments.map((c) => c.seq)).toEqual([1, 2, 3]);
    expect(s101.comments[0]).toEqual({
      seq: 1,
      author: '山田 太郎',
      date: '2021-07-01',
      body: 'ステージング (staging) にデプロイ済み',
    });
    expect(s101.comments[1]).toEqual({
      seq: 2,
      author: 'Alice Smith',
      date: '2021-06-29',
      body: 'line1\nline2 (checked)',
    });
    expect(s101.comments[2]).toEqual({
      seq: 3,
      author: null,
      date: null,
      body: 'suffixなしのコメント',
    });
  });

  it('counts unparseable comment suffixes', () => {
    expect(unparsedCommentSuffixes).toBe(1);
  });

  it('pairs Task with Task Status by position', () => {
    expect(s101.tasks).toEqual([
      { seq: 1, description: 'テストを書く', status: 'completed' },
      { seq: 2, description: 'レビュー依頼', status: 'not completed' },
    ]);
  });

  it('packs iteration/blockers/reviews/PRs/branches into extra JSON', () => {
    const extra = JSON.parse(s101.extra!);
    expect(extra).toEqual({
      iteration: { number: '12', start: '2021-06-28', end: '2021-07-11' },
      blockers: [{ text: '依存タスク待ち', status: 'resolved' }],
      reviews: [{ type: 'code', reviewer: 'Alice Smith', status: 'pass' }],
      pull_requests: ['https://github.com/example/repo/pull/1'],
      git_branches: ['feature/kensa'],
    });
  });

  it('keeps multi-line quoted descriptions', () => {
    expect(s101.description).toBe('複数行の\n説明文です。');
  });

  it('rejects rows without a numeric Id', () => {
    expect(() => parseExportCsv('Id,Title\n,x\n')).toThrow(/Id/);
  });
});
