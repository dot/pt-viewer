import { describe, expect, it } from 'vitest';
import { toIsoDate } from '../src/dates.js';

describe('toIsoDate', () => {
  it('converts Mon DD, YYYY to ISO', () => {
    expect(toIsoDate('Jun 29, 2021')).toBe('2021-06-29');
    expect(toIsoDate('Dec 31, 1999')).toBe('1999-12-31');
  });

  it('zero-pads single-digit days', () => {
    expect(toIsoDate('Jul 5, 2021')).toBe('2021-07-05');
    expect(toIsoDate('Jan 1, 2022')).toBe('2022-01-01');
  });

  it('tolerates surrounding whitespace', () => {
    expect(toIsoDate(' Feb 14, 2020 ')).toBe('2020-02-14');
  });

  it('returns null for empty input', () => {
    expect(toIsoDate('')).toBeNull();
    expect(toIsoDate('   ')).toBeNull();
  });

  it('returns null for unparseable input', () => {
    expect(toIsoDate('2021-06-29')).toBeNull();
    expect(toIsoDate('Foo 1, 2021')).toBeNull();
    expect(toIsoDate('Jun 29 2021')).toBeNull();
  });
});
