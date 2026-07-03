import { parseArgs } from 'node:util';
import { runImport } from './importer.js';

const USAGE = `Usage: npx tsx src/cli.ts --project <slug> --name <display name> --src <export dir> --out <path.sqlite3> [--dump <path.sql>]

Converts a PivotalTracker CSV export into a SQLite database and, optionally,
a Cloudflare-D1-compatible SQL dump. Run once per project (one output DB per
run). Output logs contain aggregate counts only — never ticket contents.`;

function main(): void {
  const { values } = parseArgs({
    options: {
      project: { type: 'string' },
      name: { type: 'string' },
      src: { type: 'string' },
      out: { type: 'string' },
      dump: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    console.log(USAGE);
    return;
  }
  const missing = (['project', 'name', 'src', 'out'] as const).filter(
    (k) => !values[k],
  );
  if (missing.length > 0) {
    console.error(`missing required option(s): ${missing.map((k) => `--${k}`).join(', ')}`);
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const stats = runImport({
    slug: values.project as string,
    name: values.name as string,
    srcDir: values.src as string,
    outPath: values.out as string,
    dumpPath: values.dump,
  });

  // Privacy: print aggregate counts only. Never titles, bodies, filenames,
  // or user names.
  console.log(`project: ${values.project}`);
  console.log(`stories: ${stats.stories}`);
  for (const [type, n] of Object.entries(stats.storiesByType)) {
    console.log(`  ${type}: ${n}`);
  }
  console.log(`comments: ${stats.comments}`);
  console.log(`  unparsed author/date suffixes: ${stats.unparsedCommentSuffixes}`);
  console.log(`users: ${stats.users}`);
  console.log(`tasks: ${stats.tasks}`);
  console.log(`labels: ${stats.labels}`);
  console.log(`attachments: ${stats.attachments}`);
  console.log(`orphan attachment folders: ${stats.orphanAttachmentFolders}`);
  if (stats.dumpOversizedStatements !== undefined) {
    console.log(`dump statements over byte budget: ${stats.dumpOversizedStatements}`);
  }
}

main();
