import "./vault-store.js";
import "./notion-store.js";
import "./notion-session.js";
import "./article-engine.js";

// Keep extension-local settings, including the personal Notion token, out of
// any untrusted/content-script context.
try {
  chrome.storage.local.setAccessLevel({
    accessLevel:
      "TRUSTED_CONTEXTS"
  });

  chrome.storage.sync.setAccessLevel({
    accessLevel:
      "TRUSTED_CONTEXTS"
  });
} catch {
  // Older Chromium builds may not expose setAccessLevel. V1 still functions.
}


/* ==================================================
   ClipNest Quick Clip - V0.6.0
   ================================================== */

const CLIPNEST_CONTEXT_MENU_ID =
  "clipnest.contextMenu";

const QUICK_CLIP_TEXT_MENU_ID =
  "clipnest.quickClip.selectedText";

function ensureClipNestContextMenu() {
  chrome.contextMenus.create(
    {
      id: CLIPNEST_CONTEXT_MENU_ID,
      title: "ClipNest",
      contexts: [
        "page",
        "selection"
      ],
      documentUrlPatterns: [
        "http://*/*",
        "https://*/*"
      ]
    },
    () => {
      void chrome.runtime.lastError;
    }
  );
}

function ensureQuickClipContextMenu() {
  ensureClipNestContextMenu();

  chrome.contextMenus.create(
    {
      id: QUICK_CLIP_TEXT_MENU_ID,
      parentId:
        CLIPNEST_CONTEXT_MENU_ID,
      title: "Clip selected text",
      contexts: ["selection"],
      documentUrlPatterns: [
        "http://*/*",
        "https://*/*"
      ]
    },
    () => {
      void chrome.runtime.lastError;
    }
  );
}

ensureQuickClipContextMenu();

chrome.runtime.onInstalled.addListener(() => {
  ensureQuickClipContextMenu();
});

chrome.contextMenus.onClicked.addListener(
  (info, tab) => {
    if (
      info.menuItemId !==
      QUICK_CLIP_TEXT_MENU_ID
    ) {
      return;
    }

    void quickClipSelectedText(
      info,
      tab
    );
  }
);

async function quickClipSelectedText(
  info,
  tab
) {
  const selectedText =
    String(
      info.selectionText || ""
    ).trim();

  if (!selectedText) {
    await showQuickClipToast(
      tab?.id,
      "Nothing selected.",
      "error"
    );

    return;
  }

  const url =
    String(
      tab?.url ||
      info.pageUrl ||
      ""
    );

  if (!/^https?:/i.test(url)) {
    await showQuickClipToast(
      tab?.id,
      "ClipNest only clips normal webpages.",
      "error"
    );

    return;
  }

  try {
    const settings =
      await chrome.storage.local.get([
        "defaultDestination",
        "obsidianDefaultTemplatePath",
        "obsidianSubfolder"
      ]);

    const destination =
      settings.defaultDestination ===
      "notion"
        ? "notion"
        : "obsidian";

    const tags =
      [];

    const title =
      String(
        tab?.title ||
        "Untitled"
      ).trim() ||
      "Untitled";

    let hostname = "";

    try {
      hostname =
        new URL(url).hostname;
    } catch {
      hostname = "";
    }

    const selectionMarkdown =
      await getQuickSelectionMarkdown(
        tab?.id,
        selectedText
      );

    const body =
      `## Selected text\n\n` +
      selectionMarkdown;

    const markdown =
      destination === "notion"
        ? `[Source](${url})\n\n${body}`
        : body;

    let template = null;

    const templatePath =
      String(
        settings.obsidianDefaultTemplatePath ||
        ""
      ).trim();

    if (
      destination === "obsidian" &&
      templatePath
    ) {
      template =
        await getCachedObsidianTemplate(
          templatePath
        );

      if (!template) {
        try {
          await refreshObsidianTemplateCache();

          template =
            await getCachedObsidianTemplate(
              templatePath
            );
        } catch {
          /*
           * The actual save below will still provide
           * a useful permission error when applicable.
           */
        }
      }

      if (!template) {
        throw new Error(
          "Your default Obsidian template could not " +
          "be loaded. Open ClipNest once and try again."
        );
      }
    }

    const payload = {
      title,
      url,
      hostname,
      siteName: hostname,
      author: "",
      description: "",
      image: "",
      tags,
      notes: "",
      contentMode: "text",
      markdown,
      template
    };

    let successMessage = "";

    if (destination === "notion") {
      await saveToNotion(
        payload
      );

      successMessage =
        "Saved selected text to Notion";
    } else {
      const filename =
        await quickSaveToObsidian(
          payload,
          settings.obsidianSubfolder || ""
        );

      if (tags.length) {
        try {
          await rememberObsidianTags(
            tags
          );
        } catch {
          /*
           * Tag cache is non-critical after a
           * successful file save.
           */
        }
      }

      successMessage =
        filename
          ? `Saved to Obsidian · ${filename}`
          : "Saved selected text to Obsidian";
    }

    await showQuickClipToast(
      tab?.id,
      successMessage,
      "success"
    );
  } catch (error) {
    console.error(
      "ClipNest Quick Clip failed:",
      error
    );

    await showQuickClipToast(
      tab?.id,
      normalizeError(error).message ||
        "Quick Clip failed.",
      "error"
    );
  }
}

function quickQuoteMarkdown(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map(
      (line) =>
        `> ${line}`
    )
    .join("\n");
}

async function getQuickSelectionMarkdown(
  tabId,
  fallbackText
) {
  if (!Number.isInteger(tabId)) {
    return quickQuoteMarkdown(
      fallbackText
    );
  }

  try {
    const results =
      await chrome.scripting.executeScript({
        target: {
          tabId
        },

        func: () => {
          const selection =
            window.getSelection();

          if (
            !selection ||
            selection.rangeCount < 1 ||
            selection.isCollapsed
          ) {
            return null;
          }

          const range =
            selection.getRangeAt(0);

          const fragment =
            range.cloneContents();

          const cleanText = (value) =>
            String(value || "")
              .replace(/[ \t]+/g, " ")
              .trim();

          const renderChildren = (
            node
          ) => {
            return [
              ...node.childNodes
            ]
              .map(
                (child) =>
                  renderNode(child)
              )
              .join("");
          };

          const renderListItem = (
            item
          ) => {
            let text = "";

            for (
              const child of item.childNodes
            ) {
              if (
                child.nodeType ===
                  Node.ELEMENT_NODE &&
                (
                  child.tagName === "OL" ||
                  child.tagName === "UL"
                )
              ) {
                continue;
              }

              text +=
                renderNode(child);
            }

            return cleanText(text);
          };

          const renderList = (
            list,
            depth = 0
          ) => {
            const ordered =
              list.tagName === "OL";

            const startNumber =
              ordered
                ? (
                    Number(
                      list.getAttribute(
                        "start"
                      )
                    ) || 1
                  )
                : 1;

            const items = [
              ...list.children
            ].filter(
              (child) =>
                child.tagName === "LI"
            );

            const lines = [];

            items.forEach(
              (item, index) => {
                const itemText =
                  renderListItem(
                    item
                  );

                if (itemText) {
                  const prefix =
                    ordered
                      ? `${
                          startNumber +
                          index
                        }. `
                      : "- ";

                  lines.push(
                    `${"  ".repeat(depth)}${prefix}${itemText}`
                  );
                }

                for (
                  const child of
                    item.children
                ) {
                  if (
                    child.tagName ===
                      "OL" ||
                    child.tagName ===
                      "UL"
                  ) {
                    const nested =
                      renderList(
                        child,
                        depth + 1
                      );

                    if (nested) {
                      lines.push(
                        nested
                      );
                    }
                  }
                }
              }
            );

            return (
              lines.join("\n") +
              "\n\n"
            );
          };

          const renderNode = (
            node
          ) => {
            if (
              node.nodeType ===
              Node.TEXT_NODE
            ) {
              return node.nodeValue || "";
            }

            if (
              node.nodeType !==
              Node.ELEMENT_NODE
            ) {
              return "";
            }

            const tag =
              node.tagName;

            if (tag === "BR") {
              return "\n";
            }

            if (
              tag === "OL" ||
              tag === "UL"
            ) {
              return renderList(
                node
              );
            }

            const content =
              renderChildren(node);

            if (
              /^(P|DIV|SECTION|ARTICLE|H1|H2|H3|H4|H5|H6|BLOCKQUOTE)$/.test(
                tag
              )
            ) {
              return (
                content.trim() +
                "\n\n"
              );
            }

            return content;
          };

          let markdown =
            renderChildren(
              fragment
            );

          markdown = markdown
            .replace(
              /[ \t]+\n/g,
              "\n"
            )
            .replace(
              /\n[ \t]+/g,
              "\n"
            )
            .replace(
              /\n{3,}/g,
              "\n\n"
            )
            .trim();

          return markdown || null;
        }
      });

    const markdown =
      String(
        results?.[0]?.result ||
        ""
      ).trim();

    if (markdown) {
      return markdown
        .split(/\r?\n/)
        .map(
          (line) =>
            line.trim()
              ? `> ${line}`
              : ">"
        )
        .join("\n");
    }
  } catch {
    // Fall back to Chrome's plain selection text.
  }

  return quickQuoteMarkdown(
    fallbackText
  );
}

