// Minimal, XSS-safe markdown renderer for story descriptions and comments.
// Strategy: ALL text is HTML-escaped first, then a small set of markdown
// constructs is applied on the escaped text. Only http(s) URLs become links.

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

// Placeholder markers for already-rendered <a> tags so later inline passes
// (bold/italic/autolink) never touch them. \x00 cannot occur in input text.
const HOLE = "\u0000";

/** Inline markdown on ONE already-plain line. Returns safe HTML. */
function renderInline(text: string): string {
  const out: string[] = [];
  // Handle `code` spans first; their contents get no further processing.
  const parts = text.replaceAll(HOLE, "").split(/(`[^`]+`)/);
  for (const part of parts) {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      out.push(`<code>${escapeHtml(part.slice(1, -1))}</code>`);
      continue;
    }
    let t = escapeHtml(part);
    const holes: string[] = [];
    // [text](http(s)://...) — scheme allowlist prevents javascript: etc.
    t = t.replace(
      /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g,
      (_m, label: string, url: string) => {
        holes.push(`<a href="${url}">${label || url}</a>`);
        return `${HOLE}${holes.length - 1}${HOLE}`;
      }
    );
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    // Autolink bare URLs (ASCII run; escaped text has no raw <>"').
    t = t.replace(/https?:\/\/[!-~]+/g, (url) => {
      holes.push(`<a href="${url}">${url}</a>`);
      return `${HOLE}${holes.length - 1}${HOLE}`;
    });
    t = t.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => holes[Number(i)] ?? "");
    out.push(t);
  }
  return out.join("");
}

/**
 * Render markdown-ish text to safe HTML. Supports: headings (# .. ######),
 * fenced code blocks, unordered/ordered lists, bold/italic/inline code,
 * http(s) links + autolink, paragraphs with hard line breaks.
 */
export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let para: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) {
      html.push(`<p>${para.map(renderInline).join("<br>")}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      html.push(
        `<${list.tag}>` +
          list.items.map((it) => `<li>${it}</li>`).join("") +
          `</${list.tag}>`
      );
      list = null;
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] as string;

    if (/^```/.test(line)) {
      flushPara();
      flushList();
      i++;
      const code: string[] = [];
      while (i < lines.length && !/^```/.test(lines[i] as string)) {
        code.push(lines[i] as string);
        i++;
      }
      i++; // skip closing fence (or run past EOF on unterminated fence)
      html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      const level = (heading[1] as string).length;
      html.push(`<h${level}>${renderInline(heading[2] as string)}</h${level}>`);
      i++;
      continue;
    }

    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    if (ul) {
      flushPara();
      if (!list || list.tag !== "ul") {
        flushList();
        list = { tag: "ul", items: [] };
      }
      list.items.push(renderInline(ul[1] as string));
      i++;
      continue;
    }

    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ol) {
      flushPara();
      if (!list || list.tag !== "ol") {
        flushList();
        list = { tag: "ol", items: [] };
      }
      list.items.push(renderInline(ol[1] as string));
      i++;
      continue;
    }

    if (line.trim() === "") {
      flushPara();
      flushList();
      i++;
      continue;
    }

    flushList(); // a normal text line terminates a list
    para.push(line);
    i++;
  }
  flushPara();
  flushList();
  return html.join("\n");
}
