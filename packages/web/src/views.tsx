/** SSR views (hono/jsx). All dynamic text goes through JSX escaping; the only
 * raw() sinks are the outputs of renderMarkdown(), which escapes its input. */
import type { FC, Child } from "hono/jsx";
import { raw } from "hono/html";
import { renderMarkdown } from "./markdown";
import { extraSections } from "./extra";
import {
  SNIPPET_START,
  SNIPPET_END,
  type SearchFormState,
  type SearchResultRow,
} from "./search";
import type {
  AttachmentRow,
  CommentRow,
  ProjectRow,
  StoryRow,
  TaskRow,
} from "./types";

// ---------------------------------------------------------------- helpers

const TYPE_LABELS: Record<string, string> = {
  feature: "機能",
  bug: "バグ",
  chore: "雑務",
  release: "リリース",
  epic: "エピック",
};

const STATE_LABELS: Record<string, string> = {
  accepted: "受入済",
  delivered: "納品済",
  finished: "完了",
  started: "着手中",
  rejected: "差戻し",
  planned: "計画済",
  unstarted: "未着手",
  unscheduled: "未計画",
};

export const typeLabel = (t: string): string => TYPE_LABELS[t] ?? t;
export const stateLabel = (s: string): string => STATE_LABELS[s] ?? s;

export function humanSize(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes;
  let u = -1;
  do {
    v /= 1024;
    u++;
  } while (v >= 1024 && u < units.length - 1);
  return `${v >= 10 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}

// ---------------------------------------------------------------- atoms

const TypeBadge: FC<{ type: string }> = ({ type }) => {
  const style =
    type === "epic"
      ? "bg-indigo-50 text-indigo-700 ring-indigo-200"
      : type === "bug"
        ? "bg-gray-100 text-gray-700 ring-gray-300"
        : "bg-gray-50 text-gray-600 ring-gray-200";
  return (
    <span
      class={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}
    >
      {typeLabel(type)}
    </span>
  );
};

const StateBadge: FC<{ state: string | null }> = ({ state }) => {
  if (!state) return null;
  const emphasized = state === "accepted" || state === "delivered";
  return (
    <span
      class={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs ring-1 ring-inset ${
        emphasized
          ? "bg-indigo-600 text-white ring-indigo-600"
          : "bg-white text-gray-600 ring-gray-300"
      }`}
    >
      {stateLabel(state)}
    </span>
  );
};

/** FTS snippet: … delimited runs become <mark>. */
const SnippetText: FC<{ text: string }> = ({ text }) => {
  const nodes: Child[] = [];
  for (const [i, chunk] of text.split(SNIPPET_START).entries()) {
    if (i === 0) {
      nodes.push(chunk);
      continue;
    }
    const end = chunk.indexOf(SNIPPET_END);
    if (end === -1) {
      nodes.push(chunk);
      continue;
    }
    nodes.push(
      <mark class="rounded-sm bg-indigo-100 px-0.5 text-indigo-900">
        {chunk.slice(0, end)}
      </mark>
    );
    nodes.push(chunk.slice(end + 1));
  }
  return <>{nodes}</>;
};

/** Plain text with bare http(s) URLs turned into links (for extra items). */
const LinkifiedText: FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/(https?:\/\/[!-~]+)/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            href={part}
            class="break-all text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-800"
            rel="noopener noreferrer"
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </>
  );
};

const Markdown: FC<{ text: string }> = ({ text }) => (
  <div class="markdown-body text-sm leading-relaxed text-gray-800">
    {raw(renderMarkdown(text))}
  </div>
);

// ---------------------------------------------------------------- layout

export const Layout: FC<{ title: string; children?: Child }> = ({
  title,
  children,
}) => (
  <html lang="ja">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="robots" content="noindex" />
      <title>{title}</title>
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      <link rel="stylesheet" href="/styles.css" />
    </head>
    <body class="min-h-screen bg-gray-50 font-sans text-gray-900 antialiased">
      {children}
    </body>
  </html>
);

const Header: FC<{ project?: ProjectRow }> = ({ project }) => (
  <div class="mx-auto flex max-w-5xl items-baseline gap-3 px-4 py-3 sm:px-6">
    <a href="/" class="text-sm font-semibold tracking-tight text-gray-900">
      pt-viewer
    </a>
    {project && (
      <>
        <span class="text-gray-300">/</span>
        <a
          href={`/${project.slug}`}
          class="truncate text-sm font-medium text-indigo-700 hover:underline"
        >
          {project.name}
        </a>
      </>
    )}
  </div>
);