async function showQuickClipToast(
  tabId,
  message,
  kind = "success"
) {
  if (!Number.isInteger(tabId)) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: {
        tabId
      },

      func: (
        toastMessage,
        toastKind
      ) => {
        const ID =
          "__clipnestQuickClipToast";

        document
          .getElementById(ID)
          ?.remove();

        const toast =
          document.createElement("div");

        toast.id = ID;

        toast.textContent =
          toastMessage;

        const success =
          toastKind === "success";

        Object.assign(
          toast.style,
          {
            position: "fixed",
            right: "20px",
            bottom: "20px",
            zIndex: "2147483647",

            maxWidth: "420px",
            padding: "12px 16px",

            border:
              `1px solid ${
                success
                  ? "#9027db"
                  : "#db5b27"
              }`,

            borderRadius: "12px",

            background:
              "rgba(28,28,30,.96)",

            color: "#ffffff",

            boxShadow:
              "0 10px 35px rgba(0,0,0,.32)",

            fontFamily:
              '-apple-system,BlinkMacSystemFont,' +
              '"Segoe UI",sans-serif',

            fontSize: "14px",
            fontWeight: "650",
            lineHeight: "1.35",

            opacity: "0",
            transform:
              "translateY(8px)",

            transition:
              "opacity 140ms ease," +
              "transform 140ms ease",

            pointerEvents: "none"
          }
        );

        document.documentElement
          .appendChild(toast);

        requestAnimationFrame(
          () => {
            toast.style.opacity =
              "1";

            toast.style.transform =
              "translateY(0)";
          }
        );

        setTimeout(
          () => {
            toast.style.opacity =
              "0";

            toast.style.transform =
              "translateY(8px)";

            setTimeout(
              () => toast.remove(),
              180
            );
          },
          2600
        );
      },

      args: [
        String(message || ""),
        kind
      ]
    });
  } catch {
    /*
     * The save itself succeeded/failed independently
     * of whether the webpage permits a toast.
     */
  }
}


/* ==================================================
   ClipNest Quick Article - V0.6.4
   ================================================== */

const QUICK_CLIP_ARTICLE_MENU_ID =
  "clipnest.quickClip.article";

function ensureQuickArticleContextMenu() {
  ensureClipNestContextMenu();

  chrome.contextMenus.create(
    {
      id: QUICK_CLIP_ARTICLE_MENU_ID,
      parentId:
        CLIPNEST_CONTEXT_MENU_ID,
      title: "Clip article",
      contexts: [
        "page",
        "selection"
      ],
      documentUrlPatterns: [
        "http://*/*",
        "https://*/*"
      ]
    },
    () => {
      void chrome.runtime.lastError;
    }
  );
}

ensureQuickArticleContextMenu();

chrome.runtime.onInstalled.addListener(
  () => {
    ensureQuickArticleContextMenu();
  }
);

chrome.contextMenus.onClicked.addListener(
  (info, tab) => {
    if (
      info.menuItemId !==
      QUICK_CLIP_ARTICLE_MENU_ID
    ) {
      return;
    }

    void quickClipArticle(
      info,
      tab
    );
  }
);

async function captureQuickArticlePage(
  tabId
) {
  await chrome.scripting.executeScript({
    target: {
      tabId
    },
    files: [
      "article-capture.js"
    ]
  });

  const results =
    await chrome.scripting.executeScript({
      target: {
        tabId
      },

      func: () => {
        const capture =
          window.__clipnestPageCapture ||
          null;

        const error =
          window.__clipnestPageCaptureError ||
          "";

        delete window.__clipnestPageCapture;
        delete window.__clipnestPageCaptureError;

        return {
          capture,
          error
        };
      }
    });

  const pageResult =
    results?.[0]?.result;

  if (pageResult?.error) {
    throw new Error(
      pageResult.error
    );
  }

  if (!pageResult?.capture) {
    throw new Error(
      "Could not read this page."
    );
  }

  return pageResult.capture;
}

async function enhanceQuickArticleCapture(
  tabId,
  capture
) {
  try {
    await chrome.scripting.executeScript({
      target: {
        tabId
      },

      func: () => {
        window.__clipperWholePageMode =
          true;

        delete window.__clipperWholePageResult;
      }
    });

    await chrome.scripting.executeScript({
      target: {
        tabId
      },
      files: [
        "selector.js"
      ]
    });

    const results =
      await chrome.scripting.executeScript({
        target: {
          tabId
        },

        func: () => {
          const result =
            window.__clipperWholePageResult ||
            null;

          delete window.__clipperWholePageResult;
          delete window.__clipperWholePageMode;

          return result;
        }
      });

    const result =
      results?.[0]?.result;

    delete capture.structuredMarkdown;

    if (
      ClipNestArticleEngine
        .shouldPreferStructuredArticle(
          capture,
          result
        )
    ) {
      capture.structuredMarkdown =
        result.markdown;
    }
  } catch {
    /*
     * Smart repeated-record detection is optional.
     * The normal Article capture remains the fallback.
     */
  }
}

async function quickClipArticle(
  info,
  tab
) {
  const tabId =
    tab?.id;

  const url =
    String(
      tab?.url ||
      info.pageUrl ||
      ""
    );

  if (
    !Number.isInteger(tabId) ||
    !/^https?:/i.test(url)
  ) {
    await showQuickClipToast(
      tabId,
      "ClipNest only clips normal webpages.",
      "error"
    );

    return;
  }

  try {
    await showQuickClipToast(
      tabId,
      "Clipping article…",
      "success"
    );

    const capture =
      await captureQuickArticlePage(
        tabId
      );

    await enhanceQuickArticleCapture(
      tabId,
      capture
    );

    const title =
      String(
        capture.title ||
        tab?.title ||
        "Untitled"
      ).trim() ||
      "Untitled";

    const articleMarkdown =
      ClipNestArticleEngine
        .cleanArticleMarkdown(
          capture.structuredMarkdown ||
            capture.markdown ||
            "",
          title
        );

    if (!articleMarkdown) {
      throw new Error(
        "ClipNest could not find useful article content on this page."
      );
    }

    const settings =
      await chrome.storage.local.get([
        "defaultDestination",
        "obsidianDefaultTemplatePath",
        "obsidianSubfolder"
      ]);

    const destination =
      settings.defaultDestination ===
      "notion"
        ? "notion"
        : "obsidian";

    const tags =
      [];

    let template = null;

    const templatePath =
      String(
        settings.obsidianDefaultTemplatePath ||
        ""
      ).trim();

    if (
      destination === "obsidian" &&
      templatePath
    ) {
      template =
        await getCachedObsidianTemplate(
          templatePath
        );

      if (!template) {
        try {
          await refreshObsidianTemplateCache();

          template =
            await getCachedObsidianTemplate(
              templatePath
            );
        } catch {
        }
      }

      if (!template) {
        throw new Error(
          "Your default Obsidian template could not " +
          "be loaded. Open ClipNest once and try again."
        );
      }
    }

    const body =
      `## Article\n\n${articleMarkdown}`;

    const markdown =
      destination === "notion"
        ? `[Source](${capture.url})\n\n${body}`
        : body;

    const payload = {
      title,
      url: capture.url,
      hostname:
        capture.hostname || "",
      siteName:
        capture.siteName || "",
      author:
        capture.author || "",
      description:
        capture.description || "",
      image:
        capture.image || "",
      tags,
      notes: "",
      contentMode: "article",
      markdown,
      template
    };

    let successMessage = "";

    if (destination === "notion") {
      await saveToNotion(
        payload
      );

      successMessage =
        "Saved article to Notion";
    } else {
      const filename =
        await quickSaveToObsidian(
          payload,
          settings.obsidianSubfolder ||
            ""
        );

      if (tags.length) {
        try {
          await rememberObsidianTags(
            tags
          );
        } catch {
        }
      }

      successMessage =
        filename
          ? `Saved to Obsidian · ${filename}`
          : "Saved article to Obsidian";
    }

    await showQuickClipToast(
      tabId,
      successMessage,
      "success"
    );
  } catch (error) {
    console.error(
      "ClipNest Quick Article failed:",
      error
    );

    await showQuickClipToast(
      tabId,
      normalizeError(error).message ||
        "Article clip failed.",
      "error"
    );
  }
}


