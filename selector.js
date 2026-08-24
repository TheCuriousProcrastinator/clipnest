(() => {
  if (window.__clipToObsidianAreaSelector?.cleanup) {
    window.__clipToObsidianAreaSelector.cleanup();
  }

  const state = {
    target: null,
    done: false,
    parentHistory: []
  };

  const normalizeText = (text) =>
    String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  const absoluteUrl = (value) => {
    try {
      return new URL(value, location.href).href;
    } catch {
      return "";
    }
  };

  const inline = (node) => {
    if (!node) return "";

    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue || "";
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const tag = node.tagName.toLowerCase();

    const content = [...node.childNodes]
      .map(inline)
      .join("");

    if (tag === "br") return "\n";

    if (tag === "strong" || tag === "b") {
      return content.trim()
        ? `**${content.trim()}**`
        : "";
    }

    if (tag === "em" || tag === "i") {
      return content.trim()
        ? `*${content.trim()}*`
        : "";
    }

    if (tag === "code") {
      return content.trim()
        ? `\`${content.trim().replace(/`/g, "\\`")}\``
        : "";
    }

    if (tag === "a") {
      const href = absoluteUrl(node.getAttribute("href"));
      const label = normalizeText(content);

      if (!label) {
        return "";
      }

      if (!href || /^javascript:/i.test(href)) {
        return label;
      }

      return `[${label.replace(/\]/g, "\\]")}](${href.replace(/\)/g, "%29")})`;
    }

    if (tag === "img") {
      const src = absoluteUrl(
        node.currentSrc || node.getAttribute("src")
      );

      if (!src || /^data:/i.test(src)) {
        return "";
      }

      const alt = (
        node.getAttribute("alt") || "image"
      ).replace(/[\[\]]/g, "");

      return `![${alt}](${src.replace(/\)/g, "%29")})`;
    }

    return content;
  };

  const tableToMarkdown = (table) => {
    const rows = [...table.querySelectorAll("tr")]
      .map((row) =>
        [
          ...row.querySelectorAll(
            ":scope > th, :scope > td"
          )
        ].map((cell) =>
          normalizeText(cell.innerText)
            .replace(/\|/g, "\\|")
        )
      )
      .filter((row) => row.length);

    if (!rows.length) return "";

    const width = Math.max(
      ...rows.map((row) => row.length)
    );

    const normalized = rows.map((row) => [
      ...row,
      ...Array(
        Math.max(0, width - row.length)
      ).fill("")
    ]);

    const divider = Array(width).fill("---");

    return [
      normalized[0],
      divider,
      ...normalized.slice(1)
    ]
      .map((row) => `| ${row.join(" | ")} |`)
      .join("\n");
  };


  const tableCell = (value) =>
    normalizeText(value)
      .replace(/\|/g, "\\|")
      .replace(/\r?\n+/g, " ")
      .trim();

  const markdownTable = (headers, rows) => {
    if (!headers.length || !rows.length) {
      return "";
    }

    const safeHeaders = headers.map((header) =>
      tableCell(header || "Field")
    );

    const width = safeHeaders.length;

    const safeRows = rows.map((row) => {
      const normalized = row
        .slice(0, width)
        .map((cell) => tableCell(cell));

      while (normalized.length < width) {
        normalized.push("");
      }

      return normalized;
    });

    return [
      `| ${safeHeaders.join(" | ")} |`,
      `| ${safeHeaders.map(() => "---").join(" | ")} |`,
      ...safeRows.map((row) => `| ${row.join(" | ")} |`)
    ].join("\n");
  };

  const ignoredFieldPatterns = [
    /^[-–—]+$/,
    /^loading(?:\.{3}|…)?$/i,
    /^claim$/i,
    /^fulfill$/i,
    /^open link$/i
  ];

  const extractCardFields = (root) => {
    const fields = [];

    const blockish = new Set([
      "address",
      "article",
      "dd",
      "details",
      "div",
      "dl",
      "dt",
      "figcaption",
      "figure",
      "footer",
      "header",
      "li",
      "main",
      "p",
      "section",
      "summary"
    ]);

    const ignored = new Set([
      "button",
      "canvas",
      "form",
      "input",
      "nav",
      "noscript",
      "option",
      "script",
      "select",
      "style",
      "svg",
      "textarea"
    ]);

    const push = (value) => {
      let text = normalizeText(value);

      if (!text) return;
      if (text.length > 400) return;

      if (
        ignoredFieldPatterns.some((pattern) =>
          pattern.test(text)
        )
      ) {
        return;
      }

      if (fields[fields.length - 1] === text) {
        return;
      }

      fields.push(text);
    };

    const visit = (node) => {
      if (!(node instanceof Element)) {
        return;
      }

      const tag = node.tagName.toLowerCase();

      if (ignored.has(tag)) {
        return;
      }

      if (
        node.hidden ||
        node.getAttribute("aria-hidden") === "true"
      ) {
        return;
      }

      const children = [...node.children].filter((child) => {
        const childTag = child.tagName.toLowerCase();

        return (
          !ignored.has(childTag) &&
          !child.hidden &&
          child.getAttribute("aria-hidden") !== "true"
        );
      });

      const blockChildren = children.filter((child) =>
        blockish.has(child.tagName.toLowerCase())
      );

      const directText = normalizeText(
        [...node.childNodes]
          .filter(
            (child) =>
              child.nodeType === Node.TEXT_NODE
          )
          .map((child) => child.nodeValue || "")
          .join(" ")
      );

      if (directText) {
        push(directText);
      }

      if (!blockChildren.length) {
        if (!directText) {
          push(node.innerText || node.textContent || "");
        }

        return;
      }

      for (const child of children) {
        visit(child);
      }
    };

    visit(root);

    return fields;
  };

  const looksLikeYearRange = (value) =>
    /^(?:\d{3,4}|unknown)\s*[–—-]\s*(?:\d{3,4}|unknown)$/i.test(
      value
    );

  const looksLikeDistance = (value) =>
    /^\d+(?:\.\d+)?\s*(?:mile|miles|mi|km)\b.*$/i.test(
      value
    );

  const looksLikeStatus = (value) =>
    /^(?:open|closed|pending|claimed|fulfilled|active|inactive|available|unavailable)$/i.test(
      value
    );

  const cleanRequestedBy = (value) => {
    let text = String(value || "")
      .replace(/^Requested\s+By\s*:\s*/i, "")
      .trim();

    text = text.replace(
      /([A-Za-z0-9_.')])on\s+(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})$/i,
      "$1 on $2"
    );

    return text;
  };

  const cardAnchorInfo = (card) => {
    return [...card.querySelectorAll("a")]
      .map((anchor) => {
        const label =
          normalizeText(
            anchor.textContent || ""
          );

        const href =
          absoluteUrl(
            anchor.getAttribute("href")
          );

        return {
          label,
          href
        };
      })
      .filter(({ label, href }) => {
        if (!label || !href) {
          return false;
        }

        if (
          /^javascript:/i.test(href) ||
          href.includes("/null") ||
          href.includes("#prompt-signup")
        ) {
          return false;
        }

        return true;
      });
  };

  const markdownLink = (
    label,
    href
  ) => {
    const safeLabel =
      String(label || "")
        .replace(/\\/g, "\\\\")
        .replace(/\[/g, "\\[")
        .replace(/\]/g, "\\]");

    const safeHref =
      String(href || "")
        .replace(/\(/g, "%28")
        .replace(/\)/g, "%29")
        .replace(/ /g, "%20");

    return `[${safeLabel}](${safeHref})`;
  };

  const linkCardExactValue = (
    card,
    value
  ) => {
    const text =
      normalizeText(value);

    if (!text) {
      return "";
    }

    const match =
      cardAnchorInfo(card).find(
        ({ label }) =>
          label === text
      );

    return match
      ? markdownLink(
          text,
          match.href
        )
      : text;
  };

  const linkRequestedByValue = (
    card,
    value
  ) => {
    const text =
      normalizeText(value);

    if (!text) {
      return "";
    }

    const match =
      text.match(
        /^(.+?)\s+on\s+(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})$/i
      );

    if (!match) {
      return linkCardExactValue(
        card,
        text
      );
    }

    const person =
      match[1].trim();

    const date =
      match[2].trim();

    const linkedPerson =
      linkCardExactValue(
        card,
        person
      );

    return `${linkedPerson} on ${date}`;
  };

  const semanticRowsFromCards = (cards) => {
    const combinedPattern =
      /^((?:\d{3,4}|unknown)\s*[–—-]\s*(?:\d{3,4}|unknown))\s*[–—-]\s*Requested\s+By\s*:\s*(.+)$/i;

    const rows = cards.map((card) => {
      const fields = extractCardFields(card);

      const distanceIndex = fields.findIndex(
        looksLikeDistance
      );

      const statusIndex = fields.findIndex(
        looksLikeStatus
      );

      const combinedIndex = fields.findIndex((value) =>
        combinedPattern.test(value)
      );

      if (
        combinedIndex > 0 &&
        distanceIndex > combinedIndex
      ) {
        const match =
          fields[combinedIndex].match(combinedPattern);

        if (!match) {
          return null;
        }

        const name =
          fields[combinedIndex - 1] ||
          fields[0] ||
          "";

        const years = match[1].trim();
        const requestedBy = cleanRequestedBy(
          `Requested By: ${match[2].trim()}`
        );

        const details = fields
          .slice(combinedIndex + 1, distanceIndex)
          .filter(
            (value) =>
              !looksLikeDistance(value) &&
              !looksLikeStatus(value)
          );

        const cemetery =
          details[0] || "";

        const location =
          details.slice(1).join(", ");

        const distance =
          fields[distanceIndex] || "";

        const status =
          statusIndex >= 0
            ? fields[statusIndex]
            : "";

        return [
          linkCardExactValue(
            card,
            name
          ),
          years,
          linkRequestedByValue(
            card,
            requestedBy
          ),
          linkCardExactValue(
            card,
            cemetery
          ),
          location,
          distance,
          status
        ];
      }

      const yearIndex = fields.findIndex(
        looksLikeYearRange
      );

      const requestedIndex = fields.findIndex((value) =>
        /^Requested\s+By\s*:/i.test(value)
      );

      if (
        yearIndex <= 0 ||
        requestedIndex < 0 ||
        distanceIndex < 0
      ) {
        return null;
      }

      const name =
        fields[yearIndex - 1] ||
        fields[0] ||
        "";

      const years =
        fields[yearIndex] || "";

      const requestedBy =
        cleanRequestedBy(
          fields[requestedIndex]
        );

      const details = fields
        .slice(requestedIndex + 1, distanceIndex)
        .filter(
          (value) =>
            !looksLikeDistance(value) &&
            !looksLikeStatus(value)
        );

      const cemetery =
        details[0] || "";

      const location =
        details.slice(1).join(", ");

      const distance =
        fields[distanceIndex] || "";

      const status =
        statusIndex >= 0
          ? fields[statusIndex]
          : "";

      return [
          linkCardExactValue(
            card,
            name
          ),
          years,
          linkRequestedByValue(
            card,
            requestedBy
          ),
          linkCardExactValue(
            card,
            cemetery
          ),
          location,
          distance,
          status
        ];
    });

    const valid = rows.filter(Boolean);

    if (
      valid.length < 3 ||
      valid.length / cards.length < 0.7
    ) {
      return null;
    }

    return {
      headers: [
        "Name",
        "Years",
        "Requested by",
        "Cemetery",
        "Location",
        "Distance",
        "Status"
      ],
      rows: valid
    };
  };

  const genericRowsFromCards = (cards) => {
    const extracted = cards
      .map(extractCardFields)
      .filter((fields) => fields.length >= 2);

    if (extracted.length < 3) {
      return null;
    }

    const counts = extracted
      .map((fields) => fields.length)
      .sort((a, b) => a - b);

    const median =
      counts[Math.floor(counts.length / 2)];

    if (median < 2 || median > 12) {
      return null;
    }

    const consistent = extracted.filter(
      (fields) =>
        Math.abs(fields.length - median) <= 1
    );

    if (
      consistent.length / extracted.length < 0.75
    ) {
      return null;
    }

    const width = Math.max(
      ...consistent.map((fields) => fields.length)
    );

    const rows = consistent.map((fields) => {
      const row = [...fields];

      while (row.length < width) {
        row.push("");
      }

      return row.slice(0, width);
    });

    const headers = Array.from(
      { length: width },
      (_, index) => `Field ${index + 1}`
    );

    if (
      rows.every((row) => row[0]) &&
      new Set(rows.map((row) => row[0])).size >=
        Math.ceil(rows.length * 0.7)
    ) {
      headers[0] = "Name";
    }

    for (let column = 0; column < width; column++) {
      const values = rows
        .map((row) => row[column])
        .filter(Boolean);

      if (!values.length) continue;

      if (
        values.length >= rows.length * 0.7 &&
        values.every(looksLikeYearRange)
      ) {
        headers[column] = "Years";
      } else if (
        values.length >= rows.length * 0.7 &&
        values.every(looksLikeDistance)
      ) {
        headers[column] = "Distance";
      } else if (
        values.length >= rows.length * 0.7 &&
        values.every(looksLikeStatus)
      ) {
        headers[column] = "Status";
      }
    }

    return {
      headers,
      rows
    };
  };

  const repeatedCardsToMarkdown = (root) => {
    if (!root || root.querySelector("table")) {
      return "";
    }

    const parents = [root, ...root.querySelectorAll("*")];

    let best = null;

    for (const parent of parents) {
      const children = [...parent.children].filter((child) => {
        const text = normalizeText(
          child.innerText || child.textContent || ""
        );

        if (text.length < 20 || text.length > 2500) {
          return false;
        }

        const fields = extractCardFields(child);

        return (
          fields.length >= 4 &&
          fields.length <= 16
        );
      });

      if (children.length < 3) {
        continue;
      }

      const counts = children
        .map((child) => extractCardFields(child).length)
        .sort((a, b) => a - b);

      const median =
        counts[Math.floor(counts.length / 2)];

      const consistent = children.filter((child) => {
        const count =
          extractCardFields(child).length;

        return Math.abs(count - median) <= 2;
      });

      if (
        consistent.length < 3 ||
        consistent.length / children.length < 0.7
      ) {
        continue;
      }

      const score =
        consistent.length * 100 +
        median * 4;

      if (!best || score > best.score) {
        best = {
          score,
          cards: consistent
        };
      }
    }

    if (!best) {
      return "";
    }

    const semantic =
      semanticRowsFromCards(best.cards);

    if (semantic) {
      return markdownTable(
        semantic.headers,
        semantic.rows
      );
    }

    const generic =
      genericRowsFromCards(best.cards);

    if (!generic) {
      return "";
    }

    return markdownTable(
      generic.headers,
      generic.rows
    );
  };

  const block = (node, listDepth = 0) => {
    if (!node) return "";

    if (node.nodeType === Node.TEXT_NODE) {
      return normalizeText(node.nodeValue || "");
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const tag = node.tagName.toLowerCase();

    if (
      [
        "script",
        "style",
        "noscript",
        "svg",
        "canvas",
        "form",
        "button",
        "nav",
        "footer",
        "aside"
      ].includes(tag)
    ) {
      return "";
    }

    if (/^h[1-6]$/.test(tag)) {
      const level = Math.min(Number(tag[1]), 4);
      const text = normalizeText(inline(node));

      return text
        ? `${"#".repeat(level)} ${text}\n\n`
        : "";
    }

    if (tag === "p") {
      const text = normalizeText(inline(node));
      return text ? `${text}\n\n` : "";
    }

    if (tag === "blockquote") {
      const text = normalizeText(node.innerText);

      return text
        ? `${text
            .split(/\r?\n/)
            .map((line) => `> ${line}`)
            .join("\n")}\n\n`
        : "";
    }

    if (tag === "pre") {
      const code = node.innerText
        .replace(/^\n+|\n+$/g, "");

      return code
        ? `\`\`\`\n${code}\n\`\`\`\n\n`
        : "";
    }

    if (tag === "hr") {
      return "---\n\n";
    }

    if (tag === "table") {
      const md = tableToMarkdown(node);
      return md ? `${md}\n\n` : "";
    }

    if (tag === "ul" || tag === "ol") {
      const ordered = tag === "ol";

      const items = [...node.children].filter(
        (child) =>
          child.tagName?.toLowerCase() === "li"
      );

      const lines = items.map((item, index) => {
        const clone = item.cloneNode(true);

        clone
          .querySelectorAll("ul,ol")
          .forEach((nested) => nested.remove());

        const text = normalizeText(inline(clone));

        const prefix = ordered
          ? `${index + 1}.`
          : "-";

        const own =
          `${"  ".repeat(listDepth)}${prefix} ${text}`;

        const nested = [...item.children]
          .filter((child) =>
            ["ul", "ol"].includes(
              child.tagName?.toLowerCase()
            )
          )
          .map((child) =>
            block(child, listDepth + 1).trimEnd()
          )
          .filter(Boolean)
          .join("\n");

        return nested
          ? `${own}\n${nested}`
          : own;
      });

      return lines.length
        ? `${lines.join("\n")}\n\n`
        : "";
    }

    if (tag === "img") {
      const md = inline(node);
      return md ? `${md}\n\n` : "";
    }

    const blockContainers = new Set([
      "div",
      "section",
      "article",
      "main",
      "header",
      "figure",
      "figcaption",
      "details",
      "summary",
      "dl",
      "dt",
      "dd",
      "address"
    ]);

    const chunks = [...node.childNodes]
      .map((child) => block(child, listDepth))
      .map((chunk) => chunk.trim())
      .filter(Boolean);

    if (chunks.length) {
      const separator = blockContainers.has(tag)
        ? "\n\n"
        : "";

      return `${chunks.join(separator)}${blockContainers.has(tag) ? "\n\n" : ""}`;
    }

    const fallback = normalizeText(inline(node));

    return fallback
      ? `${fallback}\n\n`
      : "";
  };

  const sanitizeClone = (element) => {
    const clone = element.cloneNode(true);

    clone
      .querySelectorAll(
        [
          "script",
          "style",
          "noscript",
          "svg",
          "canvas",
          "form",
          "button",
          "input",
          "select",
          "option",
          "textarea",
          "nav",
          "footer",
          "aside",
          "[hidden]",
          "[aria-hidden='true']",
          "[role='navigation']",
          "[role='banner']",
          "[role='contentinfo']",
          "[role='button']",
          "[role='dialog']",
          "[role='alertdialog']",
          "[role='menu']",
          "[role='menuitem']",
          "[role='menubar']",
          "[role='combobox']",
          "[role='listbox']",
          "[role='option']",
          "[role='search']",
          "[role='slider']",
          "[role='switch']",
          "[role='tablist']",
          "[role='toolbar']",
          "[contenteditable='true']",
          ".advertisement",
          ".ads",
          ".ad",
          ".cookie",
          ".newsletter",
          ".social-share"
        ].join(",")
      )
      .forEach((node) => node.remove());

    const noisePatterns = [
      /^loading(?:\.{3}|…)?$/i,
      /^getting location(?:\.{3}|…)?$/i,
      /^please wait(?:\.{3}|…)?$/i,
      /^claim$/i,
      /^fulfill$/i,
      /^cancel$/i,
      /^close$/i,
      /^download list$/i,
      /^list settings$/i
    ];

    const candidates = [...clone.querySelectorAll("*")].reverse();

    for (const node of candidates) {
      if (node.children.length > 0) {
        continue;
      }

      const value = normalizeText(node.textContent || "");

      if (
        value &&
        noisePatterns.some((pattern) => pattern.test(value))
      ) {
        node.remove();
      }
    }

    return clone;
  };

  /*
   * Non-interactive mode used by Article capture.
   *
   * popup.js sets __clipperWholePageMode before loading this file.
   * We then reuse the selector's existing structural intelligence
   * without showing the blue selection UI.
   */
  if (window.__clipperWholePageMode === true) {
    try {
      const root =
        document.querySelector("main") ||
        document.querySelector('[role="main"]') ||
        document.body;

      const clone =
        sanitizeClone(root);

      const smartTable =
        repeatedCardsToMarkdown(clone);

      if (smartTable) {
        const cleanedTable =
          smartTable
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n[ \t]+/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim()
            .slice(0, 500000);

        const rootText =
          normalizeText(
            clone.innerText ||
            clone.textContent ||
            ""
          );

        const tablePlainText =
          normalizeText(
            cleanedTable
              .replace(
                /\[([^\]]+)\]\([^)]+\)/g,
                "$1"
              )
              .replace(/\|/g, " ")
              .replace(/---+/g, " ")
          );

        const tableLines =
          cleanedTable
            .split(/\r?\n/)
            .filter((line) =>
              line.trim().startsWith("|")
            );

        const headerCells =
          tableLines.length
            ? tableLines[0]
                .split("|")
                .slice(1, -1)
                .map((cell) =>
                  normalizeText(cell)
                )
                .filter(Boolean)
            : [];

        const genericHeaderCount =
          headerCells.filter((cell) =>
            /^Field\s+\d+$/i.test(cell)
          ).length;

        const semanticHeaderRatio =
          headerCells.length
            ? (
                headerCells.length -
                genericHeaderCount
              ) / headerCells.length
            : 0;

        const rowCount =
          Math.max(
            0,
            tableLines.length - 2
          );

        const coverage =
          rootText.length
            ? Math.min(
                1,
                tablePlainText.length /
                  rootText.length
              )
            : 0;

        window.__clipperWholePageResult = {
          markdown: cleanedTable,
          type: "repeated-records",
          rowCount,
          coverage,
          semanticHeaderRatio,
          rootTextLength:
            rootText.length,
          tableTextLength:
            tablePlainText.length
        };
      } else {
        window.__clipperWholePageResult =
          null;
      }
    } catch (error) {
      window.__clipperWholePageResult = {
        error:
          error?.message ||
          String(error)
      };
    }

    window.__clipperWholePageMode = false;
    return;
  }

  const overlay = document.createElement("div");

  overlay.style.cssText = [
    "position:fixed",
    "z-index:2147483646",
    "pointer-events:none",
    "border:2px solid #9027db",
    "background:rgba(144,39,219,.10)",
    "border-radius:4px",
    "box-sizing:border-box",
    "display:none"
  ].join(";");

  const tip = document.createElement("div");

  tip.textContent =
    "Move mouse · click to select · Esc cancel";

  tip.style.cssText = [
    "position:fixed",
    "z-index:2147483647",
    "top:14px",
    "left:50%",
    "transform:translateX(-50%)",
    "pointer-events:none",
    "padding:8px 12px",
    "border-radius:8px",
    "background:rgba(20,20,20,.94)",
    "color:white",
    "font:13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "box-shadow:0 4px 18px rgba(0,0,0,.25)"
  ].join(";");

  document.documentElement.append(
    overlay,
    tip
  );

  const chooseTarget = (rawTarget) => {
    if (
      !(rawTarget instanceof Element) ||
      rawTarget === overlay ||
      rawTarget === tip
    ) {
      return null;
    }

    return rawTarget === document.documentElement
      ? document.body
      : rawTarget;
  };

  const draw = (target) => {
    if (!target) return;

    const rect = target.getBoundingClientRect();

    if (
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return;
    }

    overlay.style.display = "block";
    overlay.style.left =
      `${Math.max(0, rect.left)}px`;
    overlay.style.top =
      `${Math.max(0, rect.top)}px`;

    overlay.style.width =
      `${Math.min(
        innerWidth - Math.max(0, rect.left),
        rect.width
      )}px`;

    overlay.style.height =
      `${Math.min(
        innerHeight - Math.max(0, rect.top),
        rect.height
      )}px`;
  };

  const onMove = (event) => {
    if (state.done) return;

    const target = chooseTarget(event.target);

    if (!target) return;

    state.target = target;
    state.parentHistory = [];

    draw(target);
  };

  const onScroll = () => {
    if (
      !state.done &&
      state.target
    ) {
      draw(state.target);
    }
  };

  const resetSelection = async () => {
    try {
      await chrome.runtime.sendMessage({
        type: "clipper.clearQuickSaveState"
      });
    } catch {
      // Selection can still be reset locally.
    }

    state.done = false;
    state.target = null;
    state.parentHistory = [];

    if (state.confirmPanel) {
      state.confirmPanel.remove();
      state.confirmPanel = null;
    }

    document.removeEventListener(
      "pointerdown",
      onOutsideConfirmPointerDown,
      true
    );

    overlay.style.display = "none";

    tip.textContent =
      "Move mouse · click to select · Esc cancel";
  };

  const onOutsideConfirmPointerDown = (event) => {
    if (
      !state.done ||
      !state.confirmPanel ||
      state.confirmPanel.contains(event.target)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    cleanup();
  };

  const cancelSelection = () => {
    // Dismiss the selector immediately.
    // Background cleanup must never block the UI.
    cleanup();

    void chrome.runtime.sendMessage({
      type: "clipper.cancelQuickClip"
    }).catch(() => {
      // Local selector is already gone.
    });
  };

  const showConfirmPanel = (anchorX, anchorY) => {
    if (state.confirmPanel) {
      state.confirmPanel.remove();
    }

    const panel = document.createElement("div");

    panel.style.cssText = [
      "position:fixed",
      "z-index:2147483647",
      "left:0",
      "top:0",
      "width:260px",
      "box-sizing:border-box",
      "padding:14px",
      "border-radius:12px",
      "background:rgba(28,28,30,.97)",
      "color:white",
      "font:13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      "box-shadow:0 10px 35px rgba(0,0,0,.35)"
    ].join(";");

    const title = document.createElement("div");
    title.textContent = "Selection ready";

    title.style.cssText = [
      "font-size:14px",
      "font-weight:650",
      "margin-bottom:11px",
      "padding-right:30px"
    ].join(";");

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", "Cancel clipping");

    closeButton.style.cssText = [
      "position:absolute",
      "top:7px",
      "right:8px",
      "width:30px",
      "height:30px",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "border:0",
      "border-radius:7px",
      "background:transparent",
      "color:rgba(255,255,255,.72)",
      "font:22px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      "cursor:pointer"
    ].join(";");

    closeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void cancelSelection();
    });

    const actions = document.createElement("div");

    actions.style.cssText = [
      "display:flex",
      "gap:8px"
    ].join(";");

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save";

    saveButton.style.cssText = [
      "flex:1",
      "border:0",
      "border-radius:8px",
      "padding:9px 12px",
      "background:#9027db",
      "color:white",
      "font:600 13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      "cursor:pointer"
    ].join(";");

    const reselectButton = document.createElement("button");
    reselectButton.type = "button";
    reselectButton.textContent = "Reselect";

    reselectButton.style.cssText = [
      "flex:1",
      "border:1px solid rgba(255,255,255,.18)",
      "border-radius:8px",
      "padding:9px 12px",
      "background:rgba(255,255,255,.08)",
      "color:white",
      "font:600 13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      "cursor:pointer"
    ].join(";");

    const status = document.createElement("div");

    status.style.cssText = [
      "display:none",
      "margin-top:9px",
      "font-size:12px",
      "color:rgba(255,255,255,.72)"
    ].join(";");

    reselectButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await resetSelection();
    });

    saveButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      saveButton.disabled = true;
      reselectButton.disabled = true;

      title.textContent = "Saving…";

      status.style.display = "block";
      status.textContent = "Saving selected area…";

      try {
        const response =
          await chrome.runtime.sendMessage({
            type: "clipper.quickSaveSelection",
            payload: {
              url: location.href,
              capturedAt: Date.now()
            }
          });

        if (!response?.ok) {
          throw new Error(
            response?.error?.message ||
            "Could not save selection."
          );
        }

        const destination =
          response.destination === "notion"
            ? "Notion"
            : "Obsidian";

        panel.innerHTML = "";

        const success = document.createElement("div");

        success.textContent =
          `Saved to ${destination} ✓`;

        success.style.cssText = [
          "font-size:14px",
          "font-weight:650"
        ].join(";");

        panel.append(success);

        tip.textContent =
          `Saved to ${destination} ✓`;

        setTimeout(cleanup, 1100);
      } catch (error) {
        title.textContent = "Couldn’t save";
        status.textContent =
          error?.message || String(error);

        saveButton.disabled = false;
        reselectButton.disabled = false;
      }
    });

    actions.append(
      saveButton,
      reselectButton
    );

    panel.append(
      title,
      closeButton,
      actions,
      status
    );

    document.documentElement.append(panel);

    document.addEventListener(
      "pointerdown",
      onOutsideConfirmPointerDown,
      true
    );

    const margin = 12;
    const gap = 14;
    const rect = panel.getBoundingClientRect();

    let left = anchorX + gap;
    let top = anchorY + gap;

    if (left + rect.width + margin > window.innerWidth) {
      left = anchorX - rect.width - gap;
    }

    if (top + rect.height + margin > window.innerHeight) {
      top = anchorY - rect.height - gap;
    }

    left = Math.max(
      margin,
      Math.min(
        left,
        window.innerWidth - rect.width - margin
      )
    );

    top = Math.max(
      margin,
      Math.min(
        top,
        window.innerHeight - rect.height - margin
      )
    );

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;

    state.confirmPanel = panel;
  };

  const onRuntimeMessage = (message) => {
    if (message?.type !== "clipper.quickSaveComplete") {
      return;
    }

    const destination =
      message.destination === "notion"
        ? "Notion"
        : "Obsidian";

    if (state.confirmPanel) {
      state.confirmPanel.innerHTML = "";

      const success = document.createElement("div");

      success.textContent =
        `Saved to ${destination} ✓`;

      success.style.cssText = [
        "font-size:14px",
        "font-weight:650"
      ].join(";");

      state.confirmPanel.append(success);
    }

    tip.textContent =
      `Saved to ${destination} ✓`;

    setTimeout(cleanup, 1100);
  };

  const cleanSelectedMarkdown = (source) => {
    let text =
      String(source || "")
        .replace(/\r\n?/g, "\n");

    /*
     * Remove social/profile avatars from selected
     * content while leaving meaningful images alone.
     */
    text = text.replace(
      /^!\[[^\]]*(?:avatar|profile picture|profile photo)[^\]]*\]\([^)]+\)\s*$/gim,
      ""
    );

    /*
     * Remove standalone reaction counters.
     */
    text = text.replace(
      /^\s*\d+\s+(?:Likes?|Restacks?|Comments?)(?:\s*∙\s*\d+\s+(?:Likes?|Restacks?|Comments?))*\s*$/gim,
      ""
    );

    const urls = [];

    text = text.replace(
      /https?:\/\/[^\s)]+/g,
      (url) => {
        const token =
          `CLIPPER_AREA_URL_${urls.length}_TOKEN`;

        urls.push(url);

        return token;
      }
    );

    const months =
      "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)";

    text = text.replace(
      new RegExp(
        `([A-Za-zÀ-ÿ])(${months}\\\\s+\\\\d{1,2},\\\\s+\\\\d{4})`,
        "g"
      ),
      "$1\n\n$2"
    );

    text = text.replace(
      /(\d{4})\s*∙\s*(Paid|Free)\s*/gi,
      "$1\n\n$2\n\n"
    );

    text = text.replace(
      /([.!?]["”’]?)(?=[A-Z][a-z])/g,
      "$1 "
    );

    text = text.replace(
      /\(h\/t\s*([A-Z])/g,
      "(h/t $1"
    );

    for (
      let index = 0;
      index < urls.length;
      index += 1
    ) {
      text = text.replaceAll(
        `CLIPPER_AREA_URL_${index}_TOKEN`,
        urls[index]
      );
    }

    text = text.replace(
      /\)(?=[A-Z][a-z])/g,
      ") "
    );

    return text
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  const onClick = async (event) => {
    if (
      state.done ||
      !state.target
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    state.done = true;

    const clone =
      sanitizeClone(state.target);

    const smartTable =
      repeatedCardsToMarkdown(clone);

    const markdown =
      cleanSelectedMarkdown(
        (smartTable || block(clone))
          .replace(/[ \t]+\n/g, "\n")
          .replace(/\n[ \t]+/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .replace(/^\s*(Loading(?:\.{3}|…)?|Getting location(?:\.{3}|…)?|Claim|Fulfill)\s*$/gim, "")
          .replace(/^(\d+)Miles\b/gm, "$1 Miles")
          .replace(/\n{3,}/g, "\n\n")
          .trim()
      ).slice(0, 500000);

    const text = normalizeText(
      state.target.innerText ||
      state.target.textContent ||
      ""
    ).slice(0, 100000);

    if (!markdown) {
      state.done = false;

      tip.textContent =
        "Nothing useful found here · choose another area";

      return;
    }

    const response =
      await chrome.runtime.sendMessage({
        type: "clipper.areaSelected",
        payload: {
          url: location.href,
          markdown,
          text,
          capturedAt: Date.now()
        }
      });

    if (!response?.ok) {
      state.done = false;

      tip.textContent =
        response?.error?.message ||
        "Could not capture this area";

      return;
    }

    tip.textContent =
      "Selection ready · Save or reselect";

    showConfirmPanel(
      event.clientX,
      event.clientY
    );
  };

  const onKey = (event) => {
    if (
      event.key === "Escape" ||
      event.key === "Esc" ||
      event.code === "Escape"
    ) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      cancelSelection();
      return;
    }

  };

  const cleanup = () => {
    window.removeEventListener(
      "mousemove",
      onMove,
      true
    );

    window.removeEventListener(
      "click",
      onClick,
      true
    );

    window.removeEventListener(
      "keydown",
      onKey,
      true
    );

    window.removeEventListener(
      "scroll",
      onScroll,
      true
    );

    if (state.confirmPanel) {
      state.confirmPanel.remove();
      state.confirmPanel = null;
    }

    document.removeEventListener(
      "pointerdown",
      onOutsideConfirmPointerDown,
      true
    );

    chrome.runtime.onMessage.removeListener(
      onRuntimeMessage
    );

    overlay.remove();
    tip.remove();

    delete window.__clipToObsidianAreaSelector;
  };

  chrome.runtime.onMessage.addListener(
    onRuntimeMessage
  );

  window.addEventListener(
    "mousemove",
    onMove,
    true
  );

  window.addEventListener(
    "click",
    onClick,
    true
  );

  window.addEventListener(
    "keydown",
    onKey,
    true
  );

  window.addEventListener(
    "scroll",
    onScroll,
    true
  );

  window.__clipToObsidianAreaSelector = {
    cleanup
  };
})();
