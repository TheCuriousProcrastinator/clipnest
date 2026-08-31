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


  const cleanAuthorName = (value) =>
    normalizeText(
      value
    )
      .replace(
        /^by\s+/i,
        ""
      )
      .replace(
        /^author\s*:\s*/i,
        ""
      )
      .replace(
        /\s*\((?:author|editor|contributor)\).*$/i,
        ""
      )
      .replace(
        /\s+Format\s*:.*$/i,
        ""
      )
      .trim();

  const authorNames = (
    value
  ) => {
    const items =
      Array.isArray(
        value
      )
        ? value
        : [
            value
          ];

    const names =
      [];

    const addName = (
      raw
    ) => {
      const name =
        cleanAuthorName(
          raw
        );

      if (
        !name ||
        names.some(
          (existing) =>
            existing.toLowerCase() ===
            name.toLowerCase()
        )
      ) {
        return;
      }

      names.push(
        name
      );
    };

    for (
      const item of
        items
    ) {
      if (
        typeof item ===
          "string"
      ) {
        addName(
          item
        );

        continue;
      }

      if (
        !item ||
        typeof item !==
          "object"
      ) {
        continue;
      }

      if (item.name) {
        addName(
          item.name
        );

        continue;
      }

      const fullName =
        [
          item.givenName,
          item.familyName
        ]
          .filter(Boolean)
          .join(" ");

      if (fullName) {
        addName(
          fullName
        );
      }
    }

    return names;
  };

  const extractJsonLdAuthor =
    () => {
      const nodes =
        [];

      const visit = (
        value
      ) => {
        if (
          Array.isArray(
            value
          )
        ) {
          value.forEach(
            visit
          );

          return;
        }

        if (
          !value ||
          typeof value !==
            "object"
        ) {
          return;
        }

        nodes.push(
          value
        );

        for (
          const child of
            Object.values(
              value
            )
        ) {
          if (
            child &&
            typeof child ===
              "object"
          ) {
            visit(
              child
            );
          }
        }
      };

      document
        .querySelectorAll(
          'script[type="application/ld+json"]'
        )
        .forEach(
          (script) => {
            const raw =
              String(
                script.textContent ||
                ""
              ).trim();

            if (!raw) {
              return;
            }

            try {
              visit(
                JSON.parse(
                  raw
                )
              );
            } catch {
              return;
            }
          }
        );

      const rankNode = (
        node
      ) => {
        const rawType =
          node?.["@type"];

        const types =
          (
            Array.isArray(
              rawType
            )
              ? rawType
              : [
                  rawType
                ]
          )
            .map(
              (value) =>
                String(
                  value ||
                  ""
                )
                  .trim()
                  .toLowerCase()
            )
            .filter(Boolean);

        if (
          types.includes(
            "book"
          )
        ) {
          return 0;
        }

        if (
          types.includes(
            "product"
          )
        ) {
          return 1;
        }

        if (
          types.some(
            (type) =>
              [
                "article",
                "newsarticle",
                "blogposting",
                "creativework"
              ].includes(
                type
              )
          )
        ) {
          return 2;
        }

        return 3;
      };

      const candidates =
        nodes
          .map(
            (
              node,
              index
            ) => ({
              names:
                authorNames(
                  node?.author ??
                  node?.creator
                ),

              rank:
                rankNode(
                  node
                ),

              index
            })
          )
          .filter(
            (candidate) =>
              candidate.names.length
          )
          .sort(
            (a, b) =>
              a.rank -
                b.rank ||
              a.index -
                b.index
          );

      return (
        candidates[0]
          ?.names
          ?.join(", ") ||
        ""
      );
    };

  const extractAuthor =
    () => {
      const structured =
        extractJsonLdAuthor();

      if (structured) {
        return structured;
      }

      const metadata =
        getMeta(
          'meta[name="citation_author"]',
          'meta[name="author"]',
          'meta[name="parsely-author"]',
          'meta[name="dc.creator"]',
          'meta[name="DC.creator"]',
          'meta[property="article:author"]'
        );

      const cleanMetadata =
        cleanAuthorName(
          metadata
        );

      if (
        cleanMetadata &&
        !/^https?:\/\//i.test(
          cleanMetadata
        )
      ) {
        return cleanMetadata;
      }

      const targetedAuthor =
        document.querySelector(
          [
            '#bylineInfo .author a',
            '#bylineInfo .contributorNameID',
            '[data-feature-name="bylineInfo"] .author a',
            '[itemprop="author"] [itemprop="name"]',
            '[itemprop="author"] a',
            '[itemprop="creator"] [itemprop="name"]',
            '[rel="author"]',
            '.author a'
          ].join(",")
        );

      const targetedName =
        cleanAuthorName(
          targetedAuthor
            ?.textContent ||
          ""
        );

      if (targetedName) {
        return targetedName;
      }

      const pageAuthor =
        getMeta(
          '[itemprop="author"]',
          '[itemprop="creator"]',
          '[rel="author"]',
          '.author a'
        );

      return cleanAuthorName(
        pageAuthor
      );
    };

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
      const level =
        Math.min(
          Number(
            tag[1]
          ),
          4
        );

      /*
       * Headings already carry semantic emphasis in Markdown.
       * Use their visible text rather than serializing nested
       * strong/em/span markup, which can produce malformed runs
       * such as:
       *
       *   **Cool Facts About****Hiroki Totoki**
       */
      const text =
        normalizeText(
          node.innerText
        );

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

    if (tag === "iframe") {
      const source =
        absoluteUrl(
          node.getAttribute(
            "src"
          )
        );

      if (!/^https?:\/\//i.test(source)) {
        return "";
      }

      try {
        const parsed =
          new URL(
            source
          );

        const hostname =
          parsed.hostname
            .toLowerCase()
            .replace(
              /^www\./,
              ""
            );

        const youtubeHost =
          hostname ===
            "youtube.com" ||
          hostname ===
            "youtube-nocookie.com";

        if (youtubeHost) {
          const match =
            parsed.pathname.match(
              /^\/embed\/([^/?#]+)/
            );

          const videoId =
            match?.[1] ||
            "";

          if (videoId) {
            return (
              `[YouTube video](https://www.youtube.com/watch?v=${videoId})\n\n`
            );
          }
        }

        if (
          hostname ===
          "player.vimeo.com"
        ) {
          const match =
            parsed.pathname.match(
              /^\/video\/([^/?#]+)/
            );

          const videoId =
            match?.[1] ||
            "";

          if (videoId) {
            return (
              `[Vimeo video](https://vimeo.com/${videoId})\n\n`
            );
          }
        }
      } catch {
      }

      return "";
    }

    const chunks =
      [...node.childNodes]
        .map(
          (child) =>
            block(
              child,
              listDepth
            )
        )
        .filter(Boolean);

    if (chunks.length) {
      /*
       * Generic wrapper elements often contain a mixture of
       * inline controls and real block content.
       *
       * Do not blindly add spacing between every child because
       * that would split legitimate inline spans. Instead,
       * protect Markdown block starts from being glued directly
       * onto preceding text.
       *
       * Example:
       *   Subscribe# A Workspace I Envy
       * becomes:
       *   Subscribe
       *
       *   # A Workspace I Envy
       */
      const startsMarkdownBlock =
        (value) =>
          /^(?:#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|---(?:\n|$)|\|\s|!\[)/
            .test(
              String(
                value ||
                ""
              )
            );

      return chunks.reduce(
        (
          output,
          chunk
        ) => {
          if (!output) {
            return chunk;
          }

          const alreadySeparated =
            /\n\s*$/
              .test(
                output
              );

          const separator =
            !alreadySeparated &&
            startsMarkdownBlock(
              chunk
            )
              ? "\n\n"
              : "";

          return (
            output +
            separator +
            chunk
          );
        },
        ""
      );
    }

    const fallback = normalizeText(inline(node));
    return fallback ? `${fallback}\n\n` : "";
  };

  const pickContentRoot = () => {
    const pickLongest = (
      elements
    ) =>
      elements
        .map(
          (element) => ({
            element,
            score:
              normalizeText(
                element.innerText
              ).length
          })
        )
        .sort(
          (a, b) =>
            b.score -
            a.score
        )[0]
        ?.element ||
      null;

    /*
     * Prefer explicit article-body containers before broader
     * document landmarks. Modern publishing platforms do not
     * always use semantic <article> or <main> elements.
     *
     * Beehiiv, for example, exposes the actual post body as
     * #content-blocks.post-content-node while surrounding page
     * chrome, comments, recommendations and footer live outside it.
     */
    const explicitContent =
      [
        ...document.querySelectorAll(
          [
            '[itemprop="articleBody"]',
            '#content-blocks.post-content-node',
            '.post-content-node'
          ].join(",")
        )
      ];

    const explicitRoot =
      pickLongest(
        explicitContent
      );

    if (explicitRoot) {
      return explicitRoot;
    }

    /*
     * Prefer a semantic article over a broader main container.
     * A <main> often contains the article plus comments,
     * recommendations and other surrounding page content.
     */
    const articleRoot =
      pickLongest(
        [
          ...document.querySelectorAll(
            "article"
          )
        ]
      );

    if (articleRoot) {
      return articleRoot;
    }

    const mainRoot =
      pickLongest(
        [
          ...document.querySelectorAll(
            "main"
          ),
          ...document.querySelectorAll(
            '[role="main"]'
          )
        ]
      );

    return (
      mainRoot ||
      document.body
    );
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

  const bestProductImageSource = (
    image
  ) => {
    if (!image) {
      return "";
    }

    const highResolution =
      String(
        image.getAttribute(
          "data-old-hires"
        ) ||
        ""
      ).trim();

    if (highResolution) {
      return highResolution;
    }

    const dynamic =
      String(
        image.getAttribute(
          "data-a-dynamic-image"
        ) ||
        ""
      ).trim();

    if (dynamic) {
      try {
        const parsed =
          JSON.parse(
            dynamic
          );

        const candidates =
          Object.entries(
            parsed
          )
            .map(
              ([
                url,
                dimensions
              ]) => ({
                url,

                area:
                  Number(
                    dimensions?.[0] ||
                    0
                  ) *
                  Number(
                    dimensions?.[1] ||
                    0
                  )
              })
            )
            .sort(
              (a, b) =>
                b.area -
                a.area
            );

        if (
          candidates[0]
            ?.url
        ) {
          return candidates[0]
            .url;
        }
      } catch {
      }
    }

    return (
      image.currentSrc ||
      image.src ||
      image.getAttribute(
        "src"
      ) ||
      ""
    );
  };

  const extractPrimaryImage =
    () => {
      if (
        /(^|\\.)amazon\\./i.test(
          location.hostname
        )
      ) {
        const selectors = [
          "#ebooksImgBlkFront",
          "#imgBlkFront",
          "#landingImage",
          "#imgTagWrapperId img",
          "#main-image-container img"
        ];

        for (
          const selector of
            selectors
        ) {
          const image =
            document.querySelector(
              selector
            );

          const source =
            bestProductImageSource(
              image
            );

          if (source) {
            return absoluteUrl(
              source
            );
          }
        }
      }

      return absoluteUrl(
        getMeta(
          'meta[property="og:image"]',
          'meta[name="twitter:image"]'
        )
      );
    };

  /*
   * CLIPNEST RICH SELECTION - 2.0.12
   *
   * Snapshot the active browser selection when the popup opens.
   * Text/formatting becomes Markdown. Meaningful IMG/SVG media is
   * returned separately so each destination can use its existing
   * image-save path.
   */
  const captureSelection = () => {
    try {
      const browserSelection =
        window.getSelection();

      if (
        !browserSelection ||
        browserSelection.rangeCount < 1 ||
        browserSelection.isCollapsed
      ) {
        return {
          markdown: "",
          media: []
        };
      }

      const range =
        browserSelection.getRangeAt(0);

      const fragment =
        range.cloneContents();

      const host =
        document.createElement("div");

      host.append(
        fragment
      );

      /*
       * Remove containers that are overwhelmingly page chrome,
       * controls, or presentation-only content before examining
       * selected media.
       */
      host.querySelectorAll([
        "script",
        "style",
        "noscript",
        "canvas",
        "form",
        "button",
        "nav",
        "footer",
        "[aria-hidden='true']",
        "[role='navigation']",
        "[role='banner']",
        "[role='contentinfo']",
        ".advertisement",
        ".ads",
        ".ad",
        ".cookie",
        ".newsletter",
        ".social-share"
      ].join(","))
        .forEach(
          (node) =>
            node.remove()
        );

      const isDecorativeMedia =
        (node) => {
          if (!node) {
            return true;
          }

          const role =
            String(
              node.getAttribute(
                "role"
              ) ||
              ""
            )
              .trim()
              .toLowerCase();

          if (
            role === "presentation" ||
            role === "none" ||
            node.getAttribute(
              "aria-hidden"
            ) === "true"
          ) {
            return true;
          }

          const identity =
            [
              node.id,
              node.className?.baseVal ??
                node.className,
              node.getAttribute(
                "alt"
              ),
              node.getAttribute(
                "aria-label"
              )
            ]
              .map(
                (value) =>
                  String(
                    value ||
                    ""
                  )
              )
              .join(" ")
              .toLowerCase();

          if (
            /\b(?:avatar|profile[-_\s]?photo|profile[-_\s]?picture|reaction[-_\s]?icon|social[-_\s]?icon|share[-_\s]?icon|emoji[-_\s]?icon|ui[-_\s]?icon)\b/i
              .test(
                identity
              )
          ) {
            return true;
          }

          const width =
            Number(
              node.getAttribute(
                "width"
              ) ||
              0
            );

          const height =
            Number(
              node.getAttribute(
                "height"
              ) ||
              0
            );

          if (
            width > 0 &&
            height > 0 &&
            width <= 24 &&
            height <= 24
          ) {
            return true;
          }

          return false;
        };

      const filenameFromSelectionUrl =
        (
          value,
          fallback
        ) => {
          try {
            const parsed =
              new URL(
                value
              );

            const last =
              parsed.pathname
                .split("/")
                .filter(Boolean)
                .pop();

            if (last) {
              try {
                return decodeURIComponent(
                  last
                );
              } catch {
                return last;
              }
            }
          } catch {
          }

          return fallback;
        };

      const media =
        [];

      let mediaIndex =
        0;

      const mediaNodes =
        [
          ...host.querySelectorAll(
            "img,svg"
          )
        ];

      for (
        const node of
          mediaNodes
      ) {
        if (
          media.length >= 6
        ) {
          node.remove();
          continue;
        }

        if (
          isDecorativeMedia(
            node
          )
        ) {
          node.remove();
          continue;
        }

        const tag =
          node.tagName
            .toLowerCase();

        mediaIndex +=
          1;

        if (tag === "img") {
          const rawSource =
            String(
              node.currentSrc ||
              node.getAttribute(
                "src"
              ) ||
              node.getAttribute(
                "data-src"
              ) ||
              node.getAttribute(
                "data-lazy-src"
              ) ||
              node.getAttribute(
                "data-original"
              ) ||
              ""
            ).trim();

          if (rawSource) {
            const label =
              normalizeText(
                node.getAttribute(
                  "alt"
                ) ||
                ""
              ) ||
              "Selected image";

            if (
              /^data:image\//i.test(
                rawSource
              )
            ) {
              const mimeMatch =
                rawSource.match(
                  /^data:(image\/[^;,]+)/i
                );

              const mimeType =
                mimeMatch?.[1] ||
                "image/png";

              const extension =
                mimeType.includes(
                  "jpeg"
                )
                  ? ".jpg"
                  : mimeType.includes(
                      "webp"
                    )
                    ? ".webp"
                    : mimeType.includes(
                        "gif"
                      )
                      ? ".gif"
                      : mimeType.includes(
                          "svg"
                        )
                        ? ".svg"
                        : ".png";

              media.push({
                kind: "data",
                dataUrl:
                  rawSource,
                mimeType,
                filename:
                  `clipnest-selected-${mediaIndex}${extension}`,
                label
              });
            } else {
              const url =
                absoluteUrl(
                  rawSource
                );

              if (
                /^https?:\/\//i.test(
                  url
                )
              ) {
                media.push({
                  kind:
                    "external",
                  url,
                  filename:
                    filenameFromSelectionUrl(
                      url,
                      `clipnest-selected-${mediaIndex}`
                    ),
                  label
                });
              }
            }
          }

          node.remove();
          continue;
        }

        if (tag === "svg") {
          try {
            const svg =
              node.cloneNode(
                true
              );

            svg
              .querySelectorAll(
                "script,style,foreignObject"
              )
              .forEach(
                (child) =>
                  child.remove()
              );

            const svgElements =
              [
                svg,
                ...svg.querySelectorAll(
                  "*"
                )
              ];

            for (
              const element of
                svgElements
            ) {
              for (
                const attribute of
                  [
                    ...element.attributes
                  ]
              ) {
                const name =
                  attribute.name
                    .toLowerCase();

                const value =
                  String(
                    attribute.value ||
                    ""
                  ).trim();

                if (
                  name.startsWith(
                    "on"
                  )
                ) {
                  element.removeAttribute(
                    attribute.name
                  );

                  continue;
                }

                if (
                  (
                    name === "href" ||
                    name === "xlink:href"
                  ) &&
                  /^(?:javascript:|https?:)/i.test(
                    value
                  )
                ) {
                  element.removeAttribute(
                    attribute.name
                  );
                }
              }
            }

            if (
              !svg.getAttribute(
                "xmlns"
              )
            ) {
              svg.setAttribute(
                "xmlns",
                "http://www.w3.org/2000/svg"
              );
            }

            const markup =
              new XMLSerializer()
                .serializeToString(
                  svg
                );

            if (
              markup &&
              markup.length <=
                500000
            ) {
              media.push({
                kind: "data",
                dataUrl:
                  "data:image/svg+xml;charset=utf-8," +
                  encodeURIComponent(
                    markup
                  ),
                mimeType:
                  "image/svg+xml",
                filename:
                  `clipnest-selected-${mediaIndex}.svg`,
                label:
                  normalizeText(
                    node.getAttribute(
                      "aria-label"
                    ) ||
                    node.querySelector(
                      "title"
                    )
                      ?.textContent ||
                    ""
                  ) ||
                  "Selected graphic"
              });
            }
          } catch {
          }

          /*
           * SVG is represented through selectionMedia rather than
           * being emitted as raw markup into Markdown.
           */
          node.remove();
        }
      }

      const selectedMarkdown =
        block(
          host
        )
          .replace(
            /[ \t]+\n/g,
            "\n"
          )
          .replace(
            /\n{3,}/g,
            "\n\n"
          )
          .trim()
          .slice(
            0,
            200000
          );

      return {
        markdown:
          selectedMarkdown,
        media:
          media.slice(
            0,
            6
          )
      };
    } catch {
      return {
        markdown: "",
        media: []
      };
    }
  };

  const selectionCapture =
    captureSelection();

  const selection = normalizeText(window.getSelection()?.toString() || "").slice(0, 50000);
  const title = getMeta('meta[property="og:title"]', 'meta[name="twitter:title"]') || document.title || "Untitled";
  const description = getMeta('meta[name="description"]', 'meta[property="og:description"]');
  const author = extractAuthor();
  const siteName = getMeta('meta[property="og:site_name"]') || location.hostname;
  const image =
    extractPrimaryImage();

  /*
   * Keep location.href as the exact browser-page identity used
   * by selection / Quick Clip restoration.
   *
   * sourceUrl is the stable URL saved to Obsidian and Notion.
   */
  const canonicalUrl =
    absoluteUrl(
      document
        .querySelector(
          'link[rel="canonical"]'
        )
        ?.getAttribute(
          "href"
        ) ||
      ""
    );

  const openGraphUrl =
    absoluteUrl(
      getMeta(
        'meta[property="og:url"]'
      )
    );

  const sourceUrlCandidate =
    canonicalUrl ||
    openGraphUrl ||
    location.href;

  const sourceUrl =
    /^https?:\/\//i.test(
      sourceUrlCandidate
    )
      ? sourceUrlCandidate
      : location.href;

  return {
    title: normalizeText(title),
    url: location.href,
    sourceUrl,
    hostname: location.hostname,
    siteName: normalizeText(siteName),
    author: normalizeText(author),
    description: normalizeText(description),
    image,
    selection,
    selectionMarkdown:
      selectionCapture.markdown,
    selectionMedia:
      selectionCapture.media,
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
