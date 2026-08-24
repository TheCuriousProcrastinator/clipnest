const NOTION_VERSION = "2026-03-11";

// Keep extension-local settings, including the personal Notion token, out of
// any untrusted/content-script context.
try {
  chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
} catch {
  // Older Chromium builds may not expose setAccessLevel. V1 still functions.
}


/* ==================================================
   ClipNest Quick Clip - V0.6.0
   ================================================== */

const QUICK_CLIP_TEXT_MENU_ID =
  "clipnest.quickClip.selectedText";

function ensureQuickClipContextMenu() {
  chrome.contextMenus.create(
    {
      id: QUICK_CLIP_TEXT_MENU_ID,
      title: "Clip selected text to ClipNest",
      contexts: ["selection"],
      documentUrlPatterns: [
        "http://*/*",
        "https://*/*"
      ]
    },
    () => {
      /*
       * The service worker can restart while the
       * context menu already exists. Ignore the
       * duplicate-ID error in that case.
       */
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
        "obsidianDefaultTags",
        "obsidianDefaultTemplatePath",
        "obsidianSubfolder"
      ]);

    const destination =
      settings.defaultDestination ===
      "notion"
        ? "notion"
        : "obsidian";

    const tags =
      parseQuickTags(
        settings.obsidianDefaultTags || ""
      );

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

  if (message?.type === "notion.save") {
    saveToNotion(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  if (message?.type === "notion.test") {
    testNotion(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }
});

async function getNotionConfig() {
  const config = await chrome.storage.local.get([
    "notionToken",
    "notionDataSourceId",
    "notionTitleProperty",
    "notionUrlProperty"
  ]);

  return {
    token: (config.notionToken || "").trim(),
    dataSourceId: normalizeNotionId(config.notionDataSourceId || ""),
    titleProperty: (config.notionTitleProperty || "Name").trim(),
    urlProperty: (config.notionUrlProperty || "").trim()
  };
}

async function saveToNotion(payload) {
  const config = await getNotionConfig();

  if (!config.token) throw new Error("Notion token is missing. Open Settings and add it.");
  if (!config.dataSourceId) throw new Error("Notion data source ID is missing. Open Settings and add it.");
  if (!config.titleProperty) throw new Error("Notion title property name is missing.");

  const properties = {
    [config.titleProperty]: {
      title: [
        {
          type: "text",
          text: { content: String(payload.title || "Untitled").slice(0, 2000) }
        }
      ]
    }
  };

  if (config.urlProperty && payload.url) {
    properties[config.urlProperty] = { url: payload.url };
  }

  const body = {
    parent: { data_source_id: config.dataSourceId },
    properties,
    markdown: payload.markdown || ""
  };

  const response = await notionFetch(config.token, "/v1/pages", {
    method: "POST",
    body: JSON.stringify(body)
  });

  return {
    id: response.id,
    url: response.url
  };
}

async function testNotion(payload = {}) {
  const stored = await getNotionConfig();
  const token = String(payload.token || stored.token || "").trim();
  const dataSourceId = normalizeNotionId(payload.dataSourceId || stored.dataSourceId || "");

  if (!token) throw new Error("Enter a Notion token first.");
  if (!dataSourceId) throw new Error("Enter a Notion data source ID first.");

  const response = await notionFetch(token, `/v1/data_sources/${encodeURIComponent(dataSourceId)}`, {
    method: "GET"
  });

  const properties = Object.values(response.properties || {}).map((property) => ({
    name: property.name,
    type: property.type
  }));

  return {
    id: response.id,
    name: response.name || response.title?.map?.((item) => item.plain_text).join("") || "Connected",
    properties
  };
}

async function notionFetch(token, path, options) {
  const response = await fetch(`https://api.notion.com${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(options?.headers || {})
    }
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.message || data?.code || text || `Notion returned HTTP ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function normalizeNotionId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const compact = raw.replace(/-/g, "");
  const match = compact.match(/[0-9a-fA-F]{32}/);
  if (!match) return raw;

  const id = match[0].toLowerCase();
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
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
  const db =
    await openQuickHandleDb();

  const handle =
    await new Promise(
      (resolve, reject) => {
        const tx =
          db.transaction(
            QUICK_STORE_NAME,
            "readonly"
          );

        const request =
          tx.objectStore(
            QUICK_STORE_NAME
          ).get(
            QUICK_VAULT_KEY
          );

        request.onsuccess = () =>
          resolve(
            request.result || null
          );

        request.onerror = () =>
          reject(request.error);
      }
    );

  db.close();

  return handle;
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
