import { describe, expect, it } from "vitest";
import { escapeHtml, renderMarkdown } from "../src/markdown";

describe("escapeHtml", () => {
  it("escapes all HTML metacharacters", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&`)).toBe(
      "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;"
    );
  });
});

describe("renderMarkdown — XSS safety", () => {
  it("escapes script tags", () => {
    const html = renderMarkdown("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes event-handler injection", () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("does not linkify javascript: URLs in markdown links", () => {
    const html = renderMarkdown("[click](javascript:alert(1))");
    expect(html).not.toContain("<a");
    expect(html).not.toContain("href");
    // stays as inert plain text
    expect(html).toContain("[click](javascript:alert(1))");
  });

  it("does not linkify data: URLs", () => {
    const html = renderMarkdown("[x](data:text/html,<script>alert(1)</script>)");
    expect(html).not.toContain("<a");
  });

  it("cannot break out of a link href with quotes", () => {
    const html = renderMarkdown('[x](https://example.com/"onmouseover="alert(1))');
    // any embedded quote stays entity-escaped inside the attribute value
    expect(html).not.toContain('"onmouseover');
    expect(html).not.toMatch(/href="[^"]*" *onmouseover/);
  });

  it("escapes HTML inside code blocks and code spans", () => {
    expect(renderMarkdown("```\n<b>bold</b>\n```")).toContain(
      "&lt;b&gt;bold&lt;/b&gt;"
    );
    expect(renderMarkdown("`<i>x</i>`")).toContain("&lt;i&gt;x&lt;/i&gt;");
  });

  it("escapes HTML in headings and list items", () => {
    expect(renderMarkdown("# <script>x</script>")).toContain("&lt;script&gt;");
    expect(renderMarkdown("- <script>x</script>")).toContain("&lt;script&gt;");
  });
});

describe("renderMarkdown — elements", () => {
  it("renders headings by level", () => {
    expect(renderMarkdown("# 見出し1")).toBe("<h1>見出し1</h1>");
    expect(renderMarkdown("### 見出し3")).toBe("<h3>見出し3</h3>");
  });

  it("renders bold, italic and inline code", () => {
    expect(renderMarkdown("**強調** と *斜体* と `code`")).toBe(
      "<p><strong>強調</strong> と <em>斜体</em> と <code>code</code></p>"
    );
  });

  it("does not apply markdown inside code spans", () => {
    expect(renderMarkdown("`**not bold**`")).toBe(
      "<p><code>**not bold**</code></p>"
    );
  });

  it("renders fenced code blocks preserving content", () => {
    const html = renderMarkdown("```ruby\ndef foo\n  1 + 1\nend\n```");
    expect(html).toBe("<pre><code>def foo\n  1 + 1\nend</code></pre>");
  });

  it("handles an unterminated fence without crashing", () => {
    expect(renderMarkdown("```\nabc")).toBe("<pre><code>abc</code></pre>");
  });

  it("renders markdown links for http(s) only", () => {
    expect(renderMarkdown("[リンク](https://example.com/a?b=c)")).toBe(
      '<p><a href="https://example.com/a?b=c">リンク</a></p>'
    );
  });

  it("autolinks bare URLs", () => {
    const html = renderMarkdown("see https://example.com/x 参照");
    expect(html).toContain('<a href="https://example.com/x">');
  });

  it("renders unordered and ordered lists", () => {
    expect(renderMarkdown("- 一つ目\n- 二つ目")).toBe(
      "<ul><li>一つ目</li><li>二つ目</li></ul>"
    );
    expect(renderMarkdown("1. 手順一\n2. 手順二")).toBe(
      "<ol><li>手順一</li><li>手順二</li></ol>"
    );
  });

  it("keeps hard line breaks inside a paragraph", () => {
    expect(renderMarkdown("一行目\n二行目")).toBe("<p>一行目<br>二行目</p>");
  });

  it("splits paragraphs on blank lines", () => {
    expect(renderMarkdown("段落一\n\n段落二")).toBe(
      "<p>段落一</p>\n<p>段落二</p>"
    );
  });

  it("preserves Japanese text and long lines verbatim (escaped only)", () => {
    const long = "検査結果の表示について、" + "あ".repeat(200);
    expect(renderMarkdown(long)).toBe(`<p>${long}</p>`);
  });

  it("normalizes CRLF", () => {
    expect(renderMarkdown("a\r\nb")).toBe("<p>a<br>b</p>");
  });
});
