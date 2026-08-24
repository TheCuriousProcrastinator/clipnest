/*
 * ClipNest shared Article engine.
 *
 * Pure Article analysis and Markdown cleanup only.
 * No DOM, popup, filesystem, or destination logic.
 */

(() => {
  "use strict";

  function articleProseStats(markdown) {
    const source =
      String(markdown || "")
        .replace(
          /!\[[^\]]*\]\([^)]+\)/g,
          ""
        )
        .replace(
          /\[([^\]]+)\]\([^)]+\)/g,
          "$1"
        );

    const blocks =
      source
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter(Boolean);

    let proseBlocks = 0;
    let proseWords = 0;

    for (const block of blocks) {
      if (
        /^(?:#{1,6}\s|[-*+]\s|\d+\.\s|\|)/.test(
          block
        )
      ) {
        continue;
      }

      const words =
        block
          .replace(
            /[`*_>#~]/g,
            " "
          )
          .split(/\s+/)
          .filter(Boolean);

      if (words.length >= 10) {
        proseBlocks += 1;
        proseWords += words.length;
      }
    }

    return {
      proseBlocks,
      proseWords
    };
  }

  function shouldPreferStructuredArticle(
    capture,
    result
  ) {
    if (
      !result?.markdown ||
      result.type !== "repeated-records"
    ) {
      return false;
    }

    const rowCount =
      Number(result.rowCount || 0);

    const coverage =
      Number(result.coverage || 0);

    const semanticHeaderRatio =
      Number(
        result.semanticHeaderRatio || 0
      );

    if (rowCount < 3) {
      return false;
    }

    const {
      proseBlocks,
      proseWords
    } = articleProseStats(
      capture?.markdown || ""
    );

    const substantialProse =
      proseBlocks >= 4 &&
      proseWords >= 120;

    if (
      semanticHeaderRatio >= 0.70 &&
      rowCount >= 5 &&
      coverage >= 0.25
    ) {
      return true;
    }

    if (
      coverage >= 0.58 &&
      rowCount >= 4
    ) {
      return true;
    }

    if (
      !substantialProse &&
      coverage >= 0.34 &&
      rowCount >= 5
    ) {
      return true;
    }

    return false;
  }

  function normalizeClipHeading(value) {
    return String(value || "")
      .replace(
        /!\[[^\]]*\]\([^)]+\)/g,
        ""
      )
      .replace(
        /\[([^\]]+)\]\([^)]+\)/g,
        "$1"
      )
      .replace(/[`*_~#>]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function repairClipSpacing(source) {
    let text =
      String(source || "");

    const urls = [];

    text = text.replace(
      /https?:\/\/[^\s)]+/g,
      (url) => {
        const token =
          `CLIPPER_URL_${urls.length}_TOKEN`;

        urls.push(url);

        return token;
      }
    );

    const months =
      "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)";

    text = text.replace(
      new RegExp(
        `([A-Za-zÀ-ÿ])(${months}\\s+\\d{1,2},\\s+\\d{4})`,
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
        `CLIPPER_URL_${index}_TOKEN`,
        urls[index]
      );
    }

    text = text.replace(
      /\)(?=[A-Z][a-z])/g,
      ") "
    );

    return text;
  }

  function cleanSharedClipMarkdown(markdown) {
    let text =
      String(markdown || "")
        .replace(/\r\n?/g, "\n");

    text = text.replace(
      /^!\[[^\]]*(?:avatar|profile picture|profile photo)[^\]]*\]\([^)]+\)\s*$/gim,
      ""
    );

    text = text.replace(
      /^\s*\d+\s+(?:Likes?|Restacks?|Comments?)(?:\s*∙\s*\d+\s+(?:Likes?|Restacks?|Comments?))*\s*$/gim,
      ""
    );

    text =
      repairClipSpacing(text);

    text = text.replace(
      /!\[([^\n]*?)\\\]\(([^)\n]+)\)/g,
      "![$1]($2)"
    );

    return text
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function cleanArticleMarkdown(
    markdown,
    title = ""
  ) {
    let text =
      cleanSharedClipMarkdown(
        markdown
      );

    if (!text) {
      return "";
    }

    const firstHeading =
      text.match(
        /^\s*#\s+([^\n]+)\n+/
      );

    if (
      firstHeading &&
      normalizeClipHeading(
        firstHeading[1]
      ) ===
        normalizeClipHeading(title)
    ) {
      text =
        text.slice(
          firstHeading[0].length
        );
    }

    const strongStops = [
      /#{1,6}\s+Discussion about this post\b/i,
      /\nDiscussion about this post\b/i
    ];

    let stopAt = -1;

    for (const pattern of strongStops) {
      const match =
        pattern.exec(text);

      if (
        match &&
        (
          stopAt < 0 ||
          match.index < stopAt
        )
      ) {
        stopAt =
          match.index;
      }
    }

    const genericStop =
      /(?:^|\n)#{1,6}\s+(?:Recommended|Recommendations|More from .+|Keep reading|Related posts?|You might also like|Comments?)\s*$/im.exec(
        text
      );

    if (
      genericStop &&
      genericStop.index > 800 &&
      (
        stopAt < 0 ||
        genericStop.index < stopAt
      )
    ) {
      stopAt =
        genericStop.index;
    }

    if (stopAt >= 0) {
      text =
        text.slice(
          0,
          stopAt
        );
    }

    text = text.replace(
      /\s*\d+\s+Likes?\s*∙\s*\d+\s+Restacks?\s*$/i,
      ""
    );

    return text
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  globalThis.ClipNestArticleEngine =
    Object.freeze({
      articleProseStats,
      shouldPreferStructuredArticle,
      normalizeClipHeading,
      repairClipSpacing,
      cleanSharedClipMarkdown,
      cleanArticleMarkdown
    });
})();