// ---------------------------------------------------------------- pages

export const ProjectListPage: FC<{ projects: ProjectRow[] }> = ({
  projects,
}) => (
  <Layout title="pt-viewer">
    <header class="border-b border-gray-200 bg-white">
      <Header />
    </header>
    <main class="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 class="text-lg font-semibold">プロジェクト</h1>
      <p class="mt-1 text-sm text-gray-500">
        PivotalTracker アーカイブの閲覧・検索
      </p>
      <ul class="mt-6 grid gap-3 sm:grid-cols-2">
        {projects.map((p) => (
          <li>
            <a
              href={`/${p.slug}`}
              class="block rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm transition hover:border-indigo-300 hover:shadow"
            >
              <span class="font-medium text-indigo-700">{p.name}</span>
              <span class="mt-0.5 block text-xs text-gray-500">/{p.slug}</span>
            </a>
          </li>
        ))}
        {projects.length === 0 && (
          <li class="text-sm text-gray-500">
            プロジェクトがまだ取り込まれていません。
          </li>
        )}
      </ul>
    </main>
  </Layout>
);

export interface SearchOptions {
  types: string[];
  states: string[];
  labels: string[];
  users: string[];
}

function queryString(f: SearchFormState, page: number): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({
    q: f.q,
    type: f.type,
    state: f.state,
    label: f.label,
    user: f.user,
    from: f.from,
    to: f.to,
  })) {
    if (v) p.set(k, v);
  }
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

const Select: FC<{
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
}> = ({ name, label, value, options }) => (
  <select
    name={name}
    aria-label={label}
    class="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-700 focus:border-indigo-500 focus:outline-none"
  >
    <option value="">{label}: すべて</option>
    {options.map((o) => (
      <option value={o.value} selected={o.value === value}>
        {o.label}
      </option>
    ))}
  </select>
);

const SearchForm: FC<{
  project: ProjectRow;
  form: SearchFormState;
  options: SearchOptions;
}> = ({ project, form, options }) => (
  <form method="get" action={`/${project.slug}`} class="flex flex-col gap-2">
    <div class="flex gap-2">
      <input
        type="search"
        name="q"
        value={form.q}
        placeholder="検索（タイトル・説明・コメント / #チケット番号）"
        class="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <button
        type="submit"
        class="h-9 shrink-0 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white transition hover:bg-indigo-500"
      >
        検索
      </button>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <Select
        name="type"
        label="種別"
        value={form.type}
        options={options.types.map((t) => ({ value: t, label: typeLabel(t) }))}
      />
      <Select
        name="state"
        label="状態"
        value={form.state}
        options={options.states.map((s) => ({
          value: s,
          label: stateLabel(s),
        }))}
      />
      <Select
        name="label"
        label="ラベル"
        value={form.label}
        options={options.labels.map((l) => ({ value: l, label: l }))}
      />
      <Select
        name="user"
        label="担当"
        value={form.user}
        options={options.users.map((u) => ({ value: u, label: u }))}
      />
      <label class="flex items-center gap-1 text-xs text-gray-500">
        作成日
        <input
          type="date"
          name="from"
          value={form.from}
          class="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-700 focus:border-indigo-500 focus:outline-none"
        />
        〜
        <input
          type="date"
          name="to"
          value={form.to}
          class="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-700 focus:border-indigo-500 focus:outline-none"
        />
      </label>
      <a
        href={`/${project.slug}`}
        class="text-xs text-gray-400 hover:text-gray-600"
      >
        クリア
      </a>
    </div>
  </form>
);

const ResultItem: FC<{ project: ProjectRow; row: SearchResultRow }> = ({
  project,
  row,
}) => {
  const storyHref = `/${project.slug}/stories/${row.id}`;
  return (
    <li class="px-5 py-4">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <a
          href={storyHref}
          class="font-medium text-indigo-700 hover:underline"
        >
          {row.title}
        </a>
        <TypeBadge type={row.story_type} />
        <StateBadge state={row.current_state} />
      </div>
      <div class="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-gray-500">
        <span>#{row.id}</span>
        {row.created_at && <span>作成日 {row.created_at}</span>}
      </div>
      {row.snippet != null && (
        <p class="mt-1.5 break-words text-sm text-gray-600">
          {row.comment_seq != null ? (
            <a
              href={`${storyHref}#comment-${row.comment_seq}`}
              class="group"
              title={`コメント ${row.comment_seq} へ移動`}
            >
              <span class="mr-1.5 inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 group-hover:bg-indigo-50 group-hover:text-indigo-700">
                コメント
              </span>
              <SnippetText text={row.snippet} />
            </a>
          ) : (
            <SnippetText text={row.snippet} />
          )}
        </p>
      )}
    </li>
  );
};

