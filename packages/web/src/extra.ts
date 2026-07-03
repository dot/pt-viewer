// Tolerant renderer-input for stories.extra JSON
// (blockers, reviews, pull_requests, git_branches, iteration — shape decided
// by the importer; we accept strings, objects, arrays or scalars defensively).

export interface ExtraSection {
  key: string;
  label: string;
  items: string[];
}

const SECTION_LABELS: [key: string, label: string][] = [
  ["blockers", "ブロッカー"],
  ["reviews", "レビュー"],
  ["pull_requests", "Pull Request"],
  ["git_branches", "Git ブランチ"],
  ["iteration", "イテレーション"],
];

function toItem(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(toItem).filter(Boolean).join(", ");
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .filter(([, val]) => val != null && val !== "")
      .map(([k, val]) => `${k}: ${toItem(val)}`)
      .join(" / ");
  }
  return "";
}

/** Parse stories.extra into displayable sections. Never throws. */
export function extraSections(extraJson: string | null | undefined): ExtraSection[] {
  if (!extraJson) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(extraJson);
  } catch {
    return [];
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return [];
  }
  const obj = parsed as Record<string, unknown>;
  const sections: ExtraSection[] = [];
  for (const [key, label] of SECTION_LABELS) {
    const value = obj[key];
    if (value == null) continue;
    const items = (Array.isArray(value) ? value : [value])
      .map(toItem)
      .filter((s) => s !== "");
    if (items.length) sections.push({ key, label, items });
  }
  return sections;
}
