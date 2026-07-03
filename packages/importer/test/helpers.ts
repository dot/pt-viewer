/** Render rows as quoted CSV (every field quoted, quotes doubled). */
export function toCsv(rows: string[][]): string {
  return (
    rows
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n') + '\n'
  );
}

/**
 * Fixture header mimicking the real export: repeated column names
 * (Owned By x3, Blocker/Blocker Status x2, Comment x3, Task/Task Status x2,
 * Pull Request x2, Git Branch x1, Review triple x2).
 */
export const FIXTURE_HEADER = [
  'Id',
  'Title',
  'Labels',
  'Iteration',
  'Iteration Start',
  'Iteration End',
  'Type',
  'Estimate',
  'Priority',
  'Current State',
  'Created at',
  'Accepted at',
  'Deadline',
  'Requested By',
  'Description',
  'URL',
  'Owned By',
  'Owned By',
  'Owned By',
  'Blocker',
  'Blocker Status',
  'Blocker',
  'Blocker Status',
  'Comment',
  'Comment',
  'Comment',
  'Task',
  'Task Status',
  'Task',
  'Task Status',
  'Pull Request',
  'Pull Request',
  'Git Branch',
  'Review Type',
  'Reviewer',
  'Review Status',
  'Review Type',
  'Reviewer',
  'Review Status',
];

/** Full-length row: story 101 exercising every parsed field. */
export const STORY_101_ROW = [
  '101',
  '検査結果画面の改善',
  ' api, 検査 ,,ui ',
  '12',
  'Jun 28, 2021',
  'Jul 11, 2021',
  'feature',
  '2',
  'p2 - High',
  'accepted',
  'Jun 29, 2021',
  'Jul 5, 2021',
  '',
  '山田 太郎',
  '複数行の\n説明文です。',
  'https://www.pivotaltracker.com/story/show/101',
  'Alice Smith',
  '山田 太郎',
  '',
  '依存タスク待ち',
  'resolved',
  '',
  '',
  'ステージング (staging) にデプロイ済み (山田 太郎 - Jul 1, 2021)',
  'line1\nline2 (checked)\n(Alice Smith - Jun 29, 2021)',
  'suffixなしのコメント',
  'テストを書く',
  'completed',
  'レビュー依頼',
  'not completed',
  'https://github.com/example/repo/pull/1',
  '',
  'feature/kensa',
  'code',
  'Alice Smith',
  'pass',
  '',
  '',
  '',
];

/** Variable-length row (trailing cells omitted after URL): story 102. */
export const STORY_102_ROW = [
  '102',
  "バグ修正 (it's broken)",
  '',
  '',
  '',
  '',
  'bug',
  '',
  '',
  'started',
  'Jul 2, 2021',
  '',
  'Jul 30, 2021',
  'Alice Smith',
  '',
  'https://www.pivotaltracker.com/story/show/102',
];

/** Even shorter variable-length row: epic 103. */
export const STORY_103_ROW = [
  '103',
  'リリース計画',
  '',
  '',
  '',
  '',
  'epic',
  '',
  '',
  '',
  'Jan 1, 2022',
];

export function fixtureCsv(): string {
  return toCsv([FIXTURE_HEADER, STORY_101_ROW, STORY_102_ROW, STORY_103_ROW]);
}
