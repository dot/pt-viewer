# pt-viewer

Read-only search & viewer for PivotalTracker export data, so past ticket
history stays referenceable (and permalinkable from Linear) after
PivotalTracker's shutdown.

- **packages/importer** — CLI that parses a PivotalTracker CSV export and
  builds the SQLite database / D1-compatible SQL dump. See
  [docs/pivotal-export-format.md](docs/pivotal-export-format.md).
- **packages/web** — Hono SSR app on Cloudflare Workers, backed by D1.
  Full-text search (FTS5 trigram, Japanese-aware) plus ticket-number, date
  range, and user filters. Attachments are listed as metadata only.
- **db/schema.sql** — shared schema contract.
- **infra/** — Terraform for Cloudflare (DNS, D1, Access).

Authentication is handled in front of the app by Cloudflare Access;
the allowed-user list mirrors the Linear workspace members.

## Adding a project

1. Place the export under a local folder (CSV + per-story attachment dirs).
2. `packages/importer`: run the import with `--project <slug> --src <path>`.
3. Load the generated dump into D1 (`wrangler d1 execute --file`).

## Permalinks

- Story: `/{project}/stories/{pivotal_id}`
- Comment: `/{project}/stories/{pivotal_id}#comment-{seq}`

The generated database and export data contain project-internal content and
must never be committed.
