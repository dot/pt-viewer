const MONTHS: Record<string, string> = {
  Jan: '01',
  Feb: '02',
  Mar: '03',
  Apr: '04',
  May: '05',
  Jun: '06',
  Jul: '07',
  Aug: '08',
  Sep: '09',
  Oct: '10',
  Nov: '11',
  Dec: '12',
};

const DATE_RE = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}), (\d{4})$/;

/**
 * Convert an export date `Mon DD, YYYY` (e.g. `Jun 29, 2021`) to ISO
 * `YYYY-MM-DD`. Returns null for empty or unparseable input.
 */
export function toIsoDate(value: string): string | null {
  const m = DATE_RE.exec(value.trim());
  if (!m) return null;
  const month = MONTHS[m[1] as string];
  const day = (m[2] as string).padStart(2, '0');
  return `${m[3]}-${month}-${day}`;
}
