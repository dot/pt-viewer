# PivotalTracker export format notes

Findings from the ptosh export (2025-04-10). Applies to any project exported
with PivotalTracker's CSV export near end-of-service.

## Layout

```
<export-root>/
  <project>_YYYYMMDD_HHMMSS.csv           # main story export (UTF-8)
  project_history_<project>_*.csv          # activity log (usually negligible)
  <story_id>/                              # one folder per story WITH attachments
    <original filename>                    # flat, no subfolders
```

## Main CSV

- Wide format with **repeated column names**; parse positionally from the
  header row, never by unique name. Observed repeats: `Comment` ×65,
  `Task`/`Task Status` ×22, `Pull Request` ×7, `Git Branch` ×6,
  `Blocker`/`Blocker Status` ×4, `Owned By` ×3, `Review Type`/`Reviewer`/
  `Review Status` ×2. Repeat counts vary per export — derive them from the
  header, do not hardcode.
- **Rows are variable-length**: trailing empty cells are omitted. Pad each
  row to the header length before indexing.
- Fields are quoted CSV with embedded newlines (multi-line descriptions and
  comments). Use a real CSV parser.
- `Type` distinguishes `epic` rows from stories; both share the `Id`
  namespace and the `URL` column (`/story/show/<id>` or `/epic/show/<id>`).

## Comments

- Each non-empty `Comment` cell is one comment. Author and date are embedded
  as a trailing ` (Author Name - Mon DD, YYYY)` — strip with a regex anchored
  to end-of-string; the body itself may contain parentheses.
- No comment ids. Day-precision dates only; within a day the column order is
  the only ordering. Use 1-based occurrence order as `seq`.

## Users

- Display-name strings only (`Requested By`, `Owned By`, comment suffix,
  `Reviewer`). No emails or ids. Normalize by exact string match.

## Attachments

- Linked purely by folder-name = story id. The CSV has no attachment column.
- Original (often Japanese) filenames preserved. May contain sensitive
  medical-domain files — this repo stores metadata only, never the bodies.

## Dates

- Story CSV: `Mon DD, YYYY` (e.g. `Jun 29, 2021`), no time, no timezone.
- History CSV: ISO 8601 UTC.