/* ==================================================
   Obsidian folder picker - V0.7.3
   ================================================== */

const OBSIDIAN_FOLDER_CACHE_KEY =
  "obsidianFolderCacheByVault";

const OBSIDIAN_FOLDER_CACHE_TTL =
  5 * 60 * 1000;

async function getObsidianFolders(
  forceRefresh = false
) {
  const activeVaultId =
    await ClipNestVaultStore
      .getActiveVaultId();

  if (!activeVaultId) {
    return {
      folders: [],
      activeVaultId: "",
      updatedAt: 0
    };
  }

  const stored =
    await chrome.storage.local.get([
      OBSIDIAN_FOLDER_CACHE_KEY
    ]);

  const cache =
    (
      stored[
        OBSIDIAN_FOLDER_CACHE_KEY
      ] &&
      typeof stored[
        OBSIDIAN_FOLDER_CACHE_KEY
      ] === "object"
    )
      ? stored[
          OBSIDIAN_FOLDER_CACHE_KEY
        ]
      : {};

  const current =
    cache[activeVaultId];

  if (
    !forceRefresh &&
    current &&
    Array.isArray(current.folders) &&
    (
      Date.now() -
      Number(current.updatedAt || 0)
    ) < OBSIDIAN_FOLDER_CACHE_TTL
  ) {
    return {
      folders: current.folders,
      activeVaultId,
      updatedAt:
        Number(
          current.updatedAt || 0
        )
    };
  }

  const handle =
    await ClipNestVaultStore
      .getVaultHandle(
        activeVaultId
      );

  if (!handle) {
    throw new Error(
      "The selected Obsidian vault is no longer connected."
    );
  }

  const permission =
    await handle.queryPermission({
      mode: "read"
    });

  if (permission !== "granted") {
    throw new Error(
      "Chrome needs permission to read this vault again. Open Settings and reconnect it."
    );
  }

  const folders =
    await scanObsidianFolders(
      handle
    );

  const updatedAt =
    Date.now();

  cache[activeVaultId] = {
    folders,
    updatedAt
  };

  await chrome.storage.local.set({
    [OBSIDIAN_FOLDER_CACHE_KEY]:
      cache
  });

  return {
    folders,
    activeVaultId,
    updatedAt
  };
}

async function scanObsidianFolders(
  root
) {
  const folders = [];

  const skippedNames =
    new Set([
      ".obsidian",
      ".git",
      ".trash",
      "node_modules"
    ]);

  const MAX_FOLDERS = 2000;
  const MAX_DEPTH = 8;

  async function visit(
    directory,
    prefix,
    depth
  ) {
    if (
      depth >= MAX_DEPTH ||
      folders.length >= MAX_FOLDERS
    ) {
      return;
    }

    const entries = [];

    for await (
      const [name, handle]
      of directory.entries()
    ) {
      if (
        handle.kind !== "directory"
      ) {
        continue;
      }

      if (
        !name ||
        name.startsWith(".") ||
        skippedNames.has(name)
      ) {
        continue;
      }

      entries.push({
        name,
        handle
      });
    }

    entries.sort(
      (a, b) =>
        a.name.localeCompare(
          b.name,
          undefined,
          {
            numeric: true,
            sensitivity: "base"
          }
        )
    );

    for (
      const entry of entries
    ) {
      if (
        folders.length >=
        MAX_FOLDERS
      ) {
        break;
      }

      const path =
        prefix
          ? `${prefix}/${entry.name}`
          : entry.name;

      folders.push(path);

      await visit(
        entry.handle,
        path,
        depth + 1
      );
    }
  }

  await visit(
    root,
    "",
    0
  );

  return folders;
}

chrome.runtime.onMessage.addListener(
  (
    message,
    sender,
    sendResponse
  ) => {
    if (
      message?.type !==
        "obsidian.folders.get" &&
      message?.type !==
        "obsidian.folders.refresh"
    ) {
      return;
    }

    const forceRefresh =
      message.type ===
        "obsidian.folders.refresh" ||
      message.force === true;

    getObsidianFolders(
      forceRefresh
    )
      .then(
        (result) => {
          sendResponse({
            ok: true,
            ...result
          });
        }
      )
      .catch(
        (error) => {
          sendResponse({
            ok: false,
            error:
              normalizeError(error)
          });
        }
      );

    return true;
  }
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "clipper.areaSelected") {
    const payload = message.payload || {};

    chrome.storage.local.set({
      pendingAreaSelection: {
        tabId: sender.tab?.id ?? null,
        url: String(payload.url || sender.tab?.url || ""),
        markdown: String(payload.markdown || "").slice(0, 500000),
        text: String(payload.text || "").slice(0, 100000),
        capturedAt: Number(payload.capturedAt || Date.now())
      }
    })
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: normalizeError(error)
        })
      );

    return true;
  }

  if (message?.type === "clipper.quickSaveSelection") {
    (async () => {
      try {
        const requestedUrl = String(
          message.payload?.url ||
          sender.tab?.url ||
          ""
        );

        const state =
          await chrome.storage.local.get([
            "pendingQuickClipDraft",
            "pendingAreaSelection",
            "obsidianSubfolder"
          ]);

        const draft =
          state.pendingQuickClipDraft;

        const selection =
          state.pendingAreaSelection;

        if (!draft) {
          throw new Error(
            "Quick-save draft is missing. Open the clipper and select the area again."
          );
        }

        if (!selection?.markdown) {
          throw new Error(
            "Selected content is missing. Please reselect the area."
          );
        }

        if (
          requestedUrl &&
          draft.url &&
          requestedUrl !== draft.url
        ) {
          throw new Error(
            "The page changed after selection. Please select the area again."
          );
        }

        const destination =
          draft.destination === "notion"
            ? "notion"
            : "obsidian";

        const payload =
          buildQuickSelectionPayload(
            draft,
            selection,
            destination
          );

        if (
          destination === "obsidian" &&
          draft.templatePath
        ) {
          payload.template =
            await getCachedObsidianTemplate(
              draft.templatePath
            );
        }

        let filename = "";

        if (destination === "notion") {
          await saveToNotion(payload);
        } else {
          filename =
            await quickSaveToObsidian(
              payload,
              state.obsidianSubfolder || ""
            );
        }

        await chrome.storage.local.remove([
          "pendingAreaSelection",
          "pendingQuickClipDraft",
          "pendingQuickSave"
        ]);

        sendResponse({
          ok: true,
          destination,
          filename
        });
      } catch (error) {
        sendResponse({
          ok: false,
          error: normalizeError(error)
        });
      }
    })();

    return true;
  }

  if (message?.type === "clipper.cancelQuickClip") {
    chrome.storage.local.remove([
      "pendingAreaSelection",
      "pendingQuickClipDraft",
      "pendingQuickSave"
    ])
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: normalizeError(error)
        })
      );

    return true;
  }

  if (message?.type === "clipper.clearQuickSaveState") {
    chrome.storage.local.remove([
      "pendingAreaSelection",
      "pendingQuickSave"
    ])
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: {
            message:
              error?.message ||
              String(error)
          }
        })
      );

    return true;
  }

  if (message?.type === "obsidian.templates.get") {
    chrome.storage.local.get([
      "obsidianTemplateCache",
      "obsidianTemplateCacheUpdatedAt",
      "obsidianTemplateFolders"
    ])
      .then((data) => {
        const updatedAt =
          Number(
            data.obsidianTemplateCacheUpdatedAt || 0
          );

        sendResponse({
          ok: true,
          templates:
            Array.isArray(
              data.obsidianTemplateCache
            )
              ? data.obsidianTemplateCache
              : [],
          folders:
            Array.isArray(
              data.obsidianTemplateFolders
            )
              ? data.obsidianTemplateFolders
              : [],
          updatedAt,
          stale:
            !updatedAt ||
            Date.now() - updatedAt >
              10 * 60 * 1000
        });
      })
      .catch((error) =>
        sendResponse({
          ok: false,
          error: normalizeError(error)
        })
      );

    return true;
  }

  if (
    message?.type ===
    "obsidian.templates.refresh"
  ) {
    refreshObsidianTemplateCache()
      .then((result) =>
        sendResponse({
          ok: true,
          ...result
        })
      )
      .catch((error) =>
        sendResponse({
          ok: false,
          error: normalizeError(error)
        })
      );

    return true;
  }

  if (message?.type === "obsidian.tags.get") {
    chrome.storage.local.get([
      "obsidianTagCache",
      "obsidianTagCacheUpdatedAt",
      "obsidianTagCacheFileCount"
    ])
      .then((data) => {
        const updatedAt =
          Number(data.obsidianTagCacheUpdatedAt || 0);

        sendResponse({
          ok: true,
          tags: Array.isArray(data.obsidianTagCache)
            ? data.obsidianTagCache
            : [],
          updatedAt,
          fileCount:
            Number(data.obsidianTagCacheFileCount || 0),
          stale:
            !updatedAt ||
            Date.now() - updatedAt >
              10 * 60 * 1000
        });
      })
      .catch((error) =>
        sendResponse({
          ok: false,
          error: normalizeError(error)
        })
      );

    return true;
  }

  if (message?.type === "obsidian.tags.refresh") {
    refreshObsidianTagCache()
      .then((result) =>
        sendResponse({
          ok: true,
          ...result
        })
      )
      .catch((error) =>
        sendResponse({
          ok: false,
          error: normalizeError(error)
        })
      );

    return true;
  }

  if (message?.type === "obsidian.tags.remember") {
    rememberObsidianTags(message.tags)
      .then((tags) =>
        sendResponse({
          ok: true,
          tags
        })
      )
      .catch((error) =>
        sendResponse({
          ok: false,
          error: normalizeError(error)
        })
      );

    return true;
  }

  if (message?.type === "notion.tags.options") {
    getNotionTagOptions()
      .then(
        (options) =>
          sendResponse({
            ok: true,
            options
          })
      )
      .catch(
        (error) =>
          sendResponse({
            ok: false,
            error:
              normalizeError(
                error
              )
          })
      );

    return true;
  }

  if (message?.type === "notion.save") {
    saveToNotion(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  });

