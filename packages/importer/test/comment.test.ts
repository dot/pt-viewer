import { describe, expect, it } from 'vitest';
import { COMMENT_SUFFIX_RE, parseCommentCell } from '../src/comment.js';

describe('COMMENT_SUFFIX_RE', () => {
  it('matches a plain trailing suffix', () => {
    const m = COMMENT_SUFFIX_RE.exec('Done (Bob Tanaka - Jun 29, 2021)');
    expect(m?.[1]).toBe('Bob Tanaka');
    expect(m?.[2]).toBe('Jun 29, 2021');
  });

  it('does not match when the suffix is not at the end', () => {
    expect(
      COMMENT_SUFFIX_RE.test('prefix (Bob - Jun 29, 2021) trailing text'),
    ).toBe(false);
  });

  it('does not match a parenthesized remark without a valid date', () => {
    expect(COMMENT_SUFFIX_RE.test('note (see - the spec)')).toBe(false);
    expect(COMMENT_SUFFIX_RE.test('done (Bob - someday)')).toBe(false);
  });

  it('keeps author names containing " - " intact (greedy match)', () => {
    const m = COMMENT_SUFFIX_RE.exec('x (Foo - Bar - Jun 1, 2021)');
    expect(m?.[1]).toBe('Foo - Bar');
    expect(m?.[2]).toBe('Jun 1, 2021');
  });
});

describe('parseCommentCell', () => {
  it('splits body and suffix, converting the date to ISO', () => {
    const c = parseCommentCell('Done (Bob Tanaka - Jun 29, 2021)');
    expect(c).toEqual({
      body: 'Done',
      author: 'Bob Tanaka',
      date: '2021-06-29',
      suffixParsed: true,
    });
  });

  it('is not confused by parentheses inside the body', () => {
    const c = parseCommentCell(
      'ステージング (staging) にデプロイ済み (山田 太郎 - Jul 1, 2021)',
    );
    expect(c.body).toBe('ステージング (staging) にデプロイ済み');
    expect(c.author).toBe('山田 太郎');
    expect(c.date).toBe('2021-07-01');
  });

  it('handles multi-line bodies with a suffix on the last line', () => {
    const c = parseCommentCell('line1\nline2 (checked)\n(Alice Smith - Jun 29, 2021)');
    expect(c.body).toBe('line1\nline2 (checked)');
    expect(c.author).toBe('Alice Smith');
    expect(c.date).toBe('2021-06-29');
  });

  it('keeps the full text when the suffix is missing', () => {
    const c = parseCommentCell('suffixなしのコメント');
    expect(c).toEqual({
      body: 'suffixなしのコメント',
      author: null,
      date: null,
      suffixParsed: false,
    });
  });

  it('ignores trailing whitespace after the suffix', () => {
    const c = parseCommentCell('ok (Bob - Jun 1, 2021)  \n');
    expect(c.author).toBe('Bob');
    expect(c.body).toBe('ok');
  });

  it('allows an empty body (suffix-only cell)', () => {
    const c = parseCommentCell('(Bob - Jun 1, 2021)');
    expect(c.body).toBe('');
    expect(c.suffixParsed).toBe(true);
  });
});