export const SearchPage: FC<{
  project: ProjectRow;
  form: SearchFormState;
  options: SearchOptions;
  results: SearchResultRow[];
  hasNext: boolean;
}> = ({ project, form, options, results, hasNext }) => (
  <Layout title={`${project.name} — pt-viewer`}>
    <header class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur">
      <Header project={project} />
      <div class="mx-auto max-w-5xl px-4 pb-3 sm:px-6">
        <SearchForm project={project} form={form} options={options} />
      </div>
    </header>
    <main class="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {results.length === 0 ? (
        <p class="py-16 text-center text-sm text-gray-500">
          該当するチケットが見つかりませんでした。
        </p>
      ) : (
        <ul class="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-sm">
          {results.map((row) => (
            <ResultItem project={project} row={row} />
          ))}
        </ul>
      )}
      <nav class="mt-6 flex items-center justify-between text-sm">
        {form.page > 1 ? (
          <a
            href={`/${project.slug}${queryString(form, form.page - 1)}`}
            class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-gray-700 hover:border-indigo-300 hover:text-indigo-700"
          >
            ← 前のページ
          </a>
        ) : (
          <span />
        )}
        {(form.page > 1 || hasNext) && (
          <span class="text-xs text-gray-400">{form.page} ページ目</span>
        )}
        {hasNext ? (
          <a
            href={`/${project.slug}${queryString(form, form.page + 1)}`}
            class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-gray-700 hover:border-indigo-300 hover:text-indigo-700"
          >
            次のページ →
          </a>
        ) : (
          <span />
        )}
      </nav>
    </main>
  </Layout>
);

// ---------------------------------------------------------------- story

const MetaRow: FC<{ label: string; children?: Child }> = ({
  label,
  children,
}) => (
  <div class="flex gap-3 py-1.5 text-sm">
    <dt class="w-20 shrink-0 text-gray-500">{label}</dt>
    <dd class="min-w-0 flex-1 text-gray-800">{children}</dd>
  </div>
);

const Section: FC<{ title: string; children?: Child }> = ({
  title,
  children,
}) => (
  <section class="mt-8">
    <h2 class="mb-3 text-sm font-semibold text-gray-900">{title}</h2>
    {children}
  </section>
);