function notionTagKey(
  value
) {
  return String(
    value ||
    ""
  )
    .trim()
    .toLowerCase();
}

function createNotionTagOptionId() {
  return crypto.randomUUID();
}

function chooseNotionTagColor(
  value
) {
  const colors = [
    "gray",
    "brown",
    "orange",
    "yellow",
    "green",
    "blue",
    "purple",
    "pink",
    "red"
  ];

  const text =
    notionTagKey(
      value
    );

  let hash =
    2166136261;

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    hash ^=
      text.charCodeAt(
        index
      );

    hash =
      Math.imul(
        hash,
        16777619
      );
  }

  return colors[
    (
      hash >>> 0
    ) %
    colors.length
  ];
}

async function ensureNotionTagOptionsForSave(
  preset,
  rawTags
) {
  const tags =
    [
      ...new Map(
        (
          Array.isArray(
            rawTags
          )
            ? rawTags
            : []
        )
          .map(
            (tag) =>
              String(
                tag ||
                ""
              ).trim()
          )
          .filter(Boolean)
          .map(
            (tag) => [
              notionTagKey(
                tag
              ),
              tag
            ]
          )
      ).values()
    ];

  if (
    !tags.length ||
    preset.destinationType !==
      "collection"
  ) {
    return tags;
  }

  const propertyId =
    String(
      preset.propertyIds
        ?.tags ||
      ""
    ).trim();

  if (!propertyId) {
    return tags;
  }

  const existing =
    await getNotionTagOptions();

  const existingByKey =
    new Map(
      existing.map(
        (option) => [
          notionTagKey(
            option.tag
          ),
          option
        ]
      )
    );

  const result =
    [];

  const missing =
    [];

  for (const tag of tags) {
    const key =
      notionTagKey(
        tag
      );

    const known =
      existingByKey.get(
        key
      );

    if (known) {
      result.push(
        known.tag
      );

      continue;
    }

    const option = {
      id:
        createNotionTagOptionId(),

      value:
        tag,

      color:
        chooseNotionTagColor(
          tag
        )
    };

    missing.push(
      option
    );

    existingByKey.set(
      key,
      {
        id:
          option.id,

        tag:
          option.value,

        color:
          option.color
      }
    );

    result.push(
      option.value
    );
  }

  if (!missing.length) {
    return result;
  }

  const operations =
    missing.map(
      (option) => ({
        pointer: {
          table:
            "collection",

          id:
            preset.destinationId,

          spaceId:
            preset.workspaceId
        },

        command:
          "keyedObjectListUpdate",

        path: [
          "schema",
          propertyId,
          "options"
        ],

        args: {
          value:
            option
        }
      })
    );

  await ClipNestNotionSession
    .submitOperations({
      workspaceId:
        preset.workspaceId,

      userId:
        preset.workspaceUserId,

      operations
    });

  for (const option of missing) {
    console.log(
      "ClipNest created Notion tag option:",
      {
        tag:
          option.value,

        color:
          option.color,

        database:
          preset.destinationName
      }
    );
  }

  return result;
}

async function getNotionTagOptions() {
  await ClipNestNotionStore
    .migrateLegacy();

  const preset =
    await ClipNestNotionStore
      .getActivePreset();

  if (
    !preset ||
    preset.destinationType !==
      "collection" ||
    !preset.destinationId
  ) {
    return [];
  }

  const tagsPropertyId =
    String(
      preset.propertyIds
        ?.tags ||
      ""
    ).trim();

  if (!tagsPropertyId) {
    return [];
  }

  let parentPageId =
    String(
      preset.destinationParentId ||
      ""
    ).trim();

  if (!parentPageId) {
    const result =
      await ClipNestNotionSession
        .searchDestinations({
          workspaceId:
            preset.workspaceId,

          userId:
            preset.workspaceUserId,

          query:
            preset.destinationName ||
            ""
        });

    const destination =
      result.destinations.find(
        (candidate) =>
          candidate.type ===
            "collection" &&
          candidate.id ===
            preset.destinationId
      );

    parentPageId =
      destination?.parentId ||
      "";
  }

  if (!parentPageId) {
    throw new Error(
      "ClipNest could not determine this Notion database's parent page."
    );
  }

  const database =
    await ClipNestNotionSession
      .getDatabaseSchema({
        workspaceId:
          preset.workspaceId,

        userId:
          preset.workspaceUserId,

        collectionId:
          preset.destinationId,

        parentPageId
      });

  const tagsProperty =
    database.properties.find(
      (property) =>
        property.id ===
          tagsPropertyId &&
        property.type ===
          "multi_select"
    );

  if (!tagsProperty) {
    return [];
  }

  const options =
    Array.isArray(
      tagsProperty.options
    )
      ? tagsProperty.options
      : [];

  return options
    .map(
      (option) => ({
        id:
          String(
            option?.id ||
            ""
          ).trim(),

        tag:
          String(
            option?.value ??
            option?.name ??
            ""
          ).trim(),

        color:
          String(
            option?.color ||
            ""
          ).trim()
      })
    )
    .filter(
      (option) =>
        option.tag
    );
}

