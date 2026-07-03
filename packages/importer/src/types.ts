/** One comment parsed out of a `Comment` cell. */
export interface ParsedComment {
  /** 1-based occurrence order within the story row (permalink anchor). */
  seq: number;
  /** Display name from the trailing suffix, or null when the suffix was absent/unparseable. */
  author: string | null;
  /** ISO `YYYY-MM-DD` from the trailing suffix, or null. */
  date: string | null;
  body: string;
}

export interface ParsedTask {
  /** 1-based occurrence order within the story row. */
  seq: number;
  description: string;
  status: string | null;
}

/** One data row of the main export CSV (story or epic). */
export interface ParsedStory {
  id: number;
  title: string;
  storyType: string;
  currentState: string | null;
  priority: string | null;
  estimate: number | null;
  requestedBy: string | null;
  createdAt: string | null;
  acceptedAt: string | null;
  deadline: string | null;
  description: string | null;
  url: string | null;
  labels: string[];
  /** Owner display names in column order (deduplicated). */
  owners: string[];
  comments: ParsedComment[];
  tasks: ParsedTask[];
  /** JSON string for the `extra` column, or null when nothing to pack. */
  extra: string | null;
}

export interface ParseResult {
  stories: ParsedStory[];
  /** Comment cells whose trailing author/date suffix could not be parsed. */
  unparsedCommentSuffixes: number;
}

export interface AttachmentRow {
  storyId: number;
  filename: string;
  size: number;
  /** Path relative to the export root, e.g. `165240043/screenshot.png`. */
  relPath: string;
}

export interface AttachmentScanResult {
  attachments: AttachmentRow[];
  /** All-digit folders whose name matches no story id (expected 0). */
  orphanFolders: number;
}
