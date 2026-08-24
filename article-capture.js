/*
 * ClipNest shared page capture.
 *
 * Runs inside the webpage through chrome.scripting.
 * The popup and background Quick Clip both use this
 * exact same extractor.
 */

(() => {
  "use strict";

function extractPage() {
  const absoluteUrl = (value) => {
    try {
      return new URL(value, location.href).href;
    } catch {
      return "";
    }
  };

  const getMeta = (...selectors) => {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const value = node?.content || node?.getAttribute?.("content") || node?.textContent;
      if (value?.trim()) return value.trim();
    }
    return "";
  };

  const normalizeText = (text) => String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const inline = (node) => {
    if (!node) return "";
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const tag = node.tagName.toLowerCase();
    const content = [...node.childNodes].map(inline).join("");

    if (tag === "br") return "\n";
    if (tag === "strong" || tag === "b") return content.trim() ? `**${content.trim()}**` : "";
    if (tag === "em" || tag === "i") return content.trim() ? `*${content.trim()}*` : "";
    if (tag === "code") return content.trim() ? `\`${content.trim().replace(/`/g, "\\`")}\`` : "";
    if (tag === "a") {
      const href = absoluteUrl(node.getAttribute("href"));
      const label = normalizeText(content) || href;
      if (!href || /^javascript:/i.test(href)) return label;
      return `[${label}](${href})`;
    }
    if (tag === "img") {
      const src = absoluteUrl(node.currentSrc || node.getAttribute("src"));
      if (!src) return "";
      const alt = (node.getAttribute("alt") || "image").replace(/[\[\]]/g, "");
      return `![${alt}](${src})`;
    }

    return content;
  };

  const tableToMarkdown = (table) => {
    const rows = [...table.querySelectorAll("tr")].map((row) =>
      [...row.querySelectorAll(":scope > th, :scope > td")].map((cell) => normalizeText(cell.innerText).replace(/\|/g, "\\|"))
    ).filter((row) => row.length);

    if (!rows.length) return "";
    const width = Math.max(...rows.map((row) => row.length));
    const normalized = rows.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill("")]);
    const header = normalized[0];
    const divider = Array(width).fill("---");
    return [header, divider, ...normalized.slice(1)]
      .map((row) => `| ${row.join(" | ")} |`)
      .join("\n");
  };

  const block = (node, listDepth = 0) => {
    if (!node) return "";
    if (node.nodeType === Node.TEXT_NODE) return normalizeText(node.nodeValue || "");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const tag = node.tagName.toLowerCase();

    if (["script", "style", "noscript", "svg", "canvas", "form", "button", "nav", "footer"].includes(tag)) return "";

    if (/^h[1-6]$/.test(tag)) {
      const level = Math.min(Number(tag[1]), 4);
      const text = normalizeText(inline(node));
      return text ? `${"#".repeat(level)} ${text}\n\n` : "";
    }

    if (tag === "p") {
      const text = normalizeText(inline(node));
      return text ? `${text}\n\n` : "";
    }

    if (tag === "blockquote") {
      const text = normalizeText(node.innerText);
      return text ? `${text.split(/\r?\n/).map((line) => `> ${line}`).join("\n")}\n\n` : "";
    }

    if (tag === "pre") {
      const code = node.innerText.replace(/^\n+|\n+$/g, "");
      return code ? `\`\`\`\n${code}\n\`\`\`\n\n` : "";
    }

    if (tag === "hr") return "---\n\n";
    if (tag === "table") {
      const md = tableToMarkdown(node);
      return md ? `${md}\n\n` : "";
    }

    if (tag === "ul" || tag === "ol") {
      const ordered = tag === "ol";
      const items = [...node.children].filter((child) => child.tagName?.toLowerCase() === "li");
      const lines = items.map((item, index) => {
        const clone = item.cloneNode(true);
        clone.querySelectorAll("ul,ol").forEach((nested) => nested.remove());
        const text = normalizeText(inline(clone));
        const prefix = ordered ? `${index + 1}.` : "-";
        const own = `${"  ".repeat(listDepth)}${prefix} ${text}`;
        const nested = [...item.children]
          .filter((child) => ["ul", "ol"].includes(child.tagName?.toLowerCase()))
          .map((child) => block(child, listDepth + 1).trimEnd())
          .filter(Boolean)
          .join("\n");
        return nested ? `${own}\n${nested}` : own;
      });
      return lines.length ? `${lines.join("\n")}\n\n` : "";
    }

    if (tag === "img") {
      const md = inline(node);
      return md ? `${md}\n\n` : "";
    }

    const chunks = [...node.childNodes].map((child) => block(child, listDepth)).filter(Boolean);
    if (chunks.length) return chunks.join("");

    const fallback = normalizeText(inline(node));
    return fallback ? `${fallback}\n\n` : "";
  };

  const pickContentRoot = () => {
    const candidates = [
      ...document.querySelectorAll("article"),
      ...document.querySelectorAll("main"),
      ...document.querySelectorAll('[role="main"]')
    ];

    if (!candidates.length) return document.body;

    return candidates
      .map((element) => ({ element, score: normalizeText(element.innerText).length }))
      .sort((a, b) => b.score - a.score)[0].element;
  };

  const root = pickContentRoot().cloneNode(true);
  root.querySelectorAll([
    "script", "style", "noscript", "svg", "canvas", "form", "button", "nav", "footer",
    "[aria-hidden='true']", "[role='navigation']", "[role='banner']", "[role='contentinfo']",
    ".advertisement", ".ads", ".ad", ".cookie", ".newsletter", ".social-share"
  ].join(",")).forEach((node) => node.remove());

  const rawMarkdown = block(root);
  const markdown = rawMarkdown
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 500000);

  const selection = normalizeText(window.getSelection()?.toString() || "").slice(0, 50000);
  const title = getMeta('meta[property="og:title"]', 'meta[name="twitter:title"]') || document.title || "Untitled";
  const description = getMeta('meta[name="description"]', 'meta[property="og:description"]');
  const author = getMeta('meta[name="author"]', 'meta[property="article:author"]', '[rel="author"]');
  const siteName = getMeta('meta[property="og:site_name"]') || location.hostname;
  const image = absoluteUrl(getMeta('meta[property="og:image"]', 'meta[name="twitter:image"]'));

  return {
    title: normalizeText(title),
    url: location.href,
    hostname: location.hostname,
    siteName: normalizeText(siteName),
    author: normalizeText(author),
    description: normalizeText(description),
    image,
    selection,
    markdown
  };
}

  try {
    window.__clipnestPageCapture =
      extractPage();

    delete window.__clipnestPageCaptureError;
  } catch (error) {
    window.__clipnestPageCapture = null;

    window.__clipnestPageCaptureError =
      error?.message ||
      String(error);
  }
})();