function createNotionSelectOptionId() {
  if (
    globalThis.crypto
      ?.randomUUID
  ) {
    return globalThis.crypto
      .randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
    .replace(
      /[xy]/g,
      (character) => {
        const random =
          Math.random() *
          16 |
          0;

        const value =
          character === "x"
            ? random
            : (
                random &
                0x3 |
                0x8
              );

        return value
          .toString(
            16
          );
      }
    );
}

function chooseNotionSelectOptionColor(
  value
) {
  const colors = [
    "gray",
    "brown",
    "orange",
    "yellow",
    "green",
    "blue",
    "purple",
    "pink",
    "red"
  ];

  let hash =
    0;

  for (
    const character of
      String(
        value ||
        ""
      )
  ) {
    hash =
      (
        hash * 31 +
        character.charCodeAt(
          0
        )
      ) >>> 0;
  }

  return colors[
    hash %
    colors.length
  ];
}

async function ensureNotionSelectOptionsForSave(
  preset,
  customFields
) {
  const fields =
    Array.isArray(
      customFields
    )
      ? customFields
      : [];

  const selectFields =
    fields.filter(
      (field) =>
        field?.propertyType ===
          "select" &&
        String(
          field?.value ??
          ""
        ).trim()
    );

  if (
    !selectFields.length ||
    preset?.destinationType !==
      "collection"
  ) {
    return fields;
  }

  let parentPageId =
    String(
      preset.destinationParentId ||
      ""
    ).trim();

  if (!parentPageId) {
    const result =
      await ClipNestNotionSession
        .searchDestinations({
          workspaceId:
            preset.workspaceId,

          userId:
            preset.workspaceUserId,

          query:
            preset.destinationName ||
            ""
        });

    const destination =
      result.destinations.find(
        (candidate) =>
          candidate.type ===
            "collection" &&
          candidate.id ===
            preset.destinationId
      );

    parentPageId =
      destination?.parentId ||
      "";
  }

  if (!parentPageId) {
    throw new Error(
      "ClipNest could not determine this Notion database's parent page."
    );
  }

  const database =
    await ClipNestNotionSession
      .getDatabaseSchema({
        workspaceId:
          preset.workspaceId,

        userId:
          preset.workspaceUserId,

        collectionId:
          preset.destinationId,

        parentPageId
      });

  const createdByProperty =
    new Map();

  for (
    const field of
      selectFields
  ) {
    const propertyId =
      String(
        field.propertyId ||
        ""
      ).trim();

    const value =
      String(
        field.value ??
        ""
      ).trim();

    const property =
      database.properties.find(
        (candidate) =>
          candidate.id ===
            propertyId &&
          candidate.type ===
            "select"
      );

    if (!property) {
      continue;
    }

    const options =
      Array.isArray(
        property.options
      )
        ? property.options
        : [];

    const exists =
      options.some(
        (option) =>
          String(
            option?.value ??
            option?.name ??
            ""
          )
            .trim()
            .toLowerCase() ===
          value.toLowerCase()
      );

    if (exists) {
      continue;
    }

    const option = {
      id:
        createNotionSelectOptionId(),

      value,

      color:
        chooseNotionSelectOptionColor(
          value
        )
    };

    await ClipNestNotionSession
      .submitOperations({
        workspaceId:
          preset.workspaceId,

        userId:
          preset.workspaceUserId,

        operations: [
          {
            pointer: {
              table:
                "collection",

              id:
                preset.destinationId,

              spaceId:
                preset.workspaceId
            },

            command:
              "keyedObjectListUpdate",

            path: [
              "schema",
              propertyId,
              "options"
            ],

            args: {
              value:
                option
            }
          }
        ]
      });

    property.options = [
      ...options,
      option
    ];

    createdByProperty.set(
      propertyId,
      option
    );

    console.log(
      "ClipNest created Notion select option:",
      {
        property:
          property.name,

        value,

        color:
          option.color
      }
    );
  }

  if (
    createdByProperty.size
  ) {
    const updatedFields =
      (
        Array.isArray(
          preset.fields
        )
          ? preset.fields
          : []
      ).map(
        (field) => {
          const option =
            createdByProperty.get(
              String(
                field.propertyId ||
                ""
              )
            );

          if (!option) {
            return field;
          }

          const existing =
            Array.isArray(
              field.options
            )
              ? field.options
              : [];

          return {
            ...field,

            options: [
              ...existing,
              option
            ]
          };
        }
      );

    await ClipNestNotionStore
      .updateActivePreset({
        fields:
          updatedFields
      });
  }

  return fields;
}

async function ensureNotionMultiSelectOptionsForSave(
  preset,
  customFields
) {
  const fields =
    Array.isArray(
      customFields
    )
      ? customFields
      : [];

  const candidates =
    fields.filter(
      (field) =>
        field?.propertyType ===
          "multi_select" &&
        Array.isArray(
          field?.value
        ) &&
        field.value.length
    );

  if (
    !candidates.length ||
    preset?.destinationType !==
      "collection"
  ) {
    return fields;
  }

  let parentPageId =
    String(
      preset.destinationParentId ||
      ""
    ).trim();

  if (!parentPageId) {
    const search =
      await ClipNestNotionSession
        .searchDestinations({
          workspaceId:
            preset.workspaceId,

          userId:
            preset.workspaceUserId,

          query:
            preset.destinationName ||
            ""
        });

    const destination =
      search.destinations.find(
        (candidate) =>
          candidate.type ===
            "collection" &&
          candidate.id ===
            preset.destinationId
      );

    parentPageId =
      destination?.parentId ||
      "";
  }

  if (!parentPageId) {
    throw new Error(
      "ClipNest could not determine the Notion database parent."
    );
  }

  const database =
    await ClipNestNotionSession
      .getDatabaseSchema({
        workspaceId:
          preset.workspaceId,

        userId:
          preset.workspaceUserId,

        collectionId:
          preset.destinationId,

        parentPageId
      });

  const operations =
    [];

  const createdByProperty =
    new Map();

  function normalize(
    value
  ) {
    return String(
      value ||
      ""
    )
      .trim()
      .toLowerCase();
  }

  for (
    const field of
      candidates
  ) {
    const propertyId =
      String(
        field.propertyId ||
        ""
      ).trim();

    const property =
      database.properties.find(
        (candidate) =>
          candidate.id ===
            propertyId &&
          candidate.type ===
            "multi_select"
      );

    if (!property) {
      continue;
    }

    const existing =
      Array.isArray(
        property.options
      )
        ? [
            ...property.options
          ]
        : [];

    const known =
      new Set(
        existing.map(
          (option) =>
            normalize(
              option?.value ??
              option?.name
            )
        )
      );

    for (
      const rawValue of
        field.value
    ) {
      const value =
        String(
          rawValue ||
          ""
        ).trim();

      if (
        !value ||
        known.has(
          normalize(
            value
          )
        )
      ) {
        continue;
      }

      const option = {
        id:
          createNotionTagOptionId(),

        value,

        color:
          chooseNotionTagColor(
            value
          )
      };

      operations.push({
        pointer: {
          table:
            "collection",

          id:
            preset.destinationId,

          spaceId:
            preset.workspaceId
        },

        command:
          "keyedObjectListUpdate",

        path: [
          "schema",
          propertyId,
          "options"
        ],

        args: {
          value:
            option
        }
      });

      known.add(
        normalize(
          value
        )
      );

      if (
        !createdByProperty.has(
          propertyId
        )
      ) {
        createdByProperty.set(
          propertyId,
          []
        );
      }

      createdByProperty
        .get(
          propertyId
        )
        .push(
          option
        );
    }
  }

  if (!operations.length) {
    return fields;
  }

  await ClipNestNotionSession
    .submitOperations({
      workspaceId:
        preset.workspaceId,

      userId:
        preset.workspaceUserId,

      operations
    });

  const updatedFields =
    (
      Array.isArray(
        preset.fields
      )
        ? preset.fields
        : []
    ).map(
      (field) => {
        const created =
          createdByProperty.get(
            String(
              field.propertyId ||
              ""
            )
          );

        if (
          !created?.length
        ) {
          return field;
        }

        return {
          ...field,

          options: [
            ...(
              Array.isArray(
                field.options
              )
                ? field.options
                : []
            ),
            ...created
          ]
        };
      }
    );

  await ClipNestNotionStore
    .updateActivePreset({
      fields:
        updatedFields
    });

  return fields;
}

async function saveToNotion(
  payload
) {
  await ClipNestNotionStore
    .migrateLegacy();

  const preset =
    await ClipNestNotionStore
      .getActivePreset();

  if (!preset) {
    throw new Error(
      "No Notion preset is selected. Open Settings and create one."
    );
  }

  if (
    !preset.workspaceId ||
    !preset.workspaceUserId
  ) {
    throw new Error(
      "The selected Notion preset does not have a workspace."
    );
  }

  if (
    !preset.destinationId ||
    !preset.destinationType
  ) {
    throw new Error(
      "The selected Notion preset does not have a destination."
    );
  }

  const title =
    String(
      payload?.title ||
      "Untitled"
    )
      .trim()
      .slice(
        0,
        2000
      ) ||
    "Untitled";

  const url =
    String(
      payload?.url ||
      ""
    ).trim();

  const tags =
    Array.isArray(
      payload?.tags
    )
      ? [
          ...new Set(
            payload.tags
              .map(
                (tag) =>
                  String(
                    tag ||
                    ""
                  ).trim()
              )
              .filter(Boolean)
          )
        ]
      : [];

  const markdown =
    String(
      payload?.markdown ||
      ""
    ).trim();

  const dynamicValues =
    payload?.notionFields &&
    typeof payload.notionFields ===
      "object"
      ? payload.notionFields
      : {};

  const customFields =
    (
      Array.isArray(
        preset.fields
      )
        ? preset.fields
        : []
    )
      .filter(
        (field) =>
          [
            "multi_select",
            "select",
            "status",
            "text",
            "rich_text",
            "checkbox",
            "number",
            "date"
          ].includes(
            String(
              field?.propertyType ||
              ""
            )
          )
      )
      .map(
        (field) => ({
          propertyId:
            String(
              field.propertyId ||
              ""
            ).trim(),

          propertyType:
            String(
              field.propertyType ||
              ""
            ).trim(),

          numberFormat:
            String(
              field.numberFormat ||
              ""
            ).trim(),

          value:
            Object.prototype
              .hasOwnProperty.call(
                dynamicValues,
                field.propertyId
              )
              ? dynamicValues[
                  field.propertyId
                ]
              : field.defaultValue
        })
      );

  const preparedSelectFields =
    preset.destinationType ===
      "collection"
      ? await ensureNotionSelectOptionsForSave(
          preset,
          customFields
        )
      : customFields;

  const preparedCustomFields =
    preset.destinationType ===
      "collection"
      ? await ensureNotionMultiSelectOptionsForSave(
          preset,
          preparedSelectFields
        )
      : preparedSelectFields;

  let page =
    null;

  if (
    preset.destinationType ===
      "collection"
  ) {
    const titlePropertyId =
      String(
        preset.propertyIds
          ?.title ||
        ""
      ).trim();

    if (!titlePropertyId) {
      throw new Error(
        "The selected Notion database has no Title property mapping."
      );
    }

    const databaseTags =
      await ensureNotionTagOptionsForSave(
        preset,
        tags
      );

    const properties =
      ClipNestNotionSession
        .encodeDatabaseProperties({
          title,
          url,
          tags:
            databaseTags,

          propertyIds: {
            title:
              titlePropertyId,

            url:
              preset.propertyIds
                ?.url ||
              "",

            tags:
              preset.propertyIds
                ?.tags ||
              ""
          },

          customFields:
            preparedCustomFields
        });

    page =
      await ClipNestNotionSession
        .createPage({
          workspaceId:
            preset.workspaceId,

          userId:
            preset.workspaceUserId,

          parentId:
            preset.destinationId,

          parentTable:
            "collection",

          title:
            "",

          properties
        });
  } else if (
    preset.destinationType ===
      "page"
  ) {
    page =
      await ClipNestNotionSession
        .createPage({
          workspaceId:
            preset.workspaceId,

          userId:
            preset.workspaceUserId,

          parentId:
            preset.destinationId,

          parentTable:
            "block",

          title,

          properties:
            {}
        });
  } else {
    throw new Error(
      "The selected Notion destination type is not supported."
    );
  }

  try {
    const content =
      await ClipNestNotionSession
        .appendMarkdownToPage({
          workspaceId:
            preset.workspaceId,

          userId:
            preset.workspaceUserId,

          pageId:
            page.id,

          markdown
        });

    console.log(
      "ClipNest Notion save succeeded:",
      {
        preset:
          preset.name,

        workspace:
          preset.workspaceName,

        destination:
          preset.destinationName,

        destinationType:
          preset.destinationType,

        pageId:
          page.id,

        blockCount:
          content.blockCount
      }
    );

    return {
      id:
        page.id,

      url:
        page.url,

      blockCount:
        content.blockCount
    };
  } catch (error) {
    console.error(
      "ClipNest created the Notion page but failed to append content:",
      {
        pageId:
          page?.id,

        pageUrl:
          page?.url,

        error
      }
    );

    const wrapped =
      new Error(
        "The Notion page was created, but ClipNest could not write its content. " +
        (
          error?.message ||
          String(error)
        )
      );

    wrapped.pageId =
      page?.id ||
      "";

    wrapped.pageUrl =
      page?.url ||
      "";

    wrapped.attempts =
      error?.attempts ||
      [];

    throw wrapped;
  }
}

function normalizeError(error) {
  return {
    name: error?.name || "Error",
    message: error?.message || String(error)
  };
}


/* =================================================
   Direct quick-save helpers
   ================================================= */

const QUICK_DB_NAME = "clip-to-notion-obsidian";
const QUICK_DB_VERSION = 1;
const QUICK_STORE_NAME = "handles";
const QUICK_VAULT_KEY = "obsidian-vault";

function openQuickHandleDb() {
  return new Promise((resolve, reject) => {
    const request =
      indexedDB.open(
        QUICK_DB_NAME,
        QUICK_DB_VERSION
      );

    request.onupgradeneeded = () => {
      const db = request.result;

      if (
        !db.objectStoreNames.contains(
          QUICK_STORE_NAME
        )
      ) {
        db.createObjectStore(
          QUICK_STORE_NAME
        );
      }
    };

    request.onsuccess = () =>
      resolve(request.result);

    request.onerror = () =>
      reject(request.error);
  });
}

async function getQuickVaultHandle() {
  return ClipNestVaultStore
    .getVaultHandle();
}

function parseQuickTags(value) {
  return [
    ...new Set(
      String(value || "")
        .split(",")
        .map((tag) =>
          tag
            .trim()
            .replace(/^#/, "")
        )
        .filter(Boolean)
    )
  ];
}

function buildQuickSelectionPayload(
  draft,
  selection,
  destination
) {
  const title =
    String(
      draft.title ||
      "Untitled"
    ).trim() ||
    "Untitled";

  const url =
    String(
      draft.url ||
      selection.url ||
      ""
    );

  const notes =
    String(
      draft.notes ||
      ""
    ).trim();

  const tags =
    parseQuickTags(
      draft.tags
    );

  const sections = [];

  if (notes) {
    sections.push(
      `## Notes\n\n${notes}`
    );
  }

  sections.push(
    `## Clipped content\n\n${selection.markdown}`
  );

  if (destination === "notion") {
    sections.unshift(
      `[Source](${url})`
    );
  }

  return {
    title,
    url,
    tags,
    notes,
    contentMode: "selection",
    markdown: sections
      .filter(Boolean)
      .join("\n\n")
      .trim()
  };
}

async function quickSaveToObsidian(
  payload,
  rawSubfolder
) {
  const handle =
    await getQuickVaultHandle();

  if (!handle) {
    throw new Error(
      "No Obsidian vault is connected. Open Settings and choose the vault folder."
    );
  }

  const permission =
    await handle.queryPermission({
      mode: "readwrite"
    });

  if (permission !== "granted") {
    throw new Error(
      "Chrome needs vault permission again. Open the extension Settings and reconnect the vault."
    );
  }

  const directory =
    await getQuickSubfolder(
      handle,
      rawSubfolder
    );

  const baseName =
    sanitizeQuickFilename(
      payload.title
    ) || "Untitled";

  const filename =
    await findQuickFilename(
      directory,
      baseName,
      ".md"
    );

  const fileHandle =
    await directory.getFileHandle(
      filename,
      { create: true }
    );

  const writable =
    await fileHandle.createWritable();

  await writable.write(
    payload.template?.content
      ? applyQuickObsidianTemplate(
          payload.template.content,
          payload
        )
      : buildQuickObsidianMarkdown(
          payload
        )
  );

  await writable.close();

  try {
    await rememberObsidianTags(
      payload.tags
    );
  } catch {
    // Saving the note is more important than updating the tag cache.
  }

  return filename;
}

async function getQuickSubfolder(
  root,
  rawPath
) {
  const parts =
    String(rawPath || "")
      .split("/")
      .map((part) =>
        part.trim()
      )
      .filter(Boolean)
      .filter(
        (part) =>
          part !== "." &&
          part !== ".."
      );

  let current = root;

  for (const part of parts) {
    current =
      await current.getDirectoryHandle(
        part,
        { create: true }
      );
  }

  return current;
}

async function findQuickFilename(
  directory,
  baseName,
  extension
) {
  for (
    let index = 1;
    index < 1000;
    index += 1
  ) {
    const suffix =
      index === 1
        ? ""
        : ` (${index})`;

    const candidate =
      `${baseName}${suffix}${extension}`;

    try {
      await directory.getFileHandle(
        candidate,
        { create: false }
      );
    } catch (error) {
      if (
        error?.name ===
        "NotFoundError"
      ) {
        return candidate;
      }

      throw error;
    }
  }

  throw new Error(
    "Could not create a unique note filename."
  );
}

function buildQuickObsidianMarkdown(
  payload
) {
  const tags =
    Array.isArray(payload.tags)
      ? payload.tags
      : [];

  const frontmatter = [
    "---",
    "aliases: []",
    tags.length
      ? "tags:"
      : "tags: []",
    ...tags.map(
      (tag) =>
        `  - ${quickYamlString(tag)}`
    ),
    `source: ${quickYamlString(payload.url)}`,
    "---"
  ].join("\n");

  return (
    `${frontmatter}\n\n` +
    `# ${payload.title}\n\n` +
    `${payload.markdown}\n`
  );
}

function quickYamlString(value) {
  return JSON.stringify(
    String(value || "")
  );
}

function sanitizeQuickFilename(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 140);
}


/* =================================================
   Obsidian tag index
   ================================================= */

async function refreshObsidianTagCache() {
  const handle =
    await getQuickVaultHandle();

  if (!handle) {
    throw new Error(
      "No Obsidian vault is connected."
    );
  }

  const permission =
    await handle.queryPermission({
      mode: "read"
    });

  if (permission !== "granted") {
    throw new Error(
      "Chrome needs access to the Obsidian vault again. Open Settings and reconnect the vault."
    );
  }

  const counts = new Map();

  const stats = {
    files: 0,
    folders: 0
  };

  await scanObsidianTagDirectory(
    handle,
    counts,
    stats,
    0
  );

  const tags = [...counts.entries()]
    .map(([tag, data]) => ({
      tag: data.label,
      count: data.count
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.tag.localeCompare(
          b.tag,
          undefined,
          { sensitivity: "base" }
        )
    );

  const updatedAt =
    Date.now();

  await chrome.storage.local.set({
    obsidianTagCache: tags,
    obsidianTagCacheUpdatedAt:
      updatedAt,
    obsidianTagCacheFileCount:
      stats.files
  });

  return {
    tags,
    updatedAt,
    fileCount: stats.files
  };
}

async function scanObsidianTagDirectory(
  directory,
  counts,
  stats,
  depth
) {
  if (depth > 30) {
    return;
  }

  const skippedFolders =
    new Set([
      ".obsidian",
      ".git",
      ".trash",
      "node_modules"
    ]);

  for await (
    const entry of directory.values()
  ) {
    if (
      entry.kind === "directory"
    ) {
      if (
        skippedFolders.has(entry.name) ||
        entry.name.startsWith(".")
      ) {
        continue;
      }

      stats.folders += 1;

      await scanObsidianTagDirectory(
        entry,
        counts,
        stats,
        depth + 1
      );

      continue;
    }

    if (
      entry.kind !== "file" ||
      !entry.name.toLowerCase().endsWith(".md")
    ) {
      continue;
    }

    // Safety limit for very large vaults.
    if (stats.files >= 25000) {
      return;
    }

    stats.files += 1;

    try {
      const file =
        await entry.getFile();

      const header =
        await file
          .slice(0, 65536)
          .text();

      const tags =
        extractTagsFromFrontmatter(
          header
        );

      for (const tag of tags) {
        const key =
          tag.toLowerCase();

        const current =
          counts.get(key);

        if (current) {
          current.count += 1;
        } else {
          counts.set(key, {
            label: tag,
            count: 1
          });
        }
      }
    } catch {
      // Ignore unreadable individual notes.
    }
  }
}

function extractTagsFromFrontmatter(
  source
) {
  const text =
    String(source || "")
      .replace(/^\uFEFF/, "");

  if (!text.startsWith("---")) {
    return [];
  }

  const end =
    text.indexOf("\n---", 3);

  if (end < 0) {
    return [];
  }

  const yaml =
    text.slice(3, end);

  const lines =
    yaml.split(/\r?\n/);

  const result = [];
  let readingTags = false;

  for (const line of lines) {
    const tagMatch =
      line.match(
        /^tags\s*:\s*(.*)$/i
      );

    if (tagMatch) {
      readingTags = true;

      const inline =
        tagMatch[1].trim();

      if (inline) {
        for (
          const value of parseYamlTagValue(
            inline
          )
        ) {
          result.push(value);
        }

        // Scalar / inline tags are complete.
        readingTags = false;
      }

      continue;
    }

    if (readingTags) {
      const item =
        line.match(
          /^\s*-\s*(.+?)\s*$/
        );

      if (item) {
        const value =
          cleanYamlTag(
            item[1]
          );

        if (value) {
          result.push(value);
        }

        continue;
      }

      if (
        /^\S[^:]*\s*:/.test(line)
      ) {
        readingTags = false;
      }
    }
  }

  return [
    ...new Set(
      result
        .map((tag) =>
          String(tag)
            .trim()
            .replace(/^#/, "")
        )
        .filter(Boolean)
    )
  ];
}

function parseYamlTagValue(value) {
  const raw =
    String(value || "").trim();

  if (!raw) {
    return [];
  }

  if (
    raw.startsWith("[") &&
    raw.endsWith("]")
  ) {
    return raw
      .slice(1, -1)
      .split(",")
      .map(cleanYamlTag)
      .filter(Boolean);
  }

  const single =
    cleanYamlTag(raw);

  return single
    ? [single]
    : [];
}

function cleanYamlTag(value) {
  let result =
    String(value || "").trim();

  if (
    (
      result.startsWith('"') &&
      result.endsWith('"')
    ) ||
    (
      result.startsWith("'") &&
      result.endsWith("'")
    )
  ) {
    result =
      result.slice(1, -1);
  }

  return result
    .trim()
    .replace(/^#/, "");
}

async function rememberObsidianTags(
  rawTags
) {
  const incoming =
    Array.isArray(rawTags)
      ? rawTags
      : [];

  if (!incoming.length) {
    const current =
      await chrome.storage.local.get(
        "obsidianTagCache"
      );

    return Array.isArray(
      current.obsidianTagCache
    )
      ? current.obsidianTagCache
      : [];
  }

  const stored =
    await chrome.storage.local.get(
      "obsidianTagCache"
    );

  const current =
    Array.isArray(
      stored.obsidianTagCache
    )
      ? stored.obsidianTagCache
      : [];

  const map =
    new Map(
      current.map((item) => [
        String(item.tag || "")
          .toLowerCase(),
        {
          tag: String(
            item.tag || ""
          ),
          count: Number(
            item.count || 1
          )
        }
      ])
    );

  for (const rawTag of incoming) {
    const tag =
      String(rawTag || "")
        .trim()
        .replace(/^#/, "");

    if (!tag) {
      continue;
    }

    const key =
      tag.toLowerCase();

    if (!map.has(key)) {
      map.set(key, {
        tag,
        count: 1
      });
    }
  }

  const tags =
    [...map.values()]
      .filter((item) =>
        item.tag
      )
      .sort(
        (a, b) =>
          b.count - a.count ||
          a.tag.localeCompare(
            b.tag,
            undefined,
            { sensitivity: "base" }
          )
      );

  await chrome.storage.local.set({
    obsidianTagCache: tags
  });

  return tags;
}


/* =================================================
   Obsidian template discovery
   ================================================= */

async function refreshObsidianTemplateCache() {
  const vault =
    await getQuickVaultHandle();

  if (!vault) {
    throw new Error(
      "No Obsidian vault is connected."
    );
  }

  const permission =
    await vault.queryPermission({
      mode: "read"
    });

  if (permission !== "granted") {
    throw new Error(
      "Chrome needs vault permission again."
    );
  }

  const discovered = [];

  const core =
    await readVaultJson(
      vault,
      [
        ".obsidian",
        "templates.json"
      ]
    );

  if (
    core &&
    typeof core.folder === "string" &&
    core.folder.trim()
  ) {
    discovered.push({
      path: normalizeVaultPath(
        core.folder
      ),
      source: "Obsidian"
    });
  }

  const templater =
    await readVaultJson(
      vault,
      [
        ".obsidian",
        "plugins",
        "templater-obsidian",
        "data.json"
      ]
    );

  if (
    templater &&
    typeof templater.templates_folder ===
      "string" &&
    templater.templates_folder.trim()
  ) {
    discovered.push({
      path: normalizeVaultPath(
        templater.templates_folder
      ),
      source: "Templater"
    });
  }

  const folderMap =
    new Map();

  for (const item of discovered) {
    if (!item.path) continue;

    const existing =
      folderMap.get(item.path);

    if (existing) {
      if (
        !existing.sources.includes(
          item.source
        )
      ) {
        existing.sources.push(
          item.source
        );
      }
    } else {
      folderMap.set(
        item.path,
        {
          path: item.path,
          sources: [item.source]
        }
      );
    }
  }

  const templates = [];

  let totalChars = 0;

  for (
    const folder of folderMap.values()
  ) {
    const handle =
      await getExistingVaultDirectory(
        vault,
        folder.path
      );

    if (!handle) {
      continue;
    }

    await scanTemplateFolder(
      handle,
      folder.path,
      folder.sources.join(" + "),
      templates,
      {
        totalChars
      }
    );

    totalChars =
      templates.reduce(
        (sum, item) =>
          sum +
          String(item.content || "")
            .length,
        0
      );
  }

  const unique =
    new Map();

  for (const item of templates) {
    if (!unique.has(item.path)) {
      unique.set(item.path, item);
    }
  }

  const result =
    [...unique.values()]
      .sort((a, b) =>
        a.name.localeCompare(
          b.name,
          undefined,
          { sensitivity: "base" }
        )
      )
      .slice(0, 500);

  const folders =
    [...folderMap.values()]
      .map((item) =>
        item.sources.length > 1
          ? `${item.path} (${item.sources.join(" + ")})`
          : `${item.path} (${item.sources[0]})`
      );

  const updatedAt =
    Date.now();

  await chrome.storage.local.set({
    obsidianTemplateCache:
      result,
    obsidianTemplateCacheUpdatedAt:
      updatedAt,
    obsidianTemplateFolders:
      folders
  });

  return {
    templates: result,
    folders,
    updatedAt
  };
}

function normalizeVaultPath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((part) =>
      part.trim()
    )
    .filter(
      (part) =>
        part &&
        part !== "." &&
        part !== ".."
    )
    .join("/");
}

async function readVaultJson(
  root,
  parts
) {
  try {
    let current = root;

    for (
      let index = 0;
      index < parts.length - 1;
      index += 1
    ) {
      current =
        await current.getDirectoryHandle(
          parts[index],
          { create: false }
        );
    }

    const fileHandle =
      await current.getFileHandle(
        parts[parts.length - 1],
        { create: false }
      );

    const file =
      await fileHandle.getFile();

    return JSON.parse(
      await file.text()
    );
  } catch {
    return null;
  }
}

async function getExistingVaultDirectory(
  root,
  path
) {
  try {
    let current = root;

    for (
      const part of normalizeVaultPath(
        path
      ).split("/").filter(Boolean)
    ) {
      current =
        await current.getDirectoryHandle(
          part,
          { create: false }
        );
    }

    return current;
  } catch {
    return null;
  }
}

async function scanTemplateFolder(
  directory,
  basePath,
  source,
  results,
  stats
) {
  if (
    results.length >= 500 ||
    stats.totalChars >= 4000000
  ) {
    return;
  }

  for await (
    const entry of directory.values()
  ) {
    if (
      results.length >= 500 ||
      stats.totalChars >= 4000000
    ) {
      return;
    }

    if (
      entry.kind === "directory"
    ) {
      await scanTemplateFolder(
        entry,
        `${basePath}/${entry.name}`,
        source,
        results,
        stats
      );

      continue;
    }

    if (
      entry.kind !== "file" ||
      !entry.name
        .toLowerCase()
        .endsWith(".md")
    ) {
      continue;
    }

    try {
      const file =
        await entry.getFile();

      if (file.size > 512000) {
        continue;
      }

      const content =
        await file.text();

      if (
        stats.totalChars +
          content.length >
        4000000
      ) {
        continue;
      }

      stats.totalChars +=
        content.length;

      results.push({
        name:
          entry.name.replace(
            /\.md$/i,
            ""
          ),
        path:
          `${basePath}/${entry.name}`,
        source,
        content
      });
    } catch {
      // Ignore an unreadable template.
    }
  }
}

async function getCachedObsidianTemplate(
  path
) {
  if (!path) {
    return null;
  }

  let stored =
    await chrome.storage.local.get(
      "obsidianTemplateCache"
    );

  let templates =
    Array.isArray(
      stored.obsidianTemplateCache
    )
      ? stored.obsidianTemplateCache
      : [];

  let match =
    templates.find(
      (item) =>
        item.path === path
    );

  if (match) {
    return match;
  }

  try {
    const refreshed =
      await refreshObsidianTemplateCache();

    templates =
      refreshed.templates || [];

    match =
      templates.find(
        (item) =>
          item.path === path
      );
  } catch {
    // Fall through.
  }

  return match || null;
}

function applyQuickObsidianTemplate(
  templateContent,
  payload
) {
  let output =
    String(templateContent || "")
      .replace(/^\uFEFF/, "");

  const now = new Date();

  const pad = (value) =>
    String(value).padStart(2, "0");

  const date =
    `${now.getFullYear()}-` +
    `${pad(now.getMonth() + 1)}-` +
    `${pad(now.getDate())}`;

  const time =
    `${pad(now.getHours())}:` +
    `${pad(now.getMinutes())}`;

  const hadContentToken =
    output.includes("{{content}}");

  const replacements = [
    ["{{title}}", payload.title || ""],
    ["{{source}}", payload.url || ""],
    ["{{url}}", payload.url || ""],
    ["{{date}}", date],
    ["{{time}}", time],
    ["{{content}}", payload.markdown || ""]
  ];

  for (
    const [token, value] of replacements
  ) {
    output =
      output.split(token).join(value);
  }

  output =
    mergeQuickTemplateFrontmatter(
      output,
      payload
    );

  if (
    !hadContentToken &&
    payload.markdown
  ) {
    output =
      insertQuickClipBeforeTemplateBody(
        output,
        payload
      );
  }

  const yamlEnd =
    output.startsWith("---")
      ? output.indexOf("\n---", 3)
      : -1;

  const body =
    yamlEnd >= 0
      ? output.slice(yamlEnd + 4)
      : output;

  if (!body.trim().match(/^#\s+/m)) {
    if (yamlEnd >= 0) {
      const before =
        output.slice(
          0,
          yamlEnd + 4
        );

      const after =
        output.slice(
          yamlEnd + 4
        ).replace(/^\s+/, "");

      output =
        `${before}\n\n` +
        `# ${payload.title}\n\n` +
        `${after}`;
    } else {
      output =
        `# ${payload.title}\n\n` +
        output;
    }
  }

  return output.trimEnd() + "\n";
}

function insertQuickClipBeforeTemplateBody(
  source,
  payload
) {
  const clip =
    String(payload.markdown || "").trim();

  if (!clip) {
    return source;
  }

  let frontmatter = "";
  let body = source;

  if (source.startsWith("---")) {
    const end =
      source.indexOf("\n---", 3);

    if (end >= 0) {
      frontmatter =
        source.slice(0, end + 4);

      body =
        source.slice(end + 4)
          .replace(/^\s+/, "");
    }
  }

  const h1 =
    body.match(/^#\s+.*$/m);

  if (h1 && Number.isInteger(h1.index)) {
    const split =
      h1.index + h1[0].length;

    const before =
      body.slice(0, split)
        .trimEnd();

    const after =
      body.slice(split)
        .replace(/^\s+/, "");

    body =
      `${before}\n\n` +
      `${clip}` +
      (after
        ? `\n\n${after}`
        : "");
  } else {
    body =
      `# ${payload.title}\n\n` +
      `${clip}` +
      (body.trim()
        ? `\n\n${body.trimStart()}`
        : "");
  }

  return frontmatter
    ? `${frontmatter}\n\n${body}`
    : body;
}

function mergeQuickTemplateFrontmatter(
  source,
  payload
) {
  const tags =
    Array.isArray(payload.tags)
      ? payload.tags
      : [];

  if (!source.startsWith("---")) {
    const fm = [
      "---",
      "aliases: []",
      tags.length ? "tags:" : "tags: []",
      ...tags.map(
        (tag) =>
          `  - ${quickYamlString(tag)}`
      ),
      `source: ${quickYamlString(payload.url)}`,
      "---"
    ].join("\n");

    return `${fm}\n\n${source}`;
  }

  const end =
    source.indexOf("\n---", 3);

  if (end < 0) {
    return source;
  }

  const yaml =
    source.slice(3, end)
      .split(/\r?\n/);

  const result = [];

  let foundSource = false;
  let foundTags = false;

  for (
    let index = 0;
    index < yaml.length;
    index += 1
  ) {
    const line = yaml[index];

    if (/^source\s*:/i.test(line)) {
      result.push(
        `source: ${quickYamlString(payload.url)}`
      );
      foundSource = true;
      continue;
    }

    if (/^tags\s*:/i.test(line)) {
      foundTags = true;

      result.push(
        tags.length
          ? "tags:"
          : "tags: []"
      );

      for (const tag of tags) {
        result.push(
          `  - ${quickYamlString(tag)}`
        );
      }

      while (
        index + 1 < yaml.length &&
        /^\s*-\s+/.test(
          yaml[index + 1]
        )
      ) {
        index += 1;
      }

      continue;
    }

    result.push(line);
  }

  if (!foundSource) {
    result.push(
      `source: ${quickYamlString(payload.url)}`
    );
  }

  if (!foundTags) {
    result.push(
      tags.length
        ? "tags:"
        : "tags: []"
    );

    for (const tag of tags) {
      result.push(
        `  - ${quickYamlString(tag)}`
      );
    }
  }

  return (
    `---${result.join("\n")}\n---` +
    source.slice(end + 4)
  );
}