export const StoryPage: FC<{
  project: ProjectRow;
  story: StoryRow;
  owners: string[];
  labels: string[];
  tasks: TaskRow[];
  comments: CommentRow[];
  attachments: AttachmentRow[];
}> = ({ project, story, owners, labels, tasks, comments, attachments }) => {
  const extras = extraSections(story.extra);
  return (
    <Layout title={`#${story.id} ${story.title} — ${project.name}`}>
      <header class="border-b border-gray-200 bg-white">
        <Header project={project} />
      </header>
      <main class="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <p class="text-xs text-gray-400">#{story.id}</p>
        <h1 class="mt-1 break-words text-xl font-semibold leading-snug text-gray-900">
          {story.title}
        </h1>
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <TypeBadge type={story.story_type} />
          <StateBadge state={story.current_state} />
          {story.priority && (
            <span class="inline-flex items-center rounded-md bg-white px-1.5 py-0.5 text-xs text-gray-600 ring-1 ring-inset ring-gray-300">
              優先度 {story.priority}
            </span>
          )}
          {story.estimate != null && (
            <span class="inline-flex items-center rounded-md bg-white px-1.5 py-0.5 text-xs text-gray-600 ring-1 ring-inset ring-gray-300">
              {story.estimate} pt
            </span>
          )}
          {labels.map((l) => (
            <a
              href={`/${project.slug}?label=${encodeURIComponent(l)}`}
              class="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700 hover:bg-indigo-100"
            >
              {l}
            </a>
          ))}
        </div>

        <dl class="mt-5 rounded-lg border border-gray-200 bg-white px-5 py-3 shadow-sm sm:columns-2">
          {story.requested_by && (
            <MetaRow label="依頼者">{story.requested_by}</MetaRow>
          )}
          {owners.length > 0 && (
            <MetaRow label="担当">{owners.join("、")}</MetaRow>
          )}
          {story.created_at && (
            <MetaRow label="作成日">{story.created_at}</MetaRow>
          )}
          {story.accepted_at && (
            <MetaRow label="受入日">{story.accepted_at}</MetaRow>
          )}
          {story.deadline && <MetaRow label="締切">{story.deadline}</MetaRow>}
          {story.url && (
            <MetaRow label="元URL">
              <a
                href={story.url}
                class="break-all text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-800"
                rel="noopener noreferrer"
              >
                {story.url}
              </a>
            </MetaRow>
          )}
        </dl>

        {story.description && (
          <Section title="説明">
            <div class="rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm">
              <Markdown text={story.description} />
            </div>
          </Section>
        )}

        {extras.length > 0 && (
          <Section title="関連情報">
            <dl class="rounded-lg border border-gray-200 bg-white px-5 py-3 text-sm shadow-sm">
              {extras.map((sec) => (
                <div class="flex gap-3 py-1.5">
                  <dt class="w-28 shrink-0 text-gray-500">{sec.label}</dt>
                  <dd class="min-w-0 flex-1 text-gray-800">
                    <ul class="space-y-0.5">
                      {sec.items.map((item) => (
                        <li class="break-words">
                          <LinkifiedText text={item} />
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

        {tasks.length > 0 && (
          <Section title={`タスク (${tasks.length})`}>
            <ul class="space-y-1.5 rounded-lg border border-gray-200 bg-white px-5 py-4 text-sm shadow-sm">
              {tasks.map((t) => {
                const done = t.status === "completed";
                return (
                  <li class="flex items-start gap-2">
                    <span
                      class={
                        done
                          ? "mt-px font-bold text-indigo-600"
                          : "mt-px text-gray-300"
                      }
                      aria-label={done ? "完了" : "未完了"}
                    >
                      {done ? "✓" : "○"}
                    </span>
                    <span
                      class={
                        done ? "text-gray-500 line-through" : "text-gray-800"
                      }
                    >
                      {t.description}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {attachments.length > 0 && (
          <Section title={`添付ファイル (${attachments.length})`}>
            <div class="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-gray-200 text-left text-xs text-gray-500">
                    <th class="px-5 py-2 font-medium">ファイル名</th>
                    <th class="px-3 py-2 font-medium">サイズ</th>
                    <th class="px-5 py-2 font-medium">パス（エクスポート内）</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  {attachments.map((a) => (
                    <tr>
                      <td class="break-all px-5 py-2 text-gray-800">
                        {a.filename}
                      </td>
                      <td class="whitespace-nowrap px-3 py-2 text-gray-500">
                        {humanSize(a.size)}
                      </td>
                      <td class="px-5 py-2">
                        <code class="select-all break-all rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">
                          {a.rel_path}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p class="mt-1.5 text-xs text-gray-400">
              ファイル本体は配信されません（メタデータのみ）。
            </p>
          </Section>
        )}

        {comments.length > 0 && (
          <Section title={`コメント (${comments.length})`}>
            <ol class="space-y-3">
              {comments.map((cm) => (
                <li
                  id={`comment-${cm.seq}`}
                  class="comment rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm"
                >
                  <div class="mb-2 flex flex-wrap items-baseline gap-x-2 text-xs">
                    <a
                      href={`#comment-${cm.seq}`}
                      class="font-mono text-gray-300 hover:text-indigo-600"
                      aria-label={`コメント ${cm.seq} への固定リンク`}
                    >
                      #
                    </a>
                    <span class="font-medium text-gray-700">
                      {cm.author ?? "（不明）"}
                    </span>
                    {cm.commented_on && (
                      <span class="text-gray-400">{cm.commented_on}</span>
                    )}
                  </div>
                  <Markdown text={cm.body} />
                </li>
              ))}
            </ol>
          </Section>
        )}
      </main>
    </Layout>
  );
};

export const NotFoundPage: FC = () => (
  <Layout title="404 — pt-viewer">
    <header class="border-b border-gray-200 bg-white">
      <Header />
    </header>
    <main class="mx-auto max-w-5xl px-4 py-24 text-center sm:px-6">
      <p class="text-5xl font-semibold text-gray-200">404</p>
      <p class="mt-4 text-sm text-gray-600">
        ページが見つかりません。プロジェクトまたはチケットが存在しません。
      </p>
      <a
        href="/"
        class="mt-6 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        トップへ戻る
      </a>
    </main>
  </Layout>
);
