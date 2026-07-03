import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { parseCommentCell } from './comment.js';
import { toIsoDate } from './dates.js';
import type { ParseResult, ParsedComment, ParsedStory, ParsedTask } from './types.js';

/**
 * Locate the single main export CSV (`*_YYYYMMDD_*.csv`) directly in the
 * export root, excluding `project_history_*` files.
 */
export function findMainCsv(srcDir: string): string {
  const names = fs
    .readdirSync(srcDir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((n) => /_\d{8}_.*\.csv$/i.test(n) && !/^project_history/i.test(n));
  if (names.length === 0) {
    throw new Error(`no main export CSV (*_YYYYMMDD_*.csv) found in ${srcDir}`);
  }
  if (names.length > 1) {
    throw new Error(
      `expected exactly one main export CSV in ${srcDir}, found ${names.length}`,
    );
  }
  return path.join(srcDir, names[0] as string);
}

/**
 * Positional header map: for each (lower-cased) header name, the ordered list
 * of column indexes. The export repeats column names (`Comment` x65 etc.), so
 * columns must always be resolved positionally through this map.
 */
function buildHeaderMap(header: string[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  header.forEach((raw, i) => {
    const name = raw.trim().toLowerCase();
    const list = map.get(name);
    if (list) list.push(i);
    else map.set(name, [i]);
  });
  return map;
}

/** Parse the main export CSV text into stories. */
export function parseExportCsv(csvText: string): ParseResult {
  const rows: string[][] = parse(csvText, {
    bom: true,
    relax_column_count: true, // data rows omit trailing empty cells
    skip_empty_lines: true,
  });
  const header = rows[0];
  if (!header) throw new Error('export CSV is empty');
  const cols = buildHeaderMap(header);
  const all = (name: string): number[] => cols.get(name) ?? [];
  const first = (name: string): number | undefined => all(name)[0];

  const stories: ParsedStory[] = [];
  let unparsedCommentSuffixes = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as string[];
    // Rows are variable-length; missing trailing cells read as empty strings.
    const cell = (i: number | undefined): string =>
      i === undefined ? '' : (row[i] ?? '');
    const val = (name: string): string => cell(first(name)).trim();
    const opt = (name: string): string | null => val(name) || null;

    const id = Number(val('id'));
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error(`data row ${r}: missing or non-numeric Id column`);
    }

    const estimateRaw = val('estimate');
    const estimate = /^-?\d+$/.test(estimateRaw) ? Number(estimateRaw) : null;

    const labels: string[] = [];
    for (const piece of val('labels').split(',')) {
      const label = piece.trim();
      if (label && !labels.includes(label)) labels.push(label);
    }

    const owners: string[] = [];
    for (const i of all('owned by')) {
      const owner = cell(i).trim();
      if (owner && !owners.includes(owner)) owners.push(owner);
    }

    const comments: ParsedComment[] = [];
    for (const i of all('comment')) {
      const raw = cell(i);
      if (!raw.trim()) continue;
      const parsed = parseCommentCell(raw);
      if (!parsed.suffixParsed) unparsedCommentSuffixes++;
      comments.push({
        seq: comments.length + 1,
        author: parsed.author,
        date: parsed.date,
        body: parsed.body,
      });
    }

    const tasks: ParsedTask[] = [];
    const taskCols = all('task');
    const taskStatusCols = all('task status');
    for (let t = 0; t < taskCols.length; t++) {
      const description = cell(taskCols[t]).trim();
      if (!description) continue;
      tasks.push({
        seq: tasks.length + 1,
        description,
        status: cell(taskStatusCols[t]).trim() || null,
      });
    }

    stories.push({
      id,
      title: val('title'),
      storyType: val('type'),
      currentState: opt('current state'),
      priority: opt('priority'),
      estimate,
      requestedBy: opt('requested by'),
      createdAt: toIsoDate(val('created at')),
      acceptedAt: toIsoDate(val('accepted at')),
      deadline: toIsoDate(val('deadline')),
      description: cell(first('description')).trim() || null,
      url: opt('url'),
      labels,
      owners,
      comments,
      tasks,
      extra: buildExtra(cell, all, val),
    });
  }

  return { stories, unparsedCommentSuffixes };
}

/**
 * Pack the long-tail columns (iteration, blockers, reviews, pull requests,
 * git branches) into the `extra` JSON column. Empty keys are omitted; returns
 * null when nothing is present.
 */
function buildExtra(
  cell: (i: number | undefined) => string,
  all: (name: string) => number[],
  val: (name: string) => string,
): string | null {
  const extra: Record<string, unknown> = {};

  const iteration: Record<string, string> = {};
  const iterationNumber = val('iteration');
  const iterationStart = val('iteration start');
  const iterationEnd = val('iteration end');
  if (iterationNumber) iteration.number = iterationNumber;
  if (iterationStart) iteration.start = toIsoDate(iterationStart) ?? iterationStart;
  if (iterationEnd) iteration.end = toIsoDate(iterationEnd) ?? iterationEnd;
  if (Object.keys(iteration).length > 0) extra.iteration = iteration;

  const blockers: { text: string; status?: string }[] = [];
  const blockerCols = all('blocker');
  const blockerStatusCols = all('blocker status');
  for (let i = 0; i < blockerCols.length; i++) {
    const text = cell(blockerCols[i]).trim();
    if (!text) continue;
    const status = cell(blockerStatusCols[i]).trim();
    blockers.push(status ? { text, status } : { text });
  }
  if (blockers.length > 0) extra.blockers = blockers;

  const reviews: { type?: string; reviewer?: string; status?: string }[] = [];
  const reviewTypeCols = all('review type');
  const reviewerCols = all('reviewer');
  const reviewStatusCols = all('review status');
  const reviewCount = Math.max(
    reviewTypeCols.length,
    reviewerCols.length,
    reviewStatusCols.length,
  );
  for (let i = 0; i < reviewCount; i++) {
    const type = cell(reviewTypeCols[i]).trim();
    const reviewer = cell(reviewerCols[i]).trim();
    const status = cell(reviewStatusCols[i]).trim();
    if (!type && !reviewer && !status) continue;
    const review: { type?: string; reviewer?: string; status?: string } = {};
    if (type) review.type = type;
    if (reviewer) review.reviewer = reviewer;
    if (status) review.status = status;
    reviews.push(review);
  }
  if (reviews.length > 0) extra.reviews = reviews;

  const pullRequests = all('pull request')
    .map((i) => cell(i).trim())
    .filter(Boolean);
  if (pullRequests.length > 0) extra.pull_requests = pullRequests;

  const gitBranches = all('git branch')
    .map((i) => cell(i).trim())
    .filter(Boolean);
  if (gitBranches.length > 0) extra.git_branches = gitBranches;

  return Object.keys(extra).length > 0 ? JSON.stringify(extra) : null;
}
